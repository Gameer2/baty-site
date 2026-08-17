import { bigIntToDisplay, parseBigInt } from "./bigIntHelpers";
import { NumberTheory } from "./numberTheoryAlgorithms";

import type { ComputeResult, PortSpec } from "./types";

export const JACOBI_SYMBOL_PORT_SPEC: PortSpec = {
  engineId: "number-theory",
  methodId: "jacobi-symbol",
  inputs: [
    { key: "a", label: "a", kind: "expression", default: "2" },
    { key: "n", label: "n (odd)", kind: "expression", default: "9" },
  ],
  outputs: [{ key: "jacobi", label: "(a/n)", kind: "number" }],
  executionMode: "live",
  pagePath: "/math-lab/engines/number-theory/methods/jacobi-symbol.html",
  pageStoreKey: "engine-lab:number-theory-jacobi-symbol",
  compute: (inputs): ComputeResult => {
    try {
      const a = parseBigInt(inputs.a, "a");
      const n = parseBigInt(inputs.n, "n");
      const jacobi = NumberTheory.jacobiSymbol(a, n);
      return { outputs: { jacobi: bigIntToDisplay(jacobi) } };
    } catch (err) {
      return {
        outputs: {},
        error: err instanceof Error ? err.message : String(err),
      };
    }
  },
};
