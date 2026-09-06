import { IsolationForestLite } from "./isolation-forest.js";

export interface MetricDecision {
  metricName: string;
  value: number;
  sigmaAnomaly: boolean;
  ewmaAnomaly: boolean;
  isolationForestAnomaly: boolean;
  votes: number;
  isAnomaly: boolean;
}

export interface SnapshotDecision {
  serviceName: string;
  sampleTime: string;
  metricDecisions: MetricDecision[];
  vectorAnomalyScore: number;
}

function mean(values: number[]): number {
  return values.reduce((a, b) => a + b, 0) / Math.max(values.length, 1);
}
function std(values: number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  return Math.sqrt(values.reduce((sum, v) => sum + (v - m) ** 2, 0) / values.length);
}
function ewma(values: number[], alpha = 0.3): number {
  if (!values.length) return 0;
  return values.slice(1).reduce((state, value) => alpha * value + (1 - alpha) * state, values[0]);
}

export class AnomalyDetector {
  private metricHistory = new Map<string, number[]>();
  private vectorHistory = new Map<string, number[][]>();

  constructor(private readonly maxHistory = 60, private readonly minHistory = 8) {}

  detect(serviceName: string, metrics: Record<string, number>, sampleTime: string): SnapshotDecision {
    const metricNames = Object.keys(metrics).sort();
    const vector = metricNames.map((name) => metrics[name]);
    const vectors = this.vectorHistory.get(serviceName) ?? [];
    const forest = new IsolationForestLite();
    forest.fit(vectors);
    const vectorScore = forest.score(vector);
    const ifAnomaly = vectors.length >= this.minHistory && vectorScore >= 0.62;

    const metricDecisions = metricNames.map((metricName) => {
      const key = `${serviceName}::${metricName}`;
      const history = this.metricHistory.get(key) ?? [];
      const value = metrics[metricName];
      let sigmaAnomaly = false;
      let ewmaAnomaly = false;
      if (history.length >= this.minHistory) {
        const m = mean(history);
        const s = std(history);
        sigmaAnomaly = s > 0 && Math.abs(value - m) > 3 * s;
        const smoothed = ewma(history);
        const recentStd = Math.max(std(history.slice(-Math.min(20, history.length))), 1e-6);
        ewmaAnomaly = Math.abs(value - smoothed) > 2.5 * recentStd;
      }
      const votes = Number(sigmaAnomaly) + Number(ewmaAnomaly) + Number(ifAnomaly);
      const decision: MetricDecision = {
        metricName,
        value,
        sigmaAnomaly,
        ewmaAnomaly,
        isolationForestAnomaly: ifAnomaly,
        votes,
        isAnomaly: votes >= 2,
      };
      const next = [...history, value].slice(-this.maxHistory);
      this.metricHistory.set(key, next);
      return decision;
    });

    this.vectorHistory.set(serviceName, [...vectors, vector].slice(-this.maxHistory));
    return { serviceName, sampleTime, metricDecisions, vectorAnomalyScore: vectorScore };
  }
}

export interface TimeSeriesPoint { time: string; metrics: Record<string, number> }
export interface WindowAnalysis {
  abnormal: boolean;
  abnormalMetrics: string[];
  earliestAnomalyAt: string | null;
  summary: string[];
}

export function analyzeWindow(serviceName: string, baseline: TimeSeriesPoint[], target: TimeSeriesPoint[]): WindowAnalysis {
  const detector = new AnomalyDetector(120, Math.min(8, Math.max(4, baseline.length)));
  for (const point of baseline) detector.detect(serviceName, point.metrics, point.time);
  const abnormal = new Set<string>();
  let earliest: string | null = null;
  const summary: string[] = [];
  for (const point of target) {
    const result = detector.detect(serviceName, point.metrics, point.time);
    for (const decision of result.metricDecisions) {
      if (decision.isAnomaly) {
        abnormal.add(decision.metricName);
        earliest ??= point.time;
      }
    }
  }
  for (const metric of abnormal) summary.push(`${metric} 在目标时间窗口内被 2/3 投票判定为异常`);
  return { abnormal: abnormal.size > 0, abnormalMetrics: [...abnormal], earliestAnomalyAt: earliest, summary };
}
