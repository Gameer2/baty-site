"use strict";
/* L3 — Laurent expansion about a point (rational class). See docs/kernel/04_BUILD_PHASES.md
   Phase 4 task 2 (Laurent series) and docs/kernel/10_ENGINE_COMPLEX.md (residue/principal-part
   capability the Complex Analysis engine needs).

   laurent(expr, varName, center, order) -> { refused, result, derivation, poleOrder } where
     result = principal part (exact, finite negative powers of (varName - center))
            + analytic part (Taylor of the analytic remainder, truncated to `order`),
   so result is the Laurent polynomial of f about `center` through order `order` (non-negative
   powers up to x^order, plus the exact negative-power principal part).

   The Phase 3 layer makes this almost free: shifting u = varName - center, a rational function
   g(u) = f(u + center) is decomposed by partialFractions, and the principal part is EXACTLY the
   PFD terms over the factor `u` — `A_k / u^k` for k = 1..poleOrder — because `u` is degree 1 so
   each such numerator is a constant. The terms over the other (irreducible, q(0) != 0) factors
   are analytic at u = 0 and Taylor-expand via taylor.js. Pole order = multiplicity of `u` in the
   REDUCED denominator (after gcd cancellation), so removable singularities (u divides both num
   and den) are NOT reported as poles — they collapse to order 0 and delegate to Taylor.

   Honest refusals (same discipline as Phase 3):
   - Non-rational inputs about the point (e.g. exp(1/(x-a)) at a) -> refused as essential-
     singularity territory; the full essential-singularity series is deferred with the Gruntz
     follow-up (memory: Phase 4 foundation slice).
   - factorOverQ refusal (irreducible degree >= 3 needs Q(α)) -> refused naming that follow-up
     (memory: Phase 3 foundation slice).
   - Differentiation refusal from taylor.js on the analytic part propagates.

   Production wiring deferred — same kernel-vs-production boundary as Phases 1-3. Verified by
   principal-part exactness + partial-sum-vs-function on an annulus (numeric, independent numEval
   in the tests; docs/kernel/03_ARCHITECTURE.md §3 L4 — the kernel never verifies itself). */

const { Expr, Rational } = require("./expr");
const { Derivation } = require("./derivation");
const Poly = require("./polynomial");
const { gcd: polyGcd } = require("./poly-gcd");
const { factorOverQ, FactorRefusalError } = require("./factor-rat");
const { partialFractions } = require("./partial-fractions");
const { rfFromExpr, polyToExpr, rfToExpr } = require("./poly-of-expr");
const { taylor } = require("./taylor");

const ZERO = Rational.ZERO;
const ONE = Rational.ONE;
const U_FACTOR = [ZERO, ONE]; // the monic polynomial `u` (factor for a pole at u = 0)

// Coerce a center spec to a numeric Expr (mirrors taylor.js).
function centerToExpr(center) {
  if (Expr.isNumeric(center)) return center;
  if (center && typeof center === "object" && "num" in center && "den" in center) {
    return center.isInteger ? Expr.int(center.num) : Expr.rat(center.num, center.den);
  }
  if (typeof center === "number" || typeof center === "bigint") {
    const r = Rational.of(center, 1n);
    return r.isInteger ? Expr.int(r.num) : Expr.rat(r.num, r.den);
  }
  throw new TypeError("laurent: center must be a Rational, BigInt, number, or numeric Expr");
}

// Pick a shift-variable name not already free in `expr` so the substitution u = varName - center
// cannot collide with a real variable.
function freshShiftName(expr) {
  const free = Expr.freeSymbols(expr);
  let base = "u";
  let n = 0;
  while (free.has(base)) base = "u" + ++n;
  return base;
}

const RULE = {
  id: "kernel:laurent",
  name: "laurent",
  source: "kernel",
  describe: () => ({ text: "Laurent expansion via partial fractions + Taylor of the analytic part", latex: "" }),
};

