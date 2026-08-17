import { describe, expect, it } from "vitest";

import { BROYDENS_METHOD_PORT_SPEC } from "../syntropy/portSpecs/broydensMethod";

describe("BROYDENS_METHOD_PORT_SPEC", () => {
  it("identifies the numerical/broydens-method method", () => {
    expect(BROYDENS_METHOD_PORT_SPEC.engineId).toBe("numerical");
    expect(BROYDENS_METHOD_PORT_SPEC.methodId).toBe("broydens-method");
    expect(BROYDENS_METHOD_PORT_SPEC.executionMode).toBe("live");
  });

  it("solves x1^2+x2^2=2, x1=x2 to x1=x2=1", () => {
    const result = BROYDENS_METHOD_PORT_SPEC.compute({
      system: "x1^2 + x2^2 - 2;x1 - x2",
      x0: "1.5,1.5",
      tol: 0.0000000001,
      maxIter: 100,
    });
    expect(result.error).toBeUndefined();
    expect(result.outputs.x1).toBeCloseTo(1, 5);
  });

  it("returns an error for an invalid equation", () => {
    const result = BROYDENS_METHOD_PORT_SPEC.compute({
      system: "x1^2 +;x1 - x2",
      x0: "1.5,1.5",
      tol: 0.0000000001,
      maxIter: 100,
    });
    expect(result.error).toBeDefined();
  });

  it("carries the page path and localStorage key for the portal tab", () => {
    expect(BROYDENS_METHOD_PORT_SPEC.pagePath).toBe(
      "/math-lab/engines/numerical/methods/broydens-method.html",
    );
    expect(BROYDENS_METHOD_PORT_SPEC.pageStoreKey).toBe(
      "engine-lab:numerical-broydens-method",
    );
  });
});
