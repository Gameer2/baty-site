"use strict";
/* L3 — Rational integration over Q (foundation slice). See docs/kernel/04_BUILD_PHASES.md
   Phase 3 tasks 6 & 9 (kernel-level), and docs/kernel/08_ENGINE_CALCULUS.md §3 step 2.

   ∫ P(x)/Q(x) dx for P, Q in Q[x], where Q factors over Q into monic irreducible factors of
   degree 1 and 2 (linear and irreducible-quadratic, EITHER sign of discriminant), including
   repeated factors. This is the class of rational functions this route makes PROVABLY closed:
   every such integrand has a correct antiderivative expressible in polynomials, logs, and
   arctangents/logs-of-radicals.

   Algorithm (the factorization-driven route, which needs no Hermite reduction because the
   denominator is fully factored):
     1. Reduce P/Q to lowest terms (cancel gcd).
     2. If deg Q = 0: integrate the polynomial P directly.
     3. Factor Q over Q (factor-rat.js) and decompose into partial fractions (task 6).
     4. Integrate term by term:
        - polynomial part: Σ c_i x^i -> Σ c_i/(i+1) x^(i+1).
        - A/(x-r)^k : k=1 -> A ln(x-r); k>1 -> A/(1-k) (x-r)^(1-k).
        - (a₁x+a₀)/q^k, q=x²+bx+c irreducible, Δ = c-b²/4 ≠ 0 (Δ=0 is structurally impossible
          for a genuinely irreducible-over-Q quadratic — it would mean a rational double root,
          which factorOverQ's rational-root stripping already rules out): split
          a₁x+a₀ = (a₁/2) q' + (a₀ - a₁b/2); q'/q^k -> k=1: (a₁/2) ln q; k>1: (a₁/2)/(1-k) q^(1-k).
          1/q^k -> base case I_1 depends on the sign of Δ (Δ>0: arctan; Δ<0: log of a radical
          ratio, via completing the square u²-D, D=-Δ>0 — see integrateInverseQuadraticPower);
          k>1 uses the same reduction I_k = u/(2(k-1)Δ q^(k-1)) + (2k-3)/(2(k-1)Δ) I_(k-1) for
          both signs, since its derivation (integration by parts) never uses sign(Δ).

   Scope boundary, stated honestly (same discipline as factor-rat.js / the narrow rulesets): an
   irreducible factor of degree >= 3 over Q (e.g. a factor of x^4+1, or x^3-2) is REFUSED with
   a reason naming Rothstein-Trager over Q(α) (Phase 3 tasks 5b & 8). Those factors need the
   log-coefficients-live-in-Q(α) machinery the docs flag as load-bearing for the "provably
   closed" claim over ALL rational functions; this route closes the linear+quadratic-irreducible
   class (both discriminant signs) honestly rather than silently producing a wrong or truncated
   answer for the degree-3+ case, which genuinely needs it.

   Production wiring: this module is called from assets/js/integration-advanced.js's
   autoIntegrate() via assets/js/kernel/bridge.js's integrateRationalText(), ahead of the older
   nerdamer-based partial-fractions technique (docs/kernel/04_BUILD_PHASES.md Phase 2 "Production
   integration"; memory: kernel<->production gap). This module is exercised by tests/verify-poly.js
   and the property suite, which verify it by NUMERIC finite-difference differentiation back to
   the integrand — independent of the symbolic integration machinery
   (docs/kernel/03_ARCHITECTURE.md §3 L4). */

const Poly = require("./polynomial");
const { Rational } = require("./rational");
const { gcd } = require("./poly-gcd");
const { factorOverQ, FactorRefusalError } = require("./factor-rat");
const { partialFractions } = require("./partial-fractions");
const { polyToExpr } = require("./poly-of-expr");
const { Expr } = require("./expr");
const { Derivation } = require("./derivation");

const ZERO = Rational.ZERO;
const ONE = Rational.ONE;
const TWO = Rational.of(2n, 1n);

function constRat(r) {
  return r.isInteger ? Expr.int(r.num) : Expr.rat(r.num, r.den);
}
function ratInt(n) { return Expr.int(BigInt(n)); }

// Integrate the polynomial part: Σ c_i x^i -> Σ c_i/(i+1) x^(i+1). Returns an Expr (or ZERO).
function integratePolynomial(coeffs, varName) {
  const sym = Expr.sym(varName);
  const terms = [];
  for (let i = 0; i < coeffs.length; i++) {
    const c = coeffs[i];
    if (c.isZero) continue;
    const coef = c.div(Rational.of(i + 1, 1));
    const coefExpr = constRat(coef);
    const xp = Expr.pow(sym, ratInt(i + 1));
    terms.push(coef.isOne ? xp : Expr.mul(coefExpr, xp));
  }
  if (!terms.length) return Expr.ZERO;
  return Expr.add(...terms);
}

