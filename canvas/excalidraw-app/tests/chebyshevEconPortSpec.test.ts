import { describe, expect, it } from "vitest";

import { CHEBYSHEV_ECON_PORT_SPEC } from "../syntropy/portSpecs/chebyshevEcon";

describe("CHEBYSHEV_ECON_PORT_SPEC", () => {
  it("identifies the numerical/chebyshev-econ method", () => {
    expect(CHEBYSHEV_ECON_PORT_SPEC.engineId).toBe("numerical");
    expect(CHEBYSHEV_ECON_PORT_SPEC.methodId).toBe("chebyshev-econ");
    expect(CHEBYSHEV_ECON_PORT_SPEC.executionMode).toBe("live");
  });

  it("economizes x^4 (ascending [0,0,0,0,1]) to degree 2", () => {
    const result = CHEBYSHEV_ECON_PORT_SPEC.compute({
      coeffs: "0,0,0,0,1",
      d: 2,
    });
    expect(result.error).toBeUndefined();
    expect(result.outputs.originalDegree).toBe(4);
    expect(result.outputs.economizedDegree).toBe(2);
  });

  it("returns an error when target degree is not below the original degree", () => {
    const result = CHEBYSHEV_ECON_PORT_SPEC.compute({
      coeffs: "0,0,0,0,1",
      d: 4,
    });
    expect(result.error).toBeDefined();
  });

  it("carries the page path and localStorage key for the portal tab", () => {
    expect(CHEBYSHEV_ECON_PORT_SPEC.pagePath).toBe(
      "/math-lab/engines/numerical/methods/chebyshev-econ.html",
    );
    expect(CHEBYSHEV_ECON_PORT_SPEC.pageStoreKey).toBe(
      "engine-lab:numerical-chebyshev-econ",
    );
  });
});
