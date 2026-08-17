import { runCas } from "./casRunHelpers";

import type { ComputeResult, CurveOutput, PortSpec } from "./types";

// Run-mode Real-line spec: the ODE/PDE engine's Fourier-series method reuses the SAME
// CAS.fourierSeries op the calculus engine uses (the maths is identical — a PDE tooling page that
// computes the sine/cosine coefficients and partial sum). computeRun fetches the numeric
// coefficient arrays, samples the N-term partial sum S_N(x) client-side (a pure numeric eval, no
// second CAS call for the headline curve), and overlays f over the expansion interval. The first
// output is `curve` so the archetype is real-line; a0 (number) follows. Mirrors
// engines/ode/methods/fourier-series.html (distinct page from the calculus method).
export const ODE_FOURIER_SERIES_PORT_SPEC: PortSpec = {
  engineId: "ode",
  methodId: "fourier-series",
  inputs: [
    { key: "f", label: "f(x)", kind: "expression", default: "x" },
    { key: "L", label: "half-period L", kind: "expression", default: "pi" },
    { key: "mode", label: "mode", kind: "expression", default: "full" },
    { key: "N", label: "terms N", kind: "number", default: 8 },
  ],
  outputs: [
    { key: "curve", label: "S_N vs f", kind: "curve" },
    { key: "a0", label: "a₀", kind: "number" },
  ],
  executionMode: "run",
  pagePath: "/math-lab/engines/ode/methods/fourier-series.html",
  pageStoreKey: "engine-lab:ode-fourier-series",
  compute: (): ComputeResult => ({ outputs: {} }),
  computeRun: async (inputs): Promise<ComputeResult> => {
    const f = String(inputs.f ?? "");
    const L = String(inputs.L ?? "pi");
    const mode = String(inputs.mode ?? "full");
    const N = Number(inputs.N ?? 8);

    const fr = await runCas("fourierSeries", [f, "x", L, mode, N]);
    if (!fr.ok) {
      return { outputs: {}, error: fr.error };
    }
    const Lnum = Number(fr.result.L);
    const a0 = fr.result.a0 as { numeric?: number } | null | undefined;
    const an = (fr.result.an as Array<{ numeric?: number }> | undefined) ?? [];
    const bn = (fr.result.bn as Array<{ numeric?: number }> | undefined) ?? [];
    const needCos = mode === "full" || mode === "cosine";
    const needSin = mode === "full" || mode === "sine";

    const lo = mode === "full" ? -Lnum : 0;
    const hi = Lnum;
    const samples = 400;
    const points: Array<{ x: number; y: number }> = [];
    const K = Math.min(N, needCos ? an.length : needSin ? bn.length : 0);
    for (let i = 0; i <= samples; i++) {
      const x = lo + ((hi - lo) * i) / samples;
      let s = 0;
      if (needCos && a0?.numeric != null) {
        s += a0.numeric / 2;
      }
      for (let n = 1; n <= K; n++) {
        const arg = (n * Math.PI * x) / Lnum;
        if (needCos) {
          const a = an[n - 1]?.numeric;
          if (a != null) {
            s += a * Math.cos(arg);
          }
        }
        if (needSin) {
          const b = bn[n - 1]?.numeric;
          if (b != null) {
            s += b * Math.sin(arg);
          }
        }
      }
      points.push({ x, y: s });
    }

    // Overlay the original f over the same interval.
    const sf = await runCas("sampleCurve", [
      { mode: "function", expr: f, variable: "x", a: lo, b: hi, n: samples },
    ]);
    const overlay = sf.ok
      ? (sf.result.points as Array<{ x: number; y: number }>)
      : undefined;

    const curve: CurveOutput = { points, overlay };
    return {
      outputs: {
        curve,
        a0: a0?.numeric != null ? Number(a0.numeric) : 0,
      },
    };
  },
};
