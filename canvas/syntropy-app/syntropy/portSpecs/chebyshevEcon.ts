import { parseNumberList } from "./parseComposite";
import { Algorithms } from "./numericalAlgorithms";
import { samplePoints } from "./sampleCurve";

import type { ComputeResult, CurveOutput, PortSpec } from "./types";

export const CHEBYSHEV_ECON_PORT_SPEC: PortSpec = {
  engineId: "numerical",
  methodId: "chebyshev-econ",
  inputs: [
    {
      key: "coeffs",
      label: "coeffs (asc.)",
      kind: "coeffs",
      default: [0, 0, 0, 0, 1],
    },
    { key: "d", label: "target degree", kind: "number", default: 2 },
  ],
  outputs: [
    { key: "curve", label: "economized poly", kind: "curve" },
    { key: "originalDegree", label: "orig. degree", kind: "number" },
    { key: "economizedDegree", label: "econ. degree", kind: "number" },
  ],
  executionMode: "live",
  pagePath: "/math-lab/engines/numerical/methods/chebyshev-econ.html",
  pageStoreKey: "engine-lab:numerical-chebyshev-econ",
  compute: (inputs): ComputeResult => {
    const coeffs = parseNumberList(inputs.coeffs);
    const d = Math.round(Number(inputs.d));

    if (coeffs.length === 0) {
      return { outputs: {}, error: "Enter polynomial coefficients." };
    }
    if (d >= coeffs.length - 1) {
      return {
        outputs: {},
        error: `Target degree must be less than original degree (${
          coeffs.length - 1
        }).`,
      };
    }
    try {
      const result = Algorithms.runChebyshevEcon(coeffs, d);
      // The economized polynomial — the method's product — traced over [-1, 1] (the Chebyshev
      // domain) via the core's own evaluator on the economized ascending coeffs. Display of
      // the output, not new math.
      const curve: CurveOutput = {
        points: samplePoints(
          (x) => Algorithms.evalPolyAscending(result.econCoeffs, x),
          -1,
          1,
        ),
      };
      return {
        outputs: {
          curve,
          originalDegree: result.originalDegree,
          economizedDegree: result.economizedDegree,
          econCoeffs: result.econCoeffs,
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
