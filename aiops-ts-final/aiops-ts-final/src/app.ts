import { KafkaEventBus } from "./infrastructure/kafka/kafka-event-bus.js";
import { MySqlStateStore } from "./infrastructure/state/mysql-state-store.js";
import { PrometheusClient } from "./infrastructure/prometheus/prometheus-client.js";
import { Neo4jTopologyProvider } from "./infrastructure/neo4j/neo4j-topology.js";
import { LokiClient } from "./infrastructure/loki/loki-client.js";
import { MySqlChangeProvider } from "./infrastructure/changes/mysql-change-provider.js";
import { MetricsAnalysisService } from "./rca/metrics-analysis-service.js";
import { HeuristicRcaReasoner, LlmRcaReasoner } from "./rca/rca-reasoner.js";
import { HeuristicHealReasoner, LlmHealReasoner } from "./heal/heal-reasoner.js";
import { OpenAICompatibleLlmClient } from "./llm/llm-client.js";
import { MonitorService } from "./monitor/monitor-service.js";
import { RcaAgentService } from "./rca/rca-agent.js";
import { HealAgentService } from "./heal/heal-agent.js";
import { ChangeAgentService } from "./change/change-agent.js";
import { DeterministicReportGenerator, LlmReportGenerator } from "./change/report-generator.js";
import { SimulationEnvironmentInspector } from "./heal/precondition.js";
import { SimulatorHttpExecutor } from "./infrastructure/executor/action-executor.js";
import { ExecutionEngine } from "./executor/execution-engine.js";
import { Topics } from "./domain/topics.js";
import { startApprovalApi } from "./change/approval-api.js";

const bus=new KafkaEventBus();const store=new MySqlStateStore();const prom=new PrometheusClient();const metrics=new MetricsAnalysisService(prom);const topology=new Neo4jTopologyProvider();const logs=new LokiClient();const changes=new MySqlChangeProvider();const llmMode=process.env.LLM_MODE==="llm";const llm=new OpenAICompatibleLlmClient();
const monitor=new MonitorService(bus,store);const rca=new RcaAgentService(bus,store,topology,metrics,logs,changes,llmMode?new LlmRcaReasoner(llm):new HeuristicRcaReasoner());const heal=new HealAgentService(bus,store,new SimulationEnvironmentInspector(),llmMode?new LlmHealReasoner(llm):new HeuristicHealReasoner(),metrics);const change=new ChangeAgentService(bus,store,llmMode?new LlmReportGenerator(llm):new DeterministicReportGenerator());const executor=new ExecutionEngine(bus,store,new SimulatorHttpExecutor());
async function retry(name:string,fn:()=>Promise<void>,attempts=30){let last:unknown;for(let i=1;i<=attempts;i++){try{await fn();return;}catch(e){last=e;console.error(`[startup] ${name} attempt ${i}/${attempts} failed`);await new Promise(r=>setTimeout(r,2000));}}throw last;}
await retry("mysql",()=>store.init());await retry("kafka",()=>bus.connect());
await bus.subscribe(Topics.METRICS,"monitor-service",x=>monitor.handleMetric(x));await bus.subscribe(Topics.RCA_REQUESTS,"rca-agent",x=>rca.handleRequest(x));await bus.subscribe(Topics.RCA_EVENTS,"heal-agent",x=>heal.handleRca(x));await bus.subscribe(Topics.HEAL_EVENTS,"change-agent",x=>change.handle(x));await bus.subscribe(Topics.EXECUTION_COMMANDS,"execution-engine",x=>executor.handle(x));await bus.subscribe(Topics.EXECUTION_EVENTS,"heal-execution",x=>heal.handleExecution(x));
startApprovalApi(change);setInterval(()=>heal.processDueVerifications().catch(console.error),5000);console.log("[aiops-app] consumers started");
