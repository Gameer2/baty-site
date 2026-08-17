import { describe, expect, it } from "vitest";

import { TRAPEZOIDAL_RULE_PORT_SPEC } from "../syntropy/portSpecs/trapezoidalRule";

describe("TRAPEZOIDAL_RULE_PORT_SPEC", () => {
  it("identifies the numerical/trapezoidal-rule method", () => {
    expect(TRAPEZOIDAL_RULE_PORT_SPEC.engineId).toBe("numerical");
    expect(TRAPEZOIDAL_RULE_PORT_SPEC.methodId).toBe("trapezoidal-rule");
    expect(TRAPEZOIDAL_RULE_PORT_SPEC.executionMode).toBe("live");
  });

  it("approximates the integral of e^x on [0, 1] close to e - 1", () => {
    const result = TRAPEZOIDAL_RULE_PORT_SPEC.compute({
      fx: "e^x",
      a: 0,
      b: 1,
      n: 10,
    });
    expect(result.error).toBeUndefined();
    expect(result.outputs.total).toBeCloseTo(Math.E - 1, 2);
  });

  it("returns an error instead of throwing for an invalid expression", () => {
    const result = TRAPEZOIDAL_RULE_PORT_SPEC.compute({
      fx: "sin(x +",
      a: 0,
      b: 1,
      n: 10,
    });
    expect(result.error).toBeDefined();
    expect(result.outputs.total).toBeUndefined();
  });

  it("carries the page path and localStorage key for the portal tab", () => {
    expect(TRAPEZOIDAL_RULE_PORT_SPEC.pagePath).toBe(
      "/math-lab/engines/numerical/methods/trapezoidal-rule.html",
    );
    expect(TRAPEZOIDAL_RULE_PORT_SPEC.pageStoreKey).toBe(
      "engine-lab:numerical-trapezoidal-rule",
    );
  });
});
