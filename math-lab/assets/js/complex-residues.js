/* Complex Analysis Phase 3 — residue theorem, shared module.

   Deliberately factored out as its OWN module rather than folded into complex-symbolic.js,
   because it is not really a Complex Analysis-only concern: contour integration here and the
   ODE Engine's planned Laplace-transform inversion (the Bromwich integral) are the SAME
   underlying operation — find the singularities of a function, take residues, sum them. One
   shared module now avoids building that twice later. sympy-worker.js's
   singularitiesWithResidues/laurentSeries ops are this module's only two SymPy calls; every
   consumer (this engine's Contour Integration page today, the ODE Laplace page later) goes
   through here, not through SympyClient directly.

   Same verification discipline as every other engine on this site: the residue-theorem answer
   is never shown on SymPy's say-so alone. It is independently checked by numerically walking
   the actual contour (Simpson's rule, complex-valued) and comparing the two — genuinely
   independent, since it shares no code with SymPy's own residue computation. Pure/DOM-free,
   Node-testable; SymPy calls go through SympyClient, so the SymPy-touching functions are
   browser-only (same as sympy-dsolve-fallback.js), but the geometry and numeric verification
   below are plain JS and directly unit-testable. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.ComplexResidues = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const ComplexResidues = {};

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
  function getSympyClient() {
    return typeof self !== "undefined" ? self.SympyClient : (typeof root !== "undefined" ? root.SympyClient : undefined);
  }

  /* ============================================================
   * 1. Singularities + residues — the one SymPy call this whole module needs.
   * ============================================================ */

  // Resolves to an array of { locationExact, location:{re,im}, residueExact, residue:{re,im} }.
  // Non-isolated/parametric singularities and non-residue singularities (branch points,
  // essential singularities without a computable residue) are silently dropped by the SymPy
  // side rather than guessed at — see sympy-worker.js's _singularities_with_residues.
  ComplexResidues.findSingularitiesWithResidues = function (fStr, variable) {
    const SympyClient = getSympyClient();
    if (!SympyClient) return Promise.reject(new Error("The advanced solver isn't available on this page."));
    return SympyClient.singularitiesWithResidues(fStr, variable).then((out) => JSON.parse(out.resultText));
  };

  /* ============================================================
   * 2. Contour geometry — which of the found singularities are actually inside the given
   *    contour? Circle only for now (the overwhelmingly common textbook case: |z-z0|=r);
   *    extend contourKind dispatch here if a rectangle contour is ever needed.
   * ============================================================ */

  const ON_CONTOUR_TOL = 1e-6; // relative to the contour's own scale (radius), see classify()

  // Returns "inside" | "outside" | "on" for a circle contour.
  function classifyAgainstCircle(point, contour) {
    const Complex = getComplex();
    const d = Complex.abs(Complex.sub(point, contour.center));
    const tol = ON_CONTOUR_TOL * Math.max(1, contour.radius);
    if (Math.abs(d - contour.radius) <= tol) return "on";
    return d < contour.radius ? "inside" : "outside";
  }

  function classify(point, contour) {
    if (contour.type === "circle") return classifyAgainstCircle(point, contour);
    throw new Error("Unsupported contour type: " + contour.type);
  }
  ComplexResidues.classify = classify;

  /* ============================================================
   * 3. Independent numeric verification — walk the actual contour and integrate f(z)dz
   *    directly (adaptive Gauss-Kronrod quadrature, complex-valued via Complex.js), never
   *    trusting the residue-theorem prediction on its own. Uses ComplexSymbolic.decompose, which
   *    tracks u(x,y)/v(x,y) separately by construction (see that file's header for why this is
   *    safer than nerdamer's realpart()/imagpart()) — so this shares no code with the SymPy call
   *    above, which is the point of an independent check.
   *
   *    This used to be a FIXED-N composite Simpson (N=400, passed in by contourIntegral below),
   *    which is the wrong shape of fix for "the sqrt(x) keyhole case under-converges" (see
   *    numericRealIntegral below, where that specific case actually lives): no single N is right
   *    for every f(z) a user can type, and plain Simpson has no real error estimate of its own —
   *    "coarse vs refined disagree" is a proxy, not a principled bound. gaussKronrod15 below is
   *    the actual textbook fix: the same G7/K15 embedded pair QUADPACK and every serious adaptive
   *    integrator (scipy.integrate.quad, MATLAB's integral, ...) use — 15 evaluations per
   *    subinterval give BOTH a 15th-order estimate and a genuine a-posteriori error bound (the
   *    gap between the 15-point and embedded 7-point estimate) in one pass, no extra "evaluate it
   *    twice to guess convergence" needed. adaptiveGK only recurses into subintervals whose error
   *    estimate exceeds budget, and returns null — never a silently under-converged number — if a
   *    subinterval still hasn't settled after a generous recursion budget, the same "refuse
   *    rather than guess" rule this file already uses for undefined samples.
   *
   *    The other half of the original bug was performance, not just the algorithm: the integrand
   *    called CalcCore.evalNum(exprStr, scope), which re-parses the expression through nerdamer
   *    on EVERY sample — so expensive that N had to be capped around 400 just to stay responsive,
   *    which is *why* a fixed N was ever tried in the first place. u and v are now compiled ONCE
   *    via CalcCore.compileFn (a math.js compiled expression, cheap to re-evaluate many times —
   *    the same technique fdPartials/cauchyRiemann's neighbourhood sampling already use elsewhere
   *    in this codebase) instead of re-parsed per sample. That removes the performance ceiling
   *    that made a small fixed N necessary, which is what makes adaptive refinement affordable. */

  // The 7-point Gauss / 15-point Kronrod embedded pair (QUADPACK's dqk15 constants — the same
  // table scipy/MATLAB/Boost ultimately trace back to). Listed for the non-negative abscissae
  // only (the rule is symmetric about 0); index 6 is the shared centre node (x=0). wg[i] is 0
  // wherever that Kronrod node is NOT also one of the 7 Gauss nodes.
  const GK_X = [0.9914553711208126, 0.9491079123427585, 0.8648644233597691, 0.7415311855993944,
    0.5860872354676911, 0.4058451513773972, 0.2077849550078985, 0.0];
  const GK_WK = [0.0229353220105292, 0.0630920926299786, 0.1047900103222502, 0.1406532597155259,
    0.1690047266392679, 0.1903505780647854, 0.2044329400752989, 0.2094821410847278];
  const GK_WG = [0, 0.1294849661688697, 0, 0.2797053914892767, 0, 0.3818300505051189, 0, 0.4179591836734694];

  // One Gauss-Kronrod pass over [a,b]: returns {value, error} (Kronrod's 15-point estimate, and
  // |Kronrod − embedded Gauss-7| as the error estimate) or null if any of the 15 samples is
  // non-finite (f undefined somewhere in this subinterval).
  function gaussKronrod15(f, a, b) {
    const c = (a + b) / 2, h = (b - a) / 2;
    let kronrod = 0, gauss = 0;
    const fc = f(c);
    if (!Number.isFinite(fc)) return null;
    kronrod += GK_WK[7] * fc;
    gauss += GK_WG[7] * fc;
    for (let i = 0; i < 7; i++) {
      const x = GK_X[i];
      const f1 = f(c - h * x), f2 = f(c + h * x);
      if (!Number.isFinite(f1) || !Number.isFinite(f2)) return null;
      kronrod += GK_WK[i] * (f1 + f2);
      if (GK_WG[i]) gauss += GK_WG[i] * (f1 + f2);
    }
    kronrod *= h; gauss *= h;
    return { value: kronrod, error: Math.abs(kronrod - gauss) };
  }

  // QUADPACK's own dual criterion (epsabs, epsrel): a pure absolute tolerance fails on a large-
  // magnitude integrand whose true value is small or zero (e.g. a residue-0 pole of order ≥2 —
  // the integrand runs ~1/radius² around the whole loop even though the total cancels to 0), and
  // a pure relative tolerance is undefined once the running estimate is itself ~0. Accepting a
  // subinterval when its error is within EITHER bound (scaled to that subinterval's own estimate)
  // is what actually makes this robust across both cases instead of just the common one.
  // 1e-7 (not tighter) is a deliberate floor, not a round number: a contour radius small enough
  // that the integrand runs ~1/radius² produces a genuine double-precision cancellation noise
  // floor around that scale once radius drops below ~0.01-ish — no quadrature rule fixes that,
  // only more precision would. contourIntegral's own REL_TOL=1e-3 gate is what this actually has
  // to be reliable against, so 1e-7 leaves 4 orders of margin without chasing unreachable digits.
  const GK_EPSABS = 1e-7;
  const GK_EPSREL = 1e-7;
  const GK_MAX_DEPTH = 40;

  // Adaptive Gauss-Kronrod: recurse into a subinterval only when its own error estimate exceeds
  // budget, splitting the absolute half of the budget between the two halves (the relative half
  // re-scales itself to each subinterval's own magnitude, so it isn't split). Returns null (never
  // a guessed number) if a subinterval's error estimate still exceeds budget after maxDepth
  // bisections — by far the more common way this fires is a genuine non-integrable point (a pole
  // sitting on or very near the contour), not a merely "hard" integrand.
  function adaptiveGKRec(f, a, b, epsabs, depth) {
    const pass = gaussKronrod15(f, a, b);
    if (!pass) return null;
    const tol = Math.max(epsabs, GK_EPSREL * Math.abs(pass.value));
    if (pass.error <= tol) return pass.value;
    if (depth <= 0) return null;
    const mid = (a + b) / 2;
    const left = adaptiveGKRec(f, a, mid, epsabs / 2, depth - 1);
    if (left === null) return null;
    const right = adaptiveGKRec(f, mid, b, epsabs / 2, depth - 1);
    if (right === null) return null;
    return left + right;
  }

  // f(t) real-valued on [a,b]. Returns a number, or null if f is undefined where it needs to
  // sample, or some region never converges within the recursion budget.
  function adaptiveGK(f, a, b, epsabs) {
    return adaptiveGKRec(f, a, b, epsabs || GK_EPSABS, GK_MAX_DEPTH);
  }
  ComplexResidues._adaptiveGK = adaptiveGK; // exposed for tests + the contour-theorems module

  // z(t) = center + r*e^{it}, dz/dt = i*r*e^{it}. Only circle contours parametrize this way
  // today; add a branch here alongside classify() if a rectangle contour is added.
  function circleParametrization(contour) {
    const Complex = getComplex();
    return {
      z: (t) => Complex.add(contour.center, Complex.fromPolar(contour.radius, t)),
      dz: (t) => Complex.mul({ re: 0, im: contour.radius }, Complex.fromPolar(1, t)),
      tRange: [0, 2 * Math.PI],
    };
  }

  // ComplexSymbolic.decompose recognises exp(z) as the entire function it has an identity
  // for, but not e^z / e^(...) — the power-node path only special-cases an integer power OF
  // z, not e as the base. Every other module on this site (SymPy, nerdamer) accepts either
  // notation; this rewrite exists purely so this module's numeric verifier does too, without
  // touching complex-symbolic.js's own parsing rules. Balanced-paren aware, so e^(z^2) doesn't
  // truncate at the first inner ")".
  function eCaretToExp(s) {
    let out = "", i = 0;
    while (i < s.length) {
      if (s[i] === "e" && s[i + 1] === "^" && !/[A-Za-z0-9_]/.test(s[i - 1] || "")) {
        i += 2;
        if (s[i] === "(") {
          let depth = 1, j = i + 1;
          while (j < s.length && depth > 0) { if (s[j] === "(") depth++; else if (s[j] === ")") depth--; j++; }
          out += "exp(" + s.slice(i + 1, j - 1) + ")";
          i = j;
        } else {
          const m = s.slice(i).match(/^[A-Za-z0-9_.]+/);
          const tok = m ? m[0] : s[i];
          out += "exp(" + tok + ")";
          i += tok.length;
        }
      } else {
        out += s[i]; i++;
      }
    }
    return out;
  }

  // Numerically integrates f(z) dz around the contour via adaptive Gauss-Kronrod (see header
  // above). Returns null (rather than a wrong number) if u/v can't be decomposed, can't be
  // compiled, or some part of the contour never converges — "inconclusive" beats a guess.
  function numericContourIntegral(fStr, contour) {
    const ComplexSymbolic = getComplexSymbolic();
    const CalcCore = getCalcCore();
    const Complex = getComplex();
    const decomposed = ComplexSymbolic.decompose(eCaretToExp(fStr));
    if (!decomposed.ok) return null;
    const { u, v } = decomposed;
    const uFn = CalcCore.compileFn(u), vFn = CalcCore.compileFn(v);
    if (!uFn || !vFn) return null;

    const param = contour.type === "circle" ? circleParametrization(contour) : null;
    if (!param) return null;
    const [t0, t1] = param.tRange;

    function integrand(t) {
      const z = param.z(t);
      let uVal, vVal;
      try {
        uVal = uFn.evaluate({ x: z.re, y: z.im });
        vVal = vFn.evaluate({ x: z.re, y: z.im });
      } catch (e) {
        return null;
      }
      if (!Number.isFinite(uVal) || !Number.isFinite(vVal)) return null;
      return Complex.mul({ re: uVal, im: vVal }, param.dz(t));
    }
    // adaptiveGK wants a real-valued f(t); NaN-out an undefined sample rather than throw, so
    // adaptiveGK's own finiteness checks are what catch it.
    function reOf(t) { const w = integrand(t); return w ? w.re : NaN; }
    function imOf(t) { const w = integrand(t); return w ? w.im : NaN; }

    // Gauss-Kronrod's own sample nodes are all strictly interior to [t0,t1] — a singularity
    // sitting exactly at the parametrization's own seam (t0, which for a circle is also z(t1),
    // e.g. a pole exactly at center+radius on the real axis) would otherwise never be sampled at
    // any recursion depth and could slip through as a false "converged" result. This is a cheap,
    // explicit check of the one point every circular parametrization starts and ends at; it does
    // NOT generalize to catching a singularity at an arbitrary interior point (adaptiveGK's own
    // error-driven recursion is what handles those — see its header for why that isn't perfect
    // either), only to this one structurally-special point.
    if (!Number.isFinite(reOf(t0)) || !Number.isFinite(imOf(t0))) return null;

    const re = adaptiveGK(reOf, t0, t1);
    if (re === null) return null;
    const im = adaptiveGK(imOf, t0, t1);
    if (im === null) return null;
    return { re, im };
  }
  ComplexResidues.numericContourIntegral = numericContourIntegral;

  /* ============================================================
   * 4. Public entry point — the actual "solve" function a Contour Integration page (or later,
   *    the ODE Engine's Laplace inversion) calls.
   * ============================================================ */

  const REL_TOL = 1e-3;

  ComplexResidues.contourIntegral = function (fStr, variable, contour) {
    return ComplexResidues.findSingularitiesWithResidues(fStr, variable).then((all) => {
      const Complex = getComplex();
      const classified = all.map((s) => Object.assign({}, s, { position: classify(s.location, contour) }));

      const onContour = classified.filter((s) => s.position === "on");
      if (onContour.length) {
        return {
          ok: false,
          reason: "A singularity of f(z) lies exactly on the given contour — the residue theorem doesn't apply here.",
        };
      }

      const inside = classified.filter((s) => s.position === "inside");
      let residueSum = { re: 0, im: 0 };
      for (const s of inside) residueSum = Complex.add(residueSum, s.residue);
      // 2*pi*i * (sum of residues inside)
      const predicted = Complex.mul({ re: 0, im: 2 * Math.PI }, residueSum);

      const numeric = numericContourIntegral(fStr, contour);
      if (!numeric) {
        return { ok: false, reason: "Couldn't independently verify this contour integral numerically — refusing to show an unconfirmed result." };
      }
      const scale = Math.max(1, Complex.abs(predicted));
      const agrees = Complex.abs(Complex.sub(predicted, numeric)) <= REL_TOL * scale;
      if (!agrees) {
        return { ok: false, reason: "The residue-theorem prediction did not match a direct numeric contour integration — refusing to show an unconfirmed result." };
      }

      return {
        ok: true,
        insideSingularities: inside,
        allSingularities: classified, // every found singularity, each tagged .position — for a page's plot/table, so it never needs a second SymPy round-trip
        value: predicted,
        numericCheck: numeric,
        verified: true,
      };
    });
  };

  /* ============================================================
   * 5. Laurent series — the other SymPy call this module wraps, same shared-module reasoning
   *    (series expansion around a singularity is how a residue is understood conceptually,
   *    even though _singularities_with_residues above doesn't need it computationally).
   * ============================================================ */

  ComplexResidues.laurentSeries = function (fStr, variable, pointStr, order) {
    const SympyClient = getSympyClient();
    if (!SympyClient) return Promise.reject(new Error("The advanced solver isn't available on this page."));
    return SympyClient.laurentSeries(fStr, variable, pointStr, order).then((out) => {
      // SymPy's str() output: Python "**" for power, a trailing "+ O(...)" big-O remainder
      // term that isn't evaluable, and "I" for the imaginary unit only when the coefficients
      // or point are complex.
      const withoutBigO = out.resultText.replace(/\s*\+\s*O\([^()]*\)\s*$/, "");
      const normalized = withoutBigO.replace(/\*\*/g, "^");
      return { ok: true, series: normalized };
    }).catch((err) => ({ ok: false, reason: err.message }));
  };

  /* ============================================================
   * 6. Singularity classification — limit-based (analytic / removable / pole of order m /
   *    essential), via the _classify_singularity SymPy op. Used by the Laurent & Singularities
   *    page. This is deliberately NOT derived from the Laurent series: sp.series leaves an
   *    essential singularity like e^{1/z} unexpanded and raises PoleError on sin(1/z), so a
   *    principal-part parse would misclassify both. The limit definitions are robust to that.
   * ============================================================ */

  ComplexResidues.classifySingularity = function (fStr, variable, pointStr) {
    const SympyClient = getSympyClient();
    if (!SympyClient) return Promise.reject(new Error("The advanced solver isn't available on this page."));
    return SympyClient.classifySingularity(fStr, variable, pointStr).then((out) => {
      const parsed = JSON.parse(out.resultText);
      return { ok: true, classification: parsed };
    }).catch((err) => ({ ok: false, reason: err.message }));
  };

  /* ============================================================
   * 7. Real integrals by residues — rational R(x) over (-∞,∞) or (0,∞), closed with an upper
   *    semicircle (sum the upper-half-plane residues × 2πi). Same verification discipline as
   *    contourIntegral: the SymPy residue answer is never shown on its own — it is independently
   *    checked by a direct numeric integration.
   *
   *    This used to be the tangent substitution x = tan(θ) (mapping the infinite domain to a
   *    finite (-π/2, π/2) one) plus a fixed-N=400 Simpson pass. That combination has a specific,
   *    known failure mode: sec²θ = 1+tan²θ grows without bound as θ → ±π/2, so ANY integrand
   *    that doesn't fall off faster than that growth right at the endpoint — the canonical case
   *    being an algebraic endpoint singularity like √x in a keyhole-contour integrand — turns
   *    into a transformed integrand that is itself unbounded-ish right at the domain edge, which
   *    plain Simpson (fixed-N or adaptive) only resolves at a slow polynomial rate no matter how
   *    much it bisects there. Measured: ∫_0^∞ √x/(x²+1) dx at the old fixed N=400 was 27% off
   *    the true π/√2 — comfortably past the module's own REL_TOL gate without tripping it.
   *
   *    The actual fix is a better transform, not a better Simpson: the double-exponential
   *    ("tanh-sinh") substitution below (Takahashi & Mori, 1974 — the same technique
   *    mpmath/Boost.Math use for exactly this class of integral) maps t ∈ (-∞,∞) to x via a
   *    doubly-exponential map whose Jacobian decays doubly-exponentially in t. That gives the
   *    trapezoidal rule (not Simpson — trapezoid is the textbook-optimal partner for a
   *    doubly-exponentially-decaying integrand) near-exponential convergence, INCLUDING at
   *    algebraic or logarithmic endpoint singularities, which is precisely the class of case the
   *    old tan-substitution + Simpson pairing could not resolve. Step-halving with a convergence
   *    check (rather than a fixed step count) is what makes this self-verifying rather than
   *    "hopefully enough points": each level either converges (accepted) or the next level is
   *    tried, up to a generous cap, past which it honestly refuses (null) rather than guessing.
   * ============================================================ */

  // t ∈ (-∞,∞) → x ∈ (-∞,∞): x = sinh(π/2 · sinh t), dx/dt = π/2 · cosh(t) · cosh(π/2 · sinh t).
  function deMapWhole(t) {
    const s = Math.sinh(t);
    const arg = (Math.PI / 2) * s;
    return { x: Math.sinh(arg), jac: (Math.PI / 2) * Math.cosh(t) * Math.cosh(arg) };
  }
  // t ∈ (-∞,∞) → x ∈ (0,∞): x = exp(π/2 · sinh t), dx/dt = π/2 · cosh(t) · exp(π/2 · sinh t).
  function deMapHalf(t) {
    const s = Math.sinh(t);
    const arg = (Math.PI / 2) * s;
    const x = Math.exp(arg);
    return { x, jac: (Math.PI / 2) * Math.cosh(t) * x };
  }

  // Practical-infinity cutoff: beyond here the map's own Jacobian is astronomically large
  // (heading toward float overflow around t≈7 for this particular map) — for any integrand that
  // is genuinely integrable at that end, its contribution there is genuinely ~0, so a term that
  // goes non-finite out here is treated as a vanishing tail, not a domain error. A term that goes
  // non-finite INSIDE this range is a real problem (e.g. a pole legitimately on the real axis)
  // and is treated as one (see fEval below).
  const DE_TAIL_T = 6.0; // outer cutoff: beyond here, non-finite samples are the map itself overflowing
  const DE_CORE_T = 4.0; // inner range: a non-finite sample in here is a genuine domain problem
  const DE_H0 = 1.0; // initial step; halved each level
  const DE_MAX_LEVELS = 12;
  const DE_CONVERGE_TOL = 1e-10;

  // One trapezoidal pass of the DE-transformed integral at step h, summing t = k·h for all k
  // with |k·h| <= DE_TAIL_T. Returns a number, or null if fEval is non-finite inside the "core"
  // range (a genuine domain problem, e.g. an unevaluable expression) rather than out in the tail
  // (where non-finite just means this particular sample is past where floats can represent the
  // transform, and the true contribution there is genuinely ~0 for any integrable f).
  function deTrapezoidPass(fEval, map, h) {
    let sum = 0;
    const kMax = Math.floor(DE_TAIL_T / h);
    const coreK = Math.floor(DE_CORE_T / h);
    for (let k = -kMax; k <= kMax; k++) {
      const t = k * h;
      const { x, jac } = map(t);
      if (!Number.isFinite(x) || !Number.isFinite(jac)) continue; // map itself overflowed — tail
      const fv = fEval(x);
      if (!Number.isFinite(fv)) {
        if (Math.abs(k) <= coreK) return null; // genuine domain problem, not a tail
        continue; // far enough out that this is a vanishing tail, not a domain error
      }
      sum += fv * jac;
    }
    return sum * h;
  }

  // Numerically integrate a real f(x) over an infinite/semi-infinite domain via the
  // double-exponential (tanh-sinh) transform, step-halving until two successive levels agree to
  // DE_CONVERGE_TOL (relative) or the level budget runs out. Returns null (not a wrong number) if
  // the integrand can't be compiled, hits a genuine domain problem, or never converges.
  function numericRealIntegral(fStr, variable, mode) {
    const CalcCore = getCalcCore();
    const fn = CalcCore.compileFn(fStr);
    if (!fn) return null;
    const map = mode === "whole" ? deMapWhole : deMapHalf;
    const scope = {};

    function fEval(x) {
      scope[variable] = x;
      let fv;
      try { fv = fn.evaluate(scope); } catch (e) { return NaN; }
      return Number.isFinite(fv) ? fv : NaN;
    }

    let prev = deTrapezoidPass(fEval, map, DE_H0);
    if (prev === null) return null;
    for (let level = 1; level <= DE_MAX_LEVELS; level++) {
      const h = DE_H0 / Math.pow(2, level);
      const cur = deTrapezoidPass(fEval, map, h);
      if (cur === null) return null;
      if (Math.abs(cur - prev) <= DE_CONVERGE_TOL * Math.max(1, Math.abs(cur))) return cur;
      prev = cur;
    }
    return null; // never settled within the level budget — honest refusal, not a guess
  }
  ComplexResidues.numericRealIntegral = numericRealIntegral;

  ComplexResidues.realIntegralByResidues = function (fStr, variable, mode) {
    const SympyClient = getSympyClient();
    if (!SympyClient) return Promise.reject(new Error("The advanced solver isn't available on this page."));
    return SympyClient.realIntegralByResidues(fStr, variable, mode).then((out) => {
      const data = JSON.parse(out.resultText);
      // The residue-theorem value of a real integral is real (imag ≈ 0); verify the real part
      // against the independent numeric integration.
      const predicted = data.value.re;
      const numeric = numericRealIntegral(fStr, variable, mode);
      if (numeric === null) {
        return { ok: false, reason: "Couldn't independently verify this real integral numerically — refusing to show an unconfirmed result." };
      }
      const scale = Math.max(1, Math.abs(predicted));
      if (Math.abs(predicted - numeric) > REL_TOL * scale) {
        return { ok: false, reason: "The residue-theorem prediction did not match a direct numeric integration — refusing to show an unconfirmed result." };
      }
      return {
        ok: true,
        mode: data.mode,
        value: data.value,
        valueExact: data.value_exact,
        poles: data.poles,
        numericCheck: numeric,
        verified: true,
      };
    }).catch((err) => ({ ok: false, reason: err.message }));
  };

  // Reused by complex-contour-theorems.js (the Cauchy integral formula + argument-principle /
  // Rouché module): the circle parametrization and the e^z → exp(z) notation normalizer are the
  // shared geometry/parsing primitives every contour-integral theorem on this engine wants, so
  // they are exposed here rather than duplicated in the dependent module.
  ComplexResidues.circleParametrization = circleParametrization;
  ComplexResidues.eCaretToExp = eCaretToExp;

  return ComplexResidues;
});
