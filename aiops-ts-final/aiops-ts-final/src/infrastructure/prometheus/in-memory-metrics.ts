import type { MetricsProvider } from "./metrics-provider.js";
import type { TimeSeriesPoint } from "../../shared/anomaly/anomaly-detector.js";

export class InMemoryMetricsProvider implements MetricsProvider {
  private data = new Map<string, TimeSeriesPoint[]>();
  nodeTypes = new Map<string,string>();
  add(serviceName:string, metrics:Record<string,number>, time:string, nodeType="business-service") {
    this.nodeTypes.set(serviceName,nodeType);
    this.data.set(serviceName,[...(this.data.get(serviceName)??[]),{time,metrics}]);
  }
  replaceRecentWithNormal(serviceName:string, from:string, to:string) {
    const points=this.data.get(serviceName)??[];
    const start=new Date(from).getTime(); const end=new Date(to).getTime();
    const base=points.filter(p=>new Date(p.time).getTime()<start).slice(-10);
    const avg=(k:string)=> base.reduce((s,p)=>s+(p.metrics[k]??0),0)/Math.max(base.filter(p=>p.metrics[k]!==undefined).length,1);
    for(let t=start;t<=end;t+=15000){
      const keys=Object.keys(base.at(-1)?.metrics??{cpu:40,memory:50,qps:1000,latency:120,errorRate:.5});
      const metrics:Record<string,number>={}; for(const k of keys) metrics[k]=avg(k);
      this.add(serviceName,metrics,new Date(t).toISOString(),this.nodeTypes.get(serviceName));
    }
  }
  async queryRange(serviceName:string,start:string,end:string){const s=new Date(start).getTime(),e=new Date(end).getTime(); return (this.data.get(serviceName)??[]).filter(p=>{const t=new Date(p.time).getTime();return t>=s&&t<=e;});}
  async queryCurrentSnapshots(){return [...this.data.entries()].map(([serviceName,points])=>{const p=points.at(-1)!;return {serviceName,nodeType:this.nodeTypes.get(serviceName)??"unknown",metrics:p.metrics,sampleTime:p.time,stableLabels:{}};});}
}
