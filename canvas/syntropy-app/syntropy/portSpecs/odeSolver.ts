import { runCas, SYMPY_CAS_TIMEOUT_MS } from "./casRunHelpers";

import type { ComputeResult, ExpressionOutput, PortSpec } from "./types";

// Run-mode Symbolic spec: computeRun calls CAS.solveOde(equation, {x0, derivValues}) for the
// general (no ICs) or particular solution of an ODE. The op routes through SymPy
// (ode-solver.js → the nested sympy-worker), so the first Run pays Pyodide's cold boot, and caps
// the supplied derivative ICs to the equation's detected order (a node always sending
// [y0, y'0] won't over-constrain a 1st-order ODE). The node shows y(x) as the expression and the
// classification/order/verified flag as scalar stats. Mirrors ode-solver.html.
export const ODE_SOLVER_PORT_SPEC: PortSpec = {
  engineId: "ode",
  methodId: "ode-solver",
  inputs: [
    {
      key: "equation",
      label: "ODE",
      kind: "expression",
      default: "y'' + y = 0",
    },
    { key: "x0", label: "x₀", kind: "number", default: 0 },
    { key: "y0", label: "y(x₀)", kind: "number", default: 0 },
    { key: "yp0", label: "y'(x₀)", kind: "number", default: 1 },
  ],
  outputs: [
    { key: "result", label: "y(x)", kind: "expression" },
    { key: "classification", label: "classification", kind: "text" },
    { key: "order", label: "order", kind: "number" },
    { key: "verified", label: "verified (1/0)", kind: "number" },
  ],
  executionMode: "run",
  casTier: "sympy",
  pagePath: "/math-lab/engines/ode/methods/ode-solver.html",
  pageStoreKey: "engine-lab:ode-ode-solver",
  compute: (): ComputeResult => ({ outputs: {} }),
  computeRun: async (inputs): Promise<ComputeResult> => {
    const equation = String(inputs.equation ?? "");
    const x0 = Number(inputs.x0 ?? 0);
    const y0 = Number(inputs.y0 ?? 0);
    const yp0 = Number(inputs.yp0 ?? 0);
    if (!Number.isFinite(x0) || !Number.isFinite(y0) || !Number.isFinite(yp0)) {
      return { outputs: {}, error: "x₀, y(x₀) and y'(x₀) must be numbers." };
    }
    const r = await runCas(
      "solveOde",
      [equation, { x0, derivValues: [y0, yp0] }],
      SYMPY_CAS_TIMEOUT_MS,
    );
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
        classification: String(r.result.classification ?? ""),
        order: Number(r.result.order ?? 0),
        verified: r.result.verified ? 1 : 0,
      },
    };
  },
};
