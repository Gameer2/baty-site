import { runCas, SYMPY_CAS_TIMEOUT_MS } from "./casRunHelpers";
import {
  parseExpressionList,
  parseMatrix,
  parseNumberList,
} from "./parseComposite";

import type { ComputeResult, ExpressionOutput, PortSpec } from "./types";

// Run-mode Symbolic spec: computeRun calls CAS.solveOdeSystems(A, g, ics) for a linear system
// x' = A·x + g, solved by SymPy (ode-systems.js → the nested sympy-worker) and cross-checked
// against an independent numeric verify. The matrix/forcing come in as the delimited strings
// parseComposite understands (A = "a,b;c,d", g = "expr1;expr2", ics = "v1,v2"); empty ics gives
// the general solution. The node joins the component solutions as the expression and surfaces the
// stability/eigenvalues/order/verified flag as scalar stats. Mirrors systems.html.
export const ODE_SYSTEMS_PORT_SPEC: PortSpec = {
  engineId: "ode",
  methodId: "systems",
  inputs: [
    { key: "A", label: "matrix A", kind: "matrix", default: "0,1;-1,0" },
    { key: "g", label: "forcing g", kind: "expressions", default: "0;0" },
    { key: "ics", label: "x(0)", kind: "vector", default: "1,0" },
  ],
  outputs: [
    { key: "result", label: "x(t)", kind: "expression" },
    { key: "stability", label: "stability", kind: "text" },
    { key: "n", label: "size n", kind: "number" },
    { key: "verified", label: "verified (1/0)", kind: "number" },
  ],
  executionMode: "run",
  casTier: "sympy",
  pagePath: "/math-lab/engines/ode/methods/systems.html",
  pageStoreKey: "engine-lab:ode-systems",
  compute: (): ComputeResult => ({ outputs: {} }),
  computeRun: async (inputs): Promise<ComputeResult> => {
    const A = parseMatrix(inputs.A);
    const gList = parseExpressionList(inputs.g);
    const icsArr = parseNumberList(inputs.ics);
    if (A.length === 0 || !A.every((row) => row.length === A.length)) {
      return { outputs: {}, error: "A must be a square matrix." };
    }
    const ics = icsArr.length === A.length ? icsArr : null;
    const r = await runCas(
      "solveOdeSystems",
      [A, gList, ics],
      SYMPY_CAS_TIMEOUT_MS,
    );
    if (!r.ok) {
      return { outputs: {}, error: r.error };
    }
    const components = (r.result.components as unknown[]) ?? [];
    const result: ExpressionOutput = {
      display: components.map((c, i) => `x${i + 1}(t) = ${c}`).join("\n"),
      structured: { kind: "plain" },
    };
    const classification = r.result.classification as
      | { type?: string; stability?: string }
      | undefined;
    return {
      outputs: {
        result,
        stability: String(
          classification?.stability ?? r.result.stability ?? "",
        ),
        n: Number(r.result.n ?? A.length),
        verified: r.result.verified ? 1 : 0,
      },
    };
  },
};
