import { RcaEventSchema, HealEventSchema, ExecutionResultSchema, RcaRequestEventSchema, type RcaEvent } from "../domain/events.js";
import { Topics } from "../domain/topics.js";
import type { EventBus } from "../infrastructure/kafka/event-bus.js";
import type { StateStore } from "../infrastructure/state/state-store.js";
import { playbookFor, type PlaybookAction } from "./playbook.js";
import type { RepairAttempt } from "../domain/models.js";
import type { EnvironmentInspector } from "./precondition.js";
import type { HealReasoner } from "./heal-reasoner.js";
import type { MetricsAnalysisService } from "../rca/metrics-analysis-service.js";
import { newId } from "../shared/ids.js";
import { addSeconds, nowIso } from "../shared/time.js";

export class HealAgentService {
  constructor(private readonly bus:EventBus,private readonly store:StateStore,private readonly env:EnvironmentInspector,private readonly reasoner:HealReasoner,private readonly metrics:MetricsAnalysisService,private readonly verificationWindowSeconds=Number(process.env.VERIFICATION_WINDOW_SECONDS??300),private readonly maxFailures=Number(process.env.MAX_AUTO_REPAIR_FAILURES??3)){}

  async handleRca(raw:unknown){
    const rca=RcaEventSchema.parse(raw); const consumer="heal-agent-rca"; if(await this.store.isProcessed(rca.eventId,consumer))return; if(!rca.needHealing||!rca.rootCauseNode||!rca.faultType||!rca.rootCauseFingerprint){await this.store.markProcessed(rca.eventId,consumer);return;}
    const incident=await this.store.getIncident(rca.incidentId); if(!incident) throw new Error("incident missing"); await this.store.setIncidentStatus(rca.incidentId,"HEAL_PLANNING");
    const candidates=playbookFor(rca.faultType); const eligible:PlaybookAction[]=[]; for(const a of candidates){const result=await this.env.check(rca.rootCauseNode,a); if(result.executable)eligible.push(a);}
    if(!eligible.length){await this.store.setIncidentStatus(rca.incidentId,"HUMAN");await this.store.markProcessed(rca.eventId,consumer);return;}
    const history=await this.store.findAutoRepairHistory(rca.rootCauseNode,rca.faultType,eligible.map(x=>x.action));
    let previousAttempt: RepairAttempt | null=null;
    if(rca.analysisType==="RECHECK"&&rca.triggerExecutionId){
      const attempt=await this.store.getRepairAttempt(rca.triggerExecutionId);
      if(attempt){
        const previousRca=await this.store.getRca(attempt.rcaEventId);
        // 根因指纹是标准化结构字段；这里就是确定性 === 判断。
        if(previousRca?.rootCauseFingerprint===rca.rootCauseFingerprint) previousAttempt=attempt;
      }
    }
    const decision=await this.reasoner.decide({rca,eligible,history,previousAttempt});
    const attemptNo=(await this.store.listRepairAttempts(rca.primaryIncidentId)).length+1; const executionId=newId("EXEC");
    await this.store.saveRepairAttempt({executionId,incidentId:rca.incidentId,primaryIncidentId:rca.primaryIncidentId,rcaEventId:rca.eventId,attemptNo,action:decision.action,params:decision.params,status:"PENDING",startedAt:null,completedAt:null,error:null});
    await this.store.setIncidentStatus(rca.incidentId,"APPROVAL_PENDING");
    const event=HealEventSchema.parse({eventId:newId("heal"),taskStatus:"REQUEST_EXECUTION",incidentId:rca.incidentId,primaryIncidentId:rca.primaryIncidentId,rcaEventId:rca.eventId,analysisRound:rca.analysisRound,triggerExecutionId:rca.triggerExecutionId,rootCauseNode:rca.rootCauseNode,faultType:rca.faultType,rootCauseFingerprint:rca.rootCauseFingerprint,action:decision.action,params:decision.params,actionRank:decision.actionRank,attemptNo,executionId,verificationWindowSeconds:this.verificationWindowSeconds,verificationResult:"PENDING",createdAt:nowIso()});
    await this.store.markProcessed(rca.eventId,consumer); await this.bus.publish(Topics.HEAL_EVENTS,rca.primaryIncidentId,event);
  }

