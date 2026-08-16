import {
  complexDisplay,
  runCas,
  SYMPY_CAS_TIMEOUT_MS,
} from "./casRunHelpers";

import type { ComputeResult, ExpressionOutput, PortSpec } from "./types";

// Run-mode Symbolic spec: computeRun calls CAS.laurentSingularities(f, {re, im}, order) for the
// singularity classification + Laurent series of f at z0. The op routes through SymPy
// (complex-residues.js → the nested sympy-worker), so the first Run pays Pyodide's cold boot.
// The node shows the classification + series as the expression and the residue as text.
// Mirrors laurent-singularities.html.
export const LAURENT_SINGULARITIES_PORT_SPEC: PortSpec = {
  engineId: "complex",
  methodId: "laurent-singularities",
  inputs: [
    { key: "f", label: "f(z)", kind: "expression", default: "1/(z^2-1)" },
    { key: "pointRe", label: "Re(z₀)", kind: "number", default: 1 },
    { key: "pointIm", label: "Im(z₀)", kind: "number", default: 0 },
    { key: "order", label: "series order", kind: "number", default: 4 },
  ],
  outputs: [
    { key: "result", label: "Laurent series", kind: "expression" },
    { key: "residue", label: "residue", kind: "text" },
  ],
  executionMode: "run",
  casTier: "sympy",
  pagePath: "/math-lab/engines/complex/methods/laurent-singularities.html",
  pageStoreKey: "engine-lab:complex-laurent-singularities",
  compute: (): ComputeResult => ({ outputs: {} }),
  computeRun: async (inputs): Promise<ComputeResult> => {
    const f = String(inputs.f ?? "");
    const point = {
      re: Number(inputs.pointRe ?? 0),
      im: Number(inputs.pointIm ?? 0),
    };
    const order = Math.round(Number(inputs.order ?? 4));
    if (!Number.isFinite(point.re) || !Number.isFinite(point.im)) {
      return { outputs: {}, error: "Re(z₀) and Im(z₀) must be numbers." };
    }
    const r = await runCas(
      "laurentSingularities",
      [f, point, order],
      SYMPY_CAS_TIMEOUT_MS,
    );
    if (!r.ok) {
      return { outputs: {}, error: r.error };
    }
    const cls = (r.result.classification ?? {}) as {
      kind?: unknown;
      order?: unknown;
      residue?: unknown;
    };
    const series = String(r.result.series ?? "");
    const result: ExpressionOutput = {
      display: `${cls.kind ?? "singularity"}${
        cls.order ? ` (order ${cls.order})` : ""
      }\n${series}`.trim(),
      structured: { kind: "plain" },
    };
    const residueVal = cls.residue;
    const residue =
      typeof residueVal === "number"
        ? complexDisplay({ re: residueVal, im: 0 })
        : complexDisplay(residueVal as { re?: number; im?: number });
    return { outputs: { result, residue } };
  },
};
