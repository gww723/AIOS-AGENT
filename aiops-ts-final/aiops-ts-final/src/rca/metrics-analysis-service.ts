import type { MetricsProvider } from "../infrastructure/prometheus/metrics-provider.js";
import { analyzeWindow } from "../shared/anomaly/anomaly-detector.js";
import { minusMinutes } from "../shared/time.js";

export class MetricsAnalysisService {
  constructor(private readonly metrics:MetricsProvider){}
  async analyzeAround(node:string,centerTime:string){
    const baselineStart=minusMinutes(centerTime,10); const targetStart=minusMinutes(centerTime,3); const end=new Date(new Date(centerTime).getTime()+60_000).toISOString();
    const all=await this.metrics.queryRange(node,baselineStart,end); const boundary=new Date(targetStart).getTime();
    const baseline=all.filter(p=>new Date(p.time).getTime()<boundary); const target=all.filter(p=>new Date(p.time).getTime()>=boundary);
    return analyzeWindow(node,baseline,target);
  }
  async verify(node:string,metricName:string,start:string,end:string,baselineEndAt:string){
    const baselineStart=minusMinutes(baselineEndAt,10);
    const [baselineAll,target]=await Promise.all([this.metrics.queryRange(node,baselineStart,baselineEndAt),this.metrics.queryRange(node,start,end)]);
    const baseline=baselineAll.filter(p=>new Date(p.time).getTime()<new Date(baselineEndAt).getTime());
    if(target.length<2) return {abnormal:true,abnormalMetrics:[metricName],earliestAnomalyAt:null,summary:["验证窗口指标样本不足，不能判定恢复"],originalMetricStillAbnormal:true};
    const result=analyzeWindow(node,baseline,target); return { ...result, originalMetricStillAbnormal: result.abnormalMetrics.includes(metricName) };
  }
}
