import { describe, expect, it } from "vitest";
import { buildAlertFingerprint, buildRootCauseFingerprint } from "../src/shared/fingerprints.js";

describe("fingerprints", () => {
  it("is stable regardless of label order", () => {
    expect(buildAlertFingerprint("payment-service", "latency", { namespace: "payment", zone: "a" }))
      .toBe(buildAlertFingerprint("payment-service", "latency", { zone: "a", namespace: "payment" }));
  });
  it("root fingerprint is node + fault type", () => {
    expect(buildRootCauseFingerprint("mysql-primary", "resource_exhaustion")).toBe("mysql-primary::resource_exhaustion");
  });
});
