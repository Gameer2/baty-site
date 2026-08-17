import { parsePoints } from "./parseComposite";
import { Algorithms } from "./numericalAlgorithms";
import { samplePoints } from "./sampleCurve";

import type { ComputeResult, CurveOutput, PortSpec } from "./types";

export const LAGRANGE_INTERPOLATION_PORT_SPEC: PortSpec = {
  engineId: "numerical",
  methodId: "lagrange-interpolation",
  inputs: [
    {
      key: "points",
      label: "points (x,y;...)",
      kind: "points",
      default: "0,1;1,3;2,2;4,5",
    },
    { key: "x0", label: "x0", kind: "number", default: 2.5 },
  ],
  outputs: [
    { key: "curve", label: "interpolant", kind: "curve" },
    { key: "value", label: "P(x0)", kind: "number" },
    { key: "degree", label: "degree", kind: "number" },
  ],
  executionMode: "live",
  pagePath: "/math-lab/engines/numerical/methods/lagrange-interpolation.html",
  pageStoreKey: "engine-lab:numerical-lagrange-interpolation",
  // Always evaluates the Lagrange polynomial (the page's "spline" mode isn't exposed here).
  compute: (inputs): ComputeResult => {
    const points = parsePoints(inputs.points);
    const x0 = Number(inputs.x0);

    if (points.length < 2) {
      return { outputs: {}, error: "Enter at least two points." };
    }
    const xs = points.map((p) => p.x);
    if (new Set(xs).size !== xs.length) {
      return { outputs: {}, error: "x values must be distinct." };
    }
    try {
      const coeffs = Algorithms.runLagrangeInterpolation(points);
      const value = Algorithms.evalPolyAscending(coeffs, x0);
      // The interpolant traced over the data x-range via the core's own polynomial evaluator
      // (evalPolyAscending on the returned power-basis coeffs), with the input nodes as dots.
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
      return { outputs: { curve, value, degree: points.length - 1 } };
    } catch (err) {
      return {
        outputs: {},
        error: err instanceof Error ? err.message : String(err),
      };
    }
  },
};
