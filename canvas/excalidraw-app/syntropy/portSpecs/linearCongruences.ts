import { bigIntToDisplay, parseBigInt } from "./bigIntHelpers";
import { NumberTheory } from "./numberTheoryAlgorithms";

import type { ComputeResult, ExpressionOutput, PortSpec } from "./types";

export const LINEAR_CONGRUENCES_PORT_SPEC: PortSpec = {
  engineId: "number-theory",
  methodId: "linear-congruences",
  inputs: [
    { key: "a", label: "a", kind: "expression", default: "3" },
    { key: "b", label: "b", kind: "expression", default: "1" },
    { key: "n", label: "n", kind: "expression", default: "7" },
  ],
  outputs: [
    { key: "solutionSet", label: "solution set", kind: "expression" },
    { key: "solvable", label: "solvable (1/0)", kind: "number" },
    { key: "count", label: "# solutions", kind: "number" },
    { key: "x0", label: "x0", kind: "number" },
  ],
  // The number-theory analog of LU's relation:"factorization" — the expression output is the full
  // solution set x ≡ s₁, s₂, … (mod n) solveLinearCongruence already returns, rendered by
  // SymbolicNode with a mod clause.
  relation: "factorization",
  executionMode: "live",
  pagePath: "/math-lab/engines/number-theory/methods/linear-congruences.html",
  pageStoreKey: "engine-lab:number-theory-linear-congruences",
  compute: (inputs): ComputeResult => {
    try {
      const a = parseBigInt(inputs.a, "a");
      const b = parseBigInt(inputs.b, "b");
      const n = parseBigInt(inputs.n, "n");
      const r = NumberTheory.solveLinearCongruence(a, b, n);
      if (!r.solvable) {
        // No solution set on the unsolvable path — keep the existing solvable:0 scalar only.
        return { outputs: { solvable: 0 } };
      }
      // Surface the full solution set the core already computed (solutions[]); the scalars below
      // only kept count + x0, discarding the rest. The expression output declared first makes
      // archetypeFromSpec pick "symbolic".
      const solutions = r.solutions.map((s) => String(s));
      const solutionSet: ExpressionOutput = {
        display: `x ≡ ${solutions.join(", ")} (mod ${String(n)})`,
        structured: { kind: "congruenceSet", modulus: String(n), solutions },
      };
      return {
        outputs: {
          solutionSet,
          solvable: 1,
          count: r.count,
          x0: bigIntToDisplay(r.solutions[0]),
        },
      };
    } catch (err) {
      return {
        outputs: {},
        error: err instanceof Error ? err.message : String(err),
      };
    }
  },
};
