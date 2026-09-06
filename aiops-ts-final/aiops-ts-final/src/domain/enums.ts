export const FaultTypes = [
  "deployment_regression",
  "memory_leak",
  "config_change",
  "code_defect",
  "resource_exhaustion",
  "capacity_shortage",
  "traffic_surge",
  "dependency_fault",
] as const;
export type FaultType = (typeof FaultTypes)[number];

export const IncidentStatuses = [
  "RECEIVED",
  "RCA_ANALYZING",
  "HEAL_PLANNING",
  "APPROVAL_PENDING",
  "EXECUTING",
  "VERIFYING",
  "RCA_RECHECK",
  "MERGED_WAITING",
  "FINISHED",
  "HUMAN",
] as const;
export type IncidentStatus = (typeof IncidentStatuses)[number];

export const AnalysisTypes = ["INITIAL", "RECHECK"] as const;
export type AnalysisType = (typeof AnalysisTypes)[number];

export const RcaHandlingTypes = ["NEW_ROOT", "MERGED_EXISTING", "HUMAN"] as const;
export type RcaHandlingType = (typeof RcaHandlingTypes)[number];

export const HealTaskStatuses = ["REQUEST_EXECUTION", "FINISHED"] as const;
export type HealTaskStatus = (typeof HealTaskStatuses)[number];

export const ExecutionStatuses = ["SUCCESS", "FAILED"] as const;
export type ExecutionStatus = (typeof ExecutionStatuses)[number];
