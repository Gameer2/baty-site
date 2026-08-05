"use strict";
/* L3 — Square-free factorization. See docs/kernel/04_BUILD_PHASES.md Phase 3 task 3.

   Yun's algorithm (characteristic 0). Given f, it produces the unique decomposition
   f = content * ∏ f_i^i where each f_i is square-free, monic, and pairwise coprime, and the
   f_i with multiplicity i collects exactly the irreducible factors of f that occur with that
   multiplicity. Over Q (char 0) this is exact and terminating.

   Why square-free first: every factorization algorithm over Q (Phase 3 task 5) and the partial-
   fraction decomposition (task 6) factor a SQUARE-FREE polynomial into distinct irreducibles,
   then re-attach multiplicities. Factoring a non-square-free polynomial directly is both slower
   and harder to make correct; Yun cleanly separates the "how many times does each factor
   appear" question (which it answers) from the "what are the distinct factors" question (which
   Cantor-Zassenhaus answers), exactly the separation the literature uses. */

const Poly = require("./polynomial");
const { gcd } = require("./poly-gcd");
const { Rational } = require("./rational");

const ZERO = Rational.ZERO;
const ONE = Rational.ONE;

// squarefree(f) -> { content: Rational, factors: [{ factor: Rational[] (monic), mult: number }] }
//   content is lc(f); the returned monic factors satisfy f = content * ∏ factor^mult.
function squarefree(f) {
  if (Poly.isZero(f)) return { content: ZERO, factors: [] };
  if (Poly.isConstant(f)) return { content: Poly.lc(f), factors: [] };

  const content = Poly.lc(f);
  // Run Yun on monic(f) so every internal gcd/b' is on a monic poly (gcd is monic anyway, but
  // working monic keeps coefficients modest and the content separate from the structure).
  let b = Poly.monic(f);
  const bp = Poly.derivative(b);

  // If f is square-free, gcd(f, f') is constant and Yun degenerates to a single factor.
  let a = gcd(b, bp);
  if (Poly.isConstant(a)) {
    return { content, factors: [{ factor: b, mult: 1 }] };
  }

  let c = Poly.divExact(b, a); // = f / gcd(f, f') ; runs of multiplicities stripped once
  let d = Poly.sub(Poly.divExact(bp, a), Poly.derivative(c)); // d_1 = f'/g - c_1'
  let i = 1;
  const factors = [];
  while (!Poly.isConstant(c)) {
    const g = gcd(c, d); // square-free factor of multiplicity i (monic)
    if (!Poly.isConstant(g)) factors.push({ factor: g, mult: i });
    c = Poly.divExact(c, g);
    d = Poly.sub(Poly.divExact(d, g), Poly.derivative(c));
    i++;
  }
  return { content, factors };
}

module.exports = { squarefree };