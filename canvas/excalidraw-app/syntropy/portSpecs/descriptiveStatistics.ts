import { parseNumberList } from "./parseComposite";
import { StatsAlgorithms } from "./statsAlgorithms";

import type { ComputeResult, PortSpec } from "./types";

export const DESCRIPTIVE_STATISTICS_PORT_SPEC: PortSpec = {
  engineId: "statistics",
  methodId: "descriptive-statistics",
  inputs: [
    {
      key: "data",
      label: "data",
      kind: "vector",
      default: "78,85,92,67,74,88,95,81,73,90,84,79",
    },
  ],
  outputs: [
    { key: "mean", label: "mean", kind: "number" },
    { key: "sd", label: "sd", kind: "number" },
    { key: "median", label: "median", kind: "number" },
  ],
  executionMode: "live",
  pagePath: "/math-lab/engines/statistics/methods/descriptive-statistics.html",
  pageStoreKey: "engine-lab:statistics:descriptive",
  compute: (inputs): ComputeResult => {
    const data = parseNumberList(inputs.data);
    if (data.length < 1) {
      return { outputs: {}, error: "Enter at least one numeric value." };
    }
    try {
      const r = StatsAlgorithms.descriptiveStats(data);
      return { outputs: { mean: r.mean, sd: r.sd, median: r.median } };
    } catch (err) {
      return {
        outputs: {},
        error: err instanceof Error ? err.message : String(err),
      };
    }
  },
};
