import { bigIntToDisplay, parseBigInt } from "./bigIntHelpers";
import { NumberTheory } from "./numberTheoryAlgorithms";

import type { ComputeResult, PortSpec } from "./types";

export const RSA_PORT_SPEC: PortSpec = {
  engineId: "number-theory",
  methodId: "rsa",
  inputs: [
    { key: "p", label: "p", kind: "expression", default: "61" },
    { key: "q", label: "q", kind: "expression", default: "53" },
    { key: "m", label: "message m", kind: "expression", default: "42" },
  ],
  outputs: [
    { key: "n", label: "n", kind: "number" },
    { key: "cipher", label: "cipher", kind: "number" },
    { key: "roundtrip", label: "decrypts ok (1/0)", kind: "number" },
  ],
  executionMode: "live",
  pagePath: "/math-lab/engines/number-theory/methods/rsa.html",
  pageStoreKey: "engine-lab:number-theory-rsa",
  compute: (inputs): ComputeResult => {
    try {
      const p = parseBigInt(inputs.p, "p");
      const q = parseBigInt(inputs.q, "q");
      const m = parseBigInt(inputs.m, "message");
      const key = NumberTheory.rsaKeygen(p, q);
      if (m < 0n || m >= key.n) {
        return {
          outputs: {},
          error: `message must satisfy 0 <= m < n = ${key.n}.`,
        };
      }
      const cipher = NumberTheory.rsaEncrypt(m, key.e, key.n);
      const decrypted = NumberTheory.rsaDecrypt(cipher, key.d, key.n);
      return {
        outputs: {
          n: bigIntToDisplay(key.n),
          cipher: bigIntToDisplay(cipher),
          roundtrip: decrypted === m ? 1 : 0,
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
