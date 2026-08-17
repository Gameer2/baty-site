import { describe, expect, it } from "vitest";

import { FIXED_POINT_ITERATION_PORT_SPEC } from "../syntropy/portSpecs/fixedPointIteration";

describe("FIXED_POINT_ITERATION_PORT_SPEC", () => {
  it("identifies the numerical/fixed-point-iteration method", () => {
    expect(FIXED_POINT_ITERATION_PORT_SPEC.engineId).toBe("numerical");
    expect(FIXED_POINT_ITERATION_PORT_SPEC.methodId).toBe(
      "fixed-point-iteration",
    );
    expect(FIXED_POINT_ITERATION_PORT_SPEC.executionMode).toBe("live");
  });

  it("converges g(x) = cos(x) from x0 = 0.5 to the Dottie number", () => {
    const result = FIXED_POINT_ITERATION_PORT_SPEC.compute({
      gx: "cos(x)",
      x0: 0.5,
      tol: 0.000001,
      maxIter: 100,
    });
    expect(result.error).toBeUndefined();
    expect(result.outputs.root).toBeCloseTo(0.739085, 4);
  });

  it("returns an error instead of throwing for an invalid expression", () => {
    const result = FIXED_POINT_ITERATION_PORT_SPEC.compute({
      gx: "cos(x +",
      x0: 0.5,
      tol: 0.000001,
      maxIter: 40,
    });
    expect(result.error).toBeDefined();
    expect(result.outputs.root).toBeUndefined();
  });

  it("carries the page path and localStorage key for the portal tab", () => {
    expect(FIXED_POINT_ITERATION_PORT_SPEC.pagePath).toBe(
      "/math-lab/engines/numerical/methods/fixed-point-iteration.html",
    );
    expect(FIXED_POINT_ITERATION_PORT_SPEC.pageStoreKey).toBe(
      "engine-lab:numerical-fixed-point-iteration",
    );
  });
});
