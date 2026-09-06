import mysql, { type Pool } from "mysql2/promise";
import type { StateStore } from "./state-store.js";
import type { ActiveAlert, ActiveRootIncident, AutoRepairHistory, IncidentReport, IncidentState, RepairAttempt, VerificationSession } from "../../domain/models.js";
import type { AlertEvent, RcaEvent, HealEvent } from "../../domain/events.js";
import type { FaultType, IncidentStatus } from "../../domain/enums.js";

function parseJson<T>(value: unknown): T {
  if (typeof value === "string") return JSON.parse(value) as T;
  return value as T;
}

export class MySqlStateStore implements StateStore {
  private pool: Pool;
  constructor() {
    this.pool = mysql.createPool({
      host: process.env.MYSQL_HOST ?? "localhost",
      port: Number(process.env.MYSQL_PORT ?? 3306),
      user: process.env.MYSQL_USER ?? "aiops",
      password: process.env.MYSQL_PASSWORD ?? "aiops",
      database: process.env.MYSQL_DATABASE ?? "aiops",
      connectionLimit: 10,
      timezone: "Z",
    });
  }
  async init() { await this.pool.query("SELECT 1"); }
  async close() { await this.pool.end(); }
  async isProcessed(eventId: string, consumer: string) { const [rows] = await this.pool.query<any[]>("SELECT 1 FROM processed_events WHERE event_id=? AND consumer_name=? LIMIT 1", [eventId, consumer]); return rows.length > 0; }
  async markProcessed(eventId: string, consumer: string) { await this.pool.query("INSERT IGNORE INTO processed_events(event_id,consumer_name,processed_at) VALUES(?,?,NOW(3))", [eventId, consumer]); }

  async getIncident(id: string) { const [r]=await this.pool.query<any[]>("SELECT payload FROM incident_state WHERE incident_id=?",[id]); return r[0] ? parseJson<IncidentState>(r[0].payload) : null; }
  async createIncidentFromAlert(alert: AlertEvent) {
    const s: IncidentState={incidentId:alert.incidentId,primaryIncidentId:alert.incidentId,originalAlertFingerprint:alert.alertFingerprint,originalAlertNode:alert.alertNode,originalMetricName:alert.metricName,status:"RECEIVED",analysisRound:1,currentRootCauseNode:null,currentFaultType:null,currentRootCauseFingerprint:null,consecutiveRepairFailures:0,createdAt:alert.createdAt,updatedAt:alert.createdAt};
    await this.pool.query("INSERT INTO incident_state(incident_id,primary_incident_id,status,payload,updated_at) VALUES(?,?,?,?,NOW(3))",[s.incidentId,s.primaryIncidentId,s.status,JSON.stringify(s)]); return s;
  }
  async updateIncident(id:string,patch:Partial<IncidentState>){const s=await this.getIncident(id); if(!s) throw new Error(`incident not found: ${id}`); const n={...s,...patch,updatedAt:new Date().toISOString()}; await this.pool.query("UPDATE incident_state SET primary_incident_id=?,status=?,payload=?,updated_at=NOW(3) WHERE incident_id=?",[n.primaryIncidentId,n.status,JSON.stringify(n),id]);}
  async setIncidentStatus(id:string,status:IncidentStatus){await this.updateIncident(id,{status});}
  async listIncidentsByPrimary(primary:string){const [r]=await this.pool.query<any[]>("SELECT payload FROM incident_state WHERE primary_incident_id=?",[primary]); return r.map(x=>parseJson<IncidentState>(x.payload));}

