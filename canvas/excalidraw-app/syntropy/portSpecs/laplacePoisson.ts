import { fieldOutputFromResult } from "./fieldSample";
import { runCas } from "./casRunHelpers";

import type { ComputeResult, PortSpec } from "./types";

// Run-mode Field spec: computeRun calls CAS.solveLaplacePoisson({mode, a, b, M, edges, source})
// which assembles the finite-difference grid for Laplace (edge boundary values, no source) or
// Poisson (zero boundary, a source f(x,y)), solves it iteratively (Gauss–Seidel), and reshapes the
// flat solution into a (M+1)×(M+1) heatmap grid over [0,a]×[0,b]. The first output is `field` so
// the archetype is field; the converged flag and mode show as scalar stats. The node is
// single-mode (the `mode` input picks laplace vs poisson) — the page's separate Laplace/Poisson
// panels collapse to one node here. Mirrors engines/ode/methods/laplace-poisson.html.
export const LAPLACE_POISSON_PORT_SPEC: PortSpec = {
  engineId: "ode",
  methodId: "laplace-poisson",
  inputs: [
    { key: "mode", label: "mode", kind: "expression", default: "laplace" },
    { key: "a", label: "width a", kind: "number", default: 1 },
    { key: "b", label: "height b", kind: "number", default: 1 },
    { key: "M", label: "grid M", kind: "number", default: 12 },
    { key: "bottom", label: "u(x, 0)", kind: "expression", default: "0" },
    { key: "top", label: "u(x, b)", kind: "expression", default: "1" },
    { key: "left", label: "u(0, y)", kind: "expression", default: "0" },
    { key: "right", label: "u(a, y)", kind: "expression", default: "0" },
    {
      key: "source",
      label: "source f(x, y)",
      kind: "expression",
      default: "-10",
    },
  ],
  outputs: [
    { key: "field", label: "u(x, y)", kind: "field" },
    { key: "mode", label: "mode", kind: "text" },
    { key: "converged", label: "converged (1/0)", kind: "number" },
  ],
  executionMode: "run",
  pagePath: "/math-lab/engines/ode/methods/laplace-poisson.html",
  pageStoreKey: "engine-lab:ode-laplace-poisson",
  compute: (): ComputeResult => ({ outputs: {} }),
  computeRun: async (inputs): Promise<ComputeResult> => {
    const a = Number(inputs.a ?? 0);
    const b = Number(inputs.b ?? 0);
    const M = Math.round(Number(inputs.M ?? 12));
    if (![a, b].every(Number.isFinite) || a <= 0 || b <= 0) {
      return { outputs: {}, error: "a and b must be positive numbers." };
    }
    const r = await runCas("solveLaplacePoisson", [
      {
        mode: String(inputs.mode ?? "laplace"),
        a,
        b,
        M,
        bottom: String(inputs.bottom ?? "0"),
        top: String(inputs.top ?? "0"),
        left: String(inputs.left ?? "0"),
        right: String(inputs.right ?? "0"),
        source: String(inputs.source ?? "0"),
      },
    ]);
    if (!r.ok) {
      return { outputs: {}, error: r.error };
    }
    const out = fieldOutputFromResult(r.result as Record<string, unknown>);
    if (!out.ok) {
      return { outputs: {}, error: out.error };
    }
    const res = r.result as { converged?: number; mode?: string };
    return {
      outputs: {
        field: out.field,
        mode: String(res.mode ?? inputs.mode ?? ""),
        converged: Number(res.converged ?? 0),
      },
    };
  },
};
