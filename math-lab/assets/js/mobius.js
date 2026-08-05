/* Möbius (bilinear) transformation analysis — a pure, DOM-free core for the Complex Engine's
   Conformal / Möbius Mapping page. Reused Complex.js arithmetic only; no CAS, no SymPy worker —
   Möbius geometry is closed-form algebra, so the page doesn't need a symbolic backend or its
   lazy-load. UMD so the browser page and the Node test harness (tests/verify-mobius.js) consume
   the same implementation.

   Convention for the extended plane: a value of null from apply() means the image is ∞
   (denominator zero). analyze() returns the fixed points (finite ones, plus a flag when ∞ is
   fixed), the pole (the finite point mapping to ∞, when c ≠ 0), the classification, the
   multiplier k, and a re-substitution verification that each fixed point actually fixes — that
   re-substitution is this method's independent check, the Möbius analogue of the numeric
   verify gate the residue pages use. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(require("./complex.js"));
  } else {
    root.Mobius = factory(root.Complex);
  }
})(typeof self !== "undefined" ? self : this, function (Complex) {
  "use strict";

  const TOL = 1e-9;
  const HALF = { re: 0.5, im: 0 };
  const ZERO = { re: 0, im: 0 };

  function isZero(z) { return Complex.abs(z) <= TOL; }
  function cAdd(a, b) { return Complex.add(a, b); }
  function cSub(a, b) { return Complex.sub(a, b); }
  function cMul(a, b) { return Complex.mul(a, b); }
  function cDiv(a, b) { return Complex.div(a, b); }
  function cNeg(a) { return Complex.neg(a); }
  function cSqrt(a) { return Complex.pow(a, HALF); } // principal branch (pow uses logBranch k=0)
  function cScale(a, k) { return Complex.scale(a, k); }
  function fmt(z) {
    if (!z) return "∞";
    const re = Math.abs(z.re) < 1e-9 ? 0 : z.re;
    const im = Math.abs(z.im) < 1e-9 ? 0 : z.im;
    if (re === 0 && im === 0) return "0";
    if (im === 0) return String(+re.toFixed(6));
    if (re === 0) return String(+im.toFixed(6)) + "i";
    return String(+re.toFixed(6)) + (im >= 0 ? " + " : " − ") + String(+Math.abs(im).toFixed(6)) + "i";
  }

  // w(z) = (a z + b)/(c z + d). Returns null when the denominator is 0 (the image is ∞).
  function apply(T, z) {
    const num = cAdd(cMul(T.a, z), T.b);
    const den = cAdd(cMul(T.c, z), T.d);
    if (isZero(den)) return null;
    return cDiv(num, den);
  }

  // Fixed points of w(z) = (az+b)/(cz+d): solve c z² + (d−a) z − b = 0 in the extended plane.
  // Returns { points: [z, ...] (finite), infinityFixed: bool, parabolic: bool }.
  function fixedPoints(a, b, c, d) {
    const A = c;
    const B = cSub(d, a);
    const C = cNeg(b);
    const pts = [];
    let infinityFixed = false;
    if (isZero(A)) {
      // affine: w(z) = (a z + b)/d. ∞ is fixed (c = 0 ⇒ w(∞) = ∞). Finite fixed point solves
      // (d−a) z − b = 0; if d = a that's the translation case (only ∞ fixed, parabolic).
      infinityFixed = true;
      if (!isZero(B)) pts.push(cDiv(cNeg(C), B)); // b/(d−a)
    } else {
      const disc = cSub(cMul(B, B), cScale(cMul(A, C), 4)); // B² − 4AC
      const s = cSqrt(disc);
      pts.push(cDiv(cSub(cNeg(B), s), cScale(A, 2))); // (−B − s)/(2A)
      pts.push(cDiv(cAdd(cNeg(B), s), cScale(A, 2)));  // (−B + s)/(2A)
    }
    return { points: pts, infinityFixed };
  }

  function classify(a, b, c, d) {
    const det = cSub(cMul(a, d), cMul(b, c)); // ad − bc
    if (isZero(det)) return { ok: false, reason: "ad − bc = 0: these coefficients are degenerate, not a Möbius transformation." };

    const trace = cAdd(a, d); // a + d
    const traceSq = cMul(trace, trace);
    const parabolic = Math.abs(Complex.abs(cSub(traceSq, cScale(det, 4)))) < 1e-7 * Math.max(1, Complex.abs(det));

    // Identity special case (a=d, b=c=0): every point is fixed — report it honestly rather than
    // "parabolic", which the trace²=4det test would otherwise label it.
    if (isZero(b) && isZero(c) && Math.abs(a.re - d.re) < TOL && Math.abs(a.im - d.im) < TOL) {
      return { ok: true, classification: "identity", fixed: { points: [], infinityFixed: true, allFixed: true },
        pole: null, k: { re: 1, im: 0 }, images: imagesOf(a, b, c, d), verified: true };
    }

    const fx = fixedPoints(a, b, c, d);
    const pole = isZero(c) ? null : cDiv(cNeg(d), c); // −d/c (maps to ∞); null when c=0 (affine, ∞→∞)

    let k = null;
    if (fx.points.length) {
      // multiplier = w'(finite fixed point) = det / (c·ξ + d)²
      const xi = fx.points[0];
      const cd = cAdd(cMul(c, xi), d);
      if (!isZero(cd)) k = cDiv(det, cMul(cd, cd));
    } else if (isZero(c)) {
      // affine with a = d (translation): multiplier at ∞ is 1 ⇒ parabolic
      k = { re: 1, im: 0 };
    }

    let classification;
    if (parabolic) {
      classification = "parabolic";
    } else if (k) {
      const absK = Complex.abs(k);
      const onUnitCircle = Math.abs(absK - 1) < 1e-6;
      const rePos = Math.abs(k.im) < 1e-6 && k.re > 0;
      if (onUnitCircle) classification = "elliptic";
      else if (rePos) classification = "hyperbolic";
      else classification = "loxodromic";
    } else {
      classification = "parabolic";
    }

    // Independent re-substitution check: each finite fixed point must actually be fixed, and the
    // pole must actually zero the denominator. This is the method's verify gate.
    const T = { a, b, c, d };
    let verified = true;
    for (const xi of fx.points) {
      const w = apply(T, xi);
      if (w === null || !Complex.equals(w, xi, 1e-6)) verified = false;
    }
    if (pole !== null) {
      const den = cAdd(cMul(c, pole), d);
      if (!isZero(den)) verified = false;
    }

    return {
      ok: true,
      classification,
      fixed: fx,
      pole,
      k,
      images: imagesOf(a, b, c, d),
      verified,
    };
  }

  // Standard probe images: w(0), w(1), w(∞). Each is null when the image is ∞.
  function imagesOf(a, b, c, d) {
    const T = { a, b, c, d };
    return {
      w0: apply(T, ZERO),
      w1: apply(T, { re: 1, im: 0 }),
      wInf: isZero(c) ? null : cDiv(a, c), // a/c when c≠0; ∞ when c=0
    };
  }

  return { apply, classify, fixedPoints, fmt, cAdd, cSub, cMul, cDiv, isZero };
});