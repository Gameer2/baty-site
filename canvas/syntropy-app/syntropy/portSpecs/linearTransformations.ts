import { parseMatrix } from "./parseComposite";
import { LinAlg } from "./linalgAlgorithms";

import type { ComputeResult, PortSpec } from "./types";

// linear-transformations.js is the one linear-algebra page NOT built on LinAlgPage.init — its
// own bespoke 2x2 UI, already Proto-wired under key "engine-lab:linear-algebra" (not the
// "engine-lab:linear-algebra-<method>" convention the other 17 pages use — see
// math-lab/assets/js/linear-transformations.js:17), saving/loading shape { m: number[][] }. The
// single input key here is "m" specifically so portalPrefill.ts's buildPageState produces that
// exact shape.
export const LINEAR_TRANSFORMATIONS_PORT_SPEC: PortSpec = {
  engineId: "linear-algebra",
  methodId: "linear-transformations",
  inputs: [
    { key: "m", label: "A (2x2 ;)", kind: "matrix", default: "1,0;0,1" },
  ],
  outputs: [
    { key: "imageGrid", label: "A·(e₁,e₂)", kind: "matrix" },
    { key: "det", label: "det(A)", kind: "number" },
    { key: "trace", label: "trace", kind: "number" },
  ],
  executionMode: "live",
  pagePath:
    "/math-lab/engines/linear-algebra/methods/linear-transformations.html",
  pageStoreKey: "engine-lab:linear-algebra",
  compute: (inputs): ComputeResult => {
    const A = parseMatrix(inputs.m);
    if (A.length !== 2 || A[0].length !== 2) {
      return { outputs: {}, error: "Matrix must be 2x2." };
    }
    try {
      const det = LinAlg.determinant(A);
      const trace = A[0][0] + A[1][1];
      // The image of the standard basis under A is exactly A's columns; lay them out as
      // rows so the grid reads "where e₁ and e₂ land" rather than restating the input. This
      // is the transform applied to its own basis — not a new LinAlg algorithm.
      const imageGrid = [
        [A[0][0], A[1][0]],
        [A[0][1], A[1][1]],
      ];
      return { outputs: { imageGrid, det, trace } };
    } catch (err) {
      return {
        outputs: {},
        error: err instanceof Error ? err.message : String(err),
      };
    }
  },
};
