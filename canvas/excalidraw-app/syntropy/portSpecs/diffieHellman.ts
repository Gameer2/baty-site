import { bigIntToDisplay, parseBigInt } from "./bigIntHelpers";
import { NumberTheory } from "./numberTheoryAlgorithms";

import type { ComputeResult, PortSpec } from "./types";

export const DIFFIE_HELLMAN_PORT_SPEC: PortSpec = {
  engineId: "number-theory",
  methodId: "diffie-hellman",
  inputs: [
    { key: "p", label: "p (prime)", kind: "expression", default: "23" },
    { key: "g", label: "g", kind: "expression", default: "5" },
    { key: "a", label: "private a", kind: "expression", default: "6" },
    { key: "b", label: "private b", kind: "expression", default: "15" },
  ],
  outputs: [
    { key: "sharedA", label: "shared (A side)", kind: "number" },
    { key: "match", label: "match (1/0)", kind: "number" },
  ],
  executionMode: "live",
  pagePath: "/math-lab/engines/number-theory/methods/diffie-hellman.html",
  pageStoreKey: "engine-lab:number-theory-diffie-hellman",
  compute: (inputs): ComputeResult => {
    try {
      const p = parseBigInt(inputs.p, "p");
      const g = parseBigInt(inputs.g, "g");
      const a = parseBigInt(inputs.a, "private a");
      const b = parseBigInt(inputs.b, "private b");
      const r = NumberTheory.diffieHellman(p, g, a, b);
      return {
        outputs: {
          sharedA: bigIntToDisplay(r.sharedA),
          match: r.match ? 1 : 0,
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
