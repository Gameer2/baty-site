"use strict";
/* L2 rule set — completing the square. See docs/kernel/03_ARCHITECTURE.md §3 L2 rule 4:
   x^2 + bx + c -> (x + b/2)^2 + (c - b^2/4). Clears 2 measured integration failures once
   wired into trig-substitution preprocessing (deferred — see the Phase 2 status note in
   04_BUILD_PHASES.md for the kernel-vs-production-wiring boundary, same as inverse-trig).

   Implemented as a dedicated procedural transform, not a fixed-arity pattern rule: whether
   the linear term or the constant term is present varies the Add's arity (2 or 3 terms),
   which is exactly the kind of arbitrary-shape-within-a-sum case pattern.js's matcher
   deliberately does not attempt to handle generically (see its module comment). */

const { Expr } = require("../expr");
const { Rational } = require("../rational");

// completeSquareExpr(expr) -> Expr | null. Matches a single-variable quadratic
// v^2 + b*v + c (b, c rational, b != 0) anywhere it appears as a whole Add; returns null if
// the shape doesn't match or there is nothing to complete (b == 0).
function completeSquareExpr(expr) {
  if (expr.kind !== "Add") return null;

  let variable = null;
  let sawSquare = false;
  for (const term of expr.args) {
    if (term.kind === "Pow" && term.exp.kind === "Integer" && term.exp.value === 2n && term.base.kind === "Symbol") {
      if (sawSquare) return null; // more than one squared variable — not a simple quadratic
      variable = term.base;
      sawSquare = true;
    }
  }
  if (!sawSquare) return null;

  let bCoeff = Rational.ZERO;
  const constantTerms = [];
  for (const term of expr.args) {
    if (term.kind === "Pow" && term.base === variable && term.exp.kind === "Integer" && term.exp.value === 2n) continue;
    if (term === variable) {
      bCoeff = bCoeff.add(Rational.ONE);
      continue;
    }
    if (term.kind === "Mul" && term.args.length === 2 && Expr.isNumeric(term.args[0]) && term.args[1] === variable) {
      bCoeff = bCoeff.add(Expr.numericValue(term.args[0]));
      continue;
    }
    if (Expr.isNumeric(term)) {
      constantTerms.push(term);
      continue;
    }
    return null; // some other shape (e.g. a second variable, or v appearing non-linearly)
  }
  if (bCoeff.isZero) return null; // nothing to complete

  const c = constantTerms.reduce((acc, t) => acc.add(Expr.numericValue(t)), Rational.ZERO);
  const half = bCoeff.mul(Rational.of(1n, 2n));
  const newConst = c.sub(bCoeff.mul(bCoeff).mul(Rational.of(1n, 4n)));

  const shifted = Expr.add(variable, Expr.rat(half.num, half.den));
  return Expr.add(Expr.pow(shifted, Expr.int(2)), Expr.rat(newConst.num, newConst.den));
}

module.exports = { completeSquareExpr };
