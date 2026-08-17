import { parseNumberList } from "./parseComposite";
import { StatsAlgorithms } from "./statsAlgorithms";

import type { ComputeResult, PortSpec } from "./types";

// The page also supports paired and known-sigma z-test modes; this node fixes it to two-sample
// (Welch) — the page's own default landing mode — so the card stays a single, focused shape.
export const TWO_SAMPLE_PAIRED_TESTS_PORT_SPEC: PortSpec = {
  engineId: "statistics",
  methodId: "two-sample-paired-tests",
  inputs: [
    {
      key: "data1",
      label: "sample 1",
      kind: "vector",
      default: "23,19,25,31,22,28",
    },
    {
      key: "data2",
      label: "sample 2",
      kind: "vector",
      default: "18,21,17,24,20,19",
    },
  ],
  outputs: [
    { key: "t", label: "t", kind: "number" },
    { key: "df", label: "df", kind: "number" },
    { key: "p", label: "p", kind: "number" },
  ],
  executionMode: "live",
  pagePath: "/math-lab/engines/statistics/methods/two-sample-paired-tests.html",
  pageStoreKey: "engine-lab:statistics:twosample",
  toPageState: (inputs) => ({
    data1: inputs.data1,
    data2: inputs.data2,
    mode: "two-sample",
  }),
  compute: (inputs): ComputeResult => {
    const data1 = parseNumberList(inputs.data1);
    const data2 = parseNumberList(inputs.data2);
    if (data1.length < 2 || data2.length < 2) {
      return { outputs: {}, error: "Each sample needs at least two values." };
    }
    try {
      const r = StatsAlgorithms.runTwoSampleTTest(data1, data2);
      return { outputs: { t: r.t, df: r.df, p: r.p } };
    } catch (err) {
      return {
        outputs: {},
        error: err instanceof Error ? err.message : String(err),
      };
    }
  },
};
