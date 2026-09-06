import type { ActiveAlert, ActiveRootIncident, AutoRepairHistory, IncidentReport, IncidentState, RepairAttempt, VerificationSession } from "../../domain/models.js";
import type { AlertEvent, RcaEvent, HealEvent } from "../../domain/events.js";
import type { FaultType, IncidentStatus } from "../../domain/enums.js";

export interface StateStore {
  init(): Promise<void>;
  close(): Promise<void>;

  isProcessed(eventId: string, consumer: string): Promise<boolean>;
  markProcessed(eventId: string, consumer: string): Promise<void>;

  getIncident(incidentId: string): Promise<IncidentState | null>;
  createIncidentFromAlert(alert: AlertEvent): Promise<IncidentState>;
  updateIncident(incidentId: string, patch: Partial<IncidentState>): Promise<void>;
  setIncidentStatus(incidentId: string, status: IncidentStatus): Promise<void>;
  listIncidentsByPrimary(primaryIncidentId: string): Promise<IncidentState[]>;

  getActiveAlert(fingerprint: string): Promise<ActiveAlert | null>;
  upsertActiveAlert(alert: ActiveAlert): Promise<void>;
  updateActiveAlertPrimary(fingerprint: string, primaryIncidentId: string): Promise<void>;
  listActiveAlertsByPrimary(primaryIncidentId: string): Promise<ActiveAlert[]>;
  deleteActiveAlertsByPrimary(primaryIncidentId: string): Promise<void>;

  findActiveRoot(fingerprint: string): Promise<ActiveRootIncident | null>;
  upsertActiveRoot(root: ActiveRootIncident): Promise<void>;
  deleteActiveRoot(fingerprint: string): Promise<void>;
  deleteActiveRootsByPrimary(primaryIncidentId: string): Promise<void>;

  saveRca(event: RcaEvent): Promise<void>;
  getRca(eventId: string): Promise<RcaEvent | null>;
  getLatestRca(incidentId: string): Promise<RcaEvent | null>;
  listRcaByPrimary(primaryIncidentId: string): Promise<RcaEvent[]>;

  saveRepairAttempt(attempt: RepairAttempt): Promise<void>;
  updateRepairAttempt(executionId: string, patch: Partial<RepairAttempt>): Promise<void>;
  getRepairAttempt(executionId: string): Promise<RepairAttempt | null>;
  listRepairAttempts(primaryIncidentId: string): Promise<RepairAttempt[]>;

  saveVerification(session: VerificationSession): Promise<void>;
  updateVerification(verificationId: string, patch: Partial<VerificationSession>): Promise<void>;
  getVerificationByExecution(executionId: string): Promise<VerificationSession | null>;
  listDueVerifications(nowIso: string): Promise<VerificationSession[]>;

  addAutoRepairHistory(history: AutoRepairHistory): Promise<void>;
  findAutoRepairHistory(rootCauseNode: string, faultType: FaultType, actions: string[]): Promise<AutoRepairHistory[]>;

  savePendingApproval(event: HealEvent): Promise<void>;
  getPendingApproval(executionId: string): Promise<HealEvent | null>;
  deletePendingApproval(executionId: string): Promise<void>;

  saveReport(report: IncidentReport): Promise<void>;
  getReport(primaryIncidentId: string): Promise<IncidentReport | null>;
}
