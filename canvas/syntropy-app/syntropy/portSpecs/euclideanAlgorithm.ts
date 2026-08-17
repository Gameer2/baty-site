import { bigIntToDisplay, parseBigInt } from "./bigIntHelpers";
import { NumberTheory } from "./numberTheoryAlgorithms";

import type { ComputeResult, PortSpec } from "./types";

export const EUCLIDEAN_ALGORITHM_PORT_SPEC: PortSpec = {
  engineId: "number-theory",
  methodId: "euclidean-algorithm",
  inputs: [
    { key: "a", label: "a", kind: "expression", default: "1071" },
    { key: "b", label: "b", kind: "expression", default: "462" },
  ],
  outputs: [
    { key: "iterationTrace", label: "iteration trace", kind: "trace" },
    { key: "gcd", label: "gcd(a,b)", kind: "number" },
    { key: "steps", label: "steps", kind: "number" },
  ],
  executionMode: "live",
  pagePath: "/math-lab/engines/number-theory/methods/euclidean-algorithm.html",
  pageStoreKey: "engine-lab:number-theory-euclidean-algorithm",
  compute: (inputs): ComputeResult => {
    try {
      const a = parseBigInt(inputs.a, "a");
      const b = parseBigInt(inputs.b, "b");
      const r = NumberTheory.euclideanSteps(a, b);
      if (!r.ok) {
        return { outputs: {}, error: r.reason };
      }
      return {
        outputs: {
          iterationTrace: r.steps,
          gcd: bigIntToDisplay(r.gcd),
          steps: r.steps.length,
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
