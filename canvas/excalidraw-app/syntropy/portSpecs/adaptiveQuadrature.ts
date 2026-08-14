import { compileExpression } from "../compileExpression";

import { Algorithms } from "./numericalAlgorithms";
import { samplePoints } from "./sampleCurve";

import type { ComputeResult, CurveOutput, PortSpec } from "./types";

export const ADAPTIVE_QUADRATURE_PORT_SPEC: PortSpec = {
  engineId: "numerical",
  methodId: "adaptive-quadrature",
  inputs: [
    { key: "fx", label: "f(x)", kind: "expression", default: "4 / (1 + x^2)" },
    { key: "a", label: "a", kind: "number", default: 0 },
    { key: "b", label: "b", kind: "number", default: 1 },
    { key: "tol", label: "tol", kind: "number", default: 0.000001 },
  ],
  outputs: [
    { key: "curve", label: "plot", kind: "curve" },
    { key: "total", label: "total", kind: "number" },
    { key: "leafCount", label: "leaves", kind: "number" },
  ],
  executionMode: "live",
  pagePath: "/math-lab/engines/numerical/methods/adaptive-quadrature.html",
  pageStoreKey: "engine-lab:numerical-adaptive-quadrature",
  compute: (inputs): ComputeResult => {
    const fx = String(inputs.fx ?? "");
    const a = Number(inputs.a);
    const b = Number(inputs.b);
    const tol = Number(inputs.tol);

    const compiled = compileExpression(fx);
    if (!compiled.ok) {
      return { outputs: {}, error: compiled.error };
    }
    try {
      const result = Algorithms.runAdaptiveQuadrature(compiled.fn, a, b, tol);
      // Each adaptive leaf is a subinterval {a, b, estimate} the core already computed; drawn as
      // a bar whose height is the leaf's average value (estimate / width) — a derived display
      // quantity, not new math — so narrower leaves show where the integrand varies more. The
      // integrand f is sampled over [a,b] for display behind the bars, area filled.
      const leaves = result.leaves as {
        a: number;
        b: number;
        estimate: number;
      }[];
      const curve: CurveOutput = {
        points: samplePoints(compiled.fn, a, b),
        rectangles: leaves.map((leaf) => ({
          x0: leaf.a,
          x1: leaf.b,
          height: leaf.b > leaf.a ? leaf.estimate / (leaf.b - leaf.a) : 0,
        })),
        fillArea: true,
      };
      return {
        outputs: {
          curve,
          total: result.total,
          leafCount: result.leaves.length,
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
