"use strict";
/* L3 — Resultant. See docs/kernel/04_BUILD_PHASES.md Phase 3 task 4.

   The resultant of A, B in Q[x] is zero iff A and B share a root. It is the determinant of the
   Sylvester matrix, but computing that determinant directly invites fraction swell; instead
   this module uses the Euclidean resultant recurrence, which is the field-theoretic reduction:

     For deg A >= deg B > 0, with R = A mod B and dr = deg R:
       res(A, B) = (-1)^(degA * degB) * lc(B)^(degA - dr) * res(B, R)
     Base cases:
       res(A, b) = b^degA          (b a nonzero constant)
       res(A, 0) = 0               (a common root vacuously, deg B = -inf)
       res(A, B) with R == 0 = 0   (B divides A, so they share a root when deg B > 0)

   This recurrence is exact and is the same machinery the GCD PRS uses (docs/kernel/04
   Phase 3 task 2). It is verified against an INDEPENDENT Sylvester-matrix determinant computed
   from scratch in the property suite (tests/verify-poly-properties.js) — not via this module —
   so a sign or exponent error here fails the test, not the answer (docs/kernel/03 L4). */

const Poly = require("./polynomial");
const { Rational } = require("./rational");

const ZERO = Rational.ZERO;
const ONE = Rational.ONE;

// Integer power of a Rational (small helper; Poly.pow is for polynomials).
function ratPow(base, n) {
  if (n <= 0) return ONE;
  let result = ONE;
  let b = base;
  while (n > 0) {
    if (n & 1) result = result.mul(b);
    n >>>= 1;
    if (n) b = b.mul(b);
  }
  return result;
}

// sign(n) for integer n: (-1)^n as a Rational.
function paritySign(n) {
  return (n & 1) ? Rational.MINUS_ONE : ONE;
}

// res(A, B) over Q[x]. Assumes both are polynomials (Rational[]). Returns a Rational.
function resultant(A, B) {
  // Normalise ordering: deg A >= deg B.
  const dA = Poly.degree(A);
  const dB = Poly.degree(B);
  if (dA < dB) {
    // res(A,B) = (-1)^(degA*degB) * res(B,A); only the parity of degA*degB matters.
    return paritySign((dA * dB) & 1 ? 1 : 0).mul(resultant(B, A));
  }
  if (Poly.isZero(B)) return ZERO; // res(A, 0) = 0
  if (dB === 0) {
    // res(A, b) = b^degA  (b = lc(B), a nonzero constant)
    return ratPow(Poly.lc(B), dA < 0 ? 0 : dA);
  }
  // dB >= 1, dA >= dB
  const { r } = Poly.divRem(A, B);
  const dr = Poly.degree(r);
  if (Poly.isZero(r)) return ZERO; // B | A -> shared root
  const sign = paritySign(((dA * dB) & 1) ? 1 : 0);
  const factor = ratPow(Poly.lc(B), dA - dr);
  return sign.mul(factor).mul(resultant(B, r));
}

// Discriminant of a univariate polynomial f (monic or not): disc(f) = (-1)^(n(n-1)/2) *
// res(f, f') / lc(f), for n = deg f >= 1. Returns a Rational, or null if deg f < 1.
function discriminant(f) {
  const n = Poly.degree(f);
  if (n < 1) return null;
  const fp = Poly.derivative(f);
  const res = resultant(f, fp);
  // (-1)^(n(n-1)/2)
  const k = (n * (n - 1)) / 2;
  const sign = (k & 1) ? Rational.MINUS_ONE : ONE;
  const lc = Poly.lc(f);
  return sign.mul(res).div(lc);
}

module.exports = { resultant, discriminant, ratPow };