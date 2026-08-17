import { complexDisplay, runCas } from "./casRunHelpers";

import type { ComputeResult, PortSpec } from "./types";

// Run-mode Scalar spec: computeRun calls CAS.cauchyIntegralFormula(f, z0, order, radius) for
// f^(n)(z0) = n!/(2πi) ∮ f(z)/(z−z0)^(n+1) dz over a circle around z0. The op is pure-numeric
// (complex-contour-theorems.js, no SymPy) and cross-checks against a direct numerical contour
// integral. The value is generally complex, so the first output is `text` (complexDisplay) and the
// archetype is scalar; the derivative order and the numeric-check agreement are number outputs.
// Mirrors cauchy-integral-formula.html.
export const CAUCHY_INTEGRAL_FORMULA_PORT_SPEC: PortSpec = {
  engineId: "complex",
  methodId: "cauchy-integral-formula",
  inputs: [
    { key: "f", label: "f(z)", kind: "expression", default: "exp(z)" },
    { key: "z0Re", label: "Re(z₀)", kind: "number", default: 0 },
    { key: "z0Im", label: "Im(z₀)", kind: "number", default: 0 },
    { key: "order", label: "order n", kind: "number", default: 0 },
    { key: "radius", label: "radius", kind: "number", default: 1 },
  ],
  outputs: [
    { key: "value", label: "f⁽ⁿ⁾(z₀)", kind: "text" },
    { key: "order", label: "order n", kind: "number" },
    { key: "verified", label: "verified (1/0)", kind: "number" },
  ],
  executionMode: "run",
  pagePath: "/math-lab/engines/complex/methods/cauchy-integral-formula.html",
  pageStoreKey: "engine-lab:complex-cauchy-integral-formula",
  compute: (): ComputeResult => ({ outputs: {} }),
  computeRun: async (inputs): Promise<ComputeResult> => {
    const f = String(inputs.f ?? "");
    const z0 = {
      re: Number(inputs.z0Re ?? 0),
      im: Number(inputs.z0Im ?? 0),
    };
    const order = Math.round(Number(inputs.order ?? 0));
    const radius = Number(inputs.radius ?? 1);
    if (!Number.isFinite(z0.re) || !Number.isFinite(z0.im)) {
      return { outputs: {}, error: "Re(z₀) and Im(z₀) must be numbers." };
    }
    if (!Number.isFinite(radius) || radius <= 0) {
      return {
        outputs: {},
        error: "The contour radius must be a positive number.",
      };
    }
    if (!Number.isInteger(order) || order < 0) {
      return {
        outputs: {},
        error: "The derivative order n must be a non-negative integer.",
      };
    }
    const r = await runCas("cauchyIntegralFormula", [f, z0, order, radius]);
    if (!r.ok) {
      return { outputs: {}, error: r.error };
    }
    const value = complexDisplay(
      r.result.value as { re?: number; im?: number },
    );
    return {
      outputs: {
        value,
        order: Number(r.result.order ?? order),
        verified: r.result.verified ? 1 : 0,
      },
    };
  },
};
