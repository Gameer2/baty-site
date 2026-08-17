import { runCas } from "./casRunHelpers";

import type { ComputeResult, CurveOutput, PortSpec } from "./types";

// Run-mode Real-line spec: computeRun calls CAS.taylorSeries(f, "x", center, degree) for the
// numeric coefficient array, then samples the Taylor polynomial P_degree(x) = Σ c_k·(x−center)^k
// client-side (the coeffs come back as plain numbers, so the polynomial is a pure numeric eval
// — no second CAS call needed for the headline curve) and overlays f itself via sampleCurve so
// the node shows P vs f over a window around the center. The first output is `curve` so the
// archetype is real-line. Inputs mirror the page (taylor-series.js); the step table stays on
// the page (v1). See the calculus plan Task 15.
export const TAYLOR_SERIES_PORT_SPEC: PortSpec = {
  engineId: "calculus",
  methodId: "taylor-series",
  inputs: [
    { key: "f", label: "f(x)", kind: "expression", default: "e^x" },
    { key: "center", label: "center a", kind: "number", default: 0 },
    { key: "degree", label: "degree", kind: "number", default: 4 },
  ],
  outputs: [
    { key: "curve", label: "P vs f", kind: "curve" },
    { key: "degree", label: "degree", kind: "number" },
  ],
  executionMode: "run",
  pagePath: "/math-lab/engines/calculus/methods/taylor-series.html",
  pageStoreKey: "engine-lab:calculus-taylor-series",
  compute: (): ComputeResult => ({ outputs: {} }),
  computeRun: async (inputs): Promise<ComputeResult> => {
    const f = String(inputs.f ?? "");
    const center = Number(inputs.center ?? 0);
    const degree = Number(inputs.degree ?? 0);

    const t = await runCas("taylorSeries", [f, "x", center, degree]);
    if (!t.ok) {
      return { outputs: {}, error: t.error };
    }
    const coeffs = (t.result.coeffs as number[] | undefined) ?? [];

    // Window mirrors the page: span grows with |center|, minimum 2.
    const span = Math.max(2, Math.abs(center) * 0.6 + 2);
    const lo = center - span;
    const hi = center + span;
    const samples = 300;
    const points: Array<{ x: number; y: number }> = [];
    for (let i = 0; i <= samples; i++) {
      const x = lo + ((hi - lo) * i) / samples;
      let y = 0;
      for (let k = 0; k < coeffs.length; k++) {
        y += coeffs[k] * Math.pow(x - center, k);
      }
      points.push({ x, y });
    }

    // Overlay the original f so the node shows the polynomial tracking the function.
    const sf = await runCas("sampleCurve", [
      { mode: "function", expr: f, variable: "x", a: lo, b: hi, n: samples },
    ]);
    const overlay = sf.ok
      ? (sf.result.points as Array<{ x: number; y: number }>)
      : undefined;

    const curve: CurveOutput = { points, samples: overlay };
    return {
      outputs: {
        curve,
        degree: Number(t.result.degree ?? degree),
      },
    };
  },
};
