import { describe, expect, it } from "vitest";

import { LAGRANGE_INTERPOLATION_PORT_SPEC } from "../syntropy/portSpecs/lagrangeInterpolation";

describe("LAGRANGE_INTERPOLATION_PORT_SPEC", () => {
  it("identifies the numerical/lagrange-interpolation method", () => {
    expect(LAGRANGE_INTERPOLATION_PORT_SPEC.engineId).toBe("numerical");
    expect(LAGRANGE_INTERPOLATION_PORT_SPEC.methodId).toBe(
      "lagrange-interpolation",
    );
    expect(LAGRANGE_INTERPOLATION_PORT_SPEC.executionMode).toBe("live");
  });

  it("interpolates the default 4 points at x0 = 2.5", () => {
    const result = LAGRANGE_INTERPOLATION_PORT_SPEC.compute({
      points: "0,1;1,3;2,2;4,5",
      x0: 2.5,
    });
    expect(result.error).toBeUndefined();
    expect(result.outputs.degree).toBe(3);
    expect(result.outputs.value).toBeTypeOf("number");
  });

  it("reproduces exact values at the interpolation nodes", () => {
    const result = LAGRANGE_INTERPOLATION_PORT_SPEC.compute({
      points: "0,1;1,3;2,2;4,5",
      x0: 1,
    });
    expect(result.error).toBeUndefined();
    expect(result.outputs.value).toBeCloseTo(3, 8);
  });

  it("returns an error for duplicate x values", () => {
    const result = LAGRANGE_INTERPOLATION_PORT_SPEC.compute({
      points: "0,1;0,3",
      x0: 0.5,
    });
    expect(result.error).toBeDefined();
  });

  it("carries the page path and localStorage key for the portal tab", () => {
    expect(LAGRANGE_INTERPOLATION_PORT_SPEC.pagePath).toBe(
      "/math-lab/engines/numerical/methods/lagrange-interpolation.html",
    );
    expect(LAGRANGE_INTERPOLATION_PORT_SPEC.pageStoreKey).toBe(
      "engine-lab:numerical-lagrange-interpolation",
    );
  });
});
