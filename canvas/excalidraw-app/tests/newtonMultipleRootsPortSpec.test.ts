import { describe, expect, it } from "vitest";

import { NEWTON_MULTIPLE_ROOTS_PORT_SPEC } from "../syntropy/portSpecs/newtonMultipleRoots";

describe("NEWTON_MULTIPLE_ROOTS_PORT_SPEC", () => {
  it("identifies the numerical/newton-multiple-roots method", () => {
    expect(NEWTON_MULTIPLE_ROOTS_PORT_SPEC.engineId).toBe("numerical");
    expect(NEWTON_MULTIPLE_ROOTS_PORT_SPEC.methodId).toBe(
      "newton-multiple-roots",
    );
    expect(NEWTON_MULTIPLE_ROOTS_PORT_SPEC.executionMode).toBe("live");
  });

  it("finds the double root of (x-2)^2 from x0 = 0", () => {
    const result = NEWTON_MULTIPLE_ROOTS_PORT_SPEC.compute({
      fx: "(x - 2)^2",
      x0: 0,
      tol: 0.000001,
      maxIter: 20,
    });
    expect(result.error).toBeUndefined();
    expect(result.outputs.root).toBeCloseTo(2, 4);
  });

  it("returns an error instead of throwing for an invalid expression", () => {
    const result = NEWTON_MULTIPLE_ROOTS_PORT_SPEC.compute({
      fx: "sin(x +",
      x0: 0,
      tol: 0.000001,
      maxIter: 20,
    });
    expect(result.error).toBeDefined();
    expect(result.outputs.root).toBeUndefined();
  });

  it("carries the page path and localStorage key for the portal tab", () => {
    expect(NEWTON_MULTIPLE_ROOTS_PORT_SPEC.pagePath).toBe(
      "/math-lab/engines/numerical/methods/newton-multiple-roots.html",
    );
    expect(NEWTON_MULTIPLE_ROOTS_PORT_SPEC.pageStoreKey).toBe(
      "engine-lab:numerical-newton-multiple-roots",
    );
  });
});
