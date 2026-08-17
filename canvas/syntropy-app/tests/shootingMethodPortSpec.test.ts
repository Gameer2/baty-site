import { describe, expect, it } from "vitest";

import { SHOOTING_METHOD_PORT_SPEC } from "../syntropy/portSpecs/shootingMethod";

describe("SHOOTING_METHOD_PORT_SPEC", () => {
  it("identifies the numerical/shooting-method method", () => {
    expect(SHOOTING_METHOD_PORT_SPEC.engineId).toBe("numerical");
    expect(SHOOTING_METHOD_PORT_SPEC.methodId).toBe("shooting-method");
    expect(SHOOTING_METHOD_PORT_SPEC.executionMode).toBe("live");
  });

  it("solves y''=-y, y(0)=0, y(pi/2)=1 close to y=sin(x)", () => {
    const result = SHOOTING_METHOD_PORT_SPEC.compute({
      px: "0",
      qx: "-1",
      rx: "0",
      a: 0,
      b: 1.5707963267948966,
      alpha: 0,
      beta: 1,
      n: 200,
    });
    expect(result.error).toBeUndefined();
    // midpoint x = pi/4 -> sin(pi/4) ~= 0.7071
    expect(result.outputs.yMid).toBeCloseTo(Math.sin(Math.PI / 4), 3);
  });

  it("returns an error when a equals b", () => {
    const result = SHOOTING_METHOD_PORT_SPEC.compute({
      px: "0",
      qx: "-1",
      rx: "0",
      a: 1,
      b: 1,
      alpha: 0,
      beta: 1,
      n: 200,
    });
    expect(result.error).toBeDefined();
  });

  it("carries the page path and localStorage key for the portal tab", () => {
    expect(SHOOTING_METHOD_PORT_SPEC.pagePath).toBe(
      "/math-lab/engines/numerical/methods/shooting-method.html",
    );
    expect(SHOOTING_METHOD_PORT_SPEC.pageStoreKey).toBe(
      "engine-lab:numerical-shooting-method",
    );
  });
});
