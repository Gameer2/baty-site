"use strict";
/* L2 — collect like terms in a sum. See docs/kernel/03_ARCHITECTURE.md §3 L2's `normalize`
   row ("canonical form | ordering, collecting, rational normal form").

   L0's Add folding only combines NUMERIC literals into one running sum (Add.of(2, x, 3) ->
   Add(5, x)) — it deliberately does not recognise that `x` and `-1*x` share a non-numeric
   factor, because that is an algebraic fact, not an arithmetic one (see
   docs/kernel/03_ARCHITECTURE.md §3 L0's note on why Mul/Add don't auto-collect exponents
   either). This is the L2-level extension: split each term into {numeric coefficient, the
   rest}, group by the rest, sum coefficients, drop zero groups.

   Unconditionally sound — combining `c1*t + c2*t` into `(c1+c2)*t` needs no assumptions,
   unlike expand/factor/separate — so this runs as a standing part of every Add rebuild
   inside the rewrite engine (see rewrite.js), not as an opt-in directed operation. It was
   found to be missing (not merely simplifiable) when `log(exp(x)) - x` reduced to the
   unhelpful `x - x` instead of `0`: the log-of-exp RULE fired correctly, but nothing then
   recognised that the resulting `x` and the original `-x` were the same term. */

const { Expr } = require("./expr");
const { Rational } = require("./rational");

function splitCoefficient(term) {
  if (Expr.isNumeric(term)) return { coeff: Expr.numericValue(term), rest: [] };
  if (term.kind === "Mul" && Expr.isNumeric(term.args[0])) {
    return { coeff: Expr.numericValue(term.args[0]), rest: term.args.slice(1) };
  }
  return { coeff: Rational.ONE, rest: [term] };
}

function restKey(rest) {
  return rest.map((r) => r._key).join(",");
}

function collectLikeTerms(addExpr) {
  if (addExpr.kind !== "Add") return addExpr;

  const groups = new Map(); // restKey -> { coeff, rest }
  for (const term of addExpr.args) {
    const { coeff, rest } = splitCoefficient(term);
    const key = restKey(rest);
    const existing = groups.get(key);
    if (existing) existing.coeff = existing.coeff.add(coeff);
    else groups.set(key, { coeff, rest });
  }

  const newTerms = [];
  for (const { coeff, rest } of groups.values()) {
    if (coeff.isZero) continue;
    if (rest.length === 0) {
      newTerms.push(Expr.rat(coeff.num, coeff.den));
    } else if (coeff.isOne) {
      newTerms.push(Expr.mul(...rest));
    } else {
      newTerms.push(Expr.mul(Expr.rat(coeff.num, coeff.den), ...rest));
    }
  }
  return Expr.add(...newTerms); // handles empty -> 0, single term -> that term
}

module.exports = { collectLikeTerms };
