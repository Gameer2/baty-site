import { fieldOutputFromResult } from "./fieldSample";
import { runCas } from "./casRunHelpers";

import type { ComputeResult, PortSpec } from "./types";

// Run-mode Field spec: computeRun calls CAS.heatField({L, k, fxExpr, N, T}) which solves the heat
// equation (separation of variables → Fourier sine coefficients, all numeric — no SymPy) and
// samples u(x,t) = Σ bn·sin(nπx/L)·exp(-k(nπ/L)²t) over x ∈ [0,L], t ∈ [0,T] into a heatmap grid.
// The first output is `field` so the archetype is field; the classification line shows as text and
// T as a scalar stat. Mirrors engines/ode/methods/heat-equation.html.
export const HEAT_EQUATION_PORT_SPEC: PortSpec = {
  engineId: "ode",
  methodId: "heat-equation",
  inputs: [
    { key: "L", label: "length L", kind: "number", default: 3.141592653589793 },
    { key: "k", label: "diffusivity k", kind: "number", default: 1 },
    { key: "f", label: "f(x) initial", kind: "expression", default: "sin(x)" },
    { key: "N", label: "terms N", kind: "number", default: 8 },
    { key: "T", label: "horizon T", kind: "number", default: 1 },
  ],
  outputs: [
    { key: "field", label: "u(x, t)", kind: "field" },
    { key: "classification", label: "type", kind: "text" },
    { key: "T", label: "horizon T", kind: "number" },
  ],
  executionMode: "run",
  pagePath: "/math-lab/engines/ode/methods/heat-equation.html",
  pageStoreKey: "engine-lab:ode-heat-equation",
  compute: (): ComputeResult => ({ outputs: {} }),
  computeRun: async (inputs): Promise<ComputeResult> => {
    const L = Number(inputs.L ?? 0);
    const k = Number(inputs.k ?? 0);
    const T = Number(inputs.T ?? 0);
    const N = Math.round(Number(inputs.N ?? 8));
    if (![L, k, T].every(Number.isFinite) || L <= 0 || k <= 0 || T <= 0) {
      return { outputs: {}, error: "L, k and T must be positive numbers." };
    }
    const r = await runCas("heatField", [
      { L, k, fxExpr: String(inputs.f ?? "0"), N, T },
    ]);
    if (!r.ok) {
      return { outputs: {}, error: r.error };
    }
    const out = fieldOutputFromResult(r.result as Record<string, unknown>);
    if (!out.ok) {
      return { outputs: {}, error: out.error };
    }
    return {
      outputs: {
        field: out.field,
        classification: String(
          (r.result as { classification?: string }).classification ?? "",
        ),
        T,
      },
    };
  },
};
