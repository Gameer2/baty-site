import { runCas } from "./casRunHelpers";
import { sampleFieldOutput } from "./fieldSample";

import type { ComputeResult, PortSpec } from "./types";

// Run-mode Field spec: computeRun calls CAS.partialDerivatives(f, ["x","y"], [a, b]) for the
// symbolic partials f_x, f_y (and the gradient/gradient-magnitude at the point), then samples
// the GRADIENT field ∇f = ⟨f_x, f_y⟩ as arrows over a window around (a, b) via sampleField.
// The first output is `field` so the archetype is field; `gradient` is ‖∇f(a, b)‖ as a Scalar
// number. The page's 3D surface + tangent-plane viz stays on the page (v1). Inputs mirror the
// page (partial-derivatives.js); a/b are numeric so the field domain can be centred on the
// point. See the calculus plan Task 19.
export const PARTIAL_DERIVATIVES_PORT_SPEC: PortSpec = {
  engineId: "calculus",
  methodId: "partial-derivatives",
  inputs: [
    { key: "f", label: "f(x, y)", kind: "expression", default: "x^2+y^2" },
    { key: "a", label: "point a", kind: "number", default: 1 },
    { key: "b", label: "point b", kind: "number", default: 1 },
  ],
  outputs: [
    { key: "field", label: "∇f field", kind: "field" },
    { key: "gradient", label: "‖∇f‖", kind: "number" },
  ],
  executionMode: "run",
  pagePath: "/math-lab/engines/calculus/methods/partial-derivatives.html",
  pageStoreKey: "engine-lab:calculus-partial-derivatives",
  compute: (): ComputeResult => ({ outputs: {} }),
  computeRun: async (inputs): Promise<ComputeResult> => {
    const f = String(inputs.f ?? "");
    const a = Number(inputs.a ?? 0);
    const b = Number(inputs.b ?? 0);

    const r = await runCas("partialDerivatives", [
      f,
      ["x", "y"],
      [String(a), String(b)],
    ]);
    if (!r.ok) {
      return { outputs: {}, error: r.error };
    }
    const fx = String(r.result.fx ?? "");
    const fy = String(r.result.fy ?? "");
    const gradAtPointNum = (r.result.gradAtPointNum as
      | number[]
      | undefined) ?? [NaN, NaN];

    const field = await sampleFieldOutput({
      variant: "arrows",
      pExpr: fx,
      qExpr: fy,
      xLo: a - 2,
      xHi: a + 2,
      yLo: b - 2,
      yHi: b + 2,
      cols: 20,
      rows: 20,
    });
    if (!field.ok) {
      return { outputs: {}, error: field.error };
    }

    return {
      outputs: {
        field: field.field,
        gradient: Math.hypot(gradAtPointNum[0], gradAtPointNum[1]),
      },
    };
  },
};