  async handleExecution(raw:unknown){
    const result=ExecutionResultSchema.parse(raw); const consumer="heal-agent-execution"; if(await this.store.isProcessed(result.eventId,consumer))return; const attempt=await this.store.getRepairAttempt(result.executionId); if(!attempt) throw new Error("repair attempt missing");
    await this.store.updateRepairAttempt(result.executionId,{status:result.status,startedAt:result.startedAt,completedAt:result.completedAt,error:result.error}); const incident=await this.store.getIncident(result.incidentId); if(!incident)throw new Error("incident missing");
    if(result.status==="FAILED"){await this.failAndRecheck(incident.incidentId,result.executionId,"execution_failed");await this.store.markProcessed(result.eventId,consumer);return;}
    const verificationId=newId("VER"); const endAt=addSeconds(result.completedAt,this.verificationWindowSeconds); const activeAlert=await this.store.getActiveAlert(incident.originalAlertFingerprint); const baselineEndAt=activeAlert?.firstSeenAt??incident.createdAt; await this.store.saveVerification({verificationId,incidentId:incident.incidentId,primaryIncidentId:incident.primaryIncidentId,executionId:result.executionId,alertFingerprint:incident.originalAlertFingerprint,alertNode:incident.originalAlertNode,metricName:incident.originalMetricName,baselineEndAt,startAt:result.completedAt,endAt,status:"PENDING"}); await this.store.setIncidentStatus(incident.incidentId,"VERIFYING"); await this.store.markProcessed(result.eventId,consumer);
  }

  async processDueVerifications(now=nowIso()){
    const due=await this.store.listDueVerifications(now); for(const v of due){const analysis=await this.metrics.verify(v.alertNode,v.metricName,v.startAt,v.endAt,v.baselineEndAt); if(!analysis.originalMetricStillAbnormal){await this.store.updateVerification(v.verificationId,{status:"RECOVERED"});await this.store.updateRepairAttempt(v.executionId,{status:"RECOVERED"});const rca=await this.store.getLatestRca(v.incidentId);if(!rca||!rca.rootCauseNode||!rca.faultType||!rca.rootCauseFingerprint)throw new Error("RCA context missing");const attempt=await this.store.getRepairAttempt(v.executionId);if(!attempt)throw new Error("attempt missing");const finished=HealEventSchema.parse({eventId:newId("heal"),taskStatus:"FINISHED",incidentId:v.incidentId,primaryIncidentId:v.primaryIncidentId,rcaEventId:rca.eventId,analysisRound:rca.analysisRound,triggerExecutionId:v.executionId,rootCauseNode:rca.rootCauseNode,faultType:rca.faultType,rootCauseFingerprint:rca.rootCauseFingerprint,action:attempt.action,params:attempt.params,actionRank:null,attemptNo:attempt.attemptNo,executionId:v.executionId,verificationWindowSeconds:this.verificationWindowSeconds,verificationResult:"RECOVERED",createdAt:nowIso()});await this.bus.publish(Topics.HEAL_EVENTS,v.primaryIncidentId,finished);}else{await this.store.updateVerification(v.verificationId,{status:"NOT_RECOVERED"});await this.store.updateRepairAttempt(v.executionId,{status:"NOT_RECOVERED"});await this.failAndRecheck(v.incidentId,v.executionId,"verification_failed");}}
  }

  private async failAndRecheck(incidentId:string,executionId:string,_reason:string){const incident=await this.store.getIncident(incidentId); if(!incident)throw new Error("incident missing");const failures=incident.consecutiveRepairFailures+1;await this.store.updateIncident(incidentId,{consecutiveRepairFailures:failures});if(failures>=this.maxFailures){await this.store.setIncidentStatus(incidentId,"HUMAN");return;}await this.store.updateIncident(incidentId,{status:"RCA_RECHECK",analysisRound:incident.analysisRound+1});const req=RcaRequestEventSchema.parse({eventId:newId("rca-req"),incidentId,analysisType:"RECHECK",triggerExecutionId:executionId,requestedAt:nowIso()});await this.bus.publish(Topics.RCA_REQUESTS,incident.primaryIncidentId,req);}
}
