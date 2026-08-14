import { bigIntToDisplay, parseBigInt } from "./bigIntHelpers";
import { NumberTheory } from "./numberTheoryAlgorithms";

import type { ComputeResult, PortSpec } from "./types";

export const EXTENDED_EUCLIDEAN_PORT_SPEC: PortSpec = {
  engineId: "number-theory",
  methodId: "extended-euclidean",
  inputs: [
    { key: "a", label: "a", kind: "expression", default: "240" },
    { key: "b", label: "b", kind: "expression", default: "46" },
  ],
  outputs: [
    { key: "iterationTrace", label: "iteration trace", kind: "trace" },
    { key: "gcd", label: "gcd", kind: "number" },
    { key: "x", label: "x", kind: "number" },
    { key: "y", label: "y", kind: "number" },
  ],
  executionMode: "live",
  pagePath: "/math-lab/engines/number-theory/methods/extended-euclidean.html",
  pageStoreKey: "engine-lab:number-theory-extended-euclidean",
  compute: (inputs): ComputeResult => {
    try {
      const a = parseBigInt(inputs.a, "a");
      const b = parseBigInt(inputs.b, "b");
      const r = NumberTheory.extendedGcd(a, b);
      return {
        outputs: {
          iterationTrace: r.steps,
          gcd: bigIntToDisplay(r.gcd),
          x: bigIntToDisplay(r.x),
          y: bigIntToDisplay(r.y),
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
