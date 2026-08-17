import { describe, expect, it } from "vitest";

import { RICHARDSON_DIFF_PORT_SPEC } from "../syntropy/portSpecs/richardsonDiff";

describe("RICHARDSON_DIFF_PORT_SPEC", () => {
  it("identifies the numerical/richardson-diff method", () => {
    expect(RICHARDSON_DIFF_PORT_SPEC.engineId).toBe("numerical");
    expect(RICHARDSON_DIFF_PORT_SPEC.methodId).toBe("richardson-diff");
    expect(RICHARDSON_DIFF_PORT_SPEC.executionMode).toBe("live");
  });

  it("approximates d/dx sin(x) at x = pi/4 close to cos(pi/4)", () => {
    const result = RICHARDSON_DIFF_PORT_SPEC.compute({
      fx: "sin(x)",
      x: Math.PI / 4,
      h: 0.1,
    });
    expect(result.error).toBeUndefined();
    expect(result.outputs.richardson).toBeCloseTo(Math.cos(Math.PI / 4), 4);
  });

  it("returns an error instead of throwing for a zero step size", () => {
    const result = RICHARDSON_DIFF_PORT_SPEC.compute({
      fx: "sin(x)",
      x: Math.PI / 4,
      h: 0,
    });
    expect(result.error).toBeDefined();
  });

  it("carries the page path and localStorage key for the portal tab", () => {
    expect(RICHARDSON_DIFF_PORT_SPEC.pagePath).toBe(
      "/math-lab/engines/numerical/methods/richardson-diff.html",
    );
    expect(RICHARDSON_DIFF_PORT_SPEC.pageStoreKey).toBe(
      "engine-lab:numerical-richardson-diff",
    );
  });
});
