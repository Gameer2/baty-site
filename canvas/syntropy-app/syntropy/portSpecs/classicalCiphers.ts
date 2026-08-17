import { parseBigInt } from "./bigIntHelpers";
import { NumberTheory } from "./numberTheoryAlgorithms";

import type { ComputeResult, PortSpec } from "./types";

// The page also supports a Hill (2x2 matrix) cipher; this node fixes it to the Affine cipher —
// the page's own first mode — so the card stays a single, focused shape. The output is
// genuinely text (a ciphertext), not a number — see PortOutputKind's "text" kind.
export const CLASSICAL_CIPHERS_PORT_SPEC: PortSpec = {
  engineId: "number-theory",
  methodId: "classical-ciphers",
  inputs: [
    { key: "text", label: "text", kind: "expression", default: "HELLO WORLD" },
    { key: "a", label: "a (coprime to 26)", kind: "expression", default: "5" },
    { key: "b", label: "b (shift)", kind: "expression", default: "8" },
  ],
  outputs: [{ key: "cipher", label: "cipher", kind: "text" }],
  executionMode: "live",
  pagePath: "/math-lab/engines/number-theory/methods/classical-ciphers.html",
  pageStoreKey: "engine-lab:number-theory-classical-ciphers",
  compute: (inputs): ComputeResult => {
    try {
      const text = String(inputs.text ?? "");
      const a = parseBigInt(inputs.a, "a");
      const b = parseBigInt(inputs.b, "b");
      const cipher = NumberTheory.affineEncrypt(text, a, b);
      return { outputs: { cipher } };
    } catch (err) {
      return {
        outputs: {},
        error: err instanceof Error ? err.message : String(err),
      };
    }
  },
};
