"use strict";
/* Phase 2b — Weierstrass substitution t = tan(x/2). See
   docs/kernel/04_BUILD_PHASES.md Phase 2b: turns any rational function of sin(x)/cos(x)
   into a rational function of t. Measured target: 58 failures (31 wrong, 18 refused,
   6 hung) — clears entirely once this feeds Phase 3's rational integrator (deferred; this
   delivers the "normalized to rational form" gate, not the integration itself).

   sin(x) = 2t/(1+t^2), cos(x) = (1-t^2)/(1+t^2), tan(x) = 2t/(1-t^2), dx = 2/(1+t^2) dt,
   from the half-angle substitution t = tan(x/2). */

const { Expr } = require("../expr");
const { Pattern } = require("../pattern");
const { makeRule, RuleSet } = require("../rules");
const { normalize: rewriteNormalize } = require("../rewrite");

function freshSymbolName(base, expr) {
  const used = Expr.freeSymbols(expr);
  if (!used.has(base)) return base;
  let i = 1;
  while (used.has(base + i)) i++;
  return base + i;
}

// weierstrassSubstitution(expr, x) -> { result, t, dxdt } | null
// Returns null if expr contains a use of x that isn't wrapped in sin/cos/tan of x (the
// substitution doesn't fully apply), or if x does not occur in expr at all.
function weierstrassSubstitution(expr, x) {
  if (!Expr.freeSymbols(expr).has(x.name)) return null;

  const tName = freshSymbolName("t", expr);
  const t = Expr.sym(tName);
  const onePlusTSq = Expr.add(Expr.int(1), Expr.pow(t, Expr.int(2)));
  const oneMinusTSq = Expr.sub(Expr.int(1), Expr.pow(t, Expr.int(2)));

  const rules = [
    makeRule({
      name: "weierstrass-sin",
      pattern: Pattern.func("sin", Pattern.exact(x)),
      replacement: () => Expr.div(Expr.mul(Expr.int(2), t), onePlusTSq),
    }),
    makeRule({
      name: "weierstrass-cos",
      pattern: Pattern.func("cos", Pattern.exact(x)),
      replacement: () => Expr.div(oneMinusTSq, onePlusTSq),
    }),
    makeRule({
      name: "weierstrass-tan",
      pattern: Pattern.func("tan", Pattern.exact(x)),
      replacement: () => Expr.div(Expr.mul(Expr.int(2), t), oneMinusTSq),
    }),
  ];

  const out = rewriteNormalize(expr, new RuleSet(rules), null);
  if (out.refused) return null;

  if (Expr.freeSymbols(out.result).has(x.name)) return null; // some other use of x survived

  const dxdt = Expr.div(Expr.int(2), onePlusTSq);
  return { result: out.result, t, dxdt, derivation: out.derivation };
}

module.exports = { weierstrassSubstitution };
