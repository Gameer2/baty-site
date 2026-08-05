"use strict";
/* Phase 2b — Generalised algebraic substitution. See docs/kernel/04_BUILD_PHASES.md
   Phase 2b: extends the shipped n-th-root-of-linear case to the full Mobius form
   u = ((ax+b)/(cx+d))^(1/n). Clears the rest of the 159 measured algebraic-radical
   failures (the linear case, ⁿ√(ax+b), is the c=0,d=1 special case and falls out for free).

   Derivation: u^n = (ax+b)/(cx+d)  =>  x = (d u^n - b)/(a - c u^n). Differentiating with
   the quotient rule and simplifying (the u^n terms cancel):
     dx/du = n(ad-bc) u^(n-1) / (a - c u^n)^2
   which is exact and closed-form — no general symbolic differentiator is needed for this
   one, specific, well-understood family. */

const { Expr } = require("../expr");
const { Rational } = require("../rational");
const { replaceSubterm } = require("../tree-walk");

// linearCoeffs(expr, x) -> {a, b} such that expr === a*x + b, or null if expr is not
// affine-linear in x (e.g. contains x^2, or a different variable, or is nonlinear).
function linearCoeffs(expr, x) {
  if (expr === x) return { a: Rational.ONE, b: Rational.ZERO };
  if (Expr.isNumeric(expr)) return { a: Rational.ZERO, b: Expr.numericValue(expr) };
  if (expr.kind === "Mul" && expr.args.length === 2 && Expr.isNumeric(expr.args[0]) && expr.args[1] === x) {
    return { a: Expr.numericValue(expr.args[0]), b: Rational.ZERO };
  }
  if (expr.kind === "Add") {
    let a = Rational.ZERO, b = Rational.ZERO;
    for (const term of expr.args) {
      const c = linearCoeffs(term, x);
      if (!c) return null;
      a = a.add(c.a);
      b = b.add(c.b);
    }
    return { a, b };
  }
  return null;
}

// mobiusCoeffs(expr, x) -> {a,b,c,d} such that expr === (a*x+b)/(c*x+d), or null.
// A bare linear expression is the c=0, d=1 special case.
function mobiusCoeffs(expr, x) {
  const lin = linearCoeffs(expr, x);
  if (lin) return { a: lin.a, b: lin.b, c: Rational.ZERO, d: Rational.ONE };

  if (expr.kind !== "Mul") return null;
  const numFactors = [];
  let denExpr = null;
  for (const f of expr.args) {
    if (f.kind === "Pow" && f.exp.kind === "Integer" && f.exp.value === -1n) {
      if (denExpr) return null; // more than one denominator factor: not a simple Mobius form
      denExpr = f.base;
    } else {
      numFactors.push(f);
    }
  }
  if (!denExpr) return null;
  const numExpr = numFactors.length === 1 ? numFactors[0] : numFactors.length === 0 ? Expr.int(1) : Expr.mul(...numFactors);
  const numLin = linearCoeffs(numExpr, x);
  const denLin = linearCoeffs(denExpr, x);
  if (!numLin || !denLin) return null;
  return { a: numLin.a, b: numLin.b, c: denLin.a, d: denLin.b };
}

// findRadical(expr, x) -> { radicalNode, a, b, c, d, n } | null — the first Pow(mobius, 1/n)
// found, searching children before the current node (so a nested radical is preferred).
function findRadical(expr, x) {
  if (expr.kind === "Pow" && expr.exp.kind === "Rational" && expr.exp.value.num === 1n && expr.exp.value.den >= 2n) {
    const mob = mobiusCoeffs(expr.base, x);
    if (mob) return { radicalNode: expr, ...mob, n: expr.exp.value.den };
  }
  switch (expr.kind) {
    case "Add":
    case "Mul":
      for (const a of expr.args) {
        const r = findRadical(a, x);
        if (r) return r;
      }
      return null;
    case "Pow": {
      const rb = findRadical(expr.base, x);
      if (rb) return rb;
      return findRadical(expr.exp, x);
    }
    case "Func":
      for (const a of expr.args) {
        const r = findRadical(a, x);
        if (r) return r;
      }
      return null;
    case "Bind": {
      const rb = findRadical(expr.body, x);
      if (rb) return rb;
      for (const e of expr.extra) {
        const r = findRadical(e, x);
        if (r) return r;
      }
      return null;
    }
    default:
      return null;
  }
}

function ratExpr(r) {
  return Expr.rat(r.num, r.den);
}

// algebraicSubstitution(expr, x) -> { result, u, dxdu, a, b, c, d, n } | null
function algebraicSubstitution(expr, x) {
  const found = findRadical(expr, x);
  if (!found) return null;
  const { radicalNode, a, b, c, d, n } = found;

  const uName = Expr.freeSymbols(expr).has("u") ? "u1" : "u";
  const u = Expr.sym(uName);
  const nExpr = Expr.int(n);
  const uToN = Expr.pow(u, nExpr);

  const numer = Expr.sub(Expr.mul(ratExpr(d), uToN), ratExpr(b)); // d*u^n - b
  const denom = Expr.sub(ratExpr(a), Expr.mul(ratExpr(c), uToN)); // a - c*u^n
  const xInTermsOfU = Expr.div(numer, denom);

  const withRadicalReplaced = replaceSubterm(expr, radicalNode, u);
  const result = Expr.subst(withRadicalReplaced, x.name, xInTermsOfU);

  const adMinusBc = a.mul(d).sub(b.mul(c));
  const dxdu = Expr.div(
    Expr.mul(nExpr, ratExpr(adMinusBc), Expr.pow(u, Expr.int(BigInt(n) - 1n))),
    Expr.pow(denom, Expr.int(2))
  );

  return { result, u, dxdu, a, b, c, d, n };
}

module.exports = { algebraicSubstitution, linearCoeffs, mobiusCoeffs };
