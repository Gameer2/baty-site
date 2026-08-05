"use strict";
/* L3 — Expr <-> Polynomial conversion. See docs/kernel/04_BUILD_PHASES.md Phase 3 task 1.

   `polynomial.js` operates on coefficient arrays and must not depend on L0's `Expr` (it is
   pure algebra, one layer below the expression representation). This module is the bridge
   that turns a univariate `Expr` into the coefficient arrays the algorithms need, and turns a
   coefficient array back into an `Expr` for output. It is the only place that knows about BOTH
   representations.

   Refuses honestly (returns null) when an expression is not a rational function of a single
   variable: any Func, any Symbol other than the variable, or a non-integer power of the
   variable. This is the same "refuse rather than silently drop a variable" discipline as the
   existing narrow factor/rationalize rulesets — a partial-fraction routine that quietly
   ignored an `e^x` in the integrand would produce a confidently wrong answer, which is the
   one failure mode the whole kernel design exists to prevent (docs/kernel/03_ARCHITECTURE.md
   §3 L4). */

const { Expr } = require("./expr");
const { Rational: Rat } = require("./rational");
const Poly = require("./polynomial");

// ---------------------------------------------------------------------------------------
// Expr -> Polynomial (single variable)
// ---------------------------------------------------------------------------------------

// polyFromExpr(expr, varName) -> Rational[] (ascending coeffs) or null if `expr` is not a
// polynomial in the single variable `varName`.
function polyFromExpr(expr, varName) {
  switch (expr.kind) {
    case "Integer":
      return Poly.constant(Rat.of(expr.value, 1n));
    case "Rational":
      return Poly.constant(expr.value);
    case "Symbol":
      return expr.name === varName ? [Rat.ZERO, Rat.ONE] : null;
    case "Add": {
      let acc = [];
      for (const a of expr.args) {
        const p = polyFromExpr(a, varName);
        if (p === null) return null;
        acc = Poly.add(acc, p);
      }
      return acc;
    }
    case "Mul": {
      let acc = Poly.constant(Rat.ONE);
      for (const f of expr.args) {
        const p = polyFromExpr(f, varName);
        if (p === null) return null;
        acc = Poly.mul(acc, p);
      }
      return acc;
    }
    case "Pow": {
      if (expr.exp.kind !== "Integer" || expr.exp.value < 0n) return null;
      const base = polyFromExpr(expr.base, varName);
      if (base === null) return null;
      return Poly.pow(base, Number(expr.exp.value));
    }
    default: // Func, Bind, BoundVar — not a polynomial in one variable
      return null;
  }
}

// ---------------------------------------------------------------------------------------
// Expr -> { num, den } rational function (single variable)
// ---------------------------------------------------------------------------------------

// Combines sums over a common denominator, so an improper fraction or a sum of rational terms
// (e.g. 1/(x-1) + 1/(x+1)) reduces to a single P/Q the integrator can then divide and decompose.
// Returns { num: Rational[], den: Rational[] } or null if any term is not a rational function
// of `varName` (non-integer power, foreign symbol, Func, etc.).
function rfFromExpr(expr, varName) {
  switch (expr.kind) {
    case "Integer":
      return { num: Poly.constant(Rat.of(expr.value, 1n)), den: Poly.constant(Rat.ONE) };
    case "Rational":
      return { num: Poly.constant(expr.value), den: Poly.constant(Rat.ONE) };
    case "Symbol":
      return expr.name === varName
        ? { num: [Rat.ZERO, Rat.ONE], den: Poly.constant(Rat.ONE) }
        : null;
    case "Add": {
      // Combine a + b over a common denominator: (n1/d1) + (n2/d2) = (n1*d2 + n2*d1)/(d1*d2).
      let acc = { num: [], den: Poly.constant(Rat.ONE) };
      for (const a of expr.args) {
        const t = rfFromExpr(a, varName);
        if (t === null) return null;
        const num = Poly.add(Poly.mul(acc.num, t.den), Poly.mul(t.num, acc.den));
        const den = Poly.mul(acc.den, t.den);
        acc = { num, den };
      }
      return acc;
    }
    case "Mul": {
      let num = Poly.constant(Rat.ONE);
      let den = Poly.constant(Rat.ONE);
      for (const f of expr.args) {
        if (f.kind === "Pow" && f.exp.kind === "Integer" && f.exp.value < 0n) {
          const base = polyFromExpr(f.base, varName);
          if (base === null) return null;
          den = Poly.mul(den, Poly.pow(base, Number(-f.exp.value)));
        } else {
          const p = polyFromExpr(f, varName);
          if (p === null) return null;
          num = Poly.mul(num, p);
        }
      }
      return { num, den };
    }
    case "Pow": {
      if (expr.exp.kind !== "Integer") return null;
      const e = expr.exp.value;
      const base = polyFromExpr(expr.base, varName);
      if (base === null) return null;
      if (e >= 0n) return { num: Poly.pow(base, Number(e)), den: Poly.constant(Rat.ONE) };
      return { num: Poly.constant(Rat.ONE), den: Poly.pow(base, Number(-e)) };
    }
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------------------
// Polynomial -> Expr (single variable)
// ---------------------------------------------------------------------------------------

// polyToExpr(poly, varName) -> Expr. Produces the canonical L0 form: a sum of `coeff * x^i`
// terms, with the leading sign handled by the printer's Add rendering. Returns Expr.ZERO for
// the zero polynomial.
function polyToExpr(poly, varName) {
  const sym = Expr.sym(varName);
  const terms = [];
  for (let i = 0; i < poly.length; i++) {
    const c = poly[i];
    if (c.isZero) continue;
    const coeffExpr = c.isInteger ? Expr.int(c.num) : Expr.rat(c.num, c.den);
    if (i === 0) {
      terms.push(coeffExpr);
    } else if (i === 1) {
      terms.push(c.isOne ? sym : Expr.mul(coeffExpr, sym));
    } else {
      const xpow = Expr.pow(sym, Expr.int(BigInt(i)));
      terms.push(c.isOne ? xpow : Expr.mul(coeffExpr, xpow));
    }
  }
  if (terms.length === 0) return Expr.ZERO;
  return Expr.add(...terms);
}

// rfToExpr(num, den, varName) -> Expr for num/den in L0's canonical `Mul(num, Pow(den,-1))` form.
function rfToExpr(num, den, varName) {
  const numExpr = polyToExpr(num, varName);
  if (Poly.isOne(den)) return numExpr;
  const denExpr = polyToExpr(den, varName);
  return Expr.mul(numExpr, Expr.pow(denExpr, Expr.int(-1n)));
}

module.exports = {
  polyFromExpr,
  rfFromExpr,
  polyToExpr,
  rfToExpr,
};