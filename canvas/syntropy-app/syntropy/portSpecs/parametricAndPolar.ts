import { runCas } from "./casRunHelpers";

import type { ComputeResult, CurveOutput, PortSpec } from "./types";

// Run-mode Real-line spec: computeRun calls CAS.parametricAndPolar(mode, spec, {}) for the
// arc-length/area bundle and sampleCurve({mode:"parametric"|"polar",...}) for the display
// points, then assembles a CurveOutput (the parametric (x(t), y(t)) or polar r(θ) curve over
// [a, b]) plus the swept area as a Scalar number. The first output is `curve` so the archetype
// is real-line. a/b are numeric bounds (sampleCurve needs finite numbers, so — like
// riemann-sums — the node takes numeric bounds rather than the page's expression strings that
// may carry π). Inputs mirror the page (parametric-and-polar.js); the full slope/arc-length
// step table stays on the page (v1). See the calculus plan Task 13.
export const PARAMETRIC_AND_POLAR_PORT_SPEC: PortSpec = {
  engineId: "calculus",
  methodId: "parametric-and-polar",
  inputs: [
    { key: "mode", label: "mode", kind: "expression", default: "parametric" },
    { key: "x", label: "x(t)", kind: "expression", default: "cos(t)" },
    { key: "y", label: "y(t)", kind: "expression", default: "sin(t)" },
    { key: "r", label: "r(θ)", kind: "expression", default: "1" },
    { key: "a", label: "from a", kind: "number", default: 0 },
    {
      key: "b",
      label: "to b",
      kind: "number",
      default: 6.283185307179586,
    },
  ],
  outputs: [
    { key: "curve", label: "curve", kind: "curve" },
    { key: "area", label: "area", kind: "number" },
  ],
  executionMode: "run",
  pagePath: "/math-lab/engines/calculus/methods/parametric-and-polar.html",
  pageStoreKey: "engine-lab:calculus-parametric-and-polar",
  compute: (): ComputeResult => ({ outputs: {} }),
  computeRun: async (inputs): Promise<ComputeResult> => {
    const mode = String(inputs.mode ?? "parametric");
    const x = String(inputs.x ?? "");
    const y = String(inputs.y ?? "");
    const r = String(inputs.r ?? "");
    const a = Number(inputs.a ?? 0);
    const b = Number(inputs.b ?? 0);

    const spec =
      mode === "parametric"
        ? { x, y, a: String(a), b: String(b) }
        : { r, a: String(a), b: String(b) };

    const bundle = await runCas("parametricAndPolar", [mode, spec, {}]);
    if (!bundle.ok) {
      return { outputs: {}, error: bundle.error };
    }
    const sampleCfg =
      mode === "parametric"
        ? {
            mode: "parametric",
            xExpr: x,
            yExpr: y,
            variable: "t",
            a,
            b,
            n: 400,
          }
        : { mode: "polar", rExpr: r, variable: "t", a, b, n: 400 };
    const sample = await runCas("sampleCurve", [sampleCfg]);
    if (!sample.ok) {
      return { outputs: {}, error: sample.error };
    }

    const quantities = bundle.result.quantities as
      | Record<string, { ok?: boolean; numeric?: number }>
      | undefined;
    const areaQ = quantities?.area;
    const area = areaQ?.ok ? Number(areaQ.numeric) : NaN;

    const curve: CurveOutput = {
      points: sample.result.points as Array<{ x: number; y: number }>,
    };
    return { outputs: { curve, area } };
  },
};
