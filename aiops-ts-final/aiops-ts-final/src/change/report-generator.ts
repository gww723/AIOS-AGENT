import type { IncidentReport, RepairAttempt } from "../domain/models.js";
import type { RcaEvent } from "../domain/events.js";
import type { LlmClient } from "../llm/llm-client.js";
import { newId } from "../shared/ids.js";
import { nowIso } from "../shared/time.js";

export interface ReportGenerator { generate(input:{primaryIncidentId:string;rcas:RcaEvent[];attempts:RepairAttempt[]}):Promise<IncidentReport>; }

export class DeterministicReportGenerator implements ReportGenerator {
  async generate(input:{primaryIncidentId:string;rcas:RcaEvent[];attempts:RepairAttempt[]}):Promise<IncidentReport>{
    const finalRca=[...input.rcas].reverse().find(r=>r.rootCauseNode&&r.faultType); if(!finalRca?.rootCauseNode||!finalRca.faultType) throw new Error("cannot generate report without root cause");
    return {reportId:newId("REPORT"),primaryIncidentId:input.primaryIncidentId,alertSummary:`原始告警节点 ${finalRca.originalAlertNode}`,rootCauseNode:finalRca.rootCauseNode,faultType:finalRca.faultType,evidence:finalRca.evidence,attempts:input.attempts.map(a=>({executionId:a.executionId,action:a.action,params:a.params,status:a.status})),finalResult:"RECOVERED",generatedAt:nowIso()};
  }
}

export class LlmReportGenerator implements ReportGenerator {
  constructor(private readonly llm:LlmClient){}
  async generate(input:{primaryIncidentId:string;rcas:RcaEvent[];attempts:RepairAttempt[]}):Promise<IncidentReport>{
    const raw=await this.llm.completeJson<Omit<IncidentReport,"reportId"|"generatedAt">>("你是Change Agent，只负责事故闭环报告生成。根据结构化RCA和自动修复尝试生成结构化JSON报告，不做审批决策。字段: primaryIncidentId,alertSummary,rootCauseNode,faultType,evidence,attempts,finalResult。",JSON.stringify(input));
    return {...raw,reportId:newId("REPORT"),generatedAt:nowIso()};
  }
}
