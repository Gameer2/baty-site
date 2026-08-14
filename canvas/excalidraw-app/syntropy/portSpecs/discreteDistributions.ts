import { StatsAlgorithms } from "./statsAlgorithms";

import type { ComputeResult, DistributionOutput, PortSpec } from "./types";

// The page also supports Poisson/geometric/hypergeometric (dist switch); this node fixes it to
// binomial — the page's own default landing distribution — so the card stays a single, focused
// shape rather than needing per-distribution parameter fields.
export const DISCRETE_DISTRIBUTIONS_PORT_SPEC: PortSpec = {
  engineId: "statistics",
  methodId: "discrete-distributions",
  inputs: [
    { key: "n", label: "n (trials)", kind: "number", default: 20 },
    { key: "p", label: "p", kind: "number", default: 0.5 },
    { key: "k", label: "k", kind: "number", default: 10 },
  ],
  outputs: [
    { key: "distribution", label: "pmf curve", kind: "distribution" },
    { key: "pmf", label: "P(X=k)", kind: "number" },
    { key: "cdf", label: "P(X<=k)", kind: "number" },
    { key: "mean", label: "mean", kind: "number" },
  ],
  executionMode: "live",
  pagePath: "/math-lab/engines/statistics/methods/discrete-distributions.html",
  pageStoreKey: "engine-lab:statistics:discrete-distributions",
  toPageState: (inputs) => ({
    dist: "binomial",
    params: { n: inputs.n, p: inputs.p },
    k: inputs.k,
  }),
  compute: (inputs): ComputeResult => {
    const n = Math.round(Number(inputs.n));
    const p = Number(inputs.p);
    const k = Math.round(Number(inputs.k));
    try {
      // The binomial pmf over the integer support 0..n — integer-spaced sample x's, so the
      // renderer draws bars. The pmf/cdf at each k come straight from the page's own primitives.
      // The shade is the lower tail P(X<=k) over [0, k].
      const points: { x: number; pdf: number; cdf: number }[] = [];
      for (let i = 0; i <= n; i += 1) {
        points.push({
          x: i,
          pdf: StatsAlgorithms.binomialPMF(i, n, p),
          cdf: StatsAlgorithms.binomialCDF(i, n, p),
        });
      }
      const distribution: DistributionOutput = {
        points,
        lo: 0,
        hi: k,
      };
      return {
        outputs: {
          distribution,
          pmf: StatsAlgorithms.binomialPMF(k, n, p),
          cdf: StatsAlgorithms.binomialCDF(k, n, p),
          mean: StatsAlgorithms.binomialMean(n, p),
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
