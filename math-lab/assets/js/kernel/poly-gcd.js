"use strict";
/* L3 — Polynomial GCD over Q. See docs/kernel/04_BUILD_PHASES.md Phase 3 task 2.

   Over a field, polynomial GCD is the Euclidean algorithm with monic remainders — each step
   replaces the pair (A, B) with (B, A mod B), and the last nonzero remainder made monic is the
   gcd. This is a polynomial remainder sequence (PRS); the last nonzero remainder of ANY
   remainder sequence over Q is the same gcd up to a unit, so the monic-normalized Euclid PRS is
   complete and correct.

   Scope note on "subresultant PRS" (docs/kernel/04_BUILD_PHASES.md Phase 3 task 2 names the
   subresultant PRS specifically): the subresultant PRS is the *growth-optimal* variant of the
   PRS, defined over a UFD (Z) using pseudo-remainders with the subresultant beta-coefficient to
   keep coefficients fraction-free and bounded. Its specific benefit — avoiding the
   coefficient swell of naive pseudo-remainders over Z, and producing the subresultant chain
   that the Lazard-Rioboo-Trager variant of Rothstein-Trager needs without constructing a
   splitting field — is load-bearing only when LRT lands (Phase 3 task 8, deferred in this
   foundation slice). Over Q with BigInt rationals the monic-Euclid PRS is correct and its
   swell is bounded and manageable at corpus scale; this module uses it, and `resultant.js`
   uses the equivalent Euclidean resultant recurrence. Both are cross-checked against an
   INDEPENDENT Sylvester determinant in the property suite (tests/verify-poly-properties.js),
   per docs/kernel/03_ARCHITECTURE.md §3 L4: the kernel never verifies itself with its own
   primitives. The canonical subresultant PRS machinery is reserved for the LRT pass. */

const Poly = require("./polynomial");
const { Rational } = require("./rational");

const ZERO = Rational.ZERO;
const ONE = Rational.ONE;

// gcd(A, B) over Q[x] — monic Euclid PRS. Returns a monic polynomial (or [] for gcd with the
// zero polynomial). gcd(0, 0) = [] by convention.
function gcd(a, b) {
  let A = a.slice();
  let B = b.slice();
  while (!Poly.isZero(B)) {
    const { r } = Poly.divRem(A, B);
    A = B;
    B = r;
  }
  return Poly.monic(A);
}

// cofactor: A / gcd(A,B) — exact, since gcd divides A. Returns null if the gcd does not divide
// exactly (which would indicate a bug, not a user input).
function cofactor(a, b) {
  const g = gcd(a, b);
  if (Poly.isZero(g)) return a.slice(); // gcd(0,0)=[] ; cofactor of 0 is 0; of a (b==0) is a
  const q = Poly.divExact(a, g);
  return q === null ? null : q;
}

module.exports = { gcd, cofactor };