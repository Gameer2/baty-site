import { beforeEach, describe, expect, it, vi } from "vitest";

import { archetypeFromSpec } from "../syntropy/nodes/dispatch";
import { CONTINUED_FRACTIONS_PORT_SPEC } from "../syntropy/portSpecs/continuedFractions";

import type { ExpressionOutput } from "../syntropy/portSpecs/types";

// The spec surfaces the period NumberTheory.continuedFractionSqrt already returns. Mock the
// core (the math-lab IIFE global) so the test is deterministic and offline.
const { continuedFractionSqrtMock } = vi.hoisted(() => ({
  continuedFractionSqrtMock: vi.fn(),
}));

vi.mock("../syntropy/portSpecs/numberTheoryAlgorithms", () => ({
  NumberTheory: { continuedFractionSqrt: continuedFractionSqrtMock },
}));

describe("CONTINUED_FRACTIONS_PORT_SPEC", () => {
  beforeEach(() => continuedFractionSqrtMock.mockReset());

  it("identifies the number-theory/continued-fractions method", () => {
    expect(CONTINUED_FRACTIONS_PORT_SPEC.engineId).toBe("number-theory");
    expect(CONTINUED_FRACTIONS_PORT_SPEC.methodId).toBe("continued-fractions");
    expect(CONTINUED_FRACTIONS_PORT_SPEC.executionMode).toBe("live");
  });

  it("declares the expansion (expression) output first so the archetype is symbolic", () => {
    expect(CONTINUED_FRACTIONS_PORT_SPEC.outputs[0].kind).toBe("expression");
    expect(CONTINUED_FRACTIONS_PORT_SPEC.relation).toBe("factorization");
    expect(archetypeFromSpec(CONTINUED_FRACTIONS_PORT_SPEC)).toBe("symbolic");
  });

  it("surfaces the full expansion [1; 2, 2, ...] the core already returns (D=2)", () => {
    // continuedFractionSqrt(2) → {perfectSquare:false, a0:1n, period:[2n]} — the real core
    // contract. The page renders this as `[1; 2, 2, …]` (the period repeated then an ellipsis).
    continuedFractionSqrtMock.mockReturnValue({
      perfectSquare: false,
      a0: 1n,
      period: [2n],
    });
    const result = CONTINUED_FRACTIONS_PORT_SPEC.compute({ D: "2" });
    expect(result.error).toBeUndefined();
    const expr = result.outputs.expansion as ExpressionOutput;
    expect(expr).toBeDefined();
    expect(expr.display).toBe("[1; 2, 2, ...]");
    expect(expr.structured).toEqual({
      kind: "continuedFraction",
      a0: "1",
      period: ["2"],
    });
  });

  it("still reports the scalar summaries (a0, period length, perfect-square flag)", () => {
    continuedFractionSqrtMock.mockReturnValue({
      perfectSquare: false,
      a0: 1n,
      period: [2n],
    });
    const result = CONTINUED_FRACTIONS_PORT_SPEC.compute({ D: "2" });
    expect(result.outputs.a0).toBe(1);
    expect(result.outputs.periodLength).toBe(1);
    expect(result.outputs.perfectSquare).toBe(0);
  });

  it("surfaces a multi-term period (D=3 → [1; 1, 2, 1, 2, ...])", () => {
    continuedFractionSqrtMock.mockReturnValue({
      perfectSquare: false,
      a0: 1n,
      period: [1n, 2n],
    });
    const result = CONTINUED_FRACTIONS_PORT_SPEC.compute({ D: "3" });
    expect(result.error).toBeUndefined();
    expect((result.outputs.expansion as ExpressionOutput).display).toBe(
      "[1; 1, 2, 1, 2, ...]",
    );
    expect(result.outputs.periodLength).toBe(2);
  });

  it("renders a terminating (perfect-square) expansion with no period as [a0]", () => {
    continuedFractionSqrtMock.mockReturnValue({
      perfectSquare: true,
      a0: 2n,
      period: [],
    });
    const result = CONTINUED_FRACTIONS_PORT_SPEC.compute({ D: "4" });
    expect(result.error).toBeUndefined();
    expect((result.outputs.expansion as ExpressionOutput).display).toBe("[2]");
    expect(result.outputs.periodLength).toBe(0);
    expect(result.outputs.perfectSquare).toBe(1);
  });

  it("returns an error for a negative D", () => {
    const result = CONTINUED_FRACTIONS_PORT_SPEC.compute({ D: "-1" });
    expect(result.error).toBeDefined();
    expect(result.outputs.expansion).toBeUndefined();
  });
});
