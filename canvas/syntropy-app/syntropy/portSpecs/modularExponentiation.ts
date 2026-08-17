import { bigIntToDisplay, parseBigInt } from "./bigIntHelpers";
import { NumberTheory } from "./numberTheoryAlgorithms";

import type { ComputeResult, PortSpec } from "./types";

export const MODULAR_EXPONENTIATION_PORT_SPEC: PortSpec = {
  engineId: "number-theory",
  methodId: "modular-exponentiation",
  inputs: [
    { key: "base", label: "base", kind: "expression", default: "7" },
    { key: "exp", label: "exponent", kind: "expression", default: "256" },
    { key: "mod", label: "modulus", kind: "expression", default: "13" },
  ],
  outputs: [{ key: "result", label: "base^exp mod m", kind: "number" }],
  executionMode: "live",
  pagePath:
    "/math-lab/engines/number-theory/methods/modular-exponentiation.html",
  pageStoreKey: "engine-lab:number-theory-modular-exponentiation",
  compute: (inputs): ComputeResult => {
    try {
      const base = parseBigInt(inputs.base, "base");
      const exp = parseBigInt(inputs.exp, "exponent");
      const mod = parseBigInt(inputs.mod, "modulus");
      const result = NumberTheory.modPow(base, exp, mod);
      return { outputs: { result: bigIntToDisplay(result) } };
    } catch (err) {
      return {
        outputs: {},
        error: err instanceof Error ? err.message : String(err),
      };
    }
  },
};
