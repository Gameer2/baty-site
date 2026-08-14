import { runCas } from "./casRunHelpers";

import type { ComputeResult, ExpressionOutput, PortSpec } from "./types";

// Run-mode Symbolic spec: computeRun calls CAS.laplaceTransform(f) for L{f}(s) (the page's
// forward-transform tab — the node stays single-mode per the convention; inverse/IVP/convolution
// stay on the page). The op routes through SymPy (laplace-engine.js → the nested sympy-worker) and
// round-trip-verifies against the defining integral. The node shows F(s) as the expression and the
// verified flag as a scalar stat; a Dirac-delta result surfaces as unverified. Mirrors
// laplace-transform.html.
export const LAPLACE_TRANSFORM_PORT_SPEC: PortSpec = {
  engineId: "ode",
  methodId: "laplace-transform",
  inputs: [{ key: "f", label: "f(t)", kind: "expression", default: "sin(t)" }],
  outputs: [
    { key: "result", label: "F(s)", kind: "expression" },
    { key: "verified", label: "verified (1/0)", kind: "number" },
  ],
  executionMode: "run",
  pagePath: "/math-lab/engines/ode/methods/laplace-transform.html",
  pageStoreKey: "engine-lab:ode-laplace-transform",
  compute: (): ComputeResult => ({ outputs: {} }),
  computeRun: async (inputs): Promise<ComputeResult> => {
    const f = String(inputs.f ?? "");
    const r = await runCas("laplaceTransform", [f]);
    if (!r.ok) {
      return { outputs: {}, error: r.error };
    }
    const result: ExpressionOutput = {
      display: String(r.result.result ?? ""),
      structured: { kind: "plain" },
    };
    return {
      outputs: {
        result,
        verified: r.result.verified ? 1 : 0,
      },
    };
  },
};
