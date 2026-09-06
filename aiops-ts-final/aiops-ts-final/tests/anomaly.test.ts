import { describe, expect, it } from "vitest";
import { AnomalyDetector } from "../src/shared/anomaly/anomaly-detector.js";

describe("AnomalyDetector", () => {
  it("detects a sharp multi-dimensional anomaly after baseline", () => {
    const d = new AnomalyDetector();
    let t = Date.now();
    for (let i = 0; i < 20; i++) {
      d.detect("payment-service", { cpu: 40 + (i % 3), memory: 50 + (i % 2), qps: 1000 + (i % 4) * 10, latency: 120 + (i % 3), errorRate: 0.5 }, new Date(t += 15000).toISOString());
    }
    const result = d.detect("payment-service", { cpu: 95, memory: 90, qps: 3300, latency: 1600, errorRate: 8 }, new Date(t += 15000).toISOString());
    expect(result.metricDecisions.some((x) => x.isAnomaly)).toBe(true);
  });
});
