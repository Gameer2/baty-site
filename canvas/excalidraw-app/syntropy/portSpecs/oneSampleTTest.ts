import { parseNumberList } from "./parseComposite";
import { StatsAlgorithms } from "./statsAlgorithms";

import type { ComputeResult, PortSpec } from "./types";

export const ONE_SAMPLE_T_TEST_PORT_SPEC: PortSpec = {
  engineId: "statistics",
  methodId: "one-sample-t-test",
  inputs: [
    {
      key: "data",
      label: "data",
      kind: "vector",
      default: "78,85,92,67,74,88,95,81,73,90,84,79",
    },
    { key: "mu0", label: "mu0", kind: "number", default: 80 },
  ],
  outputs: [
    { key: "t", label: "t", kind: "number" },
    { key: "df", label: "df", kind: "number" },
    { key: "p", label: "p", kind: "number" },
  ],
  executionMode: "live",
  pagePath: "/math-lab/engines/statistics/methods/one-sample-t-test.html",
  pageStoreKey: "engine-lab:statistics:ttest",
  compute: (inputs): ComputeResult => {
    const data = parseNumberList(inputs.data);
    const mu0 = Number(inputs.mu0);
    if (data.length < 2) {
      return { outputs: {}, error: "Enter at least two numeric values." };
    }
    try {
      const r = StatsAlgorithms.runOneSampleTTest(data, mu0);
      return { outputs: { t: r.t, df: r.df, p: r.p } };
    } catch (err) {
      return {
        outputs: {},
        error: err instanceof Error ? err.message : String(err),
      };
    }
  },
};
