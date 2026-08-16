import { describe, expect, it, vi } from "vitest";

import { warmSympyTier } from "../syntropy/portSpecs/casRunHelpers";

import type { ComputeResult, PortSpec } from "../syntropy/portSpecs/types";

const baseSpec: PortSpec = {
  engineId: "ode",
  methodId: "systems-fixture",
  inputs: [
    { key: "A", label: "matrix A", kind: "matrix", default: "0,1;-1,0" },
    { key: "ics", label: "x(0)", kind: "vector", default: "1,0" },
  ],
  outputs: [],
  executionMode: "run",
  compute: (): ComputeResult => ({ outputs: {} }),
  pagePath: "/math-lab/engines/ode/methods/systems.html",
  pageStoreKey: "engine-lab:ode-systems",
};

describe("warmSympyTier", () => {
  it("fires computeRun with the spec's own defaults for a casTier: sympy spec", () => {
    const computeRun = vi.fn().mockResolvedValue({ outputs: {} });
    warmSympyTier({ ...baseSpec, casTier: "sympy", computeRun });

    expect(computeRun).toHaveBeenCalledWith({ A: "0,1;-1,0", ics: "1,0" });
  });

  it("is a no-op for a spec without casTier: sympy", () => {
    const computeRun = vi.fn().mockResolvedValue({ outputs: {} });
    warmSympyTier({ ...baseSpec, computeRun });

    expect(computeRun).not.toHaveBeenCalled();
  });

  it("is a no-op for a live spec with no computeRun at all", () => {
    // Guards against a future casTier: "sympy" spec that forgets computeRun — should not throw.
    expect(() =>
      warmSympyTier({ ...baseSpec, casTier: "sympy", computeRun: undefined }),
    ).not.toThrow();
  });

  it("swallows a rejected warm call — it's a cache warm, not a real run", async () => {
    const computeRun = vi.fn().mockRejectedValue(new Error("worker unavailable"));
    expect(() =>
      warmSympyTier({ ...baseSpec, casTier: "sympy", computeRun }),
    ).not.toThrow();
    // Let the rejected promise's .catch() microtask settle before the test ends, so vitest
    // doesn't see it as an unhandled rejection.
    await new Promise((r) => setTimeout(r, 0));
  });
});
