import { runCas } from "./casRunHelpers";

import type { ComputeResult, PortSpec } from "./types";

// Run-mode Scalar spec: computeRun calls CAS.multipleIntegral(f, opts) and surfaces the exact
// double-integral value (numeric) as a Scalar number. opts carries the coordinate mode
// ("cartesian" Type-I region or "polar") plus the outer bounds [a, b] and inner bounds
// [lower, upper] as expression strings — π/e survive because every bound goes through
// integrate() → sub(bound), never defint(). The 3D region viz stays on the page (v1). Inputs
// mirror the page (multiple-integrals.js). See the calculus plan Task 24.
export const MULTIPLE_INTEGRALS_PORT_SPEC: PortSpec = {
  engineId: "calculus",
  methodId: "multiple-integrals",
  inputs: [
    { key: "f", label: "f", kind: "expression", default: "x*y" },
    { key: "mode", label: "mode", kind: "expression", default: "cartesian" },
    { key: "a", label: "outer a", kind: "expression", default: "0" },
    { key: "b", label: "outer b", kind: "expression", default: "1" },
    { key: "lower", label: "inner lower", kind: "expression", default: "0" },
    { key: "upper", label: "inner upper", kind: "expression", default: "x" },
  ],
  outputs: [{ key: "value", label: "∬ f dA", kind: "number" }],
  executionMode: "run",
  pagePath: "/math-lab/engines/calculus/methods/multiple-integrals.html",
  pageStoreKey: "engine-lab:calculus-multiple-integrals",
  compute: (): ComputeResult => ({ outputs: {} }),
  computeRun: async (inputs): Promise<ComputeResult> => {
    const f = String(inputs.f ?? "");
    const opts = {
      mode: String(inputs.mode ?? "cartesian"),
      a: String(inputs.a ?? ""),
      b: String(inputs.b ?? ""),
      lower: String(inputs.lower ?? ""),
      upper: String(inputs.upper ?? ""),
    };
    const r = await runCas("multipleIntegral", [f, opts]);
    if (!r.ok) {
      return { outputs: {}, error: r.error };
    }
    return {
      outputs: {
        value: Number(r.result.numeric),
      },
    };
  },
};
