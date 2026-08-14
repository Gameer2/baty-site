import { runCas, stepsToText } from "./casRunHelpers";

import type { ComputeResult, ExpressionOutput, PortSpec } from "./types";

// Run-mode spec: computeRun calls CAS.arcLengthSurfaceArea(f, variable, a, b, { mode }) and
// surfaces the arc-length / surface-area integrand (the symbolic setup) as the Symbolic headline,
// with the evaluated numeric value as the scalar row. The op's `mode` opts field selects
// "arc-length" or "surface-area" (axis handling stays page-side for v1). See calculus plan Task 11
// — borderline: v1 Symbolic, the setup integral is the point.
export const ARC_LENGTH_SURFACE_AREA_PORT_SPEC: PortSpec = {
  engineId: "calculus",
  methodId: "arc-length-surface-area",
  inputs: [
    { key: "f", label: "f(x)", kind: "expression", default: "x^(3/2)" },
    { key: "variable", label: "variable", kind: "expression", default: "x" },
    { key: "a", label: "from", kind: "expression", default: "0" },
    { key: "b", label: "to", kind: "expression", default: "4" },
    { key: "mode", label: "mode", kind: "expression", default: "arc-length" },
  ],
  outputs: [
    { key: "setup", label: "setup", kind: "expression" },
    { key: "value", label: "value", kind: "number" },
    { key: "steps", label: "steps", kind: "text" },
  ],
  executionMode: "run",
  pagePath: "/math-lab/engines/calculus/methods/arc-length-surface-area.html",
  pageStoreKey: "engine-lab:calculus-arc-length-surface-area",
  compute: (): ComputeResult => ({ outputs: {} }),
  computeRun: async (inputs): Promise<ComputeResult> => {
    const f = String(inputs.f ?? "");
    const variable = String(inputs.variable ?? "x");
    const a = String(inputs.a ?? "0");
    const b = String(inputs.b ?? "1");
    const mode = String(inputs.mode ?? "arc-length");
    const r = await runCas("arcLengthSurfaceArea", [
      f,
      variable,
      a,
      b,
      { mode },
    ]);
    if (!r.ok) {
      return { outputs: {}, error: r.error };
    }
    const setup: ExpressionOutput = {
      display: String(r.result.integrand ?? ""),
      structured: { kind: "plain" },
    };
    const numeric = Number(r.result.numeric);
    return {
      outputs: {
        setup,
        value: Number.isFinite(numeric) ? numeric : undefined,
        steps: stepsToText(r.result.steps),
      },
    };
  },
};
