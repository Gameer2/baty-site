import { runCas } from "./casRunHelpers";

import type { ComputeResult, PortSpec } from "./types";

// Run-mode Scalar spec: computeRun calls CAS.argumentRouche(f, g, contour, mode) for either the
// argument principle (mode "argument": N − P, zeros minus poles of f inside γ) or Rouché's theorem
// (mode "rouche": when |f − g| < |f| on γ, f and f + g have the same number of zeros inside). The op
// is pure-numeric (complex-contour-theorems.js, no SymPy). The headline count is a `number` (scalar
// archetype); the supporting detail (winding / ratio) is the text output. g is used only in
// "rouche" mode. Mirrors argument-rouche.html.
export const ARGUMENT_ROUCHE_PORT_SPEC: PortSpec = {
  engineId: "complex",
  methodId: "argument-rouche",
  inputs: [
    { key: "mode", label: "mode", kind: "expression", default: "argument" },
    { key: "f", label: "f(z)", kind: "expression", default: "z^2" },
    { key: "g", label: "g(z) (Rouché)", kind: "expression", default: "0" },
    { key: "centerRe", label: "Re(center)", kind: "number", default: 0 },
    { key: "centerIm", label: "Im(center)", kind: "number", default: 0 },
    { key: "radius", label: "radius", kind: "number", default: 2 },
  ],
  outputs: [
    { key: "count", label: "count inside γ", kind: "number" },
    { key: "detail", label: "detail", kind: "text" },
  ],
  executionMode: "run",
  pagePath: "/math-lab/engines/complex/methods/argument-rouche.html",
  pageStoreKey: "engine-lab:complex-argument-rouche",
  compute: (): ComputeResult => ({ outputs: {} }),
  computeRun: async (inputs): Promise<ComputeResult> => {
    const mode = String(inputs.mode ?? "argument").trim();
    const f = String(inputs.f ?? "");
    const g = String(inputs.g ?? "");
    const center = {
      re: Number(inputs.centerRe ?? 0),
      im: Number(inputs.centerIm ?? 0),
    };
    const radius = Number(inputs.radius ?? 1);
    if (!Number.isFinite(center.re) || !Number.isFinite(center.im)) {
      return {
        outputs: {},
        error: "The contour center needs numeric Re and Im parts.",
      };
    }
    if (!Number.isFinite(radius) || radius <= 0) {
      return {
        outputs: {},
        error: "The contour radius must be a positive number.",
      };
    }
    if (mode !== "argument" && mode !== "rouche") {
      return { outputs: {}, error: 'mode must be "argument" or "rouche".' };
    }
    const contour = { type: "circle" as const, center, radius };
    const r = await runCas("argumentRouche", [f, g, contour, mode]);
    if (!r.ok) {
      return { outputs: {}, error: r.error };
    }
    const count = r.result.count;
    let detail: string;
    if (mode === "rouche") {
      detail = [
        `applies: ${r.result.applies}`,
        `max |f−g|/|f|: ${r.result.maxRatio}`,
        `zeros of f: ${r.result.nF}`,
        `zeros of f+g: ${r.result.nG}`,
        r.result.reason ? String(r.result.reason) : "",
      ]
        .filter(Boolean)
        .join("\n");
    } else {
      detail = [
        `N − P: ${r.result.nMinusP}`,
        `winding: ${r.result.winding}`,
        `log-derivative integral verified: ${r.result.verified ? "yes" : "no"}`,
      ].join("\n");
    }
    return {
      outputs: {
        count: count == null ? NaN : Number(count),
        detail,
      },
    };
  },
};
