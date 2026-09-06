import { KafkaEventBus } from "../infrastructure/kafka/kafka-event-bus.js";
import { PrometheusClient } from "../infrastructure/prometheus/prometheus-client.js";
import { MetricSnapshotEventSchema } from "../domain/events.js";
import { Topics } from "../domain/topics.js";
import { newId } from "../shared/ids.js";

const intervalMs=Number(process.env.COLLECT_INTERVAL_MS??15000);const bus=new KafkaEventBus();const prom=new PrometheusClient();await bus.connect();console.log("[collector] started");
async function collect(){try{for(const s of await prom.queryCurrentSnapshots()){const e=MetricSnapshotEventSchema.parse({eventId:newId("metric"),...s});await bus.publish(Topics.METRICS,s.serviceName,e);}}catch(e){console.error("[collector]",e);}}
await collect();setInterval(collect,intervalMs);
