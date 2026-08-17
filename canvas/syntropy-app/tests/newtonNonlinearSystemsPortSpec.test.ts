import { describe, expect, it } from "vitest";

import { NEWTON_NONLINEAR_SYSTEMS_PORT_SPEC } from "../syntropy/portSpecs/newtonNonlinearSystems";

describe("NEWTON_NONLINEAR_SYSTEMS_PORT_SPEC", () => {
  it("identifies the numerical/newton-nonlinear-systems method", () => {
    expect(NEWTON_NONLINEAR_SYSTEMS_PORT_SPEC.engineId).toBe("numerical");
    expect(NEWTON_NONLINEAR_SYSTEMS_PORT_SPEC.methodId).toBe(
      "newton-nonlinear-systems",
    );
    expect(NEWTON_NONLINEAR_SYSTEMS_PORT_SPEC.executionMode).toBe("live");
  });

  it("solves x1^2+x2^2=2, x1=x2 to x1=x2=1", () => {
    const result = NEWTON_NONLINEAR_SYSTEMS_PORT_SPEC.compute({
      system: "x1^2 + x2^2 - 2;x1 - x2",
      x0: "1.5,1.5",
      tol: 0.0000000001,
      maxIter: 50,
    });
    expect(result.error).toBeUndefined();
    expect(result.outputs.x1).toBeCloseTo(1, 6);
    expect(result.outputs.solution).toEqual([
      expect.closeTo(1, 6),
      expect.closeTo(1, 6),
    ]);
  });

  it("returns an error when x0 length doesn't match equation count", () => {
    const result = NEWTON_NONLINEAR_SYSTEMS_PORT_SPEC.compute({
      system: "x1^2 + x2^2 - 2;x1 - x2",
      x0: "1.5",
      tol: 0.0000000001,
      maxIter: 50,
    });
    expect(result.error).toBeDefined();
  });

  it("carries the page path and localStorage key for the portal tab", () => {
    expect(NEWTON_NONLINEAR_SYSTEMS_PORT_SPEC.pagePath).toBe(
      "/math-lab/engines/numerical/methods/newton-nonlinear-systems.html",
    );
    expect(NEWTON_NONLINEAR_SYSTEMS_PORT_SPEC.pageStoreKey).toBe(
      "engine-lab:numerical-newton-nonlinear-systems",
    );
  });
});
