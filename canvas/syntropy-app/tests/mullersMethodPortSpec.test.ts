import { describe, expect, it } from "vitest";

import { MULLERS_METHOD_PORT_SPEC } from "../syntropy/portSpecs/mullersMethod";

describe("MULLERS_METHOD_PORT_SPEC", () => {
  it("identifies the numerical/mullers-method method", () => {
    expect(MULLERS_METHOD_PORT_SPEC.engineId).toBe("numerical");
    expect(MULLERS_METHOD_PORT_SPEC.methodId).toBe("mullers-method");
    expect(MULLERS_METHOD_PORT_SPEC.executionMode).toBe("live");
  });

  it("finds the real root of x^3 - x - 2 from x0=1, x1=1.5, x2=2", () => {
    const result = MULLERS_METHOD_PORT_SPEC.compute({
      fx: "x^3 - x - 2",
      x0: 1,
      x1: 1.5,
      x2: 2,
      tol: 0.000001,
      maxIter: 30,
    });
    expect(result.error).toBeUndefined();
    expect(result.outputs.root).toBeCloseTo(1.5213797, 5);
  });

  it("returns an error instead of throwing for an invalid expression", () => {
    const result = MULLERS_METHOD_PORT_SPEC.compute({
      fx: "sin(x +",
      x0: 1,
      x1: 1.5,
      x2: 2,
      tol: 0.000001,
      maxIter: 30,
    });
    expect(result.error).toBeDefined();
    expect(result.outputs.root).toBeUndefined();
  });

  it("carries the page path and localStorage key for the portal tab", () => {
    expect(MULLERS_METHOD_PORT_SPEC.pagePath).toBe(
      "/math-lab/engines/numerical/methods/mullers-method.html",
    );
    expect(MULLERS_METHOD_PORT_SPEC.pageStoreKey).toBe(
      "engine-lab:numerical-mullers-method",
    );
  });
});
