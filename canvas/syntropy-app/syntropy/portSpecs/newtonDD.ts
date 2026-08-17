import { parsePoints } from "./parseComposite";
import { Algorithms } from "./numericalAlgorithms";
import { samplePoints } from "./sampleCurve";

import type { ComputeResult, CurveOutput, PortSpec } from "./types";

export const NEWTON_DD_PORT_SPEC: PortSpec = {
  engineId: "numerical",
  methodId: "newton-dd",
  inputs: [
    {
      key: "points",
      label: "points (x,y;...)",
      kind: "points",
      default: "1,2;2,3;3,5",
    },
    { key: "x", label: "x", kind: "number", default: 2.5 },
  ],
  outputs: [
    { key: "curve", label: "interpolant", kind: "curve" },
    { key: "value", label: "P(x)", kind: "number" },
  ],
  executionMode: "live",
  pagePath: "/math-lab/engines/numerical/methods/newton-dd.html",
  pageStoreKey: "engine-lab:numerical-newton-dd",
  compute: (inputs): ComputeResult => {
    const points = parsePoints(inputs.points);
    const x = Number(inputs.x);

    if (points.length < 2) {
      return { outputs: {}, error: "Enter at least 2 points." };
    }
    try {
      const result = Algorithms.runNewtonDD(points, x);
      // The divided-difference coeffs are in Newton form (not power basis), so the interpolant
      // is traced by invoking the core's own runNewtonDD at each sample x — reusing the method,
      // not reimplementing it — with the input nodes as dots.
      const xMin = Math.min(...points.map((p) => p.x));
      const xMax = Math.max(...points.map((p) => p.x));
      const curve: CurveOutput = {
        points: samplePoints(
          (s) => Algorithms.runNewtonDD(points, s).value,
          xMin,
          xMax,
        ),
        samples: points.map((p) => ({ x: p.x, y: p.y })),
      };
      return { outputs: { curve, value: result.value } };
    } catch (err) {
      return {
        outputs: {},
        error: err instanceof Error ? err.message : String(err),
      };
    }
  },
};
