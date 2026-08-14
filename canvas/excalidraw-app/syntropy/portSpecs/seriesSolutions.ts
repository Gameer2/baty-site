import { runCas } from "./casRunHelpers";

import type { ComputeResult, ExpressionOutput, PortSpec } from "./types";

// Run-mode Symbolic spec: computeRun calls CAS.seriesSolutions(equation, point, order) for the
// power/Frobenius series solution of an ODE about a point (series-solution-fallback.js → the
// nested sympy-worker). The op refuses a series whose residual doesn't shrink toward the
// expansion point. The node shows the series as the expression and the kind (ordinary/singular)
// + verified flag as scalar stats. Mirrors series-solutions.html.
export const SERIES_SOLUTIONS_PORT_SPEC: PortSpec = {
  engineId: "ode",
  methodId: "series-solutions",
  inputs: [
    {
      key: "equation",
      label: "ODE",
      kind: "expression",
      default: "(1-x^2)y'' - 2xy' + 2y = 0",
    },
    { key: "point", label: "expand at x₀", kind: "number", default: 0 },
    { key: "order", label: "terms", kind: "number", default: 6 },
  ],
  outputs: [
    { key: "result", label: "series", kind: "expression" },
    { key: "kind", label: "kind", kind: "text" },
    { key: "verified", label: "verified (1/0)", kind: "number" },
  ],
  executionMode: "run",
  pagePath: "/math-lab/engines/ode/methods/series-solutions.html",
  pageStoreKey: "engine-lab:ode-series-solutions",
  compute: (): ComputeResult => ({ outputs: {} }),
  computeRun: async (inputs): Promise<ComputeResult> => {
    const equation = String(inputs.equation ?? "");
    const point = Number(inputs.point ?? 0);
    const order = Number(inputs.order ?? 6);
    if (!Number.isFinite(point)) {
      return { outputs: {}, error: "The expansion point must be a number." };
    }
    if (!Number.isInteger(order) || order < 1) {
      return {
        outputs: {},
        error: "The term count must be a positive integer.",
      };
    }
    const r = await runCas("seriesSolutions", [equation, point, order]);
    if (!r.ok) {
      return { outputs: {}, error: r.error };
    }
    const result: ExpressionOutput = {
      display: String(r.result.series ?? ""),
      structured: { kind: "plain" },
    };
    return {
      outputs: {
        result,
        kind: String(r.result.kind ?? ""),
        verified: r.result.verified ? 1 : 0,
      },
    };
  },
};
