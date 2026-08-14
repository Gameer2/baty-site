import { runCas, stepsToText } from "./casRunHelpers";

import type { ComputeResult, ExpressionOutput, PortSpec } from "./types";

// Run-mode Symbolic spec: computeRun calls CAS.cauchyRiemann(f, [x, y]) for the Cauchy–Riemann
// analyticity check at z0 = x + iy. The op (complex-symbolic.js) decomposes f into u + iv,
// symbolically differentiates, samples a neighbourhood to tell "analytic" from "holds only here",
// and returns a verdict. The node surfaces the verdict as the expression and a 1/0 "CR holds at
// the point" flag; the derivation steps are the text output. Mirrors cauchy-riemann.html.
export const CAUCHY_RIEMANN_PORT_SPEC: PortSpec = {
  engineId: "complex",
  methodId: "cauchy-riemann",
  inputs: [
    { key: "f", label: "f(z)", kind: "expression", default: "exp(z)" },
    { key: "x", label: "Re(z₀)", kind: "number", default: 0 },
    { key: "y", label: "Im(z₀)", kind: "number", default: 0 },
  ],
  outputs: [
    { key: "result", label: "verdict", kind: "expression" },
    { key: "satisfied", label: "CR holds (1/0)", kind: "number" },
    { key: "steps", label: "steps", kind: "text" },
  ],
  executionMode: "run",
  pagePath: "/math-lab/engines/complex/methods/cauchy-riemann.html",
  pageStoreKey: "engine-lab:complex-cauchy-riemann",
  compute: (): ComputeResult => ({ outputs: {} }),
  computeRun: async (inputs): Promise<ComputeResult> => {
    const f = String(inputs.f ?? "");
    const x = Number(inputs.x ?? 0);
    const y = Number(inputs.y ?? 0);
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      return { outputs: {}, error: "Re(z₀) and Im(z₀) must be numbers." };
    }
    const r = await runCas("cauchyRiemann", [f, [x, y]]);
    if (!r.ok) {
      return { outputs: {}, error: r.error };
    }
    const verdict = String(r.result.verdict ?? "");
    const result: ExpressionOutput = {
      display: verdict,
      structured: { kind: "plain" },
    };
    const satisfied = r.result.satisfiesAtPoint ? 1 : 0;
    return {
      outputs: {
        result,
        satisfied,
        steps: stepsToText(r.result.steps),
      },
    };
  },
};
