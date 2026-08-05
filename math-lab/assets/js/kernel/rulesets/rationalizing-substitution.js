"use strict";
/* Phase 2b — Rationalizing substitution u = x^(1/L). See
   docs/kernel/04_BUILD_PHASES.md Phase 2b: turns every fractional power of x into an
   integer power of u, where L is the LCM of all the fractional exponents' denominators.
   Handles cases like 1/(x^(-1/3)+x^(-1/4)), currently a hang in the production engine
   (measured baseline) — clears a large slice of the 159 measured algebraic-radical
   failures once this feeds Phase 3's rational integrator.

   Deliberately NOT implemented as x -> u^L via the generic Pow-folding path: nested-power
   folding is only sound at L0 when BOTH exponents are integers (folding (u^2)^(1/2) to u
   unconditionally would be the exact sqrt(x^2)=|x| branch error the assumptions system
   exists to prevent). This computes the new integer exponent directly in exact Rational
   arithmetic instead of relying on Expr.pow to simplify a composition it correctly declines
   to simplify in general. */

const { Expr } = require("../expr");
const { Rational, bigGcd } = require("../rational");
const { walk } = require("../tree-walk");

function bigLcm(a, b) {
  return (a / bigGcd(a, b)) * b;
}

function collectDenominators(expr, x, denominators) {
  walk(expr, (node) => {
    if (node.kind === "Pow" && node.base === x) {
      const r = node.exp.kind === "Integer" ? Rational.of(node.exp.value, 1n) : node.exp.kind === "Rational" ? node.exp.value : null;
      if (r && !r.isInteger) denominators.add(r.den);
    }
  });
}

function substitutePow(expr, x, u, L) {
  if (expr === x) return Expr.pow(u, Expr.int(L));
  switch (expr.kind) {
    case "Pow": {
      if (expr.base === x && (expr.exp.kind === "Integer" || expr.exp.kind === "Rational")) {
        const r = expr.exp.kind === "Integer" ? Rational.of(expr.exp.value, 1n) : expr.exp.value;
        const newExp = r.mul(Rational.of(L, 1n));
        if (!newExp.isInteger) throw new Error("rationalizingSubstitution: L was not a common denominator");
        return Expr.pow(u, Expr.int(newExp.num));
      }
      return Expr.pow(substitutePow(expr.base, x, u, L), substitutePow(expr.exp, x, u, L));
    }
    case "Add":
      return Expr.add(...expr.args.map((a) => substitutePow(a, x, u, L)));
    case "Mul":
      return Expr.mul(...expr.args.map((a) => substitutePow(a, x, u, L)));
    case "Func":
      return Expr.func(expr.name, expr.args.map((a) => substitutePow(a, x, u, L)));
    case "Bind":
      return Expr.bindRaw(expr.head, substitutePow(expr.body, x, u, L), expr.extra.map((e) => substitutePow(e, x, u, L)), expr.displayName);
    default:
      return expr;
  }
}

// rationalizingSubstitution(expr, x) -> { result, u, L, dxdu } | null
// Returns null if x never appears under a genuinely fractional power (nothing to clear).
function rationalizingSubstitution(expr, x) {
  const denominators = new Set();
  collectDenominators(expr, x, denominators);
  if (denominators.size === 0) return null;

  let L = 1n;
  for (const d of denominators) L = bigLcm(L, d);
  if (L === 1n) return null;

  const uName = Expr.freeSymbols(expr).has("u") ? "u1" : "u";
  const u = Expr.sym(uName);
  const result = substitutePow(expr, x, u, L);

  // x = u^L  =>  dx/du = L * u^(L-1)
  const dxdu = Expr.mul(Expr.int(L), Expr.pow(u, Expr.int(L - 1n)));

  return { result, u, L, dxdu };
}

module.exports = { rationalizingSubstitution };