// Linear factor q = [−r, 1] (monic), root r = −q[0]. Integrate A/(x−r)^k, A constant.
function integrateLinearTerm(A, q, k, varName) {
  const sym = Expr.sym(varName);
  const r = q[0].neg(); // root
  const base = Expr.sub(sym, constRat(r)); // x - r
  // A is a degree-0 constant; if it trimmed to [] the term is zero (contributes nothing).
  const a0 = A.length ? A[0] : ZERO;
  if (a0.isZero) return Expr.ZERO;
  if (k === 1) {
    // A ln(x - r)
    return Expr.mul(constRat(a0), Expr.func("ln", [base]));
  }
  // A/(1-k) * (x-r)^(1-k)
  const coef = a0.div(Rational.of(1 - k, 1));
  if (coef.isZero) return Expr.ZERO;
  return Expr.mul(constRat(coef), Expr.pow(base, ratInt(1 - k)));
}

// Quadratic factor q = [c, b, 1] (monic irreducible), Δ = c − b²/4 > 0.
// Integrate (a₁ x + a₀)/q^k.
function integrateQuadraticTerm(A, q, k, varName) {
  const sym = Expr.sym(varName);
  const c = q[0], b = q[1];
  const a0 = A.length >= 1 ? A[0] : ZERO;
  const a1 = A.length >= 2 ? A[1] : ZERO;
  const qExpr = polyToExpr(q, varName);
  const lam = a1.div(TWO); // a1/2
  const mu = a0.sub(lam.mul(b)); // a0 - (a1 b)/2
  const Delta = c.sub(b.mul(b).div(Rational.of(4, 1)));
  // Δ = c − b²/4 < 0 means q = (x+b/2)² − D, D = −Δ > 0, has real irrational roots ±√D − b/2.
  // This does NOT need Rothstein-Trager/Q(α): completing the square gives an elementary real
  // logarithm whose coefficient is a plain radical √D — representable directly as sqrt(D), the
  // same primitive already used for the Δ>0 arctan case's √Δ. See
  // integrateInverseQuadraticPower's k===1 branch. (Δ=0 cannot occur here: it would mean q has
  // a rational double root, which factorOverQ's rational-root stripping would already have
  // caught, so q would never reach this function as an "irreducible" factor.)
  const parts = [];
  // λ q'/q^k
  if (!lam.isZero) {
    if (k === 1) {
      parts.push(Expr.mul(constRat(lam), Expr.func("ln", [qExpr])));
    } else {
      const coef = lam.div(Rational.of(1 - k, 1));
      parts.push(Expr.mul(constRat(coef), Expr.pow(qExpr, ratInt(1 - k))));
    }
  }
  // μ/q^k  ->  μ * I_k(u, Δ)
  if (!mu.isZero) {
    const Ik = integrateInverseQuadraticPower(k, Delta, b, qExpr, varName);
    if (Ik.refuse) return Ik;
    parts.push(Expr.mul(constRat(mu), Ik.expr));
  }
  if (!parts.length) return Expr.ZERO;
  return Expr.add(...parts);
}

