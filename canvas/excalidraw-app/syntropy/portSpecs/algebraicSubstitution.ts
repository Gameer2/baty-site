import { runCas, stepsToText } from "./casRunHelpers";

import type { ComputeResult, ExpressionOutput, PortSpec } from "./types";

// Run-mode spec: computeRun calls math-lab's CAS.algebraicSubstitution(integrand, variable)
// through the bridge and surfaces the verified antiderivative it returns as a Symbolic
// expression. The page (math-lab/engines/calculus/methods/algebraic-substitution.html) auto-detects
// the substitution u = g(x); the op takes only the integrand + variable, so the node does too.
// See docs/superpowers/plans/2026-08-14-syntropy-engine-calculus.md Task 1.
export const ALGEBRAIC_SUBSTITUTION_PORT_SPEC: PortSpec = {
  engineId: "calculus",
  methodId: "algebraic-substitution",
  inputs: [
    { key: "f", label: "f(x)", kind: "expression", default: "x*sqrt(x+1)" },
    { key: "variable", label: "variable", kind: "expression", default: "x" },
  ],
  outputs: [
    { key: "antiderivative", label: "∫f dx", kind: "expression" },
    { key: "steps", label: "steps", kind: "text" },
  ],
  executionMode: "run",
  pagePath: "/math-lab/engines/calculus/methods/algebraic-substitution.html",
  pageStoreKey: "engine-lab:calculus-algebraic-substitution",
  // Sync placeholder — the render path never reads a run spec's real result from compute (it
  // branches on executionMode); an empty result is honest: "not run yet."
  compute: (): ComputeResult => ({ outputs: {} }),
  computeRun: async (inputs): Promise<ComputeResult> => {
    const f = String(inputs.f ?? "");
    const variable = String(inputs.variable ?? "x");
    const r = await runCas("algebraicSubstitution", [f, variable]);
    if (!r.ok) {
      return { outputs: {}, error: r.error };
    }
    const antiderivative: ExpressionOutput = {
      display: String(r.result.result ?? ""),
      structured: { kind: "plain" },
    };
    return {
      outputs: {
        antiderivative,
        steps: stepsToText(r.result.steps),
      },
    };
  },
};
