import { runCas } from "./casRunHelpers";

import type { ComputeResult, PortSpec } from "./types";

// Run-mode Trace spec: computeRun calls CAS.convergenceTests(term, "n") for the verdict (which
// test, converges/diverges) and seriesPartialSums({termExpr, indexVar, count}) for the
// partial-sum sequence, which becomes the iterationTrace the TraceNode scrubs. `verdict` is the
// text headline and `sum` is the limit (the last partial sum when the series converges, NaN
// when it diverges — DNE/∞ are answers, not errors). The first output is `trace` so the
// archetype is trace. Inputs mirror the page (convergence-tests.js). See plan Task 17.
export const CONVERGENCE_TESTS_PORT_SPEC: PortSpec = {
  engineId: "calculus",
  methodId: "convergence-tests",
  inputs: [
    { key: "term", label: "aₙ (in n)", kind: "expression", default: "1/n^2" },
  ],
  outputs: [
    { key: "iterationTrace", label: "partial sums", kind: "trace" },
    { key: "verdict", label: "verdict", kind: "text" },
    { key: "sum", label: "sum", kind: "number" },
  ],
  executionMode: "run",
  pagePath: "/math-lab/engines/calculus/methods/convergence-tests.html",
  pageStoreKey: "engine-lab:calculus-convergence-tests",
  compute: (): ComputeResult => ({ outputs: {} }),
  computeRun: async (inputs): Promise<ComputeResult> => {
    const term = String(inputs.term ?? "");

    const verdict = await runCas("convergenceTests", [term, "n"]);
    if (!verdict.ok) {
      return { outputs: {}, error: verdict.error };
    }
    const partials = await runCas("seriesPartialSums", [
      { termExpr: term, indexVar: "n", count: 40 },
    ]);
    if (!partials.ok) {
      return { outputs: {}, error: partials.error };
    }

    const rows =
      (partials.result.rows as
        | Array<{ n: number; term: number | null; partialSum: number }>
        | undefined) ?? [];
    const v = String(verdict.result.verdict ?? "");
    const test = String(verdict.result.test ?? "");
    const converges = v === "converges";
    const lastPartial = rows.length ? rows[rows.length - 1].partialSum : NaN;

    return {
      outputs: {
        iterationTrace: rows,
        verdict: `${v} (${test})`,
        sum: converges ? lastPartial : NaN,
      },
    };
  },
};
