import { StatsAlgorithms } from "./statsAlgorithms";

import type { ComputeResult, PortSpec } from "./types";

// Matches sampling-distributions.js's own PRESETS exactly (fixed params, no user-tunable
// mean/rate/etc — only which distribution and how the sampling is set up).
const DRAW_BY_DIST: Record<string, (rng: () => number) => () => number> = {
  uniform: (rng) => () => StatsAlgorithms.sampleUniform(rng, 0, 1),
  exponential: (rng) => () => StatsAlgorithms.sampleExponential(rng, 1),
  normal: (rng) => () => StatsAlgorithms.sampleNormal(rng, 0, 1),
};

export const SAMPLING_DISTRIBUTIONS_CLT_PORT_SPEC: PortSpec = {
  engineId: "statistics",
  methodId: "sampling-distributions-clt",
  inputs: [
    { key: "dist", label: "dist", kind: "expression", default: "normal" },
    { key: "n", label: "sample size n", kind: "number", default: 30 },
    { key: "numSamples", label: "# samples", kind: "number", default: 500 },
    { key: "seed", label: "seed", kind: "number", default: 7 },
  ],
  outputs: [
    { key: "grandMean", label: "grand mean", kind: "number" },
    { key: "se", label: "SE", kind: "number" },
  ],
  executionMode: "live",
  pagePath:
    "/math-lab/engines/statistics/methods/sampling-distributions-clt.html",
  pageStoreKey: "engine-lab:statistics:clt",
  compute: (inputs): ComputeResult => {
    const dist = String(inputs.dist ?? "").trim();
    const n = Math.round(Number(inputs.n));
    const numSamples = Math.round(Number(inputs.numSamples));
    const seed = Math.round(Number(inputs.seed));
    const makeDraw = DRAW_BY_DIST[dist];
    if (!makeDraw) {
      return {
        outputs: {},
        error: `Unknown distribution "${dist}" — use uniform, exponential, or normal.`,
      };
    }
    if (!Number.isInteger(n) || n < 1 || n > 500) {
      return {
        outputs: {},
        error: "Sample size n must be an integer between 1 and 500.",
      };
    }
    if (!Number.isInteger(numSamples) || numSamples < 2 || numSamples > 5000) {
      return {
        outputs: {},
        error: "Number of samples must be an integer between 2 and 5000.",
      };
    }
    try {
      const rng = StatsAlgorithms.mulberry32(seed);
      const draw = makeDraw(rng);
      const r = StatsAlgorithms.drawSampleMeans(draw, n, numSamples);
      return { outputs: { grandMean: r.grandMean, se: r.se } };
    } catch (err) {
      return {
        outputs: {},
        error: err instanceof Error ? err.message : String(err),
      };
    }
  },
};
