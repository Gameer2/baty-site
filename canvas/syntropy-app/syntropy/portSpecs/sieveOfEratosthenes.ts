import { bigIntToDisplay, parseBigInt } from "./bigIntHelpers";
import { NumberTheory } from "./numberTheoryAlgorithms";

import type { ComputeResult, PortSpec } from "./types";

export const SIEVE_OF_ERATOSTHENES_PORT_SPEC: PortSpec = {
  engineId: "number-theory",
  methodId: "sieve-of-eratosthenes",
  inputs: [{ key: "n", label: "n", kind: "expression", default: "120" }],
  outputs: [
    { key: "count", label: "primes <= n", kind: "number" },
    { key: "largest", label: "largest", kind: "number" },
  ],
  executionMode: "live",
  pagePath:
    "/math-lab/engines/number-theory/methods/sieve-of-eratosthenes.html",
  pageStoreKey: "engine-lab:number-theory-sieve-of-eratosthenes",
  compute: (inputs): ComputeResult => {
    try {
      const n = parseBigInt(inputs.n, "n");
      if (n < 2n) {
        return { outputs: {}, error: "n must be at least 2." };
      }
      if (n > 200000n) {
        return {
          outputs: {},
          error: "n must be at most 200000 to stay responsive.",
        };
      }
      const primes = NumberTheory.primesUpTo(n);
      return {
        outputs: {
          count: primes.length,
          largest: primes.length
            ? bigIntToDisplay(primes[primes.length - 1])
            : 0,
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
