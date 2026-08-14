import { beforeEach, describe, expect, it, vi } from "vitest";

import { archetypeFromSpec } from "../syntropy/nodes/dispatch";
import { LINEAR_CONGRUENCES_PORT_SPEC } from "../syntropy/portSpecs/linearCongruences";

import type { ExpressionOutput } from "../syntropy/portSpecs/types";

// The spec surfaces the solution set NumberTheory.solveLinearCongruence already returns. Mock the
// core (the math-lab IIFE global) so the test is deterministic and offline.
const { solveLinearCongruenceMock } = vi.hoisted(() => ({
  solveLinearCongruenceMock: vi.fn(),
}));

vi.mock("../syntropy/portSpecs/numberTheoryAlgorithms", () => ({
  NumberTheory: { solveLinearCongruence: solveLinearCongruenceMock },
}));

describe("LINEAR_CONGRUENCES_PORT_SPEC", () => {
  beforeEach(() => solveLinearCongruenceMock.mockReset());

  it("identifies the number-theory/linear-congruences method", () => {
    expect(LINEAR_CONGRUENCES_PORT_SPEC.engineId).toBe("number-theory");
    expect(LINEAR_CONGRUENCES_PORT_SPEC.methodId).toBe("linear-congruences");
    expect(LINEAR_CONGRUENCES_PORT_SPEC.executionMode).toBe("live");
  });

  it("declares the solutionSet (expression) output first so the archetype is symbolic", () => {
    expect(LINEAR_CONGRUENCES_PORT_SPEC.outputs[0].kind).toBe("expression");
    expect(LINEAR_CONGRUENCES_PORT_SPEC.relation).toBe("factorization");
    expect(archetypeFromSpec(LINEAR_CONGRUENCES_PORT_SPEC)).toBe("symbolic");
  });

  it("surfaces the full solution set (x ≡ 2, 5 (mod 6)) the core already returns", () => {
    // solveLinearCongruence(2, 4, 6) → {solvable:true, gcd:2n, count:2, solutions:[2n, 5n]} —
    // 2x ≡ 4 (mod 6) has the two solutions x ≡ 2, 5. The plan's stated (2,1,6) example is
    // unsolvable (gcd(2,6)=2 ∤ 1), so this uses the solvable (2,4,6) instead.
    solveLinearCongruenceMock.mockReturnValue({
      solvable: true,
      gcd: 2n,
      count: 2,
      solutions: [2n, 5n],
    });
    const result = LINEAR_CONGRUENCES_PORT_SPEC.compute({
      a: "2",
      b: "4",
      n: "6",
    });
    expect(result.error).toBeUndefined();
    const expr = result.outputs.solutionSet as ExpressionOutput;
    expect(expr).toBeDefined();
    expect(expr.display).toBe("x ≡ 2, 5 (mod 6)");
    expect(expr.structured).toEqual({
      kind: "congruenceSet",
      modulus: "6",
      solutions: ["2", "5"],
    });
  });

  it("still reports the scalar summaries (solvable flag, count, x0)", () => {
    solveLinearCongruenceMock.mockReturnValue({
      solvable: true,
      gcd: 2n,
      count: 2,
      solutions: [2n, 5n],
    });
    const result = LINEAR_CONGRUENCES_PORT_SPEC.compute({
      a: "2",
      b: "4",
      n: "6",
    });
    expect(result.outputs.solvable).toBe(1);
    expect(result.outputs.count).toBe(2);
    expect(result.outputs.x0).toBe(2);
  });

  it("omits the expression and reports solvable:0 on an unsolvable congruence", () => {
    solveLinearCongruenceMock.mockReturnValue({
      solvable: false,
      gcd: 2n,
      reason: "gcd(a,n) does not divide b",
    });
    const result = LINEAR_CONGRUENCES_PORT_SPEC.compute({
      a: "2",
      b: "1",
      n: "6",
    });
    expect(result.error).toBeUndefined();
    expect(result.outputs.solutionSet).toBeUndefined();
    expect(result.outputs.solvable).toBe(0);
  });
});
