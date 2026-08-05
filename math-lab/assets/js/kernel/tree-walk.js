"use strict";
/* L2 — shared tree-transform utilities for Phase 2b's substitution algorithms
   (Weierstrass, rationalizing, generalised algebraic, trig-power-reduction). Structural
   replacement by reference identity — safe because every Expr is hash-consed, so `===`
   really does mean "the same sub-expression," not just "looks the same." */

const { Expr } = require("./expr");

// replaceSubterm(expr, target, replacement) — replace every occurrence of the exact
// sub-expression `target` (by reference) with `replacement`, rebuilding ancestors.
function replaceSubterm(expr, target, replacement) {
  if (expr === target) return replacement;
  switch (expr.kind) {
    case "Add":
      return Expr.add(...expr.args.map((a) => replaceSubterm(a, target, replacement)));
    case "Mul":
      return Expr.mul(...expr.args.map((a) => replaceSubterm(a, target, replacement)));
    case "Pow":
      return Expr.pow(replaceSubterm(expr.base, target, replacement), replaceSubterm(expr.exp, target, replacement));
    case "Func":
      return Expr.func(expr.name, expr.args.map((a) => replaceSubterm(a, target, replacement)));
    case "Bind":
      return Expr.bindRaw(
        expr.head,
        replaceSubterm(expr.body, target, replacement),
        expr.extra.map((e) => replaceSubterm(e, target, replacement)),
        expr.displayName
      );
    default:
      return expr; // Integer, Rational, Symbol, BoundVar have no sub-structure to recurse into
  }
}

// walk(expr, visit) — bottom-up traversal calling visit(node) on every node (post-order),
// for search/collection passes that don't rebuild the tree (e.g. "find all Pow(x,r) here").
function walk(expr, visit) {
  switch (expr.kind) {
    case "Add":
    case "Mul":
      for (const a of expr.args) walk(a, visit);
      break;
    case "Pow":
      walk(expr.base, visit);
      walk(expr.exp, visit);
      break;
    case "Func":
      for (const a of expr.args) walk(a, visit);
      break;
    case "Bind":
      walk(expr.body, visit);
      for (const e of expr.extra) walk(e, visit);
      break;
    default:
      break;
  }
  visit(expr);
}

module.exports = { replaceSubterm, walk };
