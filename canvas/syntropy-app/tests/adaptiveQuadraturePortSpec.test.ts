import { describe, expect, it } from "vitest";

import { ADAPTIVE_QUADRATURE_PORT_SPEC } from "../syntropy/portSpecs/adaptiveQuadrature";

describe("ADAPTIVE_QUADRATURE_PORT_SPEC", () => {
  it("identifies the numerical/adaptive-quadrature method", () => {
    expect(ADAPTIVE_QUADRATURE_PORT_SPEC.engineId).toBe("numerical");
    expect(ADAPTIVE_QUADRATURE_PORT_SPEC.methodId).toBe("adaptive-quadrature");
    expect(ADAPTIVE_QUADRATURE_PORT_SPEC.executionMode).toBe("live");
  });

  it("approximates the integral of 4/(1+x^2) on [0, 1] to pi", () => {
    const result = ADAPTIVE_QUADRATURE_PORT_SPEC.compute({
      fx: "4 / (1 + x^2)",
      a: 0,
      b: 1,
      tol: 0.000001,
    });
    expect(result.error).toBeUndefined();
    expect(result.outputs.total).toBeCloseTo(Math.PI, 5);
  });

  it("returns an error instead of throwing for an invalid expression", () => {
    const result = ADAPTIVE_QUADRATURE_PORT_SPEC.compute({
      fx: "sin(x +",
      a: 0,
      b: 1,
      tol: 0.000001,
    });
    expect(result.error).toBeDefined();
    expect(result.outputs.total).toBeUndefined();
  });

  it("carries the page path and localStorage key for the portal tab", () => {
    expect(ADAPTIVE_QUADRATURE_PORT_SPEC.pagePath).toBe(
      "/math-lab/engines/numerical/methods/adaptive-quadrature.html",
    );
    expect(ADAPTIVE_QUADRATURE_PORT_SPEC.pageStoreKey).toBe(
      "engine-lab:numerical-adaptive-quadrature",
    );
  });
});
