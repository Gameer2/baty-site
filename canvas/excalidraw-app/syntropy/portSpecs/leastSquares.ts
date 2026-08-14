import { parsePoints } from "./parseComposite";
import { Algorithms } from "./numericalAlgorithms";
import { samplePoints } from "./sampleCurve";

import type { ComputeResult, CurveOutput, PortSpec } from "./types";

export const LEAST_SQUARES_PORT_SPEC: PortSpec = {
  engineId: "numerical",
  methodId: "least-squares",
  inputs: [
    {
      key: "points",
      label: "points (x,y;...)",
      kind: "points",
      default: "0,1;1,3;2,5;3,7",
    },
    { key: "d", label: "degree", kind: "number", default: 1 },
  ],
  outputs: [
    { key: "curve", label: "fit", kind: "curve" },
    { key: "coeffs", label: "coeffs", kind: "number" },
  ],
  executionMode: "live",
  pagePath: "/math-lab/engines/numerical/methods/least-squares.html",
  pageStoreKey: "engine-lab:numerical-least-squares",
  // "coeffs" reports the fitted intercept (coeffs[0]) as its number output — the full
  // coefficient vector is available on `result.outputs.allCoeffs` for a future vector display.
  compute: (inputs): ComputeResult => {
    const points = parsePoints(inputs.points);
    const d = Math.round(Number(inputs.d));

    if (points.length <= d) {
      return {
        outputs: {},
        error: "Need more points than coefficients for least squares.",
      };
    }
    try {
      const result = Algorithms.runDiscreteLeastSquares(points, d);
      const { coeffs } = result;
      // The fitted polynomial traced over the data x-range via the core's own evaluator
      // (evalPolyAscending on the ascending monomial coeffs the core returns), with the
      // scatter as dots.
      const xMin = Math.min(...points.map((p) => p.x));
      const xMax = Math.max(...points.map((p) => p.x));
      const curve: CurveOutput = {
        points: samplePoints(
          (x) => Algorithms.evalPolyAscending(coeffs, x),
          xMin,
          xMax,
        ),
        samples: points.map((p) => ({ x: p.x, y: p.y })),
      };
      return {
        outputs: { curve, coeffs: coeffs[0], allCoeffs: coeffs },
      };
    } catch (err) {
      return {
        outputs: {},
        error: err instanceof Error ? err.message : String(err),
      };
    }
  },
};
