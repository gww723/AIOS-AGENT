import type { FaultType } from "../domain/enums.js";
import type { NodeEvidence, RcaCandidate, RcaTrace } from "../domain/models.js";
import type { LlmClient } from "../llm/llm-client.js";

export interface RcaReasoner {
  chooseExpansion(trace:RcaTrace, frontier:string[]):Promise<string[]>;
  conclude(trace:RcaTrace):Promise<RcaCandidate[]>;
}

function inferFault(node:string,e:NodeEvidence):FaultType{
  const joined=[...e.logs,...e.changes.map(c=>c.summary),...e.metrics.summary].join(" ").toLowerCase();
  if(e.changes.some(c=>c.type==="deployment")) return "deployment_regression";
  if(e.changes.some(c=>c.type==="config")) return "config_change";
  if(/connection|pool|resource|slow_queries|slow query|too many connections/.test(joined)) return "resource_exhaustion";
  if(/memory|oom|heap/.test(joined)) return "memory_leak";
  if(/traffic|qps|surge/.test(joined)) return "traffic_surge";
  if(/capacity/.test(joined)) return "capacity_shortage";
  if(/code|exception|panic/.test(joined)) return "code_defect";
  return "dependency_fault";
}

export class HeuristicRcaReasoner implements RcaReasoner {
  async chooseExpansion(trace:RcaTrace,frontier:string[]){
    return frontier.filter(node=>{const e=trace.evidenceByNode[node]; return !!e&&(e.metrics.abnormal||e.logs.length>0||e.changes.length>0);});
  }
  async conclude(trace:RcaTrace){
    const depth=new Map<string,number>([[trace.alert.alertNode,0]]); let changed=true; while(changed){changed=false; for(const e of trace.topologyEdges){const a=depth.get(e.from),b=depth.get(e.to); if(a!==undefined&&b===undefined){depth.set(e.to,a+1);changed=true;} if(b!==undefined&&a===undefined){depth.set(e.from,b+1);changed=true;}}}
    const candidates:RcaCandidate[]=[];
    for(const [node,e] of Object.entries(trace.evidenceByNode)){
      let score=0; const evidence:string[]=[];
      if(e.metrics.abnormal){score+=3; evidence.push(...e.metrics.summary);}
      if(e.logs.length){
        const joined=e.logs.join(" ").toLowerCase();
        if(/too many connections|pool exhausted|oom|out of memory|panic|fatal/.test(joined)) score+=3;
        else if(/timeout|downstream|connection/.test(joined)) score+=1.5;
        else score+=2;
        evidence.push(...e.logs.slice(0,5).map(x=>`日志: ${x}`));
      }
      if(e.changes.length){score+=2; evidence.push(...e.changes.map(x=>`变更: ${x.summary}`));}
      score+=(depth.get(node)??0)*0.35;
      if(score<=0) continue;
      const confidence=Math.min(0.98,0.45+score/12);
      candidates.push({node,faultType:inferFault(node,e),confidence,evidence});
    }
    return candidates.sort((a,b)=>b.confidence-a.confidence);
  }
}

export class LlmRcaReasoner implements RcaReasoner {
  constructor(private readonly llm:LlmClient){}
  async chooseExpansion(trace:RcaTrace,frontier:string[]){
    const out=await this.llm.completeJson<{nodes:string[]}>("你是RCA Agent。只能从给定frontier选择值得继续扩展一跳的节点。依据指标异常、日志、变更和已有拓扑。输出JSON {nodes:string[]}。",JSON.stringify({frontier,evidence:trace.evidenceByNode,edges:trace.topologyEdges}));
    return out.nodes.filter(n=>frontier.includes(n));
  }
  async conclude(trace:RcaTrace){
    return this.llm.completeJson<RcaCandidate[]>("你是RCA Agent。根据结构化证据输出根因候选数组，每项包含 node,faultType,confidence,evidence。faultType必须来自 deployment_regression,memory_leak,config_change,code_defect,resource_exhaustion,capacity_shortage,traffic_surge,dependency_fault。不要输出修复建议。",JSON.stringify(trace));
  }
}
