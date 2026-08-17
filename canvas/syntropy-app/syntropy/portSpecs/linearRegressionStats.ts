import { parsePoints } from "./parseComposite";
import { StatsAlgorithms } from "./statsAlgorithms";
import { samplePoints } from "./sampleCurve";

import type { ComputeResult, CurveOutput, PortSpec } from "./types";

// Named *Stats to distinguish from a possible future numerical/calculus "linear-regression" —
// none currently registered, but the engine namespace convention (see leastSquaresLinalg.ts)
// keeps filenames unambiguous regardless.
export const LINEAR_REGRESSION_STATS_PORT_SPEC: PortSpec = {
  engineId: "statistics",
  methodId: "linear-regression",
  inputs: [
    {
      key: "pairs",
      label: "points (x,y;...)",
      kind: "points",
      default: "1,2.1;2,3.9;3,6.2;4,7.8;5,10.1",
    },
  ],
  outputs: [
    { key: "curve", label: "fit", kind: "curve" },
    { key: "slope", label: "slope", kind: "number" },
    { key: "intercept", label: "intercept", kind: "number" },
    { key: "r2", label: "R^2", kind: "number" },
  ],
  executionMode: "live",
  pagePath: "/math-lab/engines/statistics/methods/linear-regression.html",
  pageStoreKey: "engine-lab:statistics:regression",
  // linear-regression.js's own textarea is newline-separated "x, y" pairs, not this node's
  // semicolon-separated "points" convention (parseComposite.ts) — reformat for the page.
  toPageState: (inputs) => ({
    pairs: parsePoints(inputs.pairs)
      .map((p) => `${p.x}, ${p.y}`)
      .join("\n"),
  }),
  compute: (inputs): ComputeResult => {
    const points = parsePoints(inputs.pairs).map((p) => [p.x, p.y]);
    if (points.length < 2) {
      return { outputs: {}, error: "Enter at least two (x, y) pairs." };
    }
    try {
      const r = StatsAlgorithms.runLinearRegression(points);
      // The fitted line y = slope*x + intercept traced over the scatter x-range, with the
      // data as dots. The line is fully determined by the core's slope/intercept — plotting it
      // is display, not new math.
      const xs = points.map((p) => p[0]);
      const xMin = Math.min(...xs);
      const xMax = Math.max(...xs);
      const curve: CurveOutput = {
        points: samplePoints((x) => r.slope * x + r.intercept, xMin, xMax),
        samples: points.map((p) => ({ x: p[0], y: p[1] })),
      };
      return {
        outputs: { curve, slope: r.slope, intercept: r.intercept, r2: r.r2 },
      };
    } catch (err) {
      return {
        outputs: {},
        error: err instanceof Error ? err.message : String(err),
      };
    }
  },
};
