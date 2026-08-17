import { fieldOutputFromResult } from "./fieldSample";
import { runCas } from "./casRunHelpers";

import type { ComputeResult, PortSpec } from "./types";

// Run-mode Field spec: computeRun calls CAS.waveField({L, c, fxExpr, gxExpr, N, T}) which solves
// the wave equation (separation of variables → An, Bn, all numeric — no SymPy) and samples
// u(x,t) = Σ (An cos(nπct/L) + Bn sin(nπct/L)) sin(nπx/L) over x ∈ [0,L], t ∈ [0,T] into a heatmap
// grid. The first output is `field` so the archetype is field; the classification line shows as
// text and T as a scalar stat. Mirrors engines/ode/methods/wave-equation.html.
export const WAVE_EQUATION_PORT_SPEC: PortSpec = {
  engineId: "ode",
  methodId: "wave-equation",
  inputs: [
    { key: "L", label: "length L", kind: "number", default: 3.141592653589793 },
    { key: "c", label: "wave speed c", kind: "number", default: 1 },
    {
      key: "f",
      label: "f(x) initial position",
      kind: "expression",
      default: "sin(x)",
    },
    {
      key: "g",
      label: "g(x) initial velocity",
      kind: "expression",
      default: "0",
    },
    { key: "N", label: "terms N", kind: "number", default: 8 },
    { key: "T", label: "horizon T", kind: "number", default: 1 },
  ],
  outputs: [
    { key: "field", label: "u(x, t)", kind: "field" },
    { key: "classification", label: "type", kind: "text" },
    { key: "T", label: "horizon T", kind: "number" },
  ],
  executionMode: "run",
  pagePath: "/math-lab/engines/ode/methods/wave-equation.html",
  pageStoreKey: "engine-lab:ode-wave-equation",
  compute: (): ComputeResult => ({ outputs: {} }),
  computeRun: async (inputs): Promise<ComputeResult> => {
    const L = Number(inputs.L ?? 0);
    const c = Number(inputs.c ?? 0);
    const T = Number(inputs.T ?? 0);
    const N = Math.round(Number(inputs.N ?? 8));
    if (![L, c, T].every(Number.isFinite) || L <= 0 || c <= 0 || T <= 0) {
      return { outputs: {}, error: "L, c and T must be positive numbers." };
    }
    const r = await runCas("waveField", [
      {
        L,
        c,
        fxExpr: String(inputs.f ?? "0"),
        gxExpr: String(inputs.g ?? "0"),
        N,
        T,
      },
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
