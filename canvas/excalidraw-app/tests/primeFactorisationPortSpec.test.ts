import { beforeEach, describe, expect, it, vi } from "vitest";

import { archetypeFromSpec } from "../syntropy/nodes/dispatch";
import { PRIME_FACTORISATION_PORT_SPEC } from "../syntropy/portSpecs/primeFactorisation";

import type { ExpressionOutput } from "../syntropy/portSpecs/types";

// The spec surfaces the form NumberTheory.factorizeFull already returns. Mock the core (the
// math-lab IIFE global the canvas app loads at runtime) so the test is deterministic and offline
// — the same strategy the Foundation plan uses for run-mode CAS specs. vi.hoisted lets the mock
// factory (hoisted above imports) reference the fn we configure per test.
const { factorizeFullMock } = vi.hoisted(() => ({
  factorizeFullMock: vi.fn(),
}));

vi.mock("../syntropy/portSpecs/numberTheoryAlgorithms", () => ({
  NumberTheory: { factorizeFull: factorizeFullMock },
}));

describe("PRIME_FACTORISATION_PORT_SPEC", () => {
  beforeEach(() => factorizeFullMock.mockReset());

  it("identifies the number-theory/prime-factorisation method", () => {
    expect(PRIME_FACTORISATION_PORT_SPEC.engineId).toBe("number-theory");
    expect(PRIME_FACTORISATION_PORT_SPEC.methodId).toBe("prime-factorisation");
    expect(PRIME_FACTORISATION_PORT_SPEC.executionMode).toBe("live");
  });

  it("declares the factorization (expression) output first so the archetype is symbolic", () => {
    expect(PRIME_FACTORISATION_PORT_SPEC.outputs[0].kind).toBe("expression");
    expect(PRIME_FACTORISATION_PORT_SPEC.relation).toBe("factorization");
    expect(archetypeFromSpec(PRIME_FACTORISATION_PORT_SPEC)).toBe("symbolic");
  });

  it("surfaces the full factorization (12 = 2^2 · 3) the core already returns", () => {
    // factorizeFull(12) → {ok, factors:[{p:2,e:2},{p:3,e:1}]} — the real core contract.
    factorizeFullMock.mockReturnValue({
      ok: true,
      factors: [
        { p: 2n, e: 2n },
        { p: 3n, e: 1n },
      ],
      operations: 1,
    });
    const result = PRIME_FACTORISATION_PORT_SPEC.compute({ n: "12" });
    expect(result.error).toBeUndefined();
    const expr = result.outputs.factorization as ExpressionOutput;
    expect(expr).toBeDefined();
    expect(expr.display).toBe("12 = 2^2 · 3");
    expect(expr.structured).toEqual({
      kind: "factorization",
      factors: [
        { base: "2", exponent: 2 },
        { base: "3", exponent: 1 },
      ],
    });
  });

  it("still reports the scalar summaries (distinct prime count + smallest prime)", () => {
    factorizeFullMock.mockReturnValue({
      ok: true,
      factors: [
        { p: 2n, e: 2n },
        { p: 3n, e: 1n },
      ],
      operations: 1,
    });
    const result = PRIME_FACTORISATION_PORT_SPEC.compute({ n: "12" });
    expect(result.outputs.factorCount).toBe(2);
    expect(result.outputs.smallestFactor).toBe(2);
  });

  it("surfaces a single-prime factorization with no exponent (13 = 13)", () => {
    factorizeFullMock.mockReturnValue({
      ok: true,
      factors: [{ p: 13n, e: 1n }],
      operations: 1,
    });
    const result = PRIME_FACTORISATION_PORT_SPEC.compute({ n: "13" });
    expect(result.error).toBeUndefined();
    expect((result.outputs.factorization as ExpressionOutput).display).toBe(
      "13 = 13",
    );
  });

  it("returns an error for n < 2 without calling the core or emitting an expression", () => {
    const result = PRIME_FACTORISATION_PORT_SPEC.compute({ n: "1" });
    expect(result.error).toBeDefined();
    expect(result.outputs.factorization).toBeUndefined();
    expect(factorizeFullMock).not.toHaveBeenCalled();
  });

  it("surfaces the core's failure reason when factorizeFull does not succeed", () => {
    factorizeFullMock.mockReturnValue({
      ok: false,
      reason: "trial-division budget exhausted",
      factors: [],
      operations: 999,
    });
    const result = PRIME_FACTORISATION_PORT_SPEC.compute({
      n: "10000004400000259",
    });
    expect(result.error).toBe("trial-division budget exhausted");
    expect(result.outputs.factorization).toBeUndefined();
  });
});
