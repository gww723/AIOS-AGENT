import { ExecutionCommandSchema, HealEventSchema, type HealEvent } from "../domain/events.js";
import { Topics } from "../domain/topics.js";
import type { EventBus } from "../infrastructure/kafka/event-bus.js";
import type { StateStore } from "../infrastructure/state/state-store.js";
import { PLAYBOOK } from "../heal/playbook.js";
import type { ReportGenerator } from "./report-generator.js";
import { newId } from "../shared/ids.js";
import { nowIso } from "../shared/time.js";

export class ChangeAgentService {
  constructor(private readonly bus:EventBus,private readonly store:StateStore,private readonly reports:ReportGenerator){}
  async handle(raw:unknown){
    const event=HealEventSchema.parse(raw); const consumer="change-agent"; if(await this.store.isProcessed(event.eventId,consumer))return;
    if(event.taskStatus==="REQUEST_EXECUTION") await this.routeApproval(event); else await this.closeIncident(event);
    await this.store.markProcessed(event.eventId,consumer);
  }
  private async routeApproval(event:HealEvent){
    if(!event.action||!event.params)throw new Error("heal request missing action"); const pb=PLAYBOOK.find(x=>x.action===event.action); if(!pb)throw new Error(`unknown playbook action ${event.action}`);
    if(pb.risk==="L1"){await this.store.savePendingApproval(event);await this.store.setIncidentStatus(event.incidentId,"APPROVAL_PENDING");return;}
    await this.dispatch(event);
  }
  async approve(executionId:string){const event=await this.store.getPendingApproval(executionId);if(!event)throw new Error(`pending approval not found: ${executionId}`);await this.dispatch(event);await this.store.deletePendingApproval(executionId);}
  async reject(executionId:string){const event=await this.store.getPendingApproval(executionId);if(!event)throw new Error(`pending approval not found: ${executionId}`);await this.store.setIncidentStatus(event.incidentId,"HUMAN");await this.store.deletePendingApproval(executionId);}
  private async dispatch(event:HealEvent){if(!event.action||!event.params)throw new Error("heal request missing action");const pb=PLAYBOOK.find(x=>x.action===event.action);if(!pb)throw new Error("playbook missing");await this.store.setIncidentStatus(event.incidentId,"EXECUTING");const cmd=ExecutionCommandSchema.parse({eventId:newId("exec-cmd"),incidentId:event.incidentId,primaryIncidentId:event.primaryIncidentId,executionId:event.executionId,playbookId:pb.id,action:event.action,targetNode:event.rootCauseNode,params:event.params,issuedAt:nowIso()});await this.bus.publish(Topics.EXECUTION_COMMANDS,event.primaryIncidentId,cmd);}
  private async closeIncident(event:HealEvent){
    if(event.verificationResult!=="RECOVERED")return; const incident=await this.store.getIncident(event.incidentId); if(!incident)throw new Error("incident missing"); const rcas=await this.store.listRcaByPrimary(event.primaryIncidentId); const attempts=await this.store.listRepairAttempts(event.primaryIncidentId); const report=await this.reports.generate({primaryIncidentId:event.primaryIncidentId,rcas,attempts}); await this.store.saveReport(report);
    for(const a of attempts){await this.store.addAutoRepairHistory({historyId:newId("HIST"),primaryIncidentId:event.primaryIncidentId,rootCauseNode:event.rootCauseNode,faultType:event.faultType,action:a.action,params:a.params,result:a.status==="RECOVERED"?"SUCCESS":"FAILED",recoverySeconds:a.status==="RECOVERED"?event.verificationWindowSeconds:null,createdAt:nowIso()});}
    const related=await this.store.listIncidentsByPrimary(event.primaryIncidentId); for(const x of related) await this.store.setIncidentStatus(x.incidentId,"FINISHED"); await this.store.deleteActiveAlertsByPrimary(event.primaryIncidentId); await this.store.deleteActiveRootsByPrimary(event.primaryIncidentId);
  }
}
