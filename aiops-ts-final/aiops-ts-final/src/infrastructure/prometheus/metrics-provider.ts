import type { TimeSeriesPoint } from "../../shared/anomaly/anomaly-detector.js";
export interface MetricsProvider {
  queryRange(serviceName: string, start: string, end: string): Promise<TimeSeriesPoint[]>;
  queryCurrentSnapshots(): Promise<Array<{ serviceName: string; nodeType: string; metrics: Record<string, number>; sampleTime: string; stableLabels: Record<string,string> }>>;
}
