import { describe, expect, it } from "vitest";

import { STEFFENSEN_PORT_SPEC } from "../syntropy/portSpecs/steffensen";

describe("STEFFENSEN_PORT_SPEC", () => {
  it("identifies the numerical/steffensen method", () => {
    expect(STEFFENSEN_PORT_SPEC.engineId).toBe("numerical");
    expect(STEFFENSEN_PORT_SPEC.methodId).toBe("steffensen");
    expect(STEFFENSEN_PORT_SPEC.executionMode).toBe("live");
  });

  it("converges g(x) = cos(x) from x0 = 0.5 to the Dottie number", () => {
    const result = STEFFENSEN_PORT_SPEC.compute({
      gx: "cos(x)",
      x0: 0.5,
      tol: 0.00000001,
      maxIter: 50,
    });
    expect(result.error).toBeUndefined();
    expect(result.outputs.root).toBeCloseTo(0.739085, 5);
  });

  it("returns an error instead of throwing for an invalid expression", () => {
    const result = STEFFENSEN_PORT_SPEC.compute({
      gx: "cos(x +",
      x0: 0.5,
      tol: 0.00000001,
      maxIter: 50,
    });
    expect(result.error).toBeDefined();
    expect(result.outputs.root).toBeUndefined();
  });

  it("carries the page path and localStorage key for the portal tab", () => {
    expect(STEFFENSEN_PORT_SPEC.pagePath).toBe(
      "/math-lab/engines/numerical/methods/steffensen.html",
    );
    expect(STEFFENSEN_PORT_SPEC.pageStoreKey).toBe(
      "engine-lab:numerical-steffensen",
    );
  });
});