// laurent(expr, varName, center, order, ctx?) ->
//   { refused, result, derivation, poleOrder } | { refused, reason }.
function laurent(expr, varName, center, order, ctx) {
  if (!Number.isInteger(order) || order < 0) {
    return { refused: true, reason: "laurent: order must be a non-negative integer" };
  }
  const centerExpr = centerToExpr(center);
  const centerRat = Expr.isNumeric(centerExpr) ? Expr.numericValue(centerExpr) : null;
  if (centerRat === null) {
    return { refused: true, reason: "laurent: symbolic centers are not supported in this slice (rational centers only)" };
  }
  const uName = freshShiftName(expr);
  const uSym = Expr.sym(uName);
  // g(u) = f(u + center): substitute varName -> (u + center).
  const shiftedExpr = Expr.subst(expr, varName, Expr.add(uSym, centerExpr));

  // Express g(u) as a rational function of u.
  const rf = rfFromExpr(shiftedExpr, uName);
  if (rf === null) {
    return {
      refused: true,
      reason: "laurent: input is not a rational function of (" + varName + " - center) about the point; essential-singularity / transcendental composition needs the full series machinery (deferred with Gruntz)",
    };
  }
  let num = rf.num;
  let den = rf.den;
  if (Poly.isZero(den)) {
    return { refused: true, reason: "laurent: zero denominator after shifting" };
  }

  // Reduce by gcd so removable singularities (u | num and u | den) collapse to order 0.
  const g = polyGcd(num, den);
  if (!Poly.isOne(g) && !Poly.isConstant(g)) {
    num = Poly.divExact(num, g);
    den = Poly.divExact(den, g);
  }

  // Factor the reduced denominator over Q.
  let factored;
  try {
    factored = factorOverQ(den);
  } catch (e) {
    if (e instanceof FactorRefusalError) {
      return { refused: true, reason: "laurent: " + e.message + " (factorization over Q(α) deferred — Phase 3 task 5b follow-up)" };
    }
    throw e;
  }

  // Pole order = multiplicity of the factor `u` in the reduced denominator.
  let poleOrder = 0;
  for (const f of factored.factors) {
    if (Poly.equals(f.factor, U_FACTOR)) poleOrder = f.mult;
  }

  // Always partial-fraction decompose the REDUCED fraction. This handles both the pole case
  // (principal part from the u-factor terms) and the analytic case (poleOrder 0, e.g. a
  // removable singularity collapsed by gcd, or an analytic-at-the-center rational function)
  // without ever substituting into an unreduced (x - center)^(-k) form — which taylor() on the
  // raw expression would do and crash on. The reduced denominator has no `u` factor, so the
  // analytic remainder is genuinely analytic at u = 0 and Taylor-expands cleanly.
  let pfd;
  try {
    pfd = partialFractions(num, den, factored.factors, factored.content);
  } catch (e) {
    return { refused: true, reason: "laurent: partial-fraction decomposition failed: " + (e && e.message) };
  }

  // Build the principal part (exact, in terms of the basis (varName - center)) and collect the
  // analytic remainder as an Expr in `uName` for Taylor expansion.
  const basis = Expr.sub(Expr.sym(varName), centerExpr); // (varName - center) == u
  const principalTerms = [];
  const analyticTerms = [];
  // Polynomial part of the PFD is analytic (a polynomial in u).
  if (!Poly.isZero(pfd.polyPart)) analyticTerms.push(polyToExpr(pfd.polyPart, uName));
  for (const term of pfd.terms) {
    if (Poly.equals(term.factor, U_FACTOR)) {
      // term.num is a constant (deg < deg u = 1) -> A / u^mult.
      const A = term.num.length ? term.num[0] : ZERO;
      if (A.isZero) continue;
      const AExpr = A.isInteger ? Expr.int(A.num) : Expr.rat(A.num, A.den);
      principalTerms.push(Expr.mul(AExpr, Expr.pow(basis, Expr.int(-BigInt(term.mult)))));
    } else {
      // analytic at u = 0: num / factor^mult, a rational function of u.
      const factorPow = Poly.pow(term.factor, term.mult);
      analyticTerms.push(rfToExpr(term.num, factorPow, uName));
    }
  }

  // Taylor-expand the analytic remainder about u = 0 to `order`.
  let analyticInBasis;
  if (analyticTerms.length === 0) {
    analyticInBasis = Expr.ZERO;
  } else {
    const analyticExpr = Expr.add(...analyticTerms);
    const t = taylor(analyticExpr, uName, 0, order, ctx);
    if (t.refused) return { refused: true, reason: "laurent: analytic-part Taylor failed: " + t.reason };
    // Re-express the analytic polynomial (in uName) in the basis (varName - center): uName == basis.
    analyticInBasis = Expr.subst(t.result, uName, basis);
  }

  const allTerms = principalTerms.length ? principalTerms.concat([analyticInBasis]) : [analyticInBasis];
  const result = Expr.add(...allTerms);
  const derivation = Derivation.step(RULE, {}, expr, result, ctx || null, []);
  return { refused: false, result, derivation, poleOrder };
}

module.exports = { laurent };