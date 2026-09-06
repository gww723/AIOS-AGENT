import { InMemoryEventBus } from "../infrastructure/kafka/in-memory-event-bus.js";
import { InMemoryStateStore } from "../infrastructure/state/in-memory-state-store.js";
import { InMemoryMetricsProvider } from "../infrastructure/prometheus/in-memory-metrics.js";
import { InMemoryTopologyProvider } from "../infrastructure/neo4j/in-memory-topology.js";
import { InMemoryLogProvider } from "../infrastructure/loki/in-memory-logs.js";
import { InMemoryChangeProvider } from "../infrastructure/changes/in-memory-changes.js";
import { MetricsAnalysisService } from "../rca/metrics-analysis-service.js";
import { HeuristicRcaReasoner } from "../rca/rca-reasoner.js";
import { RcaAgentService } from "../rca/rca-agent.js";
import { HeuristicHealReasoner } from "../heal/heal-reasoner.js";
import { HealAgentService } from "../heal/heal-agent.js";
import { ChangeAgentService } from "../change/change-agent.js";
import { DeterministicReportGenerator } from "../change/report-generator.js";
import { SimulationEnvironmentInspector } from "../heal/precondition.js";
import { MonitorService } from "../monitor/monitor-service.js";
import { ExecutionEngine } from "../executor/execution-engine.js";
import type { ActionExecutor } from "../infrastructure/executor/action-executor.js";
import { Topics } from "../domain/topics.js";
import { MetricSnapshotEventSchema } from "../domain/events.js";
import { newId } from "../shared/ids.js";

const bus=new InMemoryEventBus();const store=new InMemoryStateStore();const provider=new InMemoryMetricsProvider();const logProvider=new InMemoryLogProvider();const changeProvider=new InMemoryChangeProvider();const topology=new InMemoryTopologyProvider({"order-service":"business-service","payment-service":"business-service","inventory-service":"business-service","mysql-primary":"database","redis-cache":"cache"},[{from:"order-service",to:"payment-service"},{from:"order-service",to:"inventory-service"},{from:"payment-service",to:"mysql-primary"},{from:"payment-service",to:"redis-cache"}]);
let t=Date.now()-20*60_000;for(let i=0;i<40;i++){const time=new Date(t+=15000).toISOString();provider.add("order-service",{cpu:40+i%2,memory:50,qps:1000,latency:120+i%3,errorRate:.5},time);provider.add("payment-service",{cpu:42,memory:52,qps:900,latency:110+i%2,errorRate:.4},time);provider.add("inventory-service",{cpu:35,memory:45,qps:700,latency:90,errorRate:.2},time);provider.add("mysql-primary",{cpu:35,memory:45,connectionUsage:40+i%2,slowQueries:1,replicationLag:5},time,"database");provider.add("redis-cache",{cpu:20,memory:35,cacheHitRate:96,evictions:0},time,"cache");}
for(let i=0;i<12;i++){const time=new Date(t+=15000).toISOString();provider.add("mysql-primary",{cpu:65+i, memory:55, connectionUsage:70+i*2.2, slowQueries:4+i, replicationLag:5},time,"database");provider.add("payment-service",{cpu:55+i,memory:55,qps:950,latency:220+i*65,errorRate:1+i*.3},time);provider.add("order-service",{cpu:50+i,memory:52,qps:1000,latency:180+i*80,errorRate:.8+i*.2},time);provider.add("inventory-service",{cpu:35,memory:45,qps:700,latency:90,errorRate:.2},time);provider.add("redis-cache",{cpu:20,memory:35,cacheHitRate:96,evictions:0},time,"cache");}
logProvider.add("payment-service",new Date(t-30_000).toISOString(),"database connection timeout while calling mysql-primary");logProvider.add("mysql-primary",new Date(t-45_000).toISOString(),"too many connections: connection pool exhausted");

const metrics=new MetricsAnalysisService(provider);const monitor=new MonitorService(bus,store);const rca=new RcaAgentService(bus,store,topology,metrics,logProvider,changeProvider,new HeuristicRcaReasoner());const heal=new HealAgentService(bus,store,new SimulationEnvironmentInspector(),new HeuristicHealReasoner(),metrics,1,3);const change=new ChangeAgentService(bus,store,new DeterministicReportGenerator());
class DemoExecutor implements ActionExecutor {async dryRun(){return{ok:true,reason:"ok"};}async execute(){const base=Date.now();for(let i=1;i<=8;i++)provider.add("order-service",{cpu:40,memory:50,qps:1000,latency:120,errorRate:.5},new Date(base+i*150).toISOString());}}
const executor=new ExecutionEngine(bus,store,new DemoExecutor());
await bus.subscribe(Topics.RCA_REQUESTS,"rca",x=>rca.handleRequest(x));await bus.subscribe(Topics.RCA_EVENTS,"heal",x=>heal.handleRca(x));await bus.subscribe(Topics.HEAL_EVENTS,"change",x=>change.handle(x));await bus.subscribe(Topics.EXECUTION_COMMANDS,"exec",x=>executor.handle(x));await bus.subscribe(Topics.EXECUTION_EVENTS,"heal-exec",x=>heal.handleExecution(x));

// Feed baseline to Monitor, then one clearly abnormal order snapshot.
let mt=Date.now()-6*60_000;for(let i=0;i<20;i++){await monitor.handleMetric(MetricSnapshotEventSchema.parse({eventId:newId("metric"),serviceName:"order-service",nodeType:"business-service",metrics:{cpu:40+i%2,memory:50,qps:1000,latency:120+i%3,errorRate:.5},sampleTime:new Date(mt+=15000).toISOString(),stableLabels:{namespace:"order"}}));}
await monitor.handleMetric(MetricSnapshotEventSchema.parse({eventId:newId("metric"),serviceName:"order-service",nodeType:"business-service",metrics:{cpu:90,memory:80,qps:1800,latency:1500,errorRate:8},sampleTime:new Date(t).toISOString(),stableLabels:{namespace:"order"}}));
for(let round=0;round<4;round++){await new Promise(r=>setTimeout(r,1200));await heal.processDueVerifications(new Date(Date.now()+5000).toISOString());const any=[...store.incidents.values()][0];if(any?.status==="FINISHED")break;}
const incident=[...store.incidents.values()][0];if(!incident)throw new Error("demo did not create incident");const report=await store.getReport(incident.primaryIncidentId);console.log("\n=== AIOps Demo Result ===");console.log("Incident:",await store.getIncident(incident.incidentId));console.log("RCA:",await store.getLatestRca(incident.incidentId));console.log("Attempts:",await store.listRepairAttempts(incident.primaryIncidentId));console.log("Report:",report);if((await store.getIncident(incident.incidentId))?.status!=="FINISHED")throw new Error("demo did not finish");
