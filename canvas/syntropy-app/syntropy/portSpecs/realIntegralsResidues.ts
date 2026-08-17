import { runCas, SYMPY_CAS_TIMEOUT_MS } from "./casRunHelpers";

import type { ComputeResult, PortSpec } from "./types";

// Run-mode Scalar spec: computeRun calls CAS.realIntegralsResidues(f, mode) for a real integral
// evaluated by closing the contour and summing residues (mode "whole" = ∫_{-∞}^{∞}, "half" =
// ∫_{0}^{∞}). The op routes through SymPy (variable x); the first Run pays Pyodide's cold boot.
// The residue-theorem value of a real integral is real (imag ≈ 0), so the headline is a `number`
// (value.re) and the archetype is scalar; the poles used are the text output. Mirrors
// real-integrals-residues.html.
export const REAL_INTEGRALS_RESIDUES_PORT_SPEC: PortSpec = {
  engineId: "complex",
  methodId: "real-integrals-residues",
  inputs: [
    { key: "f", label: "f(x)", kind: "expression", default: "1/(1+x^2)" },
    { key: "mode", label: "mode", kind: "expression", default: "whole" },
  ],
  outputs: [
    { key: "value", label: "∫ f dx", kind: "number" },
    { key: "poles", label: "poles used", kind: "text" },
  ],
  executionMode: "run",
  casTier: "sympy",
  pagePath: "/math-lab/engines/complex/methods/real-integrals-residues.html",
  pageStoreKey: "engine-lab:complex-real-integrals-residues",
  compute: (): ComputeResult => ({ outputs: {} }),
  computeRun: async (inputs): Promise<ComputeResult> => {
    const f = String(inputs.f ?? "");
    const mode = String(inputs.mode ?? "whole").trim();
    if (mode !== "whole" && mode !== "half") {
      return {
        outputs: {},
        error: 'mode must be "whole" (∫_{-∞}^{∞}) or "half" (∫_{0}^{∞}).',
      };
    }
    const r = await runCas(
      "realIntegralsResidues",
      [f, mode],
      SYMPY_CAS_TIMEOUT_MS,
    );
    if (!r.ok) {
      return { outputs: {}, error: r.error };
    }
    const value = (r.result.value as { re?: number; im?: number }) ?? {};
    const poles = Array.isArray(r.result.poles)
      ? (r.result.poles as unknown[]).map(String).join(", ")
      : String(r.result.poles ?? "");
    return { outputs: { value: Number(value.re ?? 0), poles } };
  },
};
