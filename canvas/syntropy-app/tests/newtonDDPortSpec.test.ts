import { describe, expect, it } from "vitest";

import { NEWTON_DD_PORT_SPEC } from "../syntropy/portSpecs/newtonDD";

describe("NEWTON_DD_PORT_SPEC", () => {
  it("identifies the numerical/newton-dd method", () => {
    expect(NEWTON_DD_PORT_SPEC.engineId).toBe("numerical");
    expect(NEWTON_DD_PORT_SPEC.methodId).toBe("newton-dd");
    expect(NEWTON_DD_PORT_SPEC.executionMode).toBe("live");
  });

  it("interpolates (1,2),(2,3),(3,5) at x=2.5 (cross-check vs Neville)", () => {
    const result = NEWTON_DD_PORT_SPEC.compute({
      points: "1,2;2,3;3,5",
      x: 2.5,
    });
    expect(result.error).toBeUndefined();
    expect(result.outputs.value).toBeCloseTo(3.875, 8);
  });

  it("returns an error for fewer than two points", () => {
    const result = NEWTON_DD_PORT_SPEC.compute({ points: "1,2", x: 2.5 });
    expect(result.error).toBeDefined();
  });

  it("carries the page path and localStorage key for the portal tab", () => {
    expect(NEWTON_DD_PORT_SPEC.pagePath).toBe(
      "/math-lab/engines/numerical/methods/newton-dd.html",
    );
    expect(NEWTON_DD_PORT_SPEC.pageStoreKey).toBe(
      "engine-lab:numerical-newton-dd",
    );
  });
});
