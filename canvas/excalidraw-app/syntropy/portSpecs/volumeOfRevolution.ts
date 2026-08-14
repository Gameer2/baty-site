import { runCas } from "./casRunHelpers";

import type { ComputeResult, PortSpec } from "./types";

// Run-mode Scalar spec: computeRun calls CAS.volumeOfRevolution(f, "x", a, b, opts) and surfaces
// the exact solid-of-revolution volume (numeric) as a Scalar number. opts.method is "disk",
// "washer" (needs the inner curve g(x) = opts.inner), or "shell"; bounds a/b are expression
// strings so π survive. The op verifies the symbolic volume against an independent numeric
// integration before returning. The 3D solid viz stays on the page (v1). Inputs mirror the page
// (volumes-of-revolution.js); the inner curve is only consumed when method is "washer". See the
// calculus plan Task 25.
export const VOLUME_OF_REVOLUTION_PORT_SPEC: PortSpec = {
  engineId: "calculus",
  methodId: "volumes-of-revolution",
  inputs: [
    { key: "f", label: "f(x)", kind: "expression", default: "x^2" },
    { key: "a", label: "a", kind: "expression", default: "0" },
    { key: "b", label: "b", kind: "expression", default: "2" },
    { key: "method", label: "method", kind: "expression", default: "disk" },
    { key: "inner", label: "g(x) (washer)", kind: "expression", default: "0" },
  ],
  outputs: [{ key: "volume", label: "V", kind: "number" }],
  executionMode: "run",
  pagePath: "/math-lab/engines/calculus/methods/volumes-of-revolution.html",
  pageStoreKey: "engine-lab:calculus-volumes-of-revolution",
  compute: (): ComputeResult => ({ outputs: {} }),
  computeRun: async (inputs): Promise<ComputeResult> => {
    const f = String(inputs.f ?? "");
    const a = String(inputs.a ?? "");
    const b = String(inputs.b ?? "");
    const method = String(inputs.method ?? "disk");
    const opts: Record<string, string> = { method };
    if (method === "washer") {
      opts.inner = String(inputs.inner ?? "");
    }
    const r = await runCas("volumeOfRevolution", [f, "x", a, b, opts]);
    if (!r.ok) {
      return { outputs: {}, error: r.error };
    }
    return {
      outputs: {
        volume: Number(r.result.numeric),
      },
    };
  },
};
