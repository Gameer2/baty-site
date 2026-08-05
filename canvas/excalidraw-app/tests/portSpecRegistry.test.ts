import { describe, expect, it } from "vitest";

import { getPortSpec } from "../syntropy/portSpecs/registry";

describe("getPortSpec", () => {
  it("resolves the Riemann Sums spec", () => {
    const spec = getPortSpec("calculus", "riemann-sums");
    expect(spec?.methodId).toBe("riemann-sums");
  });

  it("returns null for a method with no port spec yet", () => {
    expect(getPortSpec("calculus", "limits")).toBeNull();
    expect(getPortSpec("complex", "mobius-mapping")).toBeNull();
  });
});
