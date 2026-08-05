/* Complex arithmetic — pure, DOM-free, dependency-free. The shared foundation for the
   Complex Analysis engine.

   Promoted and extended from the private `cx` helper that lived inside linalg-algorithms.js
   (add/sub/mul/div/abs, "enough for polynomial roots"). Everything here operates on plain
   {re, im} objects — the same shape LinAlg.polynomialRoots already returns — so complex roots,
   eigenvalues, and these helpers all interoperate without conversion.

   No nerdamer, no math.js, no DOM: this is exact floating-point complex arithmetic and nothing
   else, so it is trivially Node-testable and safe to run on the main thread. This module is
   what every method page shares for that. Two other math layers sit alongside it, each used
   where it's the right tool: domain colouring (per-pixel f(z), pole/zero visuals) is
   deliberately NUMERIC — a compiled math.js expression evaluated at each pixel, no CAS
   involved, see domain-coloring.js's own header. Analyticity/Cauchy-Riemann, harmonic
   conjugates, and (later) residues are SYMBOLIC — exact nerdamer expressions produced and
   verified in complex-symbolic.js on top of the CAS worker, the same "exact answer + numeric
   verify gate" discipline calculus-symbolic.js established for the Calculus engine. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.Complex = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const Complex = {};

  // Constructor / normaliser. Accepts a real number, {re,im}, or (re, im).
  function C(re, im) {
    if (typeof re === "object" && re !== null) return { re: re.re || 0, im: re.im || 0 };
    return { re: re || 0, im: im || 0 };
  }
  Complex.C = C;

  Complex.add = (a, b) => ({ re: a.re + b.re, im: a.im + b.im });
  Complex.sub = (a, b) => ({ re: a.re - b.re, im: a.im - b.im });
  Complex.mul = (a, b) => ({ re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re });
  Complex.div = (a, b) => {
    const d = b.re * b.re + b.im * b.im;
    if (d === 0) throw new Error("Complex division by zero.");
    return { re: (a.re * b.re + a.im * b.im) / d, im: (a.im * b.re - a.re * b.im) / d };
  };
  Complex.neg = (a) => ({ re: -a.re, im: -a.im });
  Complex.conj = (a) => ({ re: a.re, im: -a.im });
  Complex.scale = (a, k) => ({ re: a.re * k, im: a.im * k });

  // Modulus |z| and principal argument arg(z) ∈ (-π, π] (Math.atan2's range).
  Complex.abs = (a) => Math.hypot(a.re, a.im);
  Complex.arg = (a) => Math.atan2(a.im, a.re);

  // Polar <-> rectangular. toPolar returns { r, theta } with theta the principal argument.
  Complex.fromPolar = (r, theta) => ({ re: r * Math.cos(theta), im: r * Math.sin(theta) });
  Complex.toPolar = (a) => ({ r: Complex.abs(a), theta: Complex.arg(a) });

  // e^z = e^{re}·(cos(im) + i·sin(im)).
  Complex.exp = (a) => {
    const e = Math.exp(a.re);
    return { re: e * Math.cos(a.im), im: e * Math.sin(a.im) };
  };

  // Principal complex logarithm: ln|z| + i·arg(z). Branch cut on the negative real axis
  // (arg ∈ (-π, π]); this is the principal branch and callers that need another must say so.
  Complex.log = (a) => {
    const r = Complex.abs(a);
    if (r === 0) throw new Error("log(0) is undefined.");
    return { re: Math.log(r), im: Complex.arg(a) };
  };

  /* Integer power via De Moivre's theorem: z^n = r^n·(cos(nθ) + i·sin(nθ)). Exact for the
     angle multiple, and the visual core of method #1 — a point at angle θ lands at angle nθ,
     |z| away scaled to r^n. Handles negative n by reciprocal. */
  Complex.powInt = (a, n) => {
    if (!Number.isInteger(n)) throw new Error("powInt exponent must be an integer; use nthRoots for fractional powers.");
    if (n === 0) return { re: 1, im: 0 };
    const { r, theta } = Complex.toPolar(a);
    if (r === 0) return { re: 0, im: 0 };
    const rn = Math.pow(r, n);
    return { re: rn * Math.cos(n * theta), im: rn * Math.sin(n * theta) };
  };

  /* The n distinct nth roots of z: r^{1/n}·exp(i·(θ + 2πk)/n), k = 0..n-1. Returned in
     increasing-angle order starting from the principal root (k = 0). For z = 1 these are the
     nth roots of unity — the regular n-gon on the unit circle that method #1 draws. */
  Complex.nthRoots = (a, n) => {
    if (!Number.isInteger(n) || n < 1) throw new Error("nthRoots needs a positive integer n.");
    const { r, theta } = Complex.toPolar(a);
    const rootR = Math.pow(r, 1 / n);
    const roots = [];
    for (let k = 0; k < n; k++) {
      const ang = (theta + 2 * Math.PI * k) / n;
      roots.push({ re: rootR * Math.cos(ang), im: rootR * Math.sin(ang) });
    }
    return roots;
  };

  // The n nth roots of unity (regular n-gon on the unit circle from 1).
  Complex.rootsOfUnity = (n) => Complex.nthRoots({ re: 1, im: 0 }, n);

  /* The kth branch of log: log(a) + 2πik. k=0 is Complex.log's principal value (Arg ∈ (−π, π]);
     every other integer k is an equally valid logarithm (e^(that value) = a), differing only by
     a full turn. This is what "log is multivalued" means concretely — see method #5. */
  Complex.logBranch = (a, k) => {
    const L = Complex.log(a);
    return { re: L.re, im: L.im + 2 * Math.PI * k };
  };

  /* The kth branch of z^w for general (possibly non-integer, possibly complex) w:
     exp(w·(log(a) + 2πik)), i.e. z^w picking the kth logarithm before exponentiating. k=0 is
     the principal branch (Complex.pow below). For w = 1/n this reproduces Complex.nthRoots(a,n)
     exactly for k = 0..n-1 (verified in tests/verify-complex.js) — nth roots ARE branches of a
     fractional power, not a separate concept. For integer w every branch collapses to the same
     value (2πik·w is a multiple of 2πi), which is exactly why integer powers need no branch at
     all — also verified. */
  Complex.powBranch = (a, w, k) => Complex.exp(Complex.mul(w, Complex.logBranch(a, k)));

  /* Principal branch of z^w — Complex.powBranch's k=0 case, exp(w·log(a)) with log's principal
     value. This is what the `^` operator means for non-integer/complex exponents; a naive
     implementation that picks a different branch silently is wrong by a factor of e^(2πikw),
     not just "a different but equally valid answer" once w is irrational or complex (see
     method #5's branch-cut page). */
  Complex.pow = (a, w) => Complex.powBranch(a, w, 0);

  // Approximate equality, for tests and for merging numerically-coincident roots.
  Complex.equals = (a, b, tol = 1e-9) => Math.abs(a.re - b.re) <= tol && Math.abs(a.im - b.im) <= tol;

  /* Display helper: "a + bi", "a - bi", "bi", "a", tidied to `prec` significant-ish digits.
     Kept here rather than in the page layer because tests and every method page format the
     same way, and the rules (drop a zero part, drop a unit coefficient) are fiddly enough to
     be worth writing once. */
  Complex.format = (a, prec = 4) => {
    const round = (x) => {
      const r = Number(x.toFixed(prec));
      return Object.is(r, -0) ? 0 : r;
    };
    const re = round(a.re);
    const im = round(a.im);
    if (im === 0) return String(re);
    const imAbs = Math.abs(im);
    const imPart = (imAbs === 1 ? "" : String(imAbs)) + "i";
    if (re === 0) return (im < 0 ? "-" : "") + imPart;
    return `${re} ${im < 0 ? "-" : "+"} ${imPart}`;
  };

  return Complex;
});
