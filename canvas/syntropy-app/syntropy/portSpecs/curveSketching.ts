import { runCas } from "./casRunHelpers";

import type { ComputeResult, CurveOutput, PortSpec } from "./types";

// Run-mode Real-line spec: computeRun calls CAS.curveAnalysis(f, "x", a, b) for the
// critical/inflection analysis and sampleCurve({mode:"function",...}) for the display points,
// then assembles a CurveOutput (the plotted f over [a, b]) plus a concise text summary of the
// critical and inflection points. The first output is `curve` so the archetype is real-line.
// Inputs mirror the page (curve-sketching.js): a/b are numeric interval bounds. The full step
// table + linked plots stay on the page (v1). See the calculus plan Task 12.
export const CURVE_SKETCHING_PORT_SPEC: PortSpec = {
  engineId: "calculus",
  methodId: "curve-sketching",
  inputs: [
    { key: "f", label: "f(x)", kind: "expression", default: "x^3-3*x" },
    { key: "a", label: "a", kind: "number", default: -3 },
    { key: "b", label: "b", kind: "number", default: 3 },
  ],
  outputs: [
    { key: "curve", label: "plot", kind: "curve" },
    { key: "features", label: "features", kind: "text" },
  ],
  executionMode: "run",
  pagePath: "/math-lab/engines/calculus/methods/curve-sketching.html",
  pageStoreKey: "engine-lab:calculus-curve-sketching",
  compute: (): ComputeResult => ({ outputs: {} }),
  computeRun: async (inputs): Promise<ComputeResult> => {
    const f = String(inputs.f ?? "");
    const a = Number(inputs.a ?? 0);
    const b = Number(inputs.b ?? 0);

    const analysis = await runCas("curveAnalysis", [f, "x", a, b]);
    if (!analysis.ok) {
      return { outputs: {}, error: analysis.error };
    }
    const sample = await runCas("sampleCurve", [
      { mode: "function", expr: f, variable: "x", a, b, n: 300 },
    ]);
    if (!sample.ok) {
      return { outputs: {}, error: sample.error };
    }

    const critical =
      (analysis.result.criticalPoints as
        | Array<{ x: number; kind: string }>
        | undefined) ?? [];
    const inflection =
      (analysis.result.inflectionPoints as Array<{ x: number }> | undefined) ??
      [];
    const cpText = critical.length
      ? critical.map((c) => `x=${c.x} (${c.kind})`).join(", ")
      : "none";
    const ipText = inflection.length
      ? inflection.map((p) => `x=${p.x}`).join(", ")
      : "none";

    const curve: CurveOutput = {
      points: sample.result.points as Array<{ x: number; y: number }>,
    };
    return {
      outputs: {
        curve,
        features: `Critical: ${cpText}; Inflection: ${ipText}`,
      },
    };
  },
};
