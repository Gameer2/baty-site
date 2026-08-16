import { describe, expect, it } from "vitest";

import { BISECTION_PORT_SPEC } from "../syntropy/portSpecs/bisection";

describe("BISECTION_PORT_SPEC", () => {
  it("identifies the numerical/bisection method", () => {
    expect(BISECTION_PORT_SPEC.engineId).toBe("numerical");
    expect(BISECTION_PORT_SPEC.methodId).toBe("bisection");
    expect(BISECTION_PORT_SPEC.executionMode).toBe("live");
  });

  it("finds the real root of x^3 - x - 2 on [1, 2]", () => {
    const result = BISECTION_PORT_SPEC.compute({
      fx: "x^3 - x - 2",
      a: 1,
      b: 2,
      tol: 0.000001,
      maxIter: 40,
    });
    expect(result.error).toBeUndefined();
    expect(result.outputs.root).toBeCloseTo(1.5213797, 5);
  });

  it("returns an error instead of throwing for an invalid expression", () => {
    const result = BISECTION_PORT_SPEC.compute({
      fx: "sin(x +",
      a: 1,
      b: 2,
      tol: 0.000001,
      maxIter: 40,
    });
    expect(result.error).toBeDefined();
    expect(result.outputs.root).toBeUndefined();
  });

  it("returns an error instead of throwing when there is no sign change", () => {
    const result = BISECTION_PORT_SPEC.compute({
      fx: "x^3 - x - 2",
      a: 5,
      b: 6,
      tol: 0.000001,
      maxIter: 40,
    });
    expect(result.error).toBeDefined();
  });

  it("carries the page path and localStorage key for the portal tab", () => {
    expect(BISECTION_PORT_SPEC.pagePath).toBe(
      "/math-lab/engines/numerical/methods/bisection.html",
    );
    expect(BISECTION_PORT_SPEC.pageStoreKey).toBe(
      "engine-lab:numerical-bisection",
    );
  });
});
