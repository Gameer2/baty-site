import { describe, expect, it } from "vitest";

import { ROMBERG_INTEGRATION_PORT_SPEC } from "../syntropy/portSpecs/rombergIntegration";

describe("ROMBERG_INTEGRATION_PORT_SPEC", () => {
  it("identifies the numerical/romberg-integration method", () => {
    expect(ROMBERG_INTEGRATION_PORT_SPEC.engineId).toBe("numerical");
    expect(ROMBERG_INTEGRATION_PORT_SPEC.methodId).toBe("romberg-integration");
    expect(ROMBERG_INTEGRATION_PORT_SPEC.executionMode).toBe("live");
  });

  it("approximates the integral of e^x on [0, 1] to e - 1", () => {
    const result = ROMBERG_INTEGRATION_PORT_SPEC.compute({
      fx: "e^x",
      a: 0,
      b: 1,
      m: 4,
    });
    expect(result.error).toBeUndefined();
    expect(result.outputs.total).toBeCloseTo(Math.E - 1, 6);
  });

  it("returns an error instead of throwing for an invalid expression", () => {
    const result = ROMBERG_INTEGRATION_PORT_SPEC.compute({
      fx: "sin(x +",
      a: 0,
      b: 1,
      m: 4,
    });
    expect(result.error).toBeDefined();
    expect(result.outputs.total).toBeUndefined();
  });

  it("carries the page path and localStorage key for the portal tab", () => {
    expect(ROMBERG_INTEGRATION_PORT_SPEC.pagePath).toBe(
      "/math-lab/engines/numerical/methods/romberg-integration.html",
    );
    expect(ROMBERG_INTEGRATION_PORT_SPEC.pageStoreKey).toBe(
      "engine-lab:numerical-romberg-integration",
    );
  });
});
