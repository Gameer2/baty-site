import { runCas } from "./casRunHelpers";

import type { ComputeResult, PortSpec } from "./types";

// Run-mode Scalar spec (a documented §7 deviation from plan Task 20, which proposed Field):
// vectors-in-space is DISCRETE vector arithmetic on a handful of literal vectors, not a
// continuous field — sampleField's arrow GRID has nothing to sample — so the Field archetype
// does not fit. v1 flips it to Scalar: computeRun calls CAS.vectorOps(op, operands) and
// surfaces the result's magnitude as a number plus the result vector/scalar as text (the
// page's 3D vector drawing stays on the page). Inputs mirror the page (vectors-in-space.js):
// a, b, w are 3-component vectors as "x, y, z" strings; w is only consumed by tripleProduct.
export const VECTORS_IN_SPACE_PORT_SPEC: PortSpec = {
  engineId: "calculus",
  methodId: "vectors-in-space",
  inputs: [
    {
      key: "operation",
      label: "operation",
      kind: "expression",
      default: "dot",
    },
    { key: "a", label: "vector a", kind: "expression", default: "1, 2, 3" },
    { key: "b", label: "vector b", kind: "expression", default: "4, 5, 6" },
    { key: "w", label: "vector w", kind: "expression", default: "0, 0, 0" },
  ],
  outputs: [
    { key: "magnitude", label: "magnitude", kind: "number" },
    { key: "result", label: "result", kind: "text" },
  ],
  executionMode: "run",
  pagePath: "/math-lab/engines/calculus/methods/vectors-in-space.html",
  pageStoreKey: "engine-lab:calculus-vectors-in-space",
  compute: (): ComputeResult => ({ outputs: {} }),
  computeRun: async (inputs): Promise<ComputeResult> => {
    const operation = String(inputs.operation ?? "dot");
    const parseVec = (raw: unknown): string[] =>
      String(raw ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s !== "");
    const aParts = parseVec(inputs.a);
    const bParts = parseVec(inputs.b);
    const wParts = parseVec(inputs.w);
    if (aParts.length !== 3 || bParts.length !== 3 || wParts.length !== 3) {
      return {
        outputs: {},
        error:
          "Each vector needs exactly three components, separated by commas.",
      };
    }

    const operands =
      operation === "magnitude" || operation === "unit"
        ? [aParts]
        : operation === "tripleProduct"
        ? [aParts, bParts, wParts]
        : [aParts, bParts];

    const r = await runCas("vectorOps", [operation, operands]);
    if (!r.ok) {
      return { outputs: {}, error: r.error };
    }
    const kind = String(r.result.kind ?? "");
    if (kind === "vector") {
      const numeric = (r.result.numeric as number[]) ?? [];
      const resultVector = (r.result.resultVector as string[]) ?? [];
      return {
        outputs: {
          magnitude: Math.hypot(...numeric),
          result: `⟨${resultVector.join(", ")}⟩`,
        },
      };
    }
    return {
      outputs: {
        magnitude: Number(r.result.numeric),
        result: String(r.result.result ?? ""),
      },
    };
  },
};
