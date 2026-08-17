import { parseNumberList } from "./parseComposite";
import { Algorithms } from "./numericalAlgorithms";

import type { ComputeResult, PortSpec } from "./types";

export const HORNER_PORT_SPEC: PortSpec = {
  engineId: "numerical",
  methodId: "horner",
  inputs: [
    {
      key: "coeffs",
      label: "coeffs (desc.)",
      kind: "coeffs",
      default: [2, -3, 4, -5],
    },
    { key: "x", label: "x", kind: "number", default: 2 },
  ],
  outputs: [
    { key: "value", label: "p(x)", kind: "number" },
    { key: "degree", label: "degree", kind: "number" },
  ],
  executionMode: "live",
  pagePath: "/math-lab/engines/numerical/methods/horner.html",
  pageStoreKey: "engine-lab:numerical-horner",
  compute: (inputs): ComputeResult => {
    const coeffs = parseNumberList(inputs.coeffs);
    const x = Number(inputs.x);

    if (coeffs.length === 0) {
      return { outputs: {}, error: "Enter at least one coefficient." };
    }
    try {
      const result = Algorithms.runHorner(coeffs, x);
      return {
        outputs: { value: result.value, degree: result.deflated.length },
      };
    } catch (err) {
      return {
        outputs: {},
        error: err instanceof Error ? err.message : String(err),
      };
    }
  },
};
