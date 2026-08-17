import { parseNumberList } from "./parseComposite";
import { StatsAlgorithms } from "./statsAlgorithms";

import type { ComputeResult, PortSpec } from "./types";

// The page also supports a contingency-table independence test (mode switch); this node fixes it
// to goodness-of-fit — the page's own default landing mode — so the card stays a single, focused
// shape rather than needing a full matrix input.
export const CHI_SQUARE_TESTS_PORT_SPEC: PortSpec = {
  engineId: "statistics",
  methodId: "chi-square-tests",
  inputs: [
    {
      key: "observed",
      label: "observed",
      kind: "vector",
      default: "18,22,20,25,15",
    },
    {
      key: "expected",
      label: "expected",
      kind: "vector",
      default: "20,20,20,20,20",
    },
  ],
  outputs: [
    { key: "stat", label: "chi^2", kind: "number" },
    { key: "df", label: "df", kind: "number" },
    { key: "p", label: "p", kind: "number" },
  ],
  executionMode: "live",
  pagePath: "/math-lab/engines/statistics/methods/chi-square-tests.html",
  pageStoreKey: "engine-lab:statistics:chisquare",
  toPageState: (inputs) => ({
    gofObserved: inputs.observed,
    gofExpected: inputs.expected,
    mode: "gof",
  }),
  compute: (inputs): ComputeResult => {
    const observed = parseNumberList(inputs.observed);
    const expected = parseNumberList(inputs.expected);
    if (observed.length < 2 || observed.length !== expected.length) {
      return {
        outputs: {},
        error:
          "observed and expected must have the same length (>= 2 categories).",
      };
    }
    try {
      const r = StatsAlgorithms.chiSquareGoodnessOfFit(observed, expected);
      return { outputs: { stat: r.stat, df: r.df, p: r.p } };
    } catch (err) {
      return {
        outputs: {},
        error: err instanceof Error ? err.message : String(err),
      };
    }
  },
};
