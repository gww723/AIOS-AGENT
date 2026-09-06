import { z } from "zod";
import { AnalysisTypes, FaultTypes, HealTaskStatuses, RcaHandlingTypes } from "./enums.js";

const MetricsSchema = z.record(z.string(), z.number());
const LabelsSchema = z.record(z.string(), z.string());

export const MetricSnapshotEventSchema = z.object({
  eventId: z.string(),
  serviceName: z.string(),
  nodeType: z.string(),
  metrics: MetricsSchema,
  sampleTime: z.string(),
  stableLabels: LabelsSchema.default({}),
});
export type MetricSnapshotEvent = z.infer<typeof MetricSnapshotEventSchema>;

export const AlertEventSchema = z.object({
  eventId: z.string(),
  incidentId: z.string(),
  alertFingerprint: z.string(),
  alertNode: z.string(),
  metricName: z.string(),
  currentValue: z.number(),
  sampleTime: z.string(),
  anomalyVotes: z.number().int().min(0).max(3),
  metricSnapshot: MetricsSchema,
  createdAt: z.string(),
});
export type AlertEvent = z.infer<typeof AlertEventSchema>;

export const RcaRequestEventSchema = z.object({
  eventId: z.string(),
  incidentId: z.string(),
  analysisType: z.enum(AnalysisTypes),
  triggerExecutionId: z.string().nullable().default(null),
  requestedAt: z.string(),
});
export type RcaRequestEvent = z.infer<typeof RcaRequestEventSchema>;

export const RcaEventSchema = z.object({
  eventId: z.string(),
  incidentId: z.string(),
  primaryIncidentId: z.string(),
  originalAlertFingerprint: z.string(),
  originalAlertNode: z.string(),
  rootCauseNode: z.string().nullable(),
  faultType: z.enum(FaultTypes).nullable(),
  rootCauseFingerprint: z.string().nullable(),
  confidence: z.number().min(0).max(1),
  evidence: z.array(z.string()),
  handling: z.enum(RcaHandlingTypes),
  needHealing: z.boolean(),
  analysisType: z.enum(AnalysisTypes),
  analysisRound: z.number().int().positive(),
  triggerExecutionId: z.string().nullable(),
  candidateCount: z.number().int().min(0),
  completedAt: z.string(),
});
export type RcaEvent = z.infer<typeof RcaEventSchema>;

export const HealEventSchema = z.object({
  eventId: z.string(),
  taskStatus: z.enum(HealTaskStatuses),
  incidentId: z.string(),
  primaryIncidentId: z.string(),
  rcaEventId: z.string(),
  analysisRound: z.number().int().positive(),
  triggerExecutionId: z.string().nullable(),
  rootCauseNode: z.string(),
  faultType: z.enum(FaultTypes),
  rootCauseFingerprint: z.string(),
  action: z.string().nullable(),
  params: z.record(z.string(), z.unknown()).nullable(),
  actionRank: z.number().int().positive().nullable(),
  attemptNo: z.number().int().positive(),
  executionId: z.string(),
  verificationWindowSeconds: z.number().int().positive(),
  verificationResult: z.enum(["PENDING", "RECOVERED", "NOT_RECOVERED"]).default("PENDING"),
  createdAt: z.string(),
});
export type HealEvent = z.infer<typeof HealEventSchema>;

export const ExecutionCommandSchema = z.object({
  eventId: z.string(),
  incidentId: z.string(),
  primaryIncidentId: z.string(),
  executionId: z.string(),
  playbookId: z.string(),
  action: z.string(),
  targetNode: z.string(),
  params: z.record(z.string(), z.unknown()),
  issuedAt: z.string(),
});
export type ExecutionCommand = z.infer<typeof ExecutionCommandSchema>;

export const ExecutionResultSchema = z.object({
  eventId: z.string(),
  incidentId: z.string(),
  primaryIncidentId: z.string(),
  executionId: z.string(),
  status: z.enum(["SUCCESS", "FAILED"]),
  action: z.string(),
  params: z.record(z.string(), z.unknown()),
  startedAt: z.string(),
  completedAt: z.string(),
  error: z.string().nullable(),
});
export type ExecutionResult = z.infer<typeof ExecutionResultSchema>;
