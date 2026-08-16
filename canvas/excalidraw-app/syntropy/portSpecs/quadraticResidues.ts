import { bigIntToDisplay, parseBigInt } from "./bigIntHelpers";
import { NumberTheory } from "./numberTheoryAlgorithms";

import type { ComputeResult, PortSpec } from "./types";

export const QUADRATIC_RESIDUES_PORT_SPEC: PortSpec = {
  engineId: "number-theory",
  methodId: "quadratic-residues",
  inputs: [
    { key: "p", label: "p (odd prime)", kind: "expression", default: "13" },
    { key: "a", label: "a", kind: "expression", default: "10" },
  ],
  outputs: [
    { key: "legendre", label: "Legendre (a/p)", kind: "number" },
    { key: "isQR", label: "is QR (1/0)", kind: "number" },
  ],
  executionMode: "live",
  pagePath: "/math-lab/engines/number-theory/methods/quadratic-residues.html",
  pageStoreKey: "engine-lab:number-theory-quadratic-residues",
  compute: (inputs): ComputeResult => {
    try {
      const p = parseBigInt(inputs.p, "p");
      const a = parseBigInt(inputs.a, "a");
      if (!NumberTheory.millerRabin(p).prime || p === 2n) {
        return { outputs: {}, error: "p must be an odd prime." };
      }
      const legendre = NumberTheory.legendreSymbol(a, p);
      return {
        outputs: {
          legendre: bigIntToDisplay(legendre),
          isQR: legendre === 1n ? 1 : 0,
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
