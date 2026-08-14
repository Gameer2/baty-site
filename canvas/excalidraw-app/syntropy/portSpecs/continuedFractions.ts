import { bigIntToDisplay, parseBigInt } from "./bigIntHelpers";
import { NumberTheory } from "./numberTheoryAlgorithms";

import type { ComputeResult, ExpressionOutput, PortSpec } from "./types";

export const CONTINUED_FRACTIONS_PORT_SPEC: PortSpec = {
  engineId: "number-theory",
  methodId: "continued-fractions",
  inputs: [{ key: "D", label: "D", kind: "expression", default: "2" }],
  outputs: [
    { key: "expansion", label: "expansion", kind: "expression" },
    { key: "a0", label: "a0", kind: "number" },
    { key: "periodLength", label: "period length", kind: "number" },
    { key: "perfectSquare", label: "perfect sq (1/0)", kind: "number" },
  ],
  // The number-theory analog of LU's relation:"factorization" — the expression output is the
  // periodic continued-fraction expansion [a0; overline{period}] the core already returns, rendered
  // by SymbolicNode with the period under an overline.
  relation: "factorization",
  executionMode: "live",
  pagePath: "/math-lab/engines/number-theory/methods/continued-fractions.html",
  pageStoreKey: "engine-lab:number-theory-continued-fractions",
  compute: (inputs): ComputeResult => {
    try {
      const D = parseBigInt(inputs.D, "D");
      if (D < 0n) {
        return { outputs: {}, error: "D must be non-negative." };
      }
      const r = NumberTheory.continuedFractionSqrt(D);
      // Surface the full expansion the core already computed (a0 + period); the scalars below
      // only kept a0/periodLength/perfectSquare, discarding the expansion. Display matches the
      // page's own convention — `[a0; period, period, …]` (the period repeated then an ellipsis),
      // the page's `firstShown` form in continued-fractions.js. A perfect square terminates with no
      // period, so it renders as `[a0]`. The expression output declared first makes
      // archetypeFromSpec pick "symbolic".
      const period = r.period.map((q) => String(q));
      const periodStr = period.join(", ");
      const expansion: ExpressionOutput = {
        display:
          period.length === 0
            ? `[${String(r.a0)}]`
            : `[${String(r.a0)}; ${periodStr}, ${periodStr}, ...]`,
        structured: { kind: "continuedFraction", a0: String(r.a0), period },
      };
      return {
        outputs: {
          expansion,
          a0: bigIntToDisplay(r.a0),
          periodLength: r.period.length,
          perfectSquare: r.perfectSquare ? 1 : 0,
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
