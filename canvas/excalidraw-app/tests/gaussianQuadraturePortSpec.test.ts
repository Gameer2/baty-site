import { describe, expect, it } from "vitest";

import { GAUSSIAN_QUADRATURE_PORT_SPEC } from "../syntropy/portSpecs/gaussianQuadrature";

describe("GAUSSIAN_QUADRATURE_PORT_SPEC", () => {
  it("identifies the numerical/gaussian-quadrature method", () => {
    expect(GAUSSIAN_QUADRATURE_PORT_SPEC.engineId).toBe("numerical");
    expect(GAUSSIAN_QUADRATURE_PORT_SPEC.methodId).toBe("gaussian-quadrature");
    expect(GAUSSIAN_QUADRATURE_PORT_SPEC.executionMode).toBe("live");
  });

  it("integrates x^3 on [0, 1] exactly with the 2-point rule", () => {
    const result = GAUSSIAN_QUADRATURE_PORT_SPEC.compute({
      fx: "x^3",
      a: 0,
      b: 1,
      order: 2,
    });
    expect(result.error).toBeUndefined();
    expect(result.outputs.total).toBeCloseTo(0.25, 10);
  });

  it("returns an error instead of throwing for an unsupported order", () => {
    const result = GAUSSIAN_QUADRATURE_PORT_SPEC.compute({
      fx: "x^3",
      a: 0,
      b: 1,
      order: 5,
    });
    expect(result.error).toBeDefined();
  });

  it("carries the page path and localStorage key for the portal tab", () => {
    expect(GAUSSIAN_QUADRATURE_PORT_SPEC.pagePath).toBe(
      "/math-lab/engines/numerical/methods/gaussian-quadrature.html",
    );
    expect(GAUSSIAN_QUADRATURE_PORT_SPEC.pageStoreKey).toBe(
      "engine-lab:numerical-gaussian-quadrature",
    );
  });
});
