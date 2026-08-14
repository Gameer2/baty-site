import { bigIntToDisplay, parseBigInt } from "./bigIntHelpers";
import { NumberTheory } from "./numberTheoryAlgorithms";

import type { ComputeResult, ExpressionOutput, PortSpec } from "./types";

export const PRIME_FACTORISATION_PORT_SPEC: PortSpec = {
  engineId: "number-theory",
  methodId: "prime-factorisation",
  // The page's own example (10000004400000259) is a deliberately hard close-prime semiprime that
  // exhausts trial division's default operation budget — a fine teaching point on that full page,
  // but this node wants a default that actually resolves for a useful live preview.
  inputs: [{ key: "n", label: "n", kind: "expression", default: "360" }],
  outputs: [
    { key: "factorization", label: "factorization", kind: "expression" },
    { key: "factorCount", label: "distinct primes", kind: "number" },
    { key: "smallestFactor", label: "smallest p", kind: "number" },
  ],
  // The number-theory analog of LU's relation:"factorization" — the expression output is the
  // prime factorization n = p₁^e₁ · p₂^e₂ · … the core already returns, rendered by SymbolicNode.
  relation: "factorization",
  executionMode: "live",
  pagePath: "/math-lab/engines/number-theory/methods/prime-factorisation.html",
  pageStoreKey: "engine-lab:number-theory-prime-factorisation",
  compute: (inputs): ComputeResult => {
    try {
      const n = parseBigInt(inputs.n, "n");
      if (n < 2n) {
        return { outputs: {}, error: "n must be at least 2." };
      }
      const r = NumberTheory.factorizeFull(n);
      if (!r.ok) {
        return { outputs: {}, error: r.reason };
      }
      // Surface the full factorization the core already computed (factorizeFull returns
      // {p, e}[]); the scalars below only kept factorCount + the smallest prime, discarding the
      // rest. The expression output declared first makes archetypeFromSpec pick "symbolic".
      const factors = r.factors.map((f) => ({
        base: String(f.p),
        exponent: Number(f.e),
      }));
      const factorization: ExpressionOutput = {
        display: `${String(n)} = ${factors
          .map((f) => (f.exponent === 1 ? f.base : `${f.base}^${f.exponent}`))
          .join(" · ")}`,
        structured: { kind: "factorization", factors },
      };
      return {
        outputs: {
          factorization,
          factorCount: r.factors.length,
          smallestFactor: r.factors.length
            ? bigIntToDisplay(r.factors[0].p)
            : 0,
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
