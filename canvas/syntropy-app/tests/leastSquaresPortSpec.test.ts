import { describe, expect, it } from "vitest";

import { LEAST_SQUARES_PORT_SPEC } from "../syntropy/portSpecs/leastSquares";

describe("LEAST_SQUARES_PORT_SPEC", () => {
  it("identifies the numerical/least-squares method", () => {
    expect(LEAST_SQUARES_PORT_SPEC.engineId).toBe("numerical");
    expect(LEAST_SQUARES_PORT_SPEC.methodId).toBe("least-squares");
    expect(LEAST_SQUARES_PORT_SPEC.executionMode).toBe("live");
  });

  it("fits y = 1 + 2x exactly through 4 collinear points", () => {
    const result = LEAST_SQUARES_PORT_SPEC.compute({
      points: "0,1;1,3;2,5;3,7",
      d: 1,
    });
    expect(result.error).toBeUndefined();
    expect(result.outputs.coeffs).toBeCloseTo(1, 6);
    expect(result.outputs.allCoeffs).toEqual([
      expect.closeTo(1, 6),
      expect.closeTo(2, 6),
    ]);
  });

  it("returns an error when there are not enough points for the degree", () => {
    const result = LEAST_SQUARES_PORT_SPEC.compute({
      points: "0,1;1,3",
      d: 3,
    });
    expect(result.error).toBeDefined();
  });

  it("carries the page path and localStorage key for the portal tab", () => {
    expect(LEAST_SQUARES_PORT_SPEC.pagePath).toBe(
      "/math-lab/engines/numerical/methods/least-squares.html",
    );
    expect(LEAST_SQUARES_PORT_SPEC.pageStoreKey).toBe(
      "engine-lab:numerical-least-squares",
    );
  });
});