  async getActiveAlert(fp:string){const [r]=await this.pool.query<any[]>("SELECT payload FROM active_alert WHERE alert_fingerprint=?",[fp]); return r[0]?parseJson<ActiveAlert>(r[0].payload):null;}
  async upsertActiveAlert(a:ActiveAlert){await this.pool.query("INSERT INTO active_alert(alert_fingerprint,incident_id,primary_incident_id,payload,updated_at) VALUES(?,?,?,?,NOW(3)) ON DUPLICATE KEY UPDATE incident_id=VALUES(incident_id),primary_incident_id=VALUES(primary_incident_id),payload=VALUES(payload),updated_at=NOW(3)",[a.alertFingerprint,a.incidentId,a.primaryIncidentId,JSON.stringify(a)]);}
  async updateActiveAlertPrimary(fp:string,primary:string){const a=await this.getActiveAlert(fp); if(a) await this.upsertActiveAlert({...a,primaryIncidentId:primary});}
  async listActiveAlertsByPrimary(primary:string){const [r]=await this.pool.query<any[]>("SELECT payload FROM active_alert WHERE primary_incident_id=?",[primary]); return r.map(x=>parseJson<ActiveAlert>(x.payload));}
  async deleteActiveAlertsByPrimary(primary:string){await this.pool.query("DELETE FROM active_alert WHERE primary_incident_id=?",[primary]);}

  async findActiveRoot(fp:string){const [r]=await this.pool.query<any[]>("SELECT payload FROM active_root_incident WHERE root_cause_fingerprint=?",[fp]); return r[0]?parseJson<ActiveRootIncident>(r[0].payload):null;}
  async upsertActiveRoot(a:ActiveRootIncident){await this.pool.query("INSERT INTO active_root_incident(root_cause_fingerprint,primary_incident_id,payload,updated_at) VALUES(?,?,?,NOW(3)) ON DUPLICATE KEY UPDATE primary_incident_id=VALUES(primary_incident_id),payload=VALUES(payload),updated_at=NOW(3)",[a.rootCauseFingerprint,a.primaryIncidentId,JSON.stringify(a)]);}
  async deleteActiveRoot(fp:string){await this.pool.query("DELETE FROM active_root_incident WHERE root_cause_fingerprint=?",[fp]);}
  async deleteActiveRootsByPrimary(primary:string){await this.pool.query("DELETE FROM active_root_incident WHERE primary_incident_id=?",[primary]);}

  async saveRca(e:RcaEvent){await this.pool.query("INSERT INTO rca_events(event_id,incident_id,primary_incident_id,completed_at,payload) VALUES(?,?,?,?,?)",[e.eventId,e.incidentId,e.primaryIncidentId,e.completedAt,JSON.stringify(e)]);}
  async getRca(id:string){const [r]=await this.pool.query<any[]>("SELECT payload FROM rca_events WHERE event_id=?",[id]); return r[0]?parseJson<RcaEvent>(r[0].payload):null;}
  async getLatestRca(incidentId:string){const [r]=await this.pool.query<any[]>("SELECT payload FROM rca_events WHERE incident_id=? ORDER BY completed_at DESC LIMIT 1",[incidentId]); return r[0]?parseJson<RcaEvent>(r[0].payload):null;}
  async listRcaByPrimary(primary:string){const [r]=await this.pool.query<any[]>("SELECT payload FROM rca_events WHERE primary_incident_id=? ORDER BY completed_at",[primary]); return r.map(x=>parseJson<RcaEvent>(x.payload));}

  async saveRepairAttempt(a:RepairAttempt){await this.pool.query("INSERT INTO repair_attempt(execution_id,incident_id,primary_incident_id,status,attempt_no,payload,updated_at) VALUES(?,?,?,?,?,?,NOW(3))",[a.executionId,a.incidentId,a.primaryIncidentId,a.status,a.attemptNo,JSON.stringify(a)]);}
  async updateRepairAttempt(id:string,patch:Partial<RepairAttempt>){const a=await this.getRepairAttempt(id); if(!a) throw new Error(`attempt not found: ${id}`); const n={...a,...patch}; await this.pool.query("UPDATE repair_attempt SET status=?,payload=?,updated_at=NOW(3) WHERE execution_id=?",[n.status,JSON.stringify(n),id]);}
  async getRepairAttempt(id:string){const [r]=await this.pool.query<any[]>("SELECT payload FROM repair_attempt WHERE execution_id=?",[id]); return r[0]?parseJson<RepairAttempt>(r[0].payload):null;}
  async listRepairAttempts(primary:string){const [r]=await this.pool.query<any[]>("SELECT payload FROM repair_attempt WHERE primary_incident_id=? ORDER BY attempt_no",[primary]); return r.map(x=>parseJson<RepairAttempt>(x.payload));}

