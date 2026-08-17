import { describe, expect, it } from "vitest";

import { NUMERICAL_DIFF_PORT_SPEC } from "../syntropy/portSpecs/numericalDiff";

describe("NUMERICAL_DIFF_PORT_SPEC", () => {
  it("identifies the numerical/numerical-diff method", () => {
    expect(NUMERICAL_DIFF_PORT_SPEC.engineId).toBe("numerical");
    expect(NUMERICAL_DIFF_PORT_SPEC.methodId).toBe("numerical-diff");
    expect(NUMERICAL_DIFF_PORT_SPEC.executionMode).toBe("live");
  });

  it("approximates d/dx sin(x) at x = pi/4 close to cos(pi/4)", () => {
    const result = NUMERICAL_DIFF_PORT_SPEC.compute({
      fx: "sin(x)",
      x: Math.PI / 4,
      h: 0.001,
    });
    expect(result.error).toBeUndefined();
    expect(result.outputs.central).toBeCloseTo(Math.cos(Math.PI / 4), 5);
  });

  it("returns an error instead of throwing for a zero step size", () => {
    const result = NUMERICAL_DIFF_PORT_SPEC.compute({
      fx: "sin(x)",
      x: Math.PI / 4,
      h: 0,
    });
    expect(result.error).toBeDefined();
  });

  it("carries the page path and localStorage key for the portal tab", () => {
    expect(NUMERICAL_DIFF_PORT_SPEC.pagePath).toBe(
      "/math-lab/engines/numerical/methods/numerical-diff.html",
    );
    expect(NUMERICAL_DIFF_PORT_SPEC.pageStoreKey).toBe(
      "engine-lab:numerical-numerical-diff",
    );
  });
});
