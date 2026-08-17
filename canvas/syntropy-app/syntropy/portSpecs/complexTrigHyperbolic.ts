import { runCas } from "./casRunHelpers";

import type { ComputeResult, ExpressionOutput, PortSpec } from "./types";

// Run-mode Symbolic spec: computeRun calls CAS.complexTrigHyperbolic(fn, z) for fn(z) where fn is
// any of math.js's complex-aware functions (sin, cos, tan, sinh, cosh, …). The op evaluates
// fn(z) via math.js and reports the value + modulus. The page's domain-coloring canvas stays on
// the page (v1); the node shows the value at the single input z.
export const COMPLEX_TRIG_HYPERBOLIC_PORT_SPEC: PortSpec = {
  engineId: "complex",
  methodId: "complex-trig-hyperbolic",
  inputs: [
    { key: "fn", label: "function", kind: "expression", default: "sin" },
    { key: "re", label: "Re(z)", kind: "number", default: 1 },
    { key: "im", label: "Im(z)", kind: "number", default: 1 },
  ],
  outputs: [
    { key: "result", label: "fn(z)", kind: "expression" },
    { key: "abs", label: "|fn(z)|", kind: "number" },
  ],
  executionMode: "run",
  pagePath: "/math-lab/engines/complex/methods/complex-trig-hyperbolic.html",
  pageStoreKey: "engine-lab:complex-complex-trig-hyperbolic",
  compute: (): ComputeResult => ({ outputs: {} }),
  computeRun: async (inputs): Promise<ComputeResult> => {
    const fn = String(inputs.fn ?? "sin").trim();
    const z = {
      re: Number(inputs.re ?? 0),
      im: Number(inputs.im ?? 0),
    };
    if (!Number.isFinite(z.re) || !Number.isFinite(z.im)) {
      return { outputs: {}, error: "Re(z) and Im(z) must be numbers." };
    }
    const r = await runCas("complexTrigHyperbolic", [fn, z]);
    if (!r.ok) {
      return { outputs: {}, error: r.error };
    }
    const result: ExpressionOutput = {
      display: String(r.result.display ?? ""),
      structured: { kind: "plain" },
    };
    const abs = Number(r.result.abs);
    return { outputs: { result, abs } };
  },
};
