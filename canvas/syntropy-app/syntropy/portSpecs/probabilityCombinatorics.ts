import { StatsAlgorithms } from "./statsAlgorithms";

import type { ComputeResult, PortSpec } from "./types";

// The page also supports conditional-probability and Bayes' theorem modes; this node fixes it to
// counting (permutations/combinations) — the page's own default landing mode.
export const PROBABILITY_COMBINATORICS_PORT_SPEC: PortSpec = {
  engineId: "statistics",
  methodId: "probability-combinatorics",
  inputs: [
    { key: "n", label: "n", kind: "number", default: 52 },
    { key: "k", label: "k", kind: "number", default: 5 },
  ],
  outputs: [
    { key: "permutation", label: "P(n,k)", kind: "number" },
    { key: "combination", label: "C(n,k)", kind: "number" },
  ],
  executionMode: "live",
  pagePath:
    "/math-lab/engines/statistics/methods/probability-combinatorics.html",
  pageStoreKey: "engine-lab:statistics:probability",
  toPageState: (inputs) => ({
    mode: "counting",
    counting: { n: inputs.n, k: inputs.k },
  }),
  compute: (inputs): ComputeResult => {
    const n = Math.round(Number(inputs.n));
    const k = Math.round(Number(inputs.k));
    try {
      return {
        outputs: {
          permutation: StatsAlgorithms.permutation(n, k),
          combination: StatsAlgorithms.combination(n, k),
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
