import { bigIntToDisplay, parseBigInt } from "./bigIntHelpers";
import { NumberTheory } from "./numberTheoryAlgorithms";

import type { ComputeResult, PortSpec } from "./types";

export const QUADRATIC_RECIPROCITY_PORT_SPEC: PortSpec = {
  engineId: "number-theory",
  methodId: "quadratic-reciprocity",
  inputs: [
    { key: "p", label: "p (odd prime)", kind: "expression", default: "13" },
    { key: "q", label: "q (odd prime)", kind: "expression", default: "17" },
  ],
  outputs: [
    { key: "legendrePQ", label: "(p/q)", kind: "number" },
    { key: "legendreQP", label: "(q/p)", kind: "number" },
    { key: "product", label: "(p/q)(q/p)", kind: "number" },
  ],
  executionMode: "live",
  pagePath:
    "/math-lab/engines/number-theory/methods/quadratic-reciprocity.html",
  pageStoreKey: "engine-lab:number-theory-quadratic-reciprocity",
  compute: (inputs): ComputeResult => {
    try {
      const p = parseBigInt(inputs.p, "p");
      const q = parseBigInt(inputs.q, "q");
      if (
        !NumberTheory.millerRabin(p).prime ||
        !NumberTheory.millerRabin(q).prime
      ) {
        return { outputs: {}, error: "p and q must both be prime." };
      }
      const pq = NumberTheory.legendreSymbol(p, q);
      const qp = NumberTheory.legendreSymbol(q, p);
      return {
        outputs: {
          legendrePQ: bigIntToDisplay(pq),
          legendreQP: bigIntToDisplay(qp),
          product: bigIntToDisplay(pq * qp),
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
