"use strict";
/* L2 — rationalize (clear denominators). See docs/kernel/03_ARCHITECTURE.md §3 L2:
   1/x + 1/y -> (x+y)/(xy).

   Elementary-school common-denominator combination (cross-multiply every term over the
   product of all denominators) — always correct, never reduced to lowest terms. Reducing
   the result needs polynomial GCD (Phase 3); an unreduced-but-correct answer is the honest
   Phase 2 deliverable, not a wrong shortcut. Guarded: every denominator must be provably
   nonzero, or this refuses rather than risk a division-by-zero hiding in the output. */

const { Expr } = require("../expr");

function splitFraction(term) {
  const factors = term.kind === "Mul" ? term.args : [term];
  const num = [], den = [];
  for (const f of factors) {
    if (f.kind === "Pow" && f.exp.kind === "Integer" && f.exp.value < 0n) {
      const posExp = -f.exp.value;
      den.push(posExp === 1n ? f.base : Expr.pow(f.base, Expr.int(posExp)));
    } else {
      num.push(f);
    }
  }
  return { num, den };
}

function rationalizeExpr(expr, ctx) {
  if (expr.kind !== "Add") return null;

  const parts = expr.args.map(splitFraction);
  if (!parts.some((p) => p.den.length > 0)) return null; // no fractions to clear

  const denominators = parts.map((p) => (p.den.length ? Expr.mul(...p.den) : Expr.int(1)));
  if (!denominators.every((d) => ctx && ctx.ask(d, "nonzero") === true)) return null;

  const commonDen = Expr.mul(...denominators);
  const newNum = Expr.add(
    ...parts.map((p, i) => {
      const numExpr = p.num.length ? Expr.mul(...p.num) : Expr.int(1);
      const otherDens = denominators.filter((_, j) => j !== i);
      return Expr.mul(numExpr, ...otherDens);
    })
  );
  return Expr.div(newNum, commonDen);
}

module.exports = { rationalizeExpr };
