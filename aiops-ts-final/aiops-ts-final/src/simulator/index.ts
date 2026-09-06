import express from "express";

const services = [
  ["api-gateway",9101,"business-service"],["order-service",9102,"business-service"],["payment-service",9103,"business-service"],["inventory-service",9104,"business-service"],["user-service",9105,"business-service"],["notification-service",9106,"business-service"],
  ["mysql-primary",9107,"database"],["mysql-replica",9108,"database"],["redis-cache",9109,"cache"],["elasticsearch",9110,"search"],["kafka-broker",9111,"middleware"],
] as const;

type Fault = "normal"|"traffic_surge"|"memory_leak"|"deployment_regression"|"resource_exhaustion";
interface State { fault:Fault; metrics:Record<string,number>; }
const state=new Map<string,State>();
for(const [name,,type] of services){
  const business={cpu:40,memory:50,qps:1000,latency:120,errorRate:.5};
  const infra= type==="database"?{cpu:35,memory:45,connectionUsage:40,slowQueries:1,replicationLag:5}:type==="cache"?{cpu:25,memory:40,cacheHitRate:95,evictions:0}:type==="middleware"?{cpu:30,memory:45,consumerLag:5}:type==="search"?{cpu:35,memory:50,latency:80,errorRate:.2}:business;
  state.set(name,{fault:"normal",metrics:{...(infra as Record<string,number>)}});
}
const jitter=(x:number,p=.03)=>Math.max(0,x*(1+(Math.random()-.5)*2*p));
function tick(name:string,s:State){for(const k of Object.keys(s.metrics))s.metrics[k]=jitter(s.metrics[k]);switch(s.fault){case"traffic_surge":if("qps"in s.metrics)s.metrics.qps*=1.08;if("cpu"in s.metrics)s.metrics.cpu=Math.min(99,s.metrics.cpu+2);if("latency"in s.metrics)s.metrics.latency*=1.07;if("errorRate"in s.metrics)s.metrics.errorRate=Math.min(20,s.metrics.errorRate+.3);break;case"memory_leak":if("memory"in s.metrics)s.metrics.memory=Math.min(99,s.metrics.memory+1.5);if((s.metrics.memory??0)>75&&"latency"in s.metrics)s.metrics.latency*=1.05;break;case"deployment_regression":if("latency"in s.metrics)s.metrics.latency=1500+Math.random()*300;if("errorRate"in s.metrics)s.metrics.errorRate=6+Math.random()*3;break;case"resource_exhaustion":if("connectionUsage"in s.metrics)s.metrics.connectionUsage=Math.min(99,s.metrics.connectionUsage+4);if("slowQueries"in s.metrics)s.metrics.slowQueries+=2;if("cpu"in s.metrics)s.metrics.cpu=Math.min(98,s.metrics.cpu+2);break;case"normal":break;}}
setInterval(()=>{for(const [name,s] of state)tick(name,s);},5000);

const metricNames:Record<string,string>={cpu:"aiops_cpu_usage_percent",memory:"aiops_memory_usage_percent",qps:"aiops_qps",latency:"aiops_response_time_ms",errorRate:"aiops_error_rate_percent",connectionUsage:"aiops_connection_usage_percent",slowQueries:"aiops_slow_queries",replicationLag:"aiops_replication_lag_ms",cacheHitRate:"aiops_cache_hit_rate_percent",evictions:"aiops_evictions",consumerLag:"aiops_consumer_lag"};
for(const [name,port,type] of services){const app=express();app.get("/metrics",(_req,res)=>{const s=state.get(name)!;const lines=Object.entries(s.metrics).map(([k,v])=>`${metricNames[k]}{service="${name}",node_type="${type}"} ${v.toFixed(4)}`);res.type("text/plain").send(lines.join("\n")+"\n");});app.listen(port,"0.0.0.0",()=>console.log(`[simulator] ${name} :${port}/metrics`));}
const admin=express();admin.use(express.json());admin.post("/fault/:service/:fault",(req,res)=>{const s=state.get(req.params.service);if(!s)return res.status(404).json({error:"service not found"});const fault=req.params.fault as Fault;if(!["normal","traffic_surge","memory_leak","deployment_regression","resource_exhaustion"].includes(fault))return res.status(400).json({error:"invalid fault"});s.fault=fault;if(fault==="normal"){const [,,type]=services.find(x=>x[0]===req.params.service)!;if(type==="business-service")s.metrics={cpu:40,memory:50,qps:1000,latency:120,errorRate:.5};else if(type==="database")s.metrics={cpu:35,memory:45,connectionUsage:40,slowQueries:1,replicationLag:5};}return res.json({service:req.params.service,fault});});admin.get("/state",(_req,res)=>res.json(Object.fromEntries(state)));admin.listen(9200,"0.0.0.0",()=>console.log("[simulator-admin] :9200"));
