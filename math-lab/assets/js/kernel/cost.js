"use strict";
/* L2b — Complexity metric. See docs/kernel/03_ARCHITECTURE.md §3 L2b.

   cost(e) -> N answers "is this form better?" — weighted node count, leaves cheap, Add/Mul
   linear in arity, Pow weighted by exponent size, Func weighted per head (a nested radical
   costs more than a log), unevaluated binders most expensive of all.

   Two properties matter more than the exact weights: deterministic (a pure function of
   structure, nothing external), and ties broken by canonical order rather than insertion
   or iteration order — required by the determinism target in docs/kernel/02_TARGET_STATE.md
   §5, and by the Phase 2d gate ("byte-identical output across a rule-database reordering"). */

const { Expr } = require("./expr");

const FUNC_COST = {
  abs: 1,
  sin: 2, cos: 2, tan: 3, cot: 3, sec: 3, csc: 3,
  asin: 3, acos: 3, atan: 3, acot: 3, asec: 3, acsc: 3,
  sinh: 2, cosh: 2, tanh: 3,
  ln: 2, log: 2, exp: 2,
  sqrt: 3,
};
const DEFAULT_FUNC_COST = 4; // an unrecognised function name is treated as relatively expensive
const BIND_COST = 10; // an unevaluated binder is the most expensive thing the kernel can hold
const MAX_INT_EXPONENT_WEIGHT = 10;

function cost(e) {
  switch (e.kind) {
    case "Integer":
      return 1;
    case "Rational":
      return 2;
    case "Symbol":
    case "BoundVar":
      return 1;
    case "Add":
    case "Mul":
      return e.args.length + e.args.reduce((s, a) => s + cost(a), 0);
    case "Pow": {
      let expWeight;
      if (e.exp.kind === "Integer") {
        const magnitude = e.exp.value < 0n ? -e.exp.value : e.exp.value;
        expWeight = 1 + Number(magnitude < BigInt(MAX_INT_EXPONENT_WEIGHT) ? magnitude : BigInt(MAX_INT_EXPONENT_WEIGHT));
      } else {
        expWeight = 3; // fractional/symbolic exponents are a structurally more complex form
      }
      return expWeight + cost(e.base) + cost(e.exp);
    }
    case "Func": {
      const w = e.name in FUNC_COST ? FUNC_COST[e.name] : DEFAULT_FUNC_COST;
      return w + e.args.reduce((s, a) => s + cost(a), 0);
    }
    case "Bind":
      return BIND_COST + cost(e.body) + e.extra.reduce((s, a) => s + cost(a), 0);
    default:
      throw new Error("cost: unknown kind " + e.kind);
  }
}

// Total order on (cost, canonical form) — used by the bounded best-first search so that
// "which candidate is better" never depends on iteration order.
function compareCost(a, b) {
  const ca = cost(a), cb = cost(b);
  if (ca !== cb) return ca - cb;
  return Expr.compare(a, b);
}

module.exports = { cost, compareCost };
