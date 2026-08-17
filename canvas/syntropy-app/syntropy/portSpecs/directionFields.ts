import { sampleFieldOutput } from "./fieldSample";

import type { ComputeResult, PortSpec } from "./types";

// Run-mode Field spec: computeRun calls the existing CAS.sampleField op with the direction field
// dy/dx = f(x, y) reinterpreted as the vector field ⟨1, f(x, y)⟩ — arrows everywhere point in the
// direction the solution curves tangent. No new math: sampleField already evaluates vector-field
// components over a rectangle. The first output is `field` so the archetype is field; the node has
// no other headline result (the page's RK4 integral curve is a separate real-line path left on the
// page). Mirrors engines/ode/methods/direction-fields.html.
export const DIRECTION_FIELDS_PORT_SPEC: PortSpec = {
  engineId: "ode",
  methodId: "direction-fields",
  inputs: [
    {
      key: "f",
      label: "dy/dx = f(x, y)",
      kind: "expression",
      default: "x + y",
    },
    { key: "x0", label: "x min", kind: "number", default: -5 },
    { key: "x1", label: "x max", kind: "number", default: 5 },
    { key: "y0", label: "y min", kind: "number", default: -5 },
    { key: "y1", label: "y max", kind: "number", default: 5 },
  ],
  outputs: [{ key: "field", label: "direction field", kind: "field" }],
  executionMode: "run",
  pagePath: "/math-lab/engines/ode/methods/direction-fields.html",
  pageStoreKey: "engine-lab:ode-direction-fields",
  compute: (): ComputeResult => ({ outputs: {} }),
  computeRun: async (inputs): Promise<ComputeResult> => {
    const f = String(inputs.f ?? "");
    const xLo = Number(inputs.x0 ?? -5);
    const xHi = Number(inputs.x1 ?? 5);
    const yLo = Number(inputs.y0 ?? -5);
    const yHi = Number(inputs.y1 ?? 5);
    if (
      ![xLo, xHi, yLo, yHi].every(Number.isFinite) ||
      xHi <= xLo ||
      yHi <= yLo
    ) {
      return {
        outputs: {},
        error: "The x and y ranges must be finite with max > min.",
      };
    }
    const out = await sampleFieldOutput({
      variant: "arrows",
      pExpr: "1",
      qExpr: f,
      vars: ["x", "y"],
      xLo,
      xHi,
      yLo,
      yHi,
      cols: 17,
      rows: 17,
    });
    if (!out.ok) {
      return { outputs: {}, error: out.error };
    }
    return { outputs: { field: out.field } };
  },
};
