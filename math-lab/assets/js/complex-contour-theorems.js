/* Complex Analysis — the contour-integral theorems that build on the residue module:
   the Cauchy integral formula (and its generalized derivative form), the argument principle,
   and Rouché's theorem. Pure/DOM-free, Node-testable; needs no SymPy — every answer here is
   obtained numerically and verified by a second, methodologically independent numeric check,
   the same "never show an unconfirmed result" discipline complex-residues.js established.

   Why a separate module rather than folding into complex-residues.js: that module is the
   shared residue-theorem engine (singularities → residues → sum), already 500 lines and
   consumed by the ODE Laplace page. These theorems are a different shape of computation —
   evaluation formulas and winding numbers, not residue sums — so they live here and REUSE
   complex-residues.js's exported primitives (adaptive Gauss–Kronrod quadrature, the circle
   parametrization, and the e^z→exp(z) notation normalizer) rather than duplicating them.

   Two independent checks per theorem:
   • Cauchy integral formula  — the contour integral of f(z)/(z−z₀)^(n+1) is computed on two
     different circles (radii r and r/2) around z₀; the formula's answer is contour-independent
     for an analytic f, so two independent numeric integrations agreeing is the verification.
     For n=0 a third, stronger check is added: the integral's prediction of f(z₀) is compared
     against a direct evaluation of f at z₀ (shares no code with the contour integral at all).
   • Argument principle         — N−P is computed two ways: as the winding number of f(γ)
     around 0 (geometric argument-unwrapping) AND as (1/2πi)∮ f'/f dz (analytic quadrature of
     the logarithmic derivative, f' obtained by Cauchy–Riemann finite differences). One tracks
     angle, the other integrates a derivative — they share no algorithm, so agreement verifies.
   • Rouché                     — the |f−g|<|f| condition is checked by sampling on γ; when it
     holds, f and g must have the same zero count, which is confirmed by computing both winding
     numbers independently and checking they actually agree. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.ComplexContourTheorems = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const Theorems = {};

  function getComplex() {
    if (typeof module === "object" && module.exports) return require("./complex.js");
    return typeof self !== "undefined" ? self.Complex : root.Complex;
  }
  function getComplexSymbolic() {
    if (typeof module === "object" && module.exports) return require("./complex-symbolic.js");
    return typeof self !== "undefined" ? self.ComplexSymbolic : root.ComplexSymbolic;
  }
  function getCalcCore() {
    if (typeof module === "object" && module.exports) return require("./calc-core.js");
    return typeof self !== "undefined" ? self.CalcCore : root.CalcCore;
  }
  function getResidues() {
    if (typeof module === "object" && module.exports) return require("./complex-residues.js");
    return typeof self !== "undefined" ? self.ComplexResidues : root.ComplexResidues;
  }

  const REL_TOL = 1e-3;          // agreement gate, same as complex-residues.js
  const ZERO_ON_CONTOUR_TOL = 1e-7; // |f(z)| below this on γ means a zero/pole sits on the contour
  const CR_FD_H = 1e-6;          // finite-difference step for f'(z) via Cauchy–Riemann

  function factorial(n) {
    let f = 1;
    for (let k = 2; k <= n; k++) f *= k;
    return f;
  }

  /* Decompose f(z) into u(x,y)+i·v(x,y) and compile both to math.js functions. Returns
     { uFn, vFn } or null if f can't be parsed/decomposed/compiled. The e^z→exp(z) rewrite is
     the same one complex-residues.js's numeric verifier applies, for the same reason:
     ComplexSymbolic.decompose recognises exp(z) but not e^z as an entire function. */
  function compileComplexFn(fStr) {
    const ComplexSymbolic = getComplexSymbolic();
    const CalcCore = getCalcCore();
    const Residues = getResidues();
    const decomposed = ComplexSymbolic.decompose(Residues.eCaretToExp(fStr));
    if (!decomposed.ok) return null;
    const uFn = CalcCore.compileFn(decomposed.u);
    const vFn = CalcCore.compileFn(decomposed.v);
    if (!uFn || !vFn) return null;
    return { uFn, vFn };
  }

  // Evaluate a compiled complex function at z = {re, im}. Returns {re, im} or null (undefined /
  // non-finite there). The scope names are x, y because ComplexSymbolic.decompose emits u, v as
  // functions of the real coordinates x = Re(z), y = Im(z).
  function evalFn(fns, z) {
    const scope = { x: z.re, y: z.im };
    let u, v;
    try { u = fns.uFn.evaluate(scope); v = fns.vFn.evaluate(scope); }
    catch (e) { return null; }
    if (!Number.isFinite(u) || !Number.isFinite(v)) return null;
    return { re: u, im: v };
  }

  /* ============================================================
   * 1. Cauchy integral formula — f^(n)(z₀) = n!/(2πi) ∮ f(z)/(z−z₀)^(n+1) dz
   * ============================================================ */

  // Numerically integrate ∮_{|z−z₀|=r} f(z)/(z−z₀)^(n+1) dz via adaptive Gauss–Kronrod
  // (reused from complex-residues.js). The contour is a circle centred at z₀ — the standard
  // CIF setup — so z₀ is always interior and is never sampled (it is the centre, the integrand
  // is evaluated only on the circle where z ≠ z₀). Returns {re, im} or null.
  function numericCauchyIntegral(fns, z0, n, radius) {
    const Complex = getComplex();
    const Residues = getResidues();
    const param = Residues.circleParametrization({ type: "circle", center: z0, radius });
    const [t0, t1] = param.tRange;
    const denomPow = n + 1;

    function integrand(t) {
      const z = param.z(t);
      const w = evalFn(fns, z);
      if (!w) return null;
      const denom = Complex.powInt(Complex.sub(z, z0), denomPow);
      const g = Complex.div(w, denom);          // f(z)/(z−z₀)^(n+1)
      return Complex.mul(g, param.dz(t));        // × dz/dt
    }
    function reOf(t) { const w = integrand(t); return w ? w.re : NaN; }
    function imOf(t) { const w = integrand(t); return w ? w.im : NaN; }
    if (!Number.isFinite(reOf(t0)) || !Number.isFinite(imOf(t0))) return null;
    const re = Residues._adaptiveGK(reOf, t0, t1);
    if (re === null) return null;
    const im = Residues._adaptiveGK(imOf, t0, t1);
    if (im === null) return null;
    return { re, im };
  }

  // 1/(2πi) · I  =  (−i/(2π)) · I  →  { re: I.im, im: −I.re } scaled by 1/(2π).
  function divideByTwoPiI(I) {
    return { re: I.im / (2 * Math.PI), im: -I.re / (2 * Math.PI) };
  }

  Theorems.cauchyIntegralFormula = function (fStr, variable, z0, order, radius) {
    if (!Number.isInteger(order) || order < 0) {
      return { ok: false, reason: "The derivative order n must be a non-negative integer." };
    }
    if (!(radius > 0)) return { ok: false, reason: "The contour radius must be positive." };
    if (!Number.isFinite(z0.re) || !Number.isFinite(z0.im)) {
      return { ok: false, reason: "z₀ needs numeric Re and Im parts." };
    }

    const fns = compileComplexFn(fStr);
    if (!fns) return { ok: false, reason: "Couldn't parse f(z) into real and imaginary parts." };

    // Precondition: f must be defined (finite) at z₀ — otherwise it isn't analytic there and the
    // formula doesn't apply. This also catches the common mistake of putting z₀ on a pole of f.
    const fAtZ0 = evalFn(fns, z0);
    if (!fAtZ0) {
      return { ok: false, reason: "f(z) is not defined at z₀ — the Cauchy integral formula requires f to be analytic at z₀." };
    }

    const I = numericCauchyIntegral(fns, z0, order, radius);
    if (!I) {
      return { ok: false, reason: "Couldn't evaluate this contour integral numerically — refusing to show an unconfirmed result." };
    }
    // f^(n)(z₀) = n!/(2πi) · I
    const value = Complex_scale(getComplex(), divideByTwoPiI(I), factorial(order));

    // Independent check #1 (all n): contour independence. Recompute on a circle of radius r/2
    // around the same z₀. For an analytic f the formula's answer does not depend on the contour,
    // so two independent numeric integrations agreeing is genuine verification.
    const Iref = numericCauchyIntegral(fns, z0, order, radius / 2);
    if (!Iref) {
      return { ok: false, reason: "Couldn't confirm this result on a second contour — refusing to show an unconfirmed result." };
    }
    const valueRef = Complex_scale(getComplex(), divideByTwoPiI(Iref), factorial(order));
    const refAgrees = complexClose(getComplex(), value, valueRef, REL_TOL);

    // Independent check #2 (n = 0 only, and stronger): the integral predicts f(z₀) directly, so
    // compare against a straight evaluation of f at z₀ — a check that shares no code with the
    // contour integral at all.
    let directAgrees = null;
    if (order === 0) {
      directAgrees = complexClose(getComplex(), value, fAtZ0, REL_TOL);
    }

    const verified = refAgrees && (directAgrees === null || directAgrees);
    if (!verified) {
      return { ok: false, reason: "The contour-integral prediction did not hold up against an independent check — refusing to show an unconfirmed result." };
    }

    return {
      ok: true,
      order,
      value,                 // f^(n)(z₀) as {re, im}
      numericCheck: I,       // the raw ∮ f(z)/(z−z₀)^(n+1) dz
      referenceCheck: valueRef, // same formula on a radius-r/2 contour
      directCheck: order === 0 ? fAtZ0 : null, // f(z₀) evaluated directly (n=0 only)
      verified: true,
    };
  };

  /* ============================================================
   * 2. Argument principle — (1/2πi) ∮ f'(z)/f(z) dz = N − P = winding of f(γ) about 0
   * ============================================================ */

  // Winding number of f(γ) around 0 by unwrapping arg f(z(t)) along the contour. Returns an
  // integer (N − P, sign included — poles give negative winding) or null if f can't be
  // evaluated on γ or hits (approximately) 0 on γ (a zero/pole on the contour makes the
  // argument undefined and the theorem inapplicable).
  Theorems.windingNumber = function (fStr, variable, contour) {
    const Residues = getResidues();
    const fns = compileComplexFn(fStr);
    if (!fns) return null;
    const param = Residues.circleParametrization(contour);
    const [t0, t1] = param.tRange;
    const N = 4096;
    let prevArg = null, total = 0;
    for (let i = 0; i <= N; i++) {
      const t = t0 + (t1 - t0) * (i / N);
      const w = evalFn(fns, param.z(t));
      if (!w) return null;
      if (Math.hypot(w.re, w.im) < ZERO_ON_CONTOUR_TOL) {
        return null; // zero/pole on γ — argument principle doesn't apply
      }
      const a = Math.atan2(w.im, w.re);
      if (prevArg !== null) {
        let d = a - prevArg;
        if (d > Math.PI) d -= 2 * Math.PI;
        else if (d < -Math.PI) d += 2 * Math.PI;
        total += d;
      }
      prevArg = a;
    }
    return Math.round(total / (2 * Math.PI));
  };

  // (1/2πi) ∮ f'(z)/f(z) dz via adaptive Gauss–Kronrod. f'(z) is obtained from u, v by the
  // Cauchy–Riemann equations — f'(z) = u_x + i·v_x — using central finite differences, so this
  // shares no code with the winding-number computation above (angle tracking vs derivative
  // quadrature). Returns {re, im} (the real part is N − P, the imaginary part ≈ 0) or null.
  Theorems.logDerivativeIntegral = function (fStr, variable, contour) {
    const Complex = getComplex();
    const Residues = getResidues();
    const fns = compileComplexFn(fStr);
    if (!fns) return null;
    const param = Residues.circleParametrization(contour);
    const [t0, t1] = param.tRange;
    const h = CR_FD_H;

    function fPrimeAt(z) {
      // f'(z) = u_x + i·v_x, central difference in x (Re z). y = Im z held fixed.
      const scopeP = { x: z.re + h, y: z.im }, scopeM = { x: z.re - h, y: z.im };
      let uP, vP, uM, vM;
      try { uP = fns.uFn.evaluate(scopeP); vP = fns.vFn.evaluate(scopeP);
            uM = fns.uFn.evaluate(scopeM); vM = fns.vFn.evaluate(scopeM); }
      catch (e) { return null; }
      if (![uP, vP, uM, vM].every(Number.isFinite)) return null;
      return { re: (uP - uM) / (2 * h), im: (vP - vM) / (2 * h) };
    }

    function integrand(t) {
      const z = param.z(t);
      const f = evalFn(fns, z);
      if (!f) return null;
      const fp = fPrimeAt(z);
      if (!fp) return null;
      const absF = Math.hypot(f.re, f.im);
      if (absF < ZERO_ON_CONTOUR_TOL) return null; // f = 0 on γ — f'/f undefined
      const ratio = Complex.div(fp, f);            // f'(z)/f(z)
      return Complex.mul(ratio, param.dz(t));       // × dz/dt
    }
    function reOf(t) { const w = integrand(t); return w ? w.re : NaN; }
    function imOf(t) { const w = integrand(t); return w ? w.im : NaN; }
    if (!Number.isFinite(reOf(t0)) || !Number.isFinite(imOf(t0))) return null;
    const re = Residues._adaptiveGK(reOf, t0, t1);
    if (re === null) return null;
    const im = Residues._adaptiveGK(imOf, t0, t1);
    if (im === null) return null;
    return divideByTwoPiI({ re, im });
  };

  Theorems.argumentPrinciple = function (fStr, variable, contour) {
    const winding = Theorems.windingNumber(fStr, variable, contour);
    const logDeriv = Theorems.logDerivativeIntegral(fStr, variable, contour);
    if (winding === null) {
      return { ok: false, reason: "Couldn't evaluate f(z) on the contour — check that f is defined everywhere on γ and has no zero or pole on it." };
    }
    if (logDeriv === null) {
      return { ok: false, reason: "Couldn't evaluate the logarithmic-derivative integral numerically — refusing to show an unconfirmed result." };
    }
    const agrees = Math.round(logDeriv.re) === winding && Math.abs(logDeriv.re - winding) < 0.05 && Math.abs(logDeriv.im) < 0.05;
    if (!agrees) {
      return { ok: false, reason: "The winding-number and logarithmic-derivative checks did not agree — refusing to show an unconfirmed result." };
    }
    return {
      ok: true,
      nMinusP: winding,        // N − P (zeros minus poles, with multiplicity; sign included)
      winding,                 // geometric: winding of f(γ) about 0
      logDeriv,                // analytic: (1/2πi)∮ f'/f dz — {re, im}, re ≈ N − P
      verified: true,
    };
  };

  /* ============================================================
   * 3. Rouché's theorem — |f − g| < |f| on γ  ⟹  N_f = N_g
   * ============================================================ */

  Theorems.rouche = function (fStr, gStr, variable, contour) {
    const Residues = getResidues();
    const fFns = compileComplexFn(fStr);
    const gFns = compileComplexFn(gStr);
    if (!fFns) return { ok: false, reason: "Couldn't parse f(z) into real and imaginary parts." };
    if (!gFns) return { ok: false, reason: "Couldn't parse g(z) into real and imaginary parts." };

    const param = Residues.circleParametrization(contour);
    const [t0, t1] = param.tRange;
    const N = 1024;
    let maxRatio = 0;          // max |f−g| / |f| over γ — Rouché's condition is maxRatio < 1
    let minAbsF = Infinity;
    for (let i = 0; i <= N; i++) {
      const t = t0 + (t1 - t0) * (i / N);
      const z = param.z(t);
      const f = evalFn(fFns, z);
      const g = evalFn(gFns, z);
      if (!f || !g) return { ok: false, reason: "Couldn't evaluate f or g on the contour — check that both are defined everywhere on γ." };
      const absF = Math.hypot(f.re, f.im);
      if (absF < ZERO_ON_CONTOUR_TOL) {
        return { ok: false, reason: "f(z) has a zero on the contour — Rouché's condition |f−g| < |f| can't be evaluated there." };
      }
      minAbsF = Math.min(minAbsF, absF);
      const diff = { re: f.re - g.re, im: f.im - g.im };
      maxRatio = Math.max(maxRatio, Math.hypot(diff.re, diff.im) / absF);
    }

    const applies = maxRatio < 1;
    if (!applies) {
      return {
        ok: true,
        applies: false,
        maxRatio,
        reason: "Rouché's condition |f−g| < |f| does not hold on γ (the ratio |f−g|/|f| reaches " + maxRatio.toFixed(3) + ", which is ≥ 1), so the theorem doesn't apply here.",
      };
    }

    // Condition holds → f and g have the same number of zeros inside γ. Verify by computing
    // both winding numbers independently and checking they actually agree.
    const nF = Theorems.windingNumber(fStr, variable, contour);
    const nG = Theorems.windingNumber(gStr, variable, contour);
    if (nF === null || nG === null) {
      return { ok: false, reason: "Rouché's condition held, but a winding number couldn't be computed for f or g — refusing to show an unconfirmed result." };
    }
    return {
      ok: true,
      applies: true,
      maxRatio,
      nF,
      nG,
      equal: nF === nG,
      verified: nF === nG,
      reason: nF === nG ? null : "Rouché's condition held but the two winding numbers disagreed — cannot confirm.",
    };
  };

  /* Sample f(γ) — the image of the contour under f — at N points. Used by the argument-principle
     / Rouché page to draw f(γ) in the w-plane and see it wind around 0. Returns an array of
     {re, im} (the image curve) or null if f can't be evaluated on γ. */
  Theorems.sampleImage = function (fStr, variable, contour, N) {
    const Residues = getResidues();
    const fns = compileComplexFn(fStr);
    if (!fns) return null;
    const param = Residues.circleParametrization(contour);
    const [t0, t1] = param.tRange;
    const out = [];
    for (let i = 0; i <= N; i++) {
      const t = t0 + (t1 - t0) * (i / N);
      const w = evalFn(fns, param.z(t));
      if (!w) return null;
      out.push(w);
    }
    return out;
  };

  /* ---------- small complex helpers (kept local to avoid mutating Complex.js) ---------- */

  function Complex_scale(Complex, a, k) { return Complex.scale(a, k); }
  function complexClose(Complex, a, b, tol) {
    const scale = Math.max(1, Math.max(Complex.abs(a), Complex.abs(b)));
    return Complex.abs(Complex.sub(a, b)) <= tol * scale;
  }

  return Theorems;
});