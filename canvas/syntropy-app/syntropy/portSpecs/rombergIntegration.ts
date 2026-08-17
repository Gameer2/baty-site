import { compileExpression } from "../compileExpression";

import { Algorithms } from "./numericalAlgorithms";
import { samplePoints } from "./sampleCurve";

import type { ComputeResult, CurveOutput, PortSpec } from "./types";

export const ROMBERG_INTEGRATION_PORT_SPEC: PortSpec = {
  engineId: "numerical",
  methodId: "romberg-integration",
  inputs: [
    { key: "fx", label: "f(x)", kind: "expression", default: "e^x" },
    { key: "a", label: "a", kind: "number", default: 0 },
    { key: "b", label: "b", kind: "number", default: 1 },
    { key: "m", label: "levels", kind: "number", default: 4 },
  ],
  outputs: [
    { key: "curve", label: "plot", kind: "curve" },
    { key: "total", label: "total", kind: "number" },
  ],
  executionMode: "live",
  pagePath: "/math-lab/engines/numerical/methods/romberg-integration.html",
  pageStoreKey: "engine-lab:numerical-romberg-integration",
  compute: (inputs): ComputeResult => {
    const fx = String(inputs.fx ?? "");
    const a = Number(inputs.a);
    const b = Number(inputs.b);
    const m = Math.round(Number(inputs.m));

    const compiled = compileExpression(fx);
    if (!compiled.ok) {
      return { outputs: {}, error: compiled.error };
    }
    try {
      const result = Algorithms.runRomberg(compiled.fn, a, b, m);
      // Romberg returns only the total and its extrapolation table — no partition to draw — so
      // the real-line view is the integrand f over [a,b] with the signed area filled; the total
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
