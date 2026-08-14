import { complexDisplay, runCas } from "./casRunHelpers";

import type { ComputeResult, PortSpec } from "./types";

// Run-mode Scalar spec: computeRun calls CAS.contourIntegration(f, contour) for ∮_γ f(z) dz over a
// circle contour via the residue theorem. The op routes through SymPy (complex-residues.js → the
// nested sympy-worker); the first Run pays Pyodide's cold boot. The headline value is generally
// complex, so the first output is `text` (complexDisplay "a + bi") and the archetype is scalar;
// the interior poles and their residues are the second text output. Mirrors contour-integration.html.
type Singularity = {
  location?: { re?: number; im?: number };
  residue?: { re?: number; im?: number };
};

export const CONTOUR_INTEGRATION_PORT_SPEC: PortSpec = {
  engineId: "complex",
  methodId: "contour-integration",
  inputs: [
    { key: "f", label: "f(z)", kind: "expression", default: "1/z" },
    { key: "centerRe", label: "Re(center)", kind: "number", default: 0 },
    { key: "centerIm", label: "Im(center)", kind: "number", default: 0 },
    { key: "radius", label: "radius", kind: "number", default: 2 },
  ],
  outputs: [
    { key: "value", label: "∮ f dz", kind: "text" },
    { key: "residues", label: "interior poles", kind: "text" },
  ],
  executionMode: "run",
  pagePath: "/math-lab/engines/complex/methods/contour-integration.html",
  pageStoreKey: "engine-lab:complex-contour-integration",
  compute: (): ComputeResult => ({ outputs: {} }),
  computeRun: async (inputs): Promise<ComputeResult> => {
    const f = String(inputs.f ?? "");
    const center = {
      re: Number(inputs.centerRe ?? 0),
      im: Number(inputs.centerIm ?? 0),
    };
    const radius = Number(inputs.radius ?? 1);
    if (!Number.isFinite(center.re) || !Number.isFinite(center.im)) {
      return {
        outputs: {},
        error: "The contour center needs numeric Re and Im parts.",
      };
    }
    if (!Number.isFinite(radius) || radius <= 0) {
      return {
        outputs: {},
        error: "The contour radius must be a positive number.",
      };
    }
    const contour = { type: "circle" as const, center, radius };
    const r = await runCas("contourIntegration", [f, contour]);
    if (!r.ok) {
      return { outputs: {}, error: r.error };
    }
    const value = complexDisplay(
      r.result.value as { re?: number; im?: number },
    );
    const inside = (
      Array.isArray(r.result.insideSingularities)
        ? r.result.insideSingularities
        : []
    ) as Singularity[];
    const residues = inside
      .map(
        (s) =>
          `${complexDisplay(s.location)} → residue ${complexDisplay(
            s.residue,
          )}`,
      )
      .join("\n");
    return { outputs: { value, residues } };
  },
};
