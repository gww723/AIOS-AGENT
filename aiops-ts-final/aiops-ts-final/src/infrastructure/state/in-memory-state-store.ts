import type { StateStore } from "./state-store.js";
import type { ActiveAlert, ActiveRootIncident, AutoRepairHistory, IncidentReport, IncidentState, RepairAttempt, VerificationSession } from "../../domain/models.js";
import type { AlertEvent, RcaEvent, HealEvent } from "../../domain/events.js";
import type { FaultType, IncidentStatus } from "../../domain/enums.js";

export class InMemoryStateStore implements StateStore {
  incidents = new Map<string, IncidentState>();
  activeAlerts = new Map<string, ActiveAlert>();
  activeRoots = new Map<string, ActiveRootIncident>();
  rcas = new Map<string, RcaEvent>();
  attempts = new Map<string, RepairAttempt>();
  verifications = new Map<string, VerificationSession>();
  histories: AutoRepairHistory[] = [];
  reports = new Map<string, IncidentReport>();
  pendingApprovals = new Map<string, HealEvent>();
  processed = new Set<string>();

  async init() {}
  async close() {}
  async isProcessed(eventId: string, consumer: string) { return this.processed.has(`${consumer}::${eventId}`); }
  async markProcessed(eventId: string, consumer: string) { this.processed.add(`${consumer}::${eventId}`); }

  async getIncident(id: string) { return this.incidents.get(id) ?? null; }
  async createIncidentFromAlert(alert: AlertEvent) {
    const now = alert.createdAt;
    const state: IncidentState = {
      incidentId: alert.incidentId,
      primaryIncidentId: alert.incidentId,
      originalAlertFingerprint: alert.alertFingerprint,
      originalAlertNode: alert.alertNode,
      originalMetricName: alert.metricName,
      status: "RECEIVED",
      analysisRound: 1,
      currentRootCauseNode: null,
      currentFaultType: null,
      currentRootCauseFingerprint: null,
      consecutiveRepairFailures: 0,
      createdAt: now,
      updatedAt: now,
    };
    this.incidents.set(state.incidentId, state);
    return state;
  }
  async updateIncident(id: string, patch: Partial<IncidentState>) {
    const current = this.incidents.get(id); if (!current) throw new Error(`incident not found: ${id}`);
    this.incidents.set(id, { ...current, ...patch, updatedAt: new Date().toISOString() });
  }
  async setIncidentStatus(id: string, status: IncidentStatus) { await this.updateIncident(id, { status }); }
  async listIncidentsByPrimary(primary: string) { return [...this.incidents.values()].filter((x) => x.primaryIncidentId === primary); }

  async getActiveAlert(fp: string) { return this.activeAlerts.get(fp) ?? null; }
  async upsertActiveAlert(a: ActiveAlert) { this.activeAlerts.set(a.alertFingerprint, a); }
  async updateActiveAlertPrimary(fp: string, primary: string) { const a = this.activeAlerts.get(fp); if (a) this.activeAlerts.set(fp, { ...a, primaryIncidentId: primary }); }
  async listActiveAlertsByPrimary(primary: string) { return [...this.activeAlerts.values()].filter((x) => x.primaryIncidentId === primary); }
  async deleteActiveAlertsByPrimary(primary: string) { for (const [k, v] of this.activeAlerts) if (v.primaryIncidentId === primary) this.activeAlerts.delete(k); }

  async findActiveRoot(fp: string) { return this.activeRoots.get(fp) ?? null; }
  async upsertActiveRoot(root: ActiveRootIncident) { this.activeRoots.set(root.rootCauseFingerprint, root); }
  async deleteActiveRoot(fp: string) { this.activeRoots.delete(fp); }
  async deleteActiveRootsByPrimary(primary: string) { for (const [k,v] of this.activeRoots) if (v.primaryIncidentId===primary) this.activeRoots.delete(k); }

  async saveRca(event: RcaEvent) { this.rcas.set(event.eventId, event); }
  async getRca(id: string) { return this.rcas.get(id) ?? null; }
  async getLatestRca(incidentId: string) {
    return [...this.rcas.values()].filter((x) => x.incidentId === incidentId).sort((a,b)=>b.completedAt.localeCompare(a.completedAt))[0] ?? null;
  }
  async listRcaByPrimary(primary: string) { return [...this.rcas.values()].filter((x) => x.primaryIncidentId === primary).sort((a,b)=>a.completedAt.localeCompare(b.completedAt)); }

  async saveRepairAttempt(a: RepairAttempt) { this.attempts.set(a.executionId, a); }
  async updateRepairAttempt(id: string, patch: Partial<RepairAttempt>) { const a=this.attempts.get(id); if(!a) throw new Error(`attempt not found: ${id}`); this.attempts.set(id,{...a,...patch}); }
  async getRepairAttempt(id: string) { return this.attempts.get(id) ?? null; }
  async listRepairAttempts(primary: string) { return [...this.attempts.values()].filter((x) => x.primaryIncidentId === primary).sort((a,b)=>a.attemptNo-b.attemptNo); }

  async saveVerification(v: VerificationSession) { this.verifications.set(v.verificationId, v); }
  async updateVerification(id: string, patch: Partial<VerificationSession>) { const v=this.verifications.get(id); if(!v) throw new Error(`verification not found: ${id}`); this.verifications.set(id,{...v,...patch}); }
  async getVerificationByExecution(executionId: string) { return [...this.verifications.values()].find((x) => x.executionId === executionId) ?? null; }
  async listDueVerifications(now: string) { return [...this.verifications.values()].filter((x) => x.status === "PENDING" && x.endAt <= now); }

  async addAutoRepairHistory(h: AutoRepairHistory) { this.histories.push(h); }
  async findAutoRepairHistory(node: string, faultType: FaultType, actions: string[]) { return this.histories.filter((x) => x.rootCauseNode === node && x.faultType === faultType && actions.includes(x.action)); }
  async savePendingApproval(e: HealEvent) { this.pendingApprovals.set(e.executionId,e); }
  async getPendingApproval(id: string) { return this.pendingApprovals.get(id) ?? null; }
  async deletePendingApproval(id: string) { this.pendingApprovals.delete(id); }
  async saveReport(r: IncidentReport) { this.reports.set(r.primaryIncidentId, r); }
  async getReport(primary: string) { return this.reports.get(primary) ?? null; }
}
