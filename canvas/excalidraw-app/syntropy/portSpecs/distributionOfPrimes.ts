import { bigIntToDisplay, parseBigInt } from "./bigIntHelpers";
import { NumberTheory } from "./numberTheoryAlgorithms";

import type { ComputeResult, PortSpec } from "./types";

export const DISTRIBUTION_OF_PRIMES_PORT_SPEC: PortSpec = {
  engineId: "number-theory",
  methodId: "distribution-of-primes",
  inputs: [{ key: "x", label: "x", kind: "expression", default: "10000" }],
  outputs: [
    { key: "pi", label: "pi(x)", kind: "number" },
    { key: "nextPrime", label: "next prime", kind: "number" },
  ],
  executionMode: "live",
  pagePath:
    "/math-lab/engines/number-theory/methods/distribution-of-primes.html",
  pageStoreKey: "engine-lab:number-theory-distribution-of-primes",
  compute: (inputs): ComputeResult => {
    try {
      const x = parseBigInt(inputs.x, "x");
      if (x < 2n) {
        return { outputs: {}, error: "x must be at least 2." };
      }
      if (x > 1000000n) {
        return { outputs: {}, error: "x must be at most 1,000,000." };
      }
      const { pi } = NumberTheory.primeCount(x);
      const next = NumberTheory.nextPrime(x + 1n);
      return {
        outputs: { pi: bigIntToDisplay(pi), nextPrime: bigIntToDisplay(next) },
      };
    } catch (err) {
      return {
        outputs: {},
        error: err instanceof Error ? err.message : String(err),
      };
    }
  },
};
