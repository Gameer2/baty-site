import { bigIntToDisplay, parseBigInt } from "./bigIntHelpers";
import { NumberTheory } from "./numberTheoryAlgorithms";

import type { ComputeResult, PortSpec } from "./types";

export const ORDER_OF_ELEMENT_PORT_SPEC: PortSpec = {
  engineId: "number-theory",
  methodId: "order-of-element",
  inputs: [
    { key: "a", label: "a", kind: "expression", default: "3" },
    { key: "n", label: "n", kind: "expression", default: "7" },
  ],
  outputs: [
    { key: "order", label: "ord_n(a)", kind: "number" },
    { key: "phi", label: "phi(n)", kind: "number" },
  ],
  executionMode: "live",
  pagePath: "/math-lab/engines/number-theory/methods/order-of-element.html",
  pageStoreKey: "engine-lab:number-theory-order-of-element",
  compute: (inputs): ComputeResult => {
    try {
      const a = parseBigInt(inputs.a, "a");
      const n = parseBigInt(inputs.n, "n");
      const r = NumberTheory.multiplicativeOrder(a, n);
      if (!r.ok) {
        return { outputs: {}, error: r.reason };
      }
      return {
        outputs: {
          order: bigIntToDisplay(r.order),
          phi: bigIntToDisplay(r.phi),
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
