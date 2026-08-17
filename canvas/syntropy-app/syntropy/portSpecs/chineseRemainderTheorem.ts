import { bigIntToDisplay, parseBigIntList } from "./bigIntHelpers";
import { NumberTheory } from "./numberTheoryAlgorithms";

import type { ComputeResult, PortSpec } from "./types";

export const CHINESE_REMAINDER_THEOREM_PORT_SPEC: PortSpec = {
  engineId: "number-theory",
  methodId: "chinese-remainder-theorem",
  inputs: [
    // "vector" kind just for the comma-separated text-field UI hint — parsed via
    // parseBigIntList (BigInt-exact) rather than parseComposite's Number-based parseNumberList.
    { key: "residues", label: "residues", kind: "vector", default: "3,1" },
    { key: "moduli", label: "moduli", kind: "vector", default: "6,4" },
  ],
  outputs: [
    { key: "ok", label: "consistent (1/0)", kind: "number" },
    { key: "x", label: "x", kind: "number" },
    { key: "modulus", label: "mod", kind: "number" },
  ],
  executionMode: "live",
  pagePath:
    "/math-lab/engines/number-theory/methods/chinese-remainder-theorem.html",
  pageStoreKey: "engine-lab:number-theory-chinese-remainder-theorem",
  compute: (inputs): ComputeResult => {
    try {
      const residues = parseBigIntList(inputs.residues, "residue");
      const moduli = parseBigIntList(inputs.moduli, "modulus");
      if (residues.length === 0 || residues.length !== moduli.length) {
        return {
          outputs: {},
          error: "residues and moduli must be non-empty and the same length.",
        };
      }
      const r = NumberTheory.crt(residues, moduli);
      if (!r.ok) {
        return { outputs: { ok: 0 }, error: r.reason };
      }
      return {
        outputs: {
          ok: 1,
          x: bigIntToDisplay(r.x),
          modulus: bigIntToDisplay(r.modulus),
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
