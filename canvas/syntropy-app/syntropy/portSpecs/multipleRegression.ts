import { parseMatrix } from "./parseComposite";
import { StatsAlgorithms } from "./statsAlgorithms";

import type { ComputeResult, PortSpec } from "./types";

export const MULTIPLE_REGRESSION_PORT_SPEC: PortSpec = {
  engineId: "statistics",
  methodId: "multiple-regression",
  inputs: [
    {
      key: "data",
      label: "rows (x1..xp,y ;)",
      kind: "matrix",
      default: "0,0,2;1,0,5;0,1,1;1,1,4;2,1,7;3,2,9",
    },
  ],
  outputs: [
    { key: "r2", label: "R^2", kind: "number" },
    { key: "adjR2", label: "adj R^2", kind: "number" },
    { key: "s", label: "s", kind: "number" },
  ],
  executionMode: "live",
  pagePath: "/math-lab/engines/statistics/methods/multiple-regression.html",
  pageStoreKey: "engine-lab:statistics:multipleregression",
  // multiple-regression.js's own textarea is newline-separated rows, not this node's
  // semicolon-separated "matrix" convention (parseComposite.ts) — reformat for the page.
  toPageState: (inputs) => ({
    data: parseMatrix(inputs.data)
      .map((row) => row.join(", "))
      .join("\n"),
  }),
  compute: (inputs): ComputeResult => {
    const data = parseMatrix(inputs.data);
    if (data.length < 2) {
      return { outputs: {}, error: "Enter at least two rows of data." };
    }
    try {
      const r = StatsAlgorithms.runMultipleRegression(data);
      return { outputs: { r2: r.r2, adjR2: r.adjR2, s: r.s } };
    } catch (err) {
      return {
        outputs: {},
        error: err instanceof Error ? err.message : String(err),
      };
    }
  },
};
