import { bigIntToDisplay, parseBigInt } from "./bigIntHelpers";
import { NumberTheory } from "./numberTheoryAlgorithms";

import type { ComputeResult, PortSpec } from "./types";

export const WILSONS_THEOREM_PORT_SPEC: PortSpec = {
  engineId: "number-theory",
  methodId: "wilsons-theorem",
  inputs: [{ key: "n", label: "n", kind: "expression", default: "9" }],
  outputs: [
    { key: "prime", label: "prime (1/0)", kind: "number" },
    { key: "residue", label: "(n-1)! mod n", kind: "number" },
  ],
  executionMode: "live",
  pagePath: "/math-lab/engines/number-theory/methods/wilsons-theorem.html",
  pageStoreKey: "engine-lab:number-theory-wilsons-theorem",
  compute: (inputs): ComputeResult => {
    try {
      const n = parseBigInt(inputs.n, "n");
      if (n < 2n) {
        return { outputs: {}, error: "n must be at least 2." };
      }
      // wilsonCheck is O(n) (it builds (n-1)! one factor at a time) and this node recomputes on
      // every keystroke, unlike the page's own explicit Compute button — cap it so a stray large
      // digit typed mid-edit can't hang the tab.
      if (n > 200000n) {
        return {
          outputs: {},
          error: "n must be at most 200000 for live recompute.",
        };
      }
      const r = NumberTheory.wilsonCheck(n);
      return {
        outputs: {
          prime: r.prime ? 1 : 0,
          residue: bigIntToDisplay(r.residue),
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
