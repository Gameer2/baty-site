import { describe, expect, it } from "vitest";

import { INVERSE_POWER_METHOD_PORT_SPEC } from "../syntropy/portSpecs/inversePowerMethod";

describe("INVERSE_POWER_METHOD_PORT_SPEC", () => {
  it("identifies the numerical/inverse-power-method method", () => {
    expect(INVERSE_POWER_METHOD_PORT_SPEC.engineId).toBe("numerical");
    expect(INVERSE_POWER_METHOD_PORT_SPEC.methodId).toBe(
      "inverse-power-method",
    );
    expect(INVERSE_POWER_METHOD_PORT_SPEC.executionMode).toBe("live");
  });

  it("finds the smallest-magnitude eigenvalue of [[3.5,1.5],[1.5,3.5]] (= 2)", () => {
    const result = INVERSE_POWER_METHOD_PORT_SPEC.compute({
      matrix: "3.5,1.5;1.5,3.5",
      x0: "1,0",
      tol: 0.000001,
      maxIter: 100,
    });
    expect(result.error).toBeUndefined();
    expect(result.outputs.eigenvalue).toBeCloseTo(2, 4);
  });

  it("returns an error when the starting vector length mismatches the matrix", () => {
    const result = INVERSE_POWER_METHOD_PORT_SPEC.compute({
      matrix: "3.5,1.5;1.5,3.5",
      x0: "1,0,0",
      tol: 0.000001,
      maxIter: 100,
    });
    expect(result.error).toBeDefined();
  });

  it("carries the page path and localStorage key for the portal tab", () => {
    expect(INVERSE_POWER_METHOD_PORT_SPEC.pagePath).toBe(
      "/math-lab/engines/numerical/methods/inverse-power-method.html",
    );
    expect(INVERSE_POWER_METHOD_PORT_SPEC.pageStoreKey).toBe(
      "engine-lab:numerical-inverse-power-method",
    );
  });
});
