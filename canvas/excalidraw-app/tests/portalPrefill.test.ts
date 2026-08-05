import { afterEach, describe, expect, it, vi } from "vitest";

import { buildPageState, openMethodPage } from "../syntropy/portalPrefill";
import { RIEMANN_SUMS_PORT_SPEC } from "../syntropy/portSpecs/riemannSums";

describe("buildPageState", () => {
  it("maps port-spec input keys to the page's own saveState/loadState shape", () => {
    // riemann-sums.js's own snapshot() is { fx, a, b, n } — see
    // math-lab/assets/js/riemann-sums.js:33. buildPageState must match it exactly since the
    // page's restore block reads these keys with no adapter on the page side.
    const state = buildPageState(RIEMANN_SUMS_PORT_SPEC, {
      fx: "cos(x)",
      a: 0,
      b: 3.14,
      n: 8,
    });
    expect(state).toEqual({ fx: "cos(x)", a: 0, b: 3.14, n: 8 });
  });
});

describe("openMethodPage", () => {
  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("writes the page's localStorage key and opens the page", () => {
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);

    openMethodPage(RIEMANN_SUMS_PORT_SPEC, { fx: "x^2", a: 0, b: 1, n: 4 });

    const stored = JSON.parse(
      localStorage.getItem("engine-lab:calculus-riemann-sums") ?? "{}",
    );
    expect(stored).toEqual({ fx: "x^2", a: 0, b: 1, n: 4 });
    expect(openSpy).toHaveBeenCalledWith(
      "/math-lab/engines/calculus/methods/riemann-sums.html",
      "_blank",
    );
  });
});
