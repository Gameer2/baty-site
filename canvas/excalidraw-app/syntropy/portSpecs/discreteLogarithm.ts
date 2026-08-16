import { bigIntToDisplay, parseBigInt } from "./bigIntHelpers";
import { NumberTheory } from "./numberTheoryAlgorithms";

import type { ComputeResult, PortSpec } from "./types";

export const DISCRETE_LOGARITHM_PORT_SPEC: PortSpec = {
  engineId: "number-theory",
  methodId: "discrete-logarithm",
  inputs: [
    { key: "g", label: "g", kind: "expression", default: "2" },
    { key: "h", label: "h", kind: "expression", default: "3" },
    { key: "n", label: "n", kind: "expression", default: "5" },
  ],
  outputs: [
    { key: "ok", label: "found (1/0)", kind: "number" },
    { key: "x", label: "x", kind: "number" },
  ],
  executionMode: "live",
  pagePath: "/math-lab/engines/number-theory/methods/discrete-logarithm.html",
  pageStoreKey: "engine-lab:number-theory-discrete-logarithm",
  compute: (inputs): ComputeResult => {
    try {
      const g = parseBigInt(inputs.g, "g");
      const h = parseBigInt(inputs.h, "h");
      const n = parseBigInt(inputs.n, "n");
      const r = NumberTheory.discreteLog(g, h, n, { maxSteps: 200000 });
      if (!r.ok) {
        return { outputs: { ok: 0 }, error: r.reason };
      }
      return { outputs: { ok: 1, x: bigIntToDisplay(r.x) } };
    } catch (err) {
      return {
        outputs: {},
        error: err instanceof Error ? err.message : String(err),
      };
    }
  },
};