  async saveVerification(v:VerificationSession){await this.pool.query("INSERT INTO verification_session(verification_id,incident_id,primary_incident_id,execution_id,status,end_at,payload,updated_at) VALUES(?,?,?,?,?,?,?,NOW(3))",[v.verificationId,v.incidentId,v.primaryIncidentId,v.executionId,v.status,v.endAt,JSON.stringify(v)]);}
  async updateVerification(id:string,patch:Partial<VerificationSession>){const [r]=await this.pool.query<any[]>("SELECT payload FROM verification_session WHERE verification_id=?",[id]); if(!r[0]) throw new Error(`verification not found: ${id}`); const n={...parseJson<VerificationSession>(r[0].payload),...patch}; await this.pool.query("UPDATE verification_session SET status=?,end_at=?,payload=?,updated_at=NOW(3) WHERE verification_id=?",[n.status,n.endAt,JSON.stringify(n),id]);}
  async getVerificationByExecution(id:string){const [r]=await this.pool.query<any[]>("SELECT payload FROM verification_session WHERE execution_id=? ORDER BY updated_at DESC LIMIT 1",[id]); return r[0]?parseJson<VerificationSession>(r[0].payload):null;}
  async listDueVerifications(now:string){const [r]=await this.pool.query<any[]>("SELECT payload FROM verification_session WHERE status='PENDING' AND end_at<=?",[now]); return r.map(x=>parseJson<VerificationSession>(x.payload));}

  async addAutoRepairHistory(h:AutoRepairHistory){await this.pool.query("INSERT INTO auto_repair_history(history_id,primary_incident_id,root_cause_node,fault_type,action,result,payload,created_at) VALUES(?,?,?,?,?,?,?,NOW(3))",[h.historyId,h.primaryIncidentId,h.rootCauseNode,h.faultType,h.action,h.result,JSON.stringify(h)]);}
  async findAutoRepairHistory(node:string,faultType:FaultType,actions:string[]){if(!actions.length)return[]; const marks=actions.map(()=>"?").join(","); const [r]=await this.pool.query<any[]>(`SELECT payload FROM auto_repair_history WHERE root_cause_node=? AND fault_type=? AND action IN (${marks}) ORDER BY created_at DESC LIMIT 50`,[node,faultType,...actions]); return r.map(x=>parseJson<AutoRepairHistory>(x.payload));}
  async savePendingApproval(e:HealEvent){await this.pool.query("INSERT INTO pending_approval(execution_id,incident_id,payload,created_at) VALUES(?,?,?,NOW(3)) ON DUPLICATE KEY UPDATE payload=VALUES(payload)",[e.executionId,e.incidentId,JSON.stringify(e)]);}
  async getPendingApproval(id:string){const [r]=await this.pool.query<any[]>("SELECT payload FROM pending_approval WHERE execution_id=?",[id]);return r[0]?parseJson<HealEvent>(r[0].payload):null;}
  async deletePendingApproval(id:string){await this.pool.query("DELETE FROM pending_approval WHERE execution_id=?",[id]);}
  async saveReport(report:IncidentReport){await this.pool.query("INSERT INTO incident_report(report_id,primary_incident_id,payload,generated_at) VALUES(?,?,?,NOW(3)) ON DUPLICATE KEY UPDATE payload=VALUES(payload),generated_at=NOW(3)",[report.reportId,report.primaryIncidentId,JSON.stringify(report)]);}
  async getReport(primary:string){const [r]=await this.pool.query<any[]>("SELECT payload FROM incident_report WHERE primary_incident_id=? ORDER BY generated_at DESC LIMIT 1",[primary]); return r[0]?parseJson<IncidentReport>(r[0].payload):null;}
}
