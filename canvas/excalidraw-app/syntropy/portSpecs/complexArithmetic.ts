import { runCas } from "./casRunHelpers";

import type { ComputeResult, ExpressionOutput, PortSpec } from "./types";

// Run-mode Symbolic spec: computeRun calls CAS.complexArithmetic(z, n) and surfaces the polar
// form of z plus z^n and the n nth-roots. The op composes the Complex.* primitives (complex.js)
// numerically — no CAS, no SymPy — so it resolves fast. The page (complex-arithmetic.html) also
// renders a roots-of-unity canvas; that viz stays on the page (v1), the node shows the values.
export const COMPLEX_ARITHMETIC_PORT_SPEC: PortSpec = {
  engineId: "complex",
  methodId: "complex-arithmetic",
  inputs: [
    { key: "re", label: "Re(z)", kind: "number", default: 1 },
    { key: "im", label: "Im(z)", kind: "number", default: 1 },
    { key: "n", label: "n (power / roots)", kind: "number", default: 3 },
  ],
  outputs: [
    { key: "result", label: "z", kind: "expression" },
    { key: "forms", label: "forms · zⁿ · roots", kind: "text" },
  ],
  executionMode: "run",
  pagePath: "/math-lab/engines/complex/methods/complex-arithmetic.html",
  pageStoreKey: "engine-lab:complex-complex-arithmetic",
  compute: (): ComputeResult => ({ outputs: {} }),
  computeRun: async (inputs): Promise<ComputeResult> => {
    const z = {
      re: Number(inputs.re ?? 0),
      im: Number(inputs.im ?? 0),
    };
    const n = Math.round(Number(inputs.n ?? 1));
    if (!Number.isFinite(z.re) || !Number.isFinite(z.im)) {
      return { outputs: {}, error: "Re(z) and Im(z) must be numbers." };
    }
    if (!Number.isInteger(n) || n < 1) {
      return {
        outputs: {},
        error: "n must be a positive integer (1–24 keeps the roots readable).",
      };
    }
    const r = await runCas("complexArithmetic", [z, n]);
    if (!r.ok) {
      return { outputs: {}, error: r.error };
    }
    const result: ExpressionOutput = {
      display: String(r.result.display ?? ""),
      structured: { kind: "plain" },
    };
    const roots = Array.isArray(r.result.roots)
      ? (r.result.roots as unknown[]).map(String)
      : [];
    const forms = [
      String(r.result.forms ?? ""),
      `z^${n} = ${r.result.power ?? ""}`,
      roots.length ? `${n} roots: ${roots.join(", ")}` : "",
    ]
      .filter(Boolean)
      .join("\n");
    return { outputs: { result, forms } };
  },
};
