import { compileExpression } from "../compileExpression";

import { Algorithms } from "./numericalAlgorithms";
import { samplePoints } from "./sampleCurve";

import type { ComputeResult, CurveOutput, PortSpec } from "./types";

export const GAUSSIAN_QUADRATURE_PORT_SPEC: PortSpec = {
  engineId: "numerical",
  methodId: "gaussian-quadrature",
  inputs: [
    { key: "fx", label: "f(x)", kind: "expression", default: "x^3" },
    { key: "a", label: "a", kind: "number", default: 0 },
    { key: "b", label: "b", kind: "number", default: 1 },
    { key: "order", label: "order", kind: "number", default: 2 },
  ],
  outputs: [
    { key: "curve", label: "plot", kind: "curve" },
    { key: "total", label: "total", kind: "number" },
  ],
  executionMode: "live",
  pagePath: "/math-lab/engines/numerical/methods/gaussian-quadrature.html",
  pageStoreKey: "engine-lab:numerical-gaussian-quadrature",
  compute: (inputs): ComputeResult => {
    const fx = String(inputs.fx ?? "");
    const a = Number(inputs.a);
    const b = Number(inputs.b);
    const order = Math.round(Number(inputs.order));

    const compiled = compileExpression(fx);
    if (!compiled.ok) {
      return { outputs: {}, error: compiled.error };
    }
    try {
      const result = Algorithms.runGaussLegendre(compiled.fn, a, b, order);
      // Gauss-Legendre returns the total and its nodes/weights but no partition to draw, so the
      // real-line view is the integrand f over [a,b] with the signed area filled; the total
      // lives below.
      const curve: CurveOutput = {
        points: samplePoints(compiled.fn, a, b),
        fillArea: true,
      };
      return {
        outputs: {
          curve,
          total: result.total,
        },
      };
    } catch (err) {
      return {
        outputs: {},
        error: err instanceof Error ? err.message : String(err),
      };
    }
  },
};
