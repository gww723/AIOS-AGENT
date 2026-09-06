import type { FaultType, IncidentStatus } from "./enums.js";
import type { AlertEvent, RcaEvent } from "./events.js";

export interface IncidentState {
  incidentId: string;
  primaryIncidentId: string;
  originalAlertFingerprint: string;
  originalAlertNode: string;
  originalMetricName: string;
  status: IncidentStatus;
  analysisRound: number;
  currentRootCauseNode: string | null;
  currentFaultType: FaultType | null;
  currentRootCauseFingerprint: string | null;
  consecutiveRepairFailures: number;
  createdAt: string;
  updatedAt: string;
}

export interface ActiveAlert {
  alertFingerprint: string;
  incidentId: string;
  primaryIncidentId: string;
  alertNode: string;
  metricName: string;
  firstSeenAt: string;
  lastSeenAt: string;
}

export interface ActiveRootIncident {
  rootCauseFingerprint: string;
  primaryIncidentId: string;
  rootCauseNode: string;
  faultType: FaultType;
  status: "ACTIVE";
  createdAt: string;
  updatedAt: string;
}

export interface RepairAttempt {
  executionId: string;
  incidentId: string;
  primaryIncidentId: string;
  rcaEventId: string;
  attemptNo: number;
  action: string;
  params: Record<string, unknown>;
  status: "PENDING" | "RUNNING" | "SUCCESS" | "FAILED" | "NOT_RECOVERED" | "RECOVERED";
  startedAt: string | null;
  completedAt: string | null;
  error: string | null;
}

export interface VerificationSession {
  verificationId: string;
  incidentId: string;
  primaryIncidentId: string;
  executionId: string;
  alertFingerprint: string;
  alertNode: string;
  metricName: string;
  baselineEndAt: string;
  startAt: string;
  endAt: string;
  status: "PENDING" | "RECOVERED" | "NOT_RECOVERED";
}

export interface AutoRepairHistory {
  historyId: string;
  primaryIncidentId: string;
  rootCauseNode: string;
  faultType: FaultType;
  action: string;
  params: Record<string, unknown>;
  result: "SUCCESS" | "FAILED";
  recoverySeconds: number | null;
  createdAt: string;
}

export interface IncidentReport {
  reportId: string;
  primaryIncidentId: string;
  alertSummary: string;
  rootCauseNode: string;
  faultType: FaultType;
  evidence: string[];
  attempts: Array<{ executionId: string; action: string; params: Record<string, unknown>; status: string }>;
  finalResult: "RECOVERED" | "HUMAN";
  generatedAt: string;
}

export interface RcaCandidate {
  node: string;
  faultType: FaultType;
  confidence: number;
  evidence: string[];
}

export interface NodeEvidence {
  node: string;
  metrics: {
    abnormal: boolean;
    abnormalMetrics: string[];
    earliestAnomalyAt: string | null;
    summary: string[];
  };
  logs: string[];
  changes: Array<{ type: string; version?: string; occurredAt: string; summary: string }>;
}

export interface RcaTrace {
  alert: AlertEvent;
  inspectedNodes: string[];
  evidenceByNode: Record<string, NodeEvidence>;
  topologyEdges: Array<{ from: string; to: string }>;
}

export interface StoredRcaRecord {
  event: RcaEvent;
}