// I_k = ∫ dx / q^k  where q = (x + b/2)² + Δ, u = x + b/2. Returns an Expr (not wrapped).
// Δ>0: I_1 = (1/√Δ) arctan(u/√Δ).
// Δ<0: q = u² − D, D = −Δ > 0 (real roots ±√D): I_1 = (1/(2√D)) ln((u−√D)/(u+√D)).
// Either way, I_k = u/(2(k-1)Δ q^(k-1)) + (2k-3)/(2(k-1)Δ) I_(k-1) for k>1 — the reduction is
// derived purely by integration by parts (see rational-integrate.js history/derivation notes)
// and never uses the sign of Δ, only Δ≠0, so the same recurrence serves both base cases.
function integrateInverseQuadraticPower(k, Delta, b, qExpr, varName) {
  const sym = Expr.sym(varName);
  const u = Expr.add(sym, constRat(b.div(TWO))); // x + b/2
  if (k === 1) {
    if (Delta.sign > 0) {
      // (1/√Δ) arctan(u/√Δ)
      const sqrtDelta = Expr.func("sqrt", [constRat(Delta)]);
      const inv = Expr.pow(sqrtDelta, ratInt(-1));
      const arg = Expr.mul(u, inv);
      return { expr: Expr.mul(inv, Expr.func("atan", [arg])) };
    }
    // (1/(2√D)) ln((u−√D)/(u+√D)), D = −Δ > 0
    const D = Delta.neg();
    const sqrtD = Expr.func("sqrt", [constRat(D)]);
    const ratio = Expr.mul(Expr.sub(u, sqrtD), Expr.pow(Expr.add(u, sqrtD), ratInt(-1)));
    const coef = Expr.pow(Expr.mul(ratInt(2), sqrtD), ratInt(-1));
    return { expr: Expr.mul(coef, Expr.func("ln", [ratio])) };
  }
  const twoKm2 = Rational.of(2 * (k - 1), 1); // 2(k-1)
  const coef1 = Rational.of(1, 1).div(twoKm2.mul(Delta)); // 1/(2(k-1)Δ)
  const rationalPart = Expr.mul(constRat(coef1), u, Expr.pow(qExpr, ratInt(-(k - 1))));
  const coefRec = Rational.of(2 * k - 3, 1).div(twoKm2.mul(Delta)); // (2k-3)/(2(k-1)Δ)
  const sub = integrateInverseQuadraticPower(k - 1, Delta, b, qExpr, varName);
  if (sub.refuse) return sub;
  const recPart = Expr.mul(constRat(coefRec), sub.expr);
  return { expr: Expr.add(rationalPart, recPart) };
}

// Main entry point.
function integrateRational(num, den, varName) {
  if (Poly.isZero(den)) return { refused: true, reason: "rational-integrate: zero denominator" };
  // Reduce to lowest terms.
  let P = num.slice();
  let Q = den.slice();
  const g = gcd(P, Q);
  if (!Poly.isConstant(g) || (g.length === 1 && !g[0].isOne)) {
    const ng = Poly.divExact(P, g);
    const dg = Poly.divExact(Q, g);
    if (ng !== null && dg !== null) { P = ng; Q = dg; }
  }
  if (Poly.isZero(P)) return { refused: false, result: Expr.sym("C"), derivation: Derivation.leaf(Expr.sym("C"), null) };

  // Constant denominator: integrate the polynomial P.
  if (Poly.isConstant(Q)) {
    const result = integratePolynomial(P, varName);
    const full = Expr.add(result, Expr.sym("C"));
    return { refused: false, result: full, derivation: Derivation.leaf(full, null) };
  }

  let factorization;
  try {
    factorization = factorOverQ(Q);
  } catch (e) {
    if (e instanceof FactorRefusalError) {
      return { refused: true, reason: e.message };
    }
    throw e;
  }

  const pfd = partialFractions(P, Q, factorization.factors, factorization.content);

  const terms = [];
  for (const t of pfd.terms) {
    const deg = Poly.degree(t.factor);
    if (deg === 1) {
      terms.push(integrateLinearTerm(t.num, t.factor, t.mult, varName));
    } else if (deg === 2) {
      const res = integrateQuadraticTerm(t.num, t.factor, t.mult, varName);
      if (res.refuse) return { refused: true, reason: res.refuse };
      terms.push(res);
    } else {
      // Irreducible factor of degree >= 3: needs Rothstein-Trager over Q(α) (deferred).
      return {
        refused: true,
        reason:
          "rational-integrate: denominator has an irreducible factor of degree " +
          deg +
          " over Q; integrating it requires Rothstein-Trager over Q(α) (Phase 3 tasks 5b/8, deferred)",
      };
    }
  }
  // polynomial part
  const polyAntideriv = pfd.polyPart.length ? integratePolynomial(pfd.polyPart, varName) : null;
  if (polyAntideriv) terms.push(polyAntideriv);
  // + C
  terms.push(Expr.sym("C"));
  const result = Expr.add(...terms);

  const rule = {
    id: "kernel:rational-integrate",
    name: "rational-integrate",
    source: "kernel",
    describe: () => ({ text: "integrate the rational function via partial fractions", latex: "" }),
  };
  const goal = buildGoalExpr(P, Q, varName);
  const derivation = Derivation.step(rule, {}, goal, result, null, []);
  return { refused: false, result, derivation };
}

function buildGoalExpr(P, Q, varName) {
  const numExpr = polyToExpr(P, varName);
  if (Poly.isOne(Q)) return numExpr;
  return Expr.mul(numExpr, Expr.pow(polyToExpr(Q, varName), ratInt(-1)));
}

module.exports = { integrateRational };