import type { FaultType } from "../domain/enums.js";

export interface PlaybookAction {
  id: string;
  action: "throttle"|"scale_out"|"restart"|"circuit_break"|"config_rollback"|"version_rollback";
  faultTypes: FaultType[];
  risk: "L0"|"L1";
  defaultParams: Record<string, unknown>;
  bounds?: Record<string,{min?:number;max?:number}>;
}

export const PLAYBOOK: PlaybookAction[] = [
  {id:"pb-throttle",action:"throttle",faultTypes:["traffic_surge","capacity_shortage","dependency_fault"],risk:"L0",defaultParams:{limitQps:800},bounds:{limitQps:{min:100,max:5000}}},
  {id:"pb-scale",action:"scale_out",faultTypes:["traffic_surge","capacity_shortage","resource_exhaustion","memory_leak"],risk:"L0",defaultParams:{targetReplicas:5},bounds:{targetReplicas:{min:2,max:20}}},
  {id:"pb-restart",action:"restart",faultTypes:["resource_exhaustion","memory_leak"],risk:"L0",defaultParams:{graceSeconds:30}},
  {id:"pb-circuit",action:"circuit_break",faultTypes:["code_defect","dependency_fault"],risk:"L1",defaultParams:{durationSeconds:60}},
  {id:"pb-config-rollback",action:"config_rollback",faultTypes:["config_change"],risk:"L1",defaultParams:{targetVersion:"previous"}},
  {id:"pb-version-rollback",action:"version_rollback",faultTypes:["deployment_regression","code_defect","memory_leak"],risk:"L1",defaultParams:{targetVersion:"previous"}},
];
export const playbookFor = (faultType:FaultType) => PLAYBOOK.filter(x=>x.faultTypes.includes(faultType));
