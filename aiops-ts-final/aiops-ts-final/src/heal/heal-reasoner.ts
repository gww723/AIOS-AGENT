import type { AutoRepairHistory, RepairAttempt } from "../domain/models.js";
import type { RcaEvent } from "../domain/events.js";
import type { PlaybookAction } from "./playbook.js";
import type { LlmClient } from "../llm/llm-client.js";

export interface HealDecision { playbookId:string; action:string; params:Record<string,unknown>; actionRank:number; reason:string; }
export interface HealReasoner { decide(input:{rca:RcaEvent;eligible:PlaybookAction[];history:AutoRepairHistory[];previousAttempt:RepairAttempt|null}):Promise<HealDecision>; }

export class HeuristicHealReasoner implements HealReasoner {
  async decide({eligible,history,previousAttempt}:Parameters<HealReasoner["decide"]>[0]){
    if(!eligible.length) throw new Error("no eligible playbook action");
    const scored=eligible.map((a,index)=>{const h=history.filter(x=>x.action===a.action);const success=h.filter(x=>x.result==="SUCCESS").length;const rate=h.length?success/h.length:0.5;let score=rate+(a.risk==="L0"?0.2:0);if(previousAttempt?.action===a.action)score-=0.25;return {a,index,score};}).sort((x,y)=>y.score-x.score);
    let chosen=scored[0].a; const params={...chosen.defaultParams};
    if(previousAttempt?.action===chosen.action && chosen.action==="scale_out" && typeof previousAttempt.params.targetReplicas==="number") params.targetReplicas=Math.min(Number(previousAttempt.params.targetReplicas)+2,20);
    if(previousAttempt?.action===chosen.action && chosen.action==="throttle" && typeof previousAttempt.params.limitQps==="number") params.limitQps=Math.max(Number(previousAttempt.params.limitQps)*0.8,100);
    return {playbookId:chosen.id,action:chosen.action,params,actionRank:scored[0].index+1,reason:"基于可执行动作、历史自动修复结果和上一轮失败信息选择"};
  }
}

export class LlmHealReasoner implements HealReasoner {
  constructor(private readonly llm:LlmClient){}
  async decide(input:Parameters<HealReasoner["decide"]>[0]){
    return this.llm.completeJson<HealDecision>("你是Heal Agent。只能从eligible中选择playbook动作，不能生成任意命令。输出 playbookId,action,params,actionRank,reason。失败重试时优先考虑调参数或次级候选。",JSON.stringify(input));
  }
}
