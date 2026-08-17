import { describe, expect, it } from "vitest";

import { SECANT_PORT_SPEC } from "../syntropy/portSpecs/secant";

describe("SECANT_PORT_SPEC", () => {
  it("identifies the numerical/secant method", () => {
    expect(SECANT_PORT_SPEC.engineId).toBe("numerical");
    expect(SECANT_PORT_SPEC.methodId).toBe("secant");
    expect(SECANT_PORT_SPEC.executionMode).toBe("live");
  });

  it("finds the real root of x^3 - x - 2 from x0=1, x1=2", () => {
    const result = SECANT_PORT_SPEC.compute({
      fx: "x^3 - x - 2",
      x0: 1,
      x1: 2,
      tol: 0.000001,
      maxIter: 30,
    });
    expect(result.error).toBeUndefined();
    expect(result.outputs.root).toBeCloseTo(1.5213797, 5);
  });

  it("returns an error instead of throwing for an invalid expression", () => {
    const result = SECANT_PORT_SPEC.compute({
      fx: "sin(x +",
      x0: 1,
      x1: 2,
      tol: 0.000001,
      maxIter: 30,
    });
    expect(result.error).toBeDefined();
    expect(result.outputs.root).toBeUndefined();
  });

  it("carries the page path and localStorage key for the portal tab", () => {
    expect(SECANT_PORT_SPEC.pagePath).toBe(
      "/math-lab/engines/numerical/methods/secant.html",
    );
    expect(SECANT_PORT_SPEC.pageStoreKey).toBe("engine-lab:numerical-secant");
  });
});
