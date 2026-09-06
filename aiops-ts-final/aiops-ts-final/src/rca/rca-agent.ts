import type { EventBus } from "../infrastructure/kafka/event-bus.js";
import type { StateStore } from "../infrastructure/state/state-store.js";
import type { TopologyProvider } from "../infrastructure/neo4j/topology-provider.js";
import type { LogProvider } from "../infrastructure/loki/log-provider.js";
import type { ChangeProvider } from "../infrastructure/changes/change-provider.js";
import { MetricsAnalysisService } from "./metrics-analysis-service.js";
import type { RcaReasoner } from "./rca-reasoner.js";
import { AlertEventSchema, RcaEventSchema, RcaRequestEventSchema, type RcaEvent, type RcaRequestEvent } from "../domain/events.js";
import type { NodeEvidence, RcaTrace } from "../domain/models.js";
import { buildRootCauseFingerprint } from "../shared/fingerprints.js";
import { newId } from "../shared/ids.js";
import { minusMinutes, nowIso } from "../shared/time.js";
import { Topics } from "../domain/topics.js";

export class RcaAgentService {
  constructor(private readonly bus:EventBus,private readonly store:StateStore,private readonly topology:TopologyProvider,private readonly metrics:MetricsAnalysisService,private readonly logs:LogProvider,private readonly changes:ChangeProvider,private readonly reasoner:RcaReasoner,private readonly maxSteps=6){}

  async handleRequest(raw:unknown){
    const req=RcaRequestEventSchema.parse(raw); const consumer="rca-agent"; if(await this.store.isProcessed(req.eventId,consumer))return;
    const incident=await this.store.getIncident(req.incidentId); if(!incident) throw new Error(`incident not found ${req.incidentId}`);
    await this.store.setIncidentStatus(req.incidentId, req.analysisType==="RECHECK"?"RCA_RECHECK":"RCA_ANALYZING");
    const alert=await this.findAlert(incident.originalAlertFingerprint);
    const trace:RcaTrace={alert,inspectedNodes:[],evidenceByNode:{},topologyEdges:[]};
    const first=await this.topology.oneHop(alert.alertNode); trace.topologyEdges.push(...first.edges);
    let frontier=[...new Set(first.nodes.map(n=>n.name))];
    for(let step=0;step<this.maxSteps&&frontier.length;step++){
      const inspect=frontier.filter(n=>!trace.inspectedNodes.includes(n)); if(!inspect.length)break;
      for(const node of inspect){trace.evidenceByNode[node]=await this.inspectNode(node,alert.sampleTime); trace.inspectedNodes.push(node);}
      const toExpand=await this.reasoner.chooseExpansion(trace,inspect);
      const next:string[]=[];
      for(const node of toExpand){const hop=await this.topology.oneHop(node); for(const e of hop.edges) if(!trace.topologyEdges.some(x=>x.from===e.from&&x.to===e.to)) trace.topologyEdges.push(e); for(const n of hop.nodes.map(x=>x.name)) if(!trace.inspectedNodes.includes(n)) next.push(n);}
      frontier=[...new Set(next)];
      if(!frontier.length)break;
    }
    const candidates=await this.reasoner.conclude(trace);
    const high=candidates.filter(c=>c.confidence>=0.6);
    let event:RcaEvent;
    if(high.length===0 || (high.length>=2 && Math.abs(high[0].confidence-high[1].confidence)<=0.08)) {
      event=RcaEventSchema.parse({eventId:newId("rca"),incidentId:req.incidentId,primaryIncidentId:incident.primaryIncidentId,originalAlertFingerprint:alert.alertFingerprint,originalAlertNode:alert.alertNode,rootCauseNode:null,faultType:null,rootCauseFingerprint:null,confidence:high[0]?.confidence??candidates[0]?.confidence??0,evidence:candidates.flatMap(c=>c.evidence).slice(0,20),handling:"HUMAN",needHealing:false,analysisType:req.analysisType,analysisRound:incident.analysisRound,triggerExecutionId:req.triggerExecutionId,candidateCount:high.length||candidates.length,completedAt:nowIso()});
      await this.store.setIncidentStatus(req.incidentId,"HUMAN");
      await this.store.deleteActiveRootsByPrimary(incident.primaryIncidentId);
    } else {
      const top=high[0]; const fp=buildRootCauseFingerprint(top.node,top.faultType); const existing=await this.store.findActiveRoot(fp);
      let primary=incident.primaryIncidentId; let handling:"NEW_ROOT"|"MERGED_EXISTING"="NEW_ROOT"; let needHealing=true;
      if(existing && existing.primaryIncidentId!==incident.primaryIncidentId && req.analysisType==="INITIAL") {primary=existing.primaryIncidentId;handling="MERGED_EXISTING";needHealing=false; await this.store.updateIncident(req.incidentId,{primaryIncidentId:primary,status:"MERGED_WAITING",currentRootCauseNode:top.node,currentFaultType:top.faultType,currentRootCauseFingerprint:fp}); await this.store.updateActiveAlertPrimary(alert.alertFingerprint,primary);} else {
        if (req.analysisType==="RECHECK" && incident.currentRootCauseFingerprint && incident.currentRootCauseFingerprint!==fp) await this.store.deleteActiveRoot(incident.currentRootCauseFingerprint);
        await this.store.upsertActiveRoot({rootCauseFingerprint:fp,primaryIncidentId:primary,rootCauseNode:top.node,faultType:top.faultType,status:"ACTIVE",createdAt:nowIso(),updatedAt:nowIso()});
        await this.store.updateIncident(req.incidentId,{primaryIncidentId:primary,status:"HEAL_PLANNING",currentRootCauseNode:top.node,currentFaultType:top.faultType,currentRootCauseFingerprint:fp});
      }
      event=RcaEventSchema.parse({eventId:newId("rca"),incidentId:req.incidentId,primaryIncidentId:primary,originalAlertFingerprint:alert.alertFingerprint,originalAlertNode:alert.alertNode,rootCauseNode:top.node,faultType:top.faultType,rootCauseFingerprint:fp,confidence:top.confidence,evidence:top.evidence,handling,needHealing,analysisType:req.analysisType,analysisRound:incident.analysisRound,triggerExecutionId:req.triggerExecutionId,candidateCount:candidates.length,completedAt:nowIso()});
    }
    await this.store.saveRca(event); await this.store.markProcessed(req.eventId,consumer); await this.bus.publish(Topics.RCA_EVENTS,event.primaryIncidentId,event);
  }
  private async findAlert(fp:string){const a=await this.store.getActiveAlert(fp); if(!a) throw new Error(`active alert not found ${fp}`); const incident=await this.store.getIncident(a.incidentId); if(!incident) throw new Error("incident missing"); return AlertEventSchema.parse({eventId:`stored-${a.incidentId}`,incidentId:a.incidentId,alertFingerprint:a.alertFingerprint,alertNode:a.alertNode,metricName:a.metricName,currentValue:0,sampleTime:a.lastSeenAt,anomalyVotes:2,metricSnapshot:{},createdAt:a.firstSeenAt});}
  private async inspectNode(node:string,center:string):Promise<NodeEvidence>{const start=minusMinutes(center,5); const end=new Date(new Date(center).getTime()+60_000).toISOString(); const [metrics,logs,changes]=await Promise.all([this.metrics.analyzeAround(node,center),this.logs.query(node,start,end),this.changes.query(node,start,end)]);return {node,metrics,logs,changes};}
}
