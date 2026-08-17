import { runCas, stepsToText } from "./casRunHelpers";

import type { ComputeResult, ExpressionOutput, PortSpec } from "./types";

// Run-mode spec: computeRun calls CAS.partialFractions(integrand, variable) and surfaces the
// partial-fraction decomposition as a Symbolic expression. The headline is the decomposition
// (the split into simpler fractions), not the integrated antiderivative — an algebraic
// decomposition rendered as a plain expression line (no `relation`, unlike the number-theory
// factorization methods). See calculus plan Task 4.
export const PARTIAL_FRACTIONS_PORT_SPEC: PortSpec = {
  engineId: "calculus",
  methodId: "partial-fractions",
  inputs: [
    { key: "f", label: "f(x)", kind: "expression", default: "1/(x^2-1)" },
    { key: "variable", label: "variable", kind: "expression", default: "x" },
  ],
  outputs: [
    { key: "decomposition", label: "decomposition", kind: "expression" },
    { key: "steps", label: "steps", kind: "text" },
  ],
  executionMode: "run",
  pagePath: "/math-lab/engines/calculus/methods/partial-fractions.html",
  pageStoreKey: "engine-lab:calculus-partial-fractions",
  compute: (): ComputeResult => ({ outputs: {} }),
  computeRun: async (inputs): Promise<ComputeResult> => {
    const f = String(inputs.f ?? "");
    const variable = String(inputs.variable ?? "x");
    const r = await runCas("partialFractions", [f, variable]);
    if (!r.ok) {
      return { outputs: {}, error: r.error };
    }
    const decomposition: ExpressionOutput = {
      display: String(r.result.decomposition ?? ""),
      structured: { kind: "plain" },
    };
    return {
      outputs: {
        decomposition,
        steps: stepsToText(r.result.steps),
      },
    };
  },
};
