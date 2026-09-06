import { createHash } from "node:crypto";
import type { FaultType } from "../domain/enums.js";

export function buildAlertFingerprint(serviceName: string, metricName: string, stableLabels: Record<string, string>): string {
  const labels = Object.entries(stableLabels).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join("|");
  const raw = `${serviceName}|${metricName}|${labels}`;
  return createHash("sha256").update(raw).digest("hex");
}

export function buildRootCauseFingerprint(rootCauseNode: string, faultType: FaultType): string {
  return `${rootCauseNode}::${faultType}`;
}
