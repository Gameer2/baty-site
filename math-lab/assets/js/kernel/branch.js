"use strict";
/* L1 — Branch selection. See docs/kernel/03_ARCHITECTURE.md §3 L1 and the Phase 1 gate in
   docs/kernel/04_BUILD_PHASES.md:

     - sqrt(x^2) -> x under x>0; |x| under x real; unevaluated otherwise
     - sqrt(x^2 - a^2) selects its branch from x>a, with a symbolic

   The first is a genuine rewrite (perfect-square case). The second is NOT a general
   nonlinear reasoner living in the assumptions core — squaring monotonicity for positive
   reals is a single, targeted, documented rule, kept here rather than folded into the
   linear difference-logic store in assumptions.js. See docs/kernel/03_ARCHITECTURE.md §3
   L1 for why the core is deliberately scoped to linear reasoning only. */

const { Expr } = require("./expr");
const { UNKNOWN } = require("./assumptions");

// Exact (never approximate) rational square root, or null if none exists — needed because a
// literal like `9` in `x^2 - 9` has already folded to Integer(-9) at construction (Pow(3,2)
// arithmetically collapses), so recognising it as "3 squared" means recovering the root,
// not pattern-matching a Pow node that no longer exists.
function bigIntSqrt(n) {
  if (n < 0n) return null;
  if (n < 2n) return n;
  let x = n, y = (x + 1n) / 2n;
  while (y < x) {
    x = y;
    y = (x + n / x) / 2n;
  }
  return x * x === n ? x : null;
}

function exactRationalSqrt(r) {
  if (r.sign < 0) return null;
  const sqNum = bigIntSqrt(r.num);
  const sqDen = bigIntSqrt(r.den);
  return sqNum !== null && sqDen !== null ? { num: sqNum, den: sqDen } : null;
}

// Does term t equal sign * base^2 for some sign in {+1,-1}? Covers Pow(base,2),
// Mul(-1,Pow(base,2)), and a bare numeric literal that happens to be a perfect square.
function squareFactor(t) {
  if (t.kind === "Pow" && t.exp.kind === "Integer" && t.exp.value === 2n) {
    return { base: t.base, sign: 1 };
  }
  if (
    t.kind === "Mul" &&
    t.args.length === 2 &&
    t.args[0].kind === "Integer" &&
    t.args[1].kind === "Pow" &&
    t.args[1].exp.kind === "Integer" &&
    t.args[1].exp.value === 2n
  ) {
    if (t.args[0].value === 1n) return { base: t.args[1].base, sign: 1 };
    if (t.args[0].value === -1n) return { base: t.args[1].base, sign: -1 };
    return null;
  }
  if (Expr.isNumeric(t)) {
    const v = Expr.numericValue(t);
    const root = exactRationalSqrt(v.abs());
    if (root) return { base: Expr.rat(root.num, root.den), sign: v.sign >= 0 ? 1 : -1 };
  }
  return null;
}

// Matches the canonical form of v^2 - w^2 (either factor may be a literal perfect square,
// e.g. `9` standing in for `3^2` — the measured docs example is sqrt(x^2 - 9), not a
// symbolic a^2).
function matchDifferenceOfSquares(expr) {
  if (expr.kind !== "Add" || expr.args.length !== 2) return null;
  const f0 = squareFactor(expr.args[0]);
  const f1 = squareFactor(expr.args[1]);
  if (!f0 || !f1) return null;
  if (f0.sign === 1 && f1.sign === -1) return { v: f0.base, w: f1.base };
  if (f1.sign === 1 && f0.sign === -1) return { v: f1.base, w: f0.base };
  return null;
}

// Is sqrt(inner) real and on the principal (nonnegative) branch? true | false | UNKNOWN.
function sqrtDomainOk(ctx, inner) {
  const direct = ctx.ask(inner, "nonnegative");
  if (direct === true) return true;
  if (direct === false) return false;

  const dos = matchDifferenceOfSquares(inner);
  if (dos) {
    // v^2 - w^2 > 0 when 0 <= w < v: both then nonnegative, and squaring preserves order
    // for nonnegative reals. This is the ONE nonlinear fact this module knows; it is not
    // a general inequality solver (see docs/kernel/03_ARCHITECTURE.md §3 L1).
    const wNonneg = ctx.ask(dos.w, "nonnegative");
    const vGtW = ctx.askRelation(dos.v, dos.w, "gt");
    if (wNonneg === true && vGtW === true) return true;
  }
  return UNKNOWN;
}

// sqrt(base^2) -> base | -base | |base| | null (no reduction — leave unevaluated)
function reduceSqrtOfSquare(ctx, base) {
  if (ctx.ask(base, "positive") === true) return base;
  if (ctx.ask(base, "negative") === true) return Expr.neg(base);
  if (ctx.ask(base, "real") === true) return Expr.func("abs", [base]);
  return null;
}

// simplifySqrt(ctx, inner) -> reduced Expr, or null if no reduction applies (unevaluated).
function simplifySqrt(ctx, inner) {
  if (inner.kind === "Pow" && inner.exp.kind === "Integer" && inner.exp.value === 2n) {
    return reduceSqrtOfSquare(ctx, inner.base);
  }
  return null;
}

module.exports = { simplifySqrt, sqrtDomainOk, reduceSqrtOfSquare, matchDifferenceOfSquares };
