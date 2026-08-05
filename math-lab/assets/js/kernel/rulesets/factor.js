"use strict";
/* L2 — factor (sums -> products). See docs/kernel/03_ARCHITECTURE.md §3 L2.

   Scope, stated honestly: this covers perfect-square trinomials (via completing the
   square) and integer-GCD common-factor extraction (2x+4y -> 2(x+2y)). It does NOT do
   general polynomial factorization — that needs square-free factorization and
   factorization over Q (docs/kernel/04_BUILD_PHASES.md Phase 3), which does not exist yet.
   A `factor` that only handles these two cases and refuses everything else is the honest
   Phase 2 deliverable; a `factor` that silently returned its input unchanged for anything
   harder would be worse than refusing. */

const { Expr } = require("../expr");
const { Rational, bigGcd } = require("../rational");
const { completeSquareExpr } = require("./completing-square");

function factorExpr(expr) {
  if (expr.kind !== "Add") return null;

  const cs = completeSquareExpr(expr);
  if (cs && cs.kind === "Pow") return cs; // completing the square left no remainder: perfect square

  const parts = expr.args.map((term) => {
    if (Expr.isNumeric(term)) return { coeff: Expr.numericValue(term), rest: null };
    if (term.kind === "Mul" && Expr.isNumeric(term.args[0])) {
      return { coeff: Expr.numericValue(term.args[0]), rest: term.args.slice(1) };
    }
    return { coeff: Rational.ONE, rest: [term] };
  });
  if (!parts.every((p) => p.coeff.isInteger)) return null; // keep scope to integer coefficients

  const nums = parts.map((p) => (p.coeff.num < 0n ? -p.coeff.num : p.coeff.num)).filter((n) => n !== 0n);
  if (nums.length < 2) return null;
  let g = nums[0];
  for (let i = 1; i < nums.length; i++) g = bigGcd(g, nums[i]);
  if (g <= 1n) return null; // nothing to factor out

  const gRat = Rational.of(g, 1n);
  const factoredTerms = parts.map((p) => {
    const newCoeff = p.coeff.div(gRat);
    if (p.rest === null) return Expr.rat(newCoeff.num, newCoeff.den);
    return newCoeff.isOne ? Expr.mul(...p.rest) : Expr.mul(Expr.rat(newCoeff.num, newCoeff.den), ...p.rest);
  });
  return Expr.mul(Expr.int(g), Expr.add(...factoredTerms));
}

module.exports = { factorExpr };
