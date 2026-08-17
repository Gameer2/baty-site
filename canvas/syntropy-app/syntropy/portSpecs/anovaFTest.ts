import { parseMatrix } from "./parseComposite";
import { StatsAlgorithms } from "./statsAlgorithms";

import type { ComputeResult, PortSpec } from "./types";

export const ANOVA_F_TEST_PORT_SPEC: PortSpec = {
  engineId: "statistics",
  methodId: "anova-f-test",
  inputs: [
    {
      key: "groups",
      label: "groups (rows ;)",
      kind: "matrix",
      default: "23,25,21,24;19,18,22,20;28,30,26,29",
    },
  ],
  outputs: [
    { key: "F", label: "F", kind: "number" },
    { key: "p", label: "p", kind: "number" },
    { key: "df1", label: "df1", kind: "number" },
  ],
  executionMode: "live",
  pagePath: "/math-lab/engines/statistics/methods/anova-f-test.html",
  pageStoreKey: "engine-lab:statistics:anova",
  // anova-f-test.js's own textarea is one group per line, not this node's semicolon-separated
  // "matrix" convention (parseComposite.ts) — reformat for the page.
  toPageState: (inputs) => ({
    groups: parseMatrix(inputs.groups)
      .map((row) => row.join(", "))
      .join("\n"),
  }),
  compute: (inputs): ComputeResult => {
    const groups = parseMatrix(inputs.groups);
    if (groups.length < 2) {
      return { outputs: {}, error: "ANOVA needs at least two groups." };
    }
    try {
      const r = StatsAlgorithms.runOneWayANOVA(groups);
      return { outputs: { F: r.F, p: r.p, df1: r.df1 } };
    } catch (err) {
      return {
        outputs: {},
        error: err instanceof Error ? err.message : String(err),
      };
    }
  },
};
