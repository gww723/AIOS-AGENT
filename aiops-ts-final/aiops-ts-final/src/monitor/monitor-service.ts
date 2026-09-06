import { MetricSnapshotEventSchema, AlertEventSchema, RcaRequestEventSchema } from "../domain/events.js";
import { Topics } from "../domain/topics.js";
import type { EventBus } from "../infrastructure/kafka/event-bus.js";
import type { StateStore } from "../infrastructure/state/state-store.js";
import { AnomalyDetector } from "../shared/anomaly/anomaly-detector.js";
import { buildAlertFingerprint } from "../shared/fingerprints.js";
import { newId } from "../shared/ids.js";
import { nowIso } from "../shared/time.js";

export class MonitorService {
  private detector = new AnomalyDetector();
  constructor(private readonly bus:EventBus, private readonly store:StateStore){}

  async handleMetric(raw:unknown){
    const metric=MetricSnapshotEventSchema.parse(raw); const consumer="monitor-service"; if(await this.store.isProcessed(metric.eventId,consumer))return;
    const result=this.detector.detect(metric.serviceName,metric.metrics,metric.sampleTime);
    for(const d of result.metricDecisions){
      if(!d.isAnomaly) continue;
      const fp=buildAlertFingerprint(metric.serviceName,d.metricName,metric.stableLabels);
      const active=await this.store.getActiveAlert(fp);
      if(active){await this.store.upsertActiveAlert({...active,lastSeenAt:metric.sampleTime});continue;}
      const incidentId=newId("INC"); const alert=AlertEventSchema.parse({eventId:newId("alert"),incidentId,alertFingerprint:fp,alertNode:metric.serviceName,metricName:d.metricName,currentValue:d.value,sampleTime:metric.sampleTime,anomalyVotes:d.votes,metricSnapshot:metric.metrics,createdAt:nowIso()});
      await this.store.createIncidentFromAlert(alert);
      await this.store.upsertActiveAlert({alertFingerprint:fp,incidentId,primaryIncidentId:incidentId,alertNode:metric.serviceName,metricName:d.metricName,firstSeenAt:metric.sampleTime,lastSeenAt:metric.sampleTime});
      await this.bus.publish(Topics.ALERTS,incidentId,alert);
      const req=RcaRequestEventSchema.parse({eventId:newId("rca-req"),incidentId,analysisType:"INITIAL",triggerExecutionId:null,requestedAt:nowIso()});
      await this.bus.publish(Topics.RCA_REQUESTS,incidentId,req);
    }
    await this.store.markProcessed(metric.eventId,consumer);
  }
}
