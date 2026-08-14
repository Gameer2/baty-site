import { describe, expect, it } from "vitest";

import { RIEMANN_SUMS_PORT_SPEC } from "../syntropy/portSpecs/riemannSums";

describe("RIEMANN_SUMS_PORT_SPEC", () => {
  it("identifies the calculus/riemann-sums method", () => {
    expect(RIEMANN_SUMS_PORT_SPEC.engineId).toBe("calculus");
    expect(RIEMANN_SUMS_PORT_SPEC.methodId).toBe("riemann-sums");
    expect(RIEMANN_SUMS_PORT_SPEC.executionMode).toBe("live");
  });

  it("declares the four Riemann Sums inputs with defaults", () => {
    const keys = RIEMANN_SUMS_PORT_SPEC.inputs.map((i) => i.key);
    expect(keys).toEqual(["fx", "a", "b", "n"]);
  });

  it("computes a correct total for a known case: f(x)=x on [0,2], n=2 (midpoint)", () => {
    // Midpoints are 0.5 and 1.5, width 1 each -> total = 0.5*1 + 1.5*1 = 2.
    const result = RIEMANN_SUMS_PORT_SPEC.compute({
      fx: "x",
      a: 0,
      b: 2,
      n: 2,
    });
    expect(result.error).toBeUndefined();
    expect(result.outputs.total).toBeCloseTo(2, 10);
    // The partition rectangles now ride inside the real-line `curve` CurveOutput.
    const rectangles = (result.outputs.curve as { rectangles: unknown[] })
      .rectangles;
    expect(rectangles).toHaveLength(2);
  });

  it("returns an error instead of throwing for an invalid expression", () => {
    const result = RIEMANN_SUMS_PORT_SPEC.compute({
      fx: "sin(x +",
      a: 0,
      b: 2,
      n: 2,
    });
    expect(result.error).toBeDefined();
    expect(result.outputs.total).toBeUndefined();
  });

  it("returns an error instead of throwing when b <= a", () => {
    const result = RIEMANN_SUMS_PORT_SPEC.compute({
      fx: "x",
      a: 2,
      b: 2,
      n: 2,
    });
    expect(result.error).toBeDefined();
  });

  it("carries the page path and localStorage key for the portal tab", () => {
    expect(RIEMANN_SUMS_PORT_SPEC.pagePath).toBe(
      "/math-lab/engines/calculus/methods/riemann-sums.html",
    );
    expect(RIEMANN_SUMS_PORT_SPEC.pageStoreKey).toBe(
      "engine-lab:calculus-riemann-sums",
    );
  });
});
