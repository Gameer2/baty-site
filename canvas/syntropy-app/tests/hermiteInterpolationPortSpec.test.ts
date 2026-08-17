import { describe, expect, it } from "vitest";

import { HERMITE_INTERPOLATION_PORT_SPEC } from "../syntropy/portSpecs/hermiteInterpolation";

describe("HERMITE_INTERPOLATION_PORT_SPEC", () => {
  it("identifies the numerical/hermite-interpolation method", () => {
    expect(HERMITE_INTERPOLATION_PORT_SPEC.engineId).toBe("numerical");
    expect(HERMITE_INTERPOLATION_PORT_SPEC.methodId).toBe(
      "hermite-interpolation",
    );
    expect(HERMITE_INTERPOLATION_PORT_SPEC.executionMode).toBe("live");
  });

  it("reproduces f(x) = x^3 exactly from two Hermite nodes", () => {
    // f(x)=x^3, f'(x)=3x^2 at x=0 and x=1 -> H(0.5) should equal 0.5^3 = 0.125
    const result = HERMITE_INTERPOLATION_PORT_SPEC.compute({
      points: "0,0,0;1,1,3",
      x0: 0.5,
    });
    expect(result.error).toBeUndefined();
    expect(result.outputs.value).toBeCloseTo(0.125, 8);
    expect(result.outputs.degree).toBe(3);
  });

  it("returns an error for fewer than two points", () => {
    const result = HERMITE_INTERPOLATION_PORT_SPEC.compute({
      points: "0,0,0",
      x0: 0.5,
    });
    expect(result.error).toBeDefined();
  });

  it("carries the page path and localStorage key for the portal tab", () => {
    expect(HERMITE_INTERPOLATION_PORT_SPEC.pagePath).toBe(
      "/math-lab/engines/numerical/methods/hermite-interpolation.html",
    );
    expect(HERMITE_INTERPOLATION_PORT_SPEC.pageStoreKey).toBe(
      "engine-lab:numerical-hermite-interpolation",
    );
  });
});
