import { describe, expect, it } from "vitest";

import { NEWTON_RAPHSON_PORT_SPEC } from "../syntropy/portSpecs/newtonRaphson";

describe("NEWTON_RAPHSON_PORT_SPEC", () => {
  it("identifies the numerical/newton-raphson method", () => {
    expect(NEWTON_RAPHSON_PORT_SPEC.engineId).toBe("numerical");
    expect(NEWTON_RAPHSON_PORT_SPEC.methodId).toBe("newton-raphson");
    expect(NEWTON_RAPHSON_PORT_SPEC.executionMode).toBe("live");
  });

  it("finds the real root of x^3 - x - 2 from x0 = 1.5", () => {
    const result = NEWTON_RAPHSON_PORT_SPEC.compute({
      fx: "x^3 - x - 2",
      x0: 1.5,
      tol: 0.000001,
      maxIter: 30,
    });
    expect(result.error).toBeUndefined();
    expect(result.outputs.root).toBeCloseTo(1.5213797, 5);
  });

  it("returns an error instead of throwing for an invalid expression", () => {
    const result = NEWTON_RAPHSON_PORT_SPEC.compute({
      fx: "sin(x +",
      x0: 1.5,
      tol: 0.000001,
      maxIter: 30,
    });
    expect(result.error).toBeDefined();
    expect(result.outputs.root).toBeUndefined();
  });

  it("returns an error instead of throwing on a horizontal tangent", () => {
    // f'(x) = 0 at x = 0 for f(x) = x^2 + 1 — starting exactly there fails immediately.
    const result = NEWTON_RAPHSON_PORT_SPEC.compute({
      fx: "x^2 + 1",
      x0: 0,
      tol: 0.000001,
      maxIter: 30,
    });
    expect(result.error).toBeDefined();
  });

  it("carries the page path and localStorage key for the portal tab", () => {
    expect(NEWTON_RAPHSON_PORT_SPEC.pagePath).toBe(
      "/math-lab/engines/numerical/methods/newton-raphson.html",
    );
    expect(NEWTON_RAPHSON_PORT_SPEC.pageStoreKey).toBe(
      "engine-lab:numerical-newton-raphson",
    );
  });
});
