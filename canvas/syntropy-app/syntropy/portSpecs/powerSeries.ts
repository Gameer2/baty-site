import { runCas } from "./casRunHelpers";

import type { ComputeResult, CurveOutput, PortSpec } from "./types";

// Run-mode Real-line spec: computeRun calls CAS.powerSeries(coeffs, "x", center) for the
// radius/interval of convergence and sampleCurve({mode:"series",...}) for the display points —
// the partial sum Σ_{k=0}^{30} c_k·(x−center)^k sampled over a window around the center (the
// convergence interval when the radius is finite and modest, a default window otherwise). The
// first output is `curve` so the archetype is real-line; radius (number) and interval (text)
// follow. Inputs mirror the page (power-series.js); the endpoint-convergence number line and
// step table stay on the page (v1). See the calculus plan Task 14.
export const POWER_SERIES_PORT_SPEC: PortSpec = {
  engineId: "calculus",
  methodId: "power-series",
  inputs: [
    { key: "coeffs", label: "cₙ (in n)", kind: "expression", default: "1/n" },
    { key: "center", label: "center a", kind: "number", default: 0 },
  ],
  outputs: [
    { key: "curve", label: "partial sum", kind: "curve" },
    { key: "radius", label: "radius R", kind: "number" },
    { key: "interval", label: "interval", kind: "text" },
  ],
  executionMode: "run",
  pagePath: "/math-lab/engines/calculus/methods/power-series.html",
  pageStoreKey: "engine-lab:calculus-power-series",
  compute: (): ComputeResult => ({ outputs: {} }),
  computeRun: async (inputs): Promise<ComputeResult> => {
    const coeffs = String(inputs.coeffs ?? "");
    const center = Number(inputs.center ?? 0);

    const ps = await runCas("powerSeries", [coeffs, "x", center]);
    if (!ps.ok) {
      return { outputs: {}, error: ps.error };
    }
    const R = Number(ps.result.radius);
    // Sample inside the convergence disc when the radius is finite and modest; otherwise fall
    // back to a default window (radius 0 ⇒ the series only converges at the center).
    const half = Number.isFinite(R) && R > 0 ? Math.min(R, 6) : R === 0 ? 1 : 6;
    const lo = center - half;
    const hi = center + half;

    const sample = await runCas("sampleCurve", [
      {
        mode: "series",
        coeffsExpr: coeffs,
        indexVar: "n",
        center,
        degree: 30,
        variable: "x",
        a: lo,
        b: hi,
        n: 300,
      },
    ]);
    if (!sample.ok) {
      return { outputs: {}, error: sample.error };
    }

    const curve: CurveOutput = {
      points: sample.result.points as Array<{ x: number; y: number }>,
    };
    return {
      outputs: {
        curve,
        radius: R,
        interval: String(ps.result.interval),
      },
    };
  },
};
