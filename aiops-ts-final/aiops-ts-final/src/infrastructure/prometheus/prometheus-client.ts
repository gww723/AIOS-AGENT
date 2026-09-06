import type { MetricsProvider } from "./metrics-provider.js";
import type { TimeSeriesPoint } from "../../shared/anomaly/anomaly-detector.js";

const prefixMap: Record<string,string> = {
  aiops_cpu_usage_percent: "cpu",
  aiops_memory_usage_percent: "memory",
  aiops_qps: "qps",
  aiops_response_time_ms: "latency",
  aiops_error_rate_percent: "errorRate",
  aiops_connection_usage_percent: "connectionUsage",
  aiops_replication_lag_ms: "replicationLag",
  aiops_cache_hit_rate_percent: "cacheHitRate",
  aiops_evictions: "evictions",
  aiops_consumer_lag: "consumerLag",
  aiops_slow_queries: "slowQueries",
};

export class PrometheusClient implements MetricsProvider {
  constructor(private readonly baseUrl = process.env.PROMETHEUS_URL ?? "http://localhost:9090") {}
  private async api(path: string) {
    const res = await fetch(`${this.baseUrl}${path}`);
    if (!res.ok) throw new Error(`Prometheus request failed ${res.status}: ${await res.text()}`);
    return res.json() as Promise<any>;
  }
  async queryCurrentSnapshots() {
    const q = encodeURIComponent('{__name__=~"aiops_.*"}');
    const data = await this.api(`/api/v1/query?query=${q}`);
    const grouped = new Map<string, any>();
    for (const item of data.data.result ?? []) {
      const serviceName = item.metric.service;
      if (!serviceName) continue;
      const metricName = prefixMap[item.metric.__name__];
      if (!metricName) continue;
      const current = grouped.get(serviceName) ?? { serviceName, nodeType: item.metric.node_type ?? "unknown", metrics: {}, sampleTime: new Date(Number(item.value[0])*1000).toISOString(), stableLabels: item.metric.namespace ? { namespace: item.metric.namespace } : {} };
      current.metrics[metricName] = Number(item.value[1]);
      grouped.set(serviceName, current);
    }
    return [...grouped.values()];
  }
  async queryRange(serviceName: string, start: string, end: string): Promise<TimeSeriesPoint[]> {
    const query = encodeURIComponent(`{__name__=~"aiops_.*",service="${serviceName}"}`);
    const startSec = new Date(start).getTime()/1000;
    const endSec = new Date(end).getTime()/1000;
    const data = await this.api(`/api/v1/query_range?query=${query}&start=${startSec}&end=${endSec}&step=15s`);
    const points = new Map<number, Record<string, number>>();
    for (const series of data.data.result ?? []) {
      const metricName = prefixMap[series.metric.__name__]; if (!metricName) continue;
      for (const [ts, value] of series.values ?? []) {
        const t = Number(ts); const m = points.get(t) ?? {}; m[metricName] = Number(value); points.set(t,m);
      }
    }
    return [...points.entries()].sort(([a],[b])=>a-b).map(([ts,metrics])=>({time:new Date(ts*1000).toISOString(),metrics}));
  }
}
