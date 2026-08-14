import { StatsAlgorithms } from "./statsAlgorithms";

import type { ComputeResult, DistributionOutput, PortSpec } from "./types";

// The page also supports exponential/uniform/gamma (dist switch); this node fixes it to
// normal — the page's own default landing distribution — so the card stays a single, focused
// shape rather than needing per-distribution parameter fields.
export const CONTINUOUS_DISTRIBUTIONS_PORT_SPEC: PortSpec = {
  engineId: "statistics",
  methodId: "continuous-distributions",
  inputs: [
    { key: "mean", label: "mean", kind: "number", default: 0 },
    { key: "sd", label: "sd", kind: "number", default: 1 },
    { key: "x", label: "x", kind: "number", default: 1 },
  ],
  outputs: [
    { key: "distribution", label: "pdf curve", kind: "distribution" },
    { key: "pdf", label: "pdf(x)", kind: "number" },
    { key: "cdf", label: "cdf(x)", kind: "number" },
    { key: "variance", label: "variance", kind: "number" },
  ],
  executionMode: "live",
  pagePath:
    "/math-lab/engines/statistics/methods/continuous-distributions.html",
  pageStoreKey: "engine-lab:statistics:continuous",
  toPageState: (inputs) => ({
    dist: "normal",
    params: { mean: inputs.mean, sd: inputs.sd },
    x: inputs.x,
  }),
  compute: (inputs): ComputeResult => {
    const mean = Number(inputs.mean);
    const sd = Number(inputs.sd);
    const x = Number(inputs.x);
    if (!(sd > 0)) {
      return { outputs: {}, error: "sd must be positive." };
    }
    try {
      // Sample the normal density over [mean-4sd, mean+4sd] at a ~third-sd step and include x
      // itself, so the lower-tail shade P(X<=x) clips to an exact sample point. The pdf/cdf at
      // every sample come straight from the page's own primitives — no new math.
      const loBound = Math.min(mean - 4 * sd, x);
      const hiBound = Math.max(mean + 4 * sd, x);
      const step = (hiBound - loBound) / 24;
      const xs = new Set<number>([x]);
      for (let i = 0; i <= 24; i += 1) {
        xs.add(loBound + i * step);
      }
      const sorted = [...xs].sort((a, b) => a - b);
      const distribution: DistributionOutput = {
        points: sorted.map((s) => ({
          x: s,
          pdf: StatsAlgorithms.normalPDF(s, mean, sd),
          cdf: StatsAlgorithms.normalCDFValue(s, mean, sd),
        })),
        lo: sorted[0],
        hi: x,
      };
      return {
        outputs: {
          distribution,
          pdf: StatsAlgorithms.normalPDF(x, mean, sd),
          cdf: StatsAlgorithms.normalCDFValue(x, mean, sd),
          variance: StatsAlgorithms.normalVariance(mean, sd),
        },
      };
    } catch (err) {
      return {
        outputs: {},
        error: err instanceof Error ? err.message : String(err),
      };
    }
  },
};
