import { runCas } from "./casRunHelpers";
import { sampleFieldOutput } from "./fieldSample";

import type { ComputeResult, PortSpec } from "./types";

// Run-mode Field spec: computeRun calls CAS.vectorCalculus(operation, spec, {}) for the
// operator result (divergence/curl, line-integral work/flux, or Green's two-sided check) and
// sampleField({variant:"arrows", pExpr:P, qExpr:Q, ...}) for the F = ⟨P, Q⟩ direction field
// over the rectangle [x0, x1] × [y0, y1]. The first output is `field` so the archetype is
// field; `result` carries the symbolic/operator verdict as text. Inputs mirror the page
// (vector-calculus.js): the curve x(t), y(t) and bounds a, b are only consumed for the
// line-integral operation. The full step table stays on the page (v1). See plan Task 18.
export const VECTOR_CALCULUS_PORT_SPEC: PortSpec = {
  engineId: "calculus",
  methodId: "vector-calculus",
  inputs: [
    {
      key: "operation",
      label: "operation",
      kind: "expression",
      default: "divergence-curl",
    },
    { key: "P", label: "P(x, y)", kind: "expression", default: "-y" },
    { key: "Q", label: "Q(x, y)", kind: "expression", default: "x" },
    { key: "x0", label: "x0", kind: "number", default: -3 },
    { key: "x1", label: "x1", kind: "number", default: 3 },
    { key: "y0", label: "y0", kind: "number", default: -3 },
    { key: "y1", label: "y1", kind: "number", default: 3 },
    { key: "curveX", label: "x(t)", kind: "expression", default: "cos(t)" },
    { key: "curveY", label: "y(t)", kind: "expression", default: "sin(t)" },
    { key: "a", label: "a", kind: "expression", default: "0" },
    { key: "b", label: "b", kind: "expression", default: "2*pi" },
  ],
  outputs: [
    { key: "field", label: "F field", kind: "field" },
    { key: "result", label: "result", kind: "text" },
  ],
  executionMode: "run",
  pagePath: "/math-lab/engines/calculus/methods/vector-calculus.html",
  pageStoreKey: "engine-lab:calculus-vector-calculus",
  compute: (): ComputeResult => ({ outputs: {} }),
  computeRun: async (inputs): Promise<ComputeResult> => {
    const operation = String(inputs.operation ?? "divergence-curl");
    const P = String(inputs.P ?? "");
    const Q = String(inputs.Q ?? "");
    const x0 = Number(inputs.x0 ?? -3);
    const x1 = Number(inputs.x1 ?? 3);
    const y0 = Number(inputs.y0 ?? -3);
    const y1 = Number(inputs.y1 ?? 3);
    const curveX = String(inputs.curveX ?? "");
    const curveY = String(inputs.curveY ?? "");
    const a = String(inputs.a ?? "");
    const b = String(inputs.b ?? "");

    const spec =
      operation === "line-integral"
        ? { P, Q, x: curveX, y: curveY, a, b }
        : operation === "greens"
        ? {
            P,
            Q,
            x0: String(x0),
            x1: String(x1),
            y0: String(y0),
            y1: String(y1),
          }
        : { P, Q };

    const r = await runCas("vectorCalculus", [operation, spec, {}]);
    if (!r.ok) {
      return { outputs: {}, error: r.error };
    }
    const field = await sampleFieldOutput({
      variant: "arrows",
      pExpr: P,
      qExpr: Q,
      xLo: x0,
      xHi: x1,
      yLo: y0,
      yHi: y1,
      cols: 20,
      rows: 20,
    });
    if (!field.ok) {
      return { outputs: {}, error: field.error };
    }

    const result = r.result;
    let resultText: string;
    if (operation === "divergence-curl") {
      const div = result.div as { value?: string; numeric?: number };
      const curl = result.curl as { value?: string; numeric?: number };
      resultText = `div = ${div.value} (≈${div.numeric}); curl = ${curl.value} (≈${curl.numeric})`;
    } else if (operation === "line-integral") {
      const quantities = result.quantities as
        | Record<string, { ok?: boolean; numeric?: number }>
        | undefined;
      const work = quantities?.work;
      const flux = quantities?.flux;
      resultText = `work ≈ ${work?.ok ? work.numeric : "—"}; flux ≈ ${
        flux?.ok ? flux.numeric : "—"
      }`;
    } else {
      const areaSide = result.areaSide as { value?: string; numeric?: number };
      const lineSide = result.lineSide as { value?: string; numeric?: number };
      resultText = `∮ = ${lineSide.value} (≈${lineSide.numeric}); ∬ = ${areaSide.value} (≈${areaSide.numeric})`;
    }

    return { outputs: { field: field.field, result: resultText } };
  },
};
