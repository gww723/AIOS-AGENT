import type { PlaybookAction } from "./playbook.js";
export interface PreconditionResult { executable:boolean; reason:string; environmentSnapshot:Record<string,unknown>; checkedAt:string; }
export interface EnvironmentInspector { check(node:string, action:PlaybookAction):Promise<PreconditionResult>; }
export class SimulationEnvironmentInspector implements EnvironmentInspector {
  async check(node:string,action:PlaybookAction):Promise<PreconditionResult>{
    const infra=/^(mysql-|redis-|kafka-|elasticsearch)/.test(node);
    if(infra && ["scale_out","throttle","circuit_break"].includes(action.action)) return {executable:false,reason:"基础设施节点不使用该业务服务动作",environmentSnapshot:{node,action:action.action,simulated:true},checkedAt:new Date().toISOString()};
    return {executable:true,reason:"仿真环境前提条件满足",environmentSnapshot:{node,action:action.action,simulated:true},checkedAt:new Date().toISOString()};
  }
}
