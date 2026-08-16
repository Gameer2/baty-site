import { bigIntToDisplay, parseBigInt } from "./bigIntHelpers";
import { NumberTheory } from "./numberTheoryAlgorithms";

import type { ComputeResult, PortSpec } from "./types";

export const FERMAT_EULER_THEOREM_PORT_SPEC: PortSpec = {
  engineId: "number-theory",
  methodId: "fermat-euler-theorem",
  inputs: [
    { key: "a", label: "a", kind: "expression", default: "3" },
    { key: "n", label: "n", kind: "expression", default: "9" },
  ],
  outputs: [
    { key: "phi", label: "phi(n)", kind: "number" },
    { key: "value", label: "a^phi mod n", kind: "number" },
    { key: "equalsOne", label: "== 1 (1/0)", kind: "number" },
  ],
  executionMode: "live",
  pagePath: "/math-lab/engines/number-theory/methods/fermat-euler-theorem.html",
  pageStoreKey: "engine-lab:number-theory-fermat-euler-theorem",
  compute: (inputs): ComputeResult => {
    try {
      const a = parseBigInt(inputs.a, "a");
      const n = parseBigInt(inputs.n, "n");
      const r = NumberTheory.eulerTheoremCheck(a, n);
      if (!r.applies) {
        return { outputs: {}, error: r.reason };
      }
      return {
        outputs: {
          phi: bigIntToDisplay(r.phi),
          value: bigIntToDisplay(r.value),
          equalsOne: r.equalsOne ? 1 : 0,
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
