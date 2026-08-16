import { describe, expect, it } from "vitest";

import { SIMPSONS_RULE_PORT_SPEC } from "../syntropy/portSpecs/simpsonsRule";

describe("SIMPSONS_RULE_PORT_SPEC", () => {
  it("identifies the numerical/simpsons-rule method", () => {
    expect(SIMPSONS_RULE_PORT_SPEC.engineId).toBe("numerical");
    expect(SIMPSONS_RULE_PORT_SPEC.methodId).toBe("simpsons-rule");
    expect(SIMPSONS_RULE_PORT_SPEC.executionMode).toBe("live");
  });

  it("approximates the integral of sin(x) on [0, pi] close to 2", () => {
    const result = SIMPSONS_RULE_PORT_SPEC.compute({
      fx: "sin(x)",
      a: 0,
      b: 3.14159265358979,
      n: 6,
    });
    expect(result.error).toBeUndefined();
    expect(result.outputs.total).toBeCloseTo(2, 2);
  });

  it("returns an error instead of throwing for an invalid expression", () => {
    const result = SIMPSONS_RULE_PORT_SPEC.compute({
      fx: "sin(x +",
      a: 0,
      b: 3.14159265358979,
      n: 6,
    });
    expect(result.error).toBeDefined();
    expect(result.outputs.total).toBeUndefined();
  });

  it("carries the page path and localStorage key for the portal tab", () => {
    expect(SIMPSONS_RULE_PORT_SPEC.pagePath).toBe(
      "/math-lab/engines/numerical/methods/simpsons-rule.html",
    );
    expect(SIMPSONS_RULE_PORT_SPEC.pageStoreKey).toBe(
      "engine-lab:numerical-simpsons-rule",
    );
  });
});
