import { describe, expect, it } from "vitest";

import { POWER_METHOD_PORT_SPEC } from "../syntropy/portSpecs/powerMethod";

describe("POWER_METHOD_PORT_SPEC", () => {
  it("identifies the numerical/power-method method", () => {
    expect(POWER_METHOD_PORT_SPEC.engineId).toBe("numerical");
    expect(POWER_METHOD_PORT_SPEC.methodId).toBe("power-method");
    expect(POWER_METHOD_PORT_SPEC.executionMode).toBe("live");
  });

  it("finds the dominant eigenvalue of [[2,1],[1,2]] (= 3)", () => {
    const result = POWER_METHOD_PORT_SPEC.compute({
      matrix: "2,1;1,2",
      x0: "1,0",
      tol: 0.0000000001,
      maxIter: 100,
    });
    expect(result.error).toBeUndefined();
    expect(result.outputs.eigenvalue).toBeCloseTo(3, 6);
  });

  it("returns an error for a non-square matrix", () => {
    const result = POWER_METHOD_PORT_SPEC.compute({
      matrix: "2,1,0;1,2,0",
      x0: "1,0,0",
      tol: 0.0000000001,
      maxIter: 100,
    });
    expect(result.error).toBeDefined();
  });

  it("carries the page path and localStorage key for the portal tab", () => {
    expect(POWER_METHOD_PORT_SPEC.pagePath).toBe(
      "/math-lab/engines/numerical/methods/power-method.html",
    );
    expect(POWER_METHOD_PORT_SPEC.pageStoreKey).toBe(
      "engine-lab:numerical-power-method",
    );
  });
});
