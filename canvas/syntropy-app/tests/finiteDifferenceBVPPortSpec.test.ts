import { describe, expect, it } from "vitest";

import { FINITE_DIFFERENCE_BVP_PORT_SPEC } from "../syntropy/portSpecs/finiteDifferenceBVP";

describe("FINITE_DIFFERENCE_BVP_PORT_SPEC", () => {
  it("identifies the numerical/finite-difference-bvp method", () => {
    expect(FINITE_DIFFERENCE_BVP_PORT_SPEC.engineId).toBe("numerical");
    expect(FINITE_DIFFERENCE_BVP_PORT_SPEC.methodId).toBe(
      "finite-difference-bvp",
    );
    expect(FINITE_DIFFERENCE_BVP_PORT_SPEC.executionMode).toBe("live");
  });

  it("solves y''=-y, y(0)=0, y(pi/2)=1 close to y=sin(x)", () => {
    const result = FINITE_DIFFERENCE_BVP_PORT_SPEC.compute({
      p: "0",
      q: "-1",
      r: "0",
      a: 0,
      b: 1.5707963267948966,
      alpha: 0,
      beta: 1,
      n: 50,
    });
    expect(result.error).toBeUndefined();
    expect(result.outputs.yMid).toBeCloseTo(Math.sin(Math.PI / 4), 2);
  });

  it("returns an error when a equals b", () => {
    const result = FINITE_DIFFERENCE_BVP_PORT_SPEC.compute({
      p: "0",
      q: "-1",
      r: "0",
      a: 1,
      b: 1,
      alpha: 0,
      beta: 1,
      n: 10,
    });
    expect(result.error).toBeDefined();
  });

  it("carries the page path and localStorage key for the portal tab", () => {
    expect(FINITE_DIFFERENCE_BVP_PORT_SPEC.pagePath).toBe(
      "/math-lab/engines/numerical/methods/finite-difference-bvp.html",
    );
    expect(FINITE_DIFFERENCE_BVP_PORT_SPEC.pageStoreKey).toBe(
      "engine-lab:numerical-finite-difference-bvp",
    );
  });
});
