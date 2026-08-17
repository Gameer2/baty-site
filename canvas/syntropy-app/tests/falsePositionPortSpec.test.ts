import { describe, expect, it } from "vitest";

import { FALSE_POSITION_PORT_SPEC } from "../syntropy/portSpecs/falsePosition";

describe("FALSE_POSITION_PORT_SPEC", () => {
  it("identifies the numerical/false-position method", () => {
    expect(FALSE_POSITION_PORT_SPEC.engineId).toBe("numerical");
    expect(FALSE_POSITION_PORT_SPEC.methodId).toBe("false-position");
    expect(FALSE_POSITION_PORT_SPEC.executionMode).toBe("live");
  });

  it("finds the real root of x^3 - x - 2 on [1, 2]", () => {
    const result = FALSE_POSITION_PORT_SPEC.compute({
      fx: "x^3 - x - 2",
      a: 1,
      b: 2,
      tol: 0.000001,
      maxIter: 40,
    });
    expect(result.error).toBeUndefined();
    expect(result.outputs.root).toBeCloseTo(1.5213797, 4);
  });

  it("returns an error instead of throwing for an invalid expression", () => {
    const result = FALSE_POSITION_PORT_SPEC.compute({
      fx: "sin(x +",
      a: 1,
      b: 2,
      tol: 0.000001,
      maxIter: 40,
    });
    expect(result.error).toBeDefined();
    expect(result.outputs.root).toBeUndefined();
  });

  it("carries the page path and localStorage key for the portal tab", () => {
    expect(FALSE_POSITION_PORT_SPEC.pagePath).toBe(
      "/math-lab/engines/numerical/methods/false-position.html",
    );
    expect(FALSE_POSITION_PORT_SPEC.pageStoreKey).toBe(
      "engine-lab:numerical-false-position",
    );
  });
});
