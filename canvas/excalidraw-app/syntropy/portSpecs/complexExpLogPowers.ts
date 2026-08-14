import { runCas } from "./casRunHelpers";

import type { ComputeResult, ExpressionOutput, PortSpec } from "./types";

// Run-mode Symbolic spec: computeRun calls CAS.complexExpLogPowers(mode, params, z) for the
// principal branch of log(z), z^(p/q), or z^w (a complex exponent), plus the branch list. The op
// uses complex.js's branch-aware log/pow primitives — no CAS, no SymPy. mode is a free text input
// ("log" | "rational" | "complex") so one node covers all three; only the params the active mode
// reads matter, the others are ignored. Mirrors complex-exp-log-powers.html's mode switch.
export const COMPLEX_EXP_LOG_POWERS_PORT_SPEC: PortSpec = {
  engineId: "complex",
  methodId: "complex-exp-log-powers",
  inputs: [
    { key: "mode", label: "mode", kind: "expression", default: "log" },
    { key: "re", label: "Re(z)", kind: "number", default: 1 },
    { key: "im", label: "Im(z)", kind: "number", default: 1 },
    { key: "p", label: "p (rational)", kind: "number", default: 2 },
    { key: "q", label: "q (rational)", kind: "number", default: 3 },
    { key: "wRe", label: "Re(w) (complex)", kind: "number", default: 0 },
    { key: "wIm", label: "Im(w) (complex)", kind: "number", default: 1 },
  ],
  outputs: [
    { key: "result", label: "principal branch", kind: "expression" },
    { key: "branches", label: "branches", kind: "text" },
  ],
  executionMode: "run",
  pagePath: "/math-lab/engines/complex/methods/complex-exp-log-powers.html",
  pageStoreKey: "engine-lab:complex-complex-exp-log-powers",
  compute: (): ComputeResult => ({ outputs: {} }),
  computeRun: async (inputs): Promise<ComputeResult> => {
    const mode = String(inputs.mode ?? "log").trim();
    const z = {
      re: Number(inputs.re ?? 0),
      im: Number(inputs.im ?? 0),
    };
    if (!Number.isFinite(z.re) || !Number.isFinite(z.im)) {
      return { outputs: {}, error: "Re(z) and Im(z) must be numbers." };
    }
    const params = {
      p: Number(inputs.p ?? 0),
      q: Number(inputs.q ?? 1),
      wRe: Number(inputs.wRe ?? 0),
      wIm: Number(inputs.wIm ?? 0),
    };
    const r = await runCas("complexExpLogPowers", [mode, params, z]);
    if (!r.ok) {
      return { outputs: {}, error: r.error };
    }
    const result: ExpressionOutput = {
      display: String(r.result.display ?? ""),
      structured: { kind: "plain" },
    };
    const branches = Array.isArray(r.result.branches)
      ? (r.result.branches as Array<{ k?: unknown; value?: unknown }>)
          .map((b) => `k=${b.k}: ${b.value}`)
          .join("\n")
      : "";
    return { outputs: { result, branches } };
  },
};
