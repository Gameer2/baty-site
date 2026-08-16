import { describe, expect, it } from "vitest";

import { NEVILLE_PORT_SPEC } from "../syntropy/portSpecs/neville";

describe("NEVILLE_PORT_SPEC", () => {
  it("identifies the numerical/neville method", () => {
    expect(NEVILLE_PORT_SPEC.engineId).toBe("numerical");
    expect(NEVILLE_PORT_SPEC.methodId).toBe("neville");
    expect(NEVILLE_PORT_SPEC.executionMode).toBe("live");
  });

  it("interpolates (1,2),(2,3),(3,5) at x=2.5", () => {
    const result = NEVILLE_PORT_SPEC.compute({
      points: "1,2;2,3;3,5",
      x: 2.5,
    });
    expect(result.error).toBeUndefined();
    expect(result.outputs.value).toBeCloseTo(3.875, 8);
  });

  it("returns an error for fewer than two points", () => {
    const result = NEVILLE_PORT_SPEC.compute({ points: "1,2", x: 2.5 });
    expect(result.error).toBeDefined();
  });

  it("carries the page path and localStorage key for the portal tab", () => {
    expect(NEVILLE_PORT_SPEC.pagePath).toBe(
      "/math-lab/engines/numerical/methods/neville.html",
    );
    expect(NEVILLE_PORT_SPEC.pageStoreKey).toBe("engine-lab:numerical-neville");
  });
});
