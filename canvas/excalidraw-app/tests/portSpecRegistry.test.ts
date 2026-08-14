import { describe, expect, it } from "vitest";

import { getPortSpec } from "../syntropy/portSpecs/registry";

describe("getPortSpec", () => {
  it("resolves the Riemann Sums spec", () => {
    const spec = getPortSpec("calculus", "riemann-sums");
    expect(spec?.methodId).toBe("riemann-sums");
  });

  it("returns null for a method with no port spec yet", () => {
    // Bogus method ids — real method names (limits, mobius-mapping, …) get registered as each
    // engine rolls out, which would churn this assertion. A non-existent id stays null forever.
    expect(getPortSpec("calculus", "not-a-real-method")).toBeNull();
    expect(getPortSpec("complex", "not-a-real-method")).toBeNull();
  });
});
