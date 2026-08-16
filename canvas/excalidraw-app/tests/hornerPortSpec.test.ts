import { describe, expect, it } from "vitest";

import { HORNER_PORT_SPEC } from "../syntropy/portSpecs/horner";

describe("HORNER_PORT_SPEC", () => {
  it("identifies the numerical/horner method", () => {
    expect(HORNER_PORT_SPEC.engineId).toBe("numerical");
    expect(HORNER_PORT_SPEC.methodId).toBe("horner");
    expect(HORNER_PORT_SPEC.executionMode).toBe("live");
  });

  it("evaluates p(2) = 7 for 2x^3 - 3x^2 + 4x - 5", () => {
    const result = HORNER_PORT_SPEC.compute({ coeffs: "2,-3,4,-5", x: 2 });
    expect(result.error).toBeUndefined();
    expect(result.outputs.value).toBe(7);
    expect(result.outputs.degree).toBe(3);
  });

  it("returns an error for an empty coefficient list", () => {
    const result = HORNER_PORT_SPEC.compute({ coeffs: "", x: 2 });
    expect(result.error).toBeDefined();
  });

  it("carries the page path and localStorage key for the portal tab", () => {
    expect(HORNER_PORT_SPEC.pagePath).toBe(
      "/math-lab/engines/numerical/methods/horner.html",
    );
    expect(HORNER_PORT_SPEC.pageStoreKey).toBe("engine-lab:numerical-horner");
  });
});
