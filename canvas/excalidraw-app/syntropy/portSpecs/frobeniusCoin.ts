import { bigIntToDisplay, parseBigInt } from "./bigIntHelpers";
import { NumberTheory } from "./numberTheoryAlgorithms";

import type { ComputeResult, PortSpec } from "./types";

export const FROBENIUS_COIN_PORT_SPEC: PortSpec = {
  engineId: "number-theory",
  methodId: "frobenius-coin",
  inputs: [
    { key: "a", label: "a", kind: "expression", default: "5" },
    { key: "b", label: "b", kind: "expression", default: "8" },
  ],
  outputs: [
    { key: "exists", label: "coprime (1/0)", kind: "number" },
    { key: "frobenius", label: "Frobenius #", kind: "number" },
  ],
  executionMode: "live",
  pagePath: "/math-lab/engines/number-theory/methods/frobenius-coin.html",
  pageStoreKey: "engine-lab:number-theory-frobenius-coin",
  compute: (inputs): ComputeResult => {
    try {
      const a = parseBigInt(inputs.a, "a");
      const b = parseBigInt(inputs.b, "b");
      const r = NumberTheory.frobenius(a, b);
      if (!r.exists) {
        return { outputs: { exists: 0 }, error: r.reason };
      }
      return {
        outputs: { exists: 1, frobenius: bigIntToDisplay(r.frobenius) },
      };
    } catch (err) {
      return {
        outputs: {},
        error: err instanceof Error ? err.message : String(err),
      };
    }
  },
};
