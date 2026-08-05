"use strict";
/* L2 — Pattern matcher. See docs/kernel/03_ARCHITECTURE.md §3 L2 and
   docs/kernel/04_BUILD_PHASES.md Phase 2 task 2 ("pattern matcher with commutative/
   associative matching").

   Patterns are a SEPARATE small language, not overloaded Expr nodes — a pattern variable is
   never confusable with a real user symbol of the same name, and the matcher never has to
   guess which Symbol nodes are "really" wildcards.

   Scope boundary, stated explicitly: commutative matching here is PERMUTATION-based at
   EXACT arity — a pattern with k sub-patterns only matches an Add/Mul with exactly k
   arguments, tried in every order. This is sufficient for the hand-written rule sets in
   Phase 2 (all small, fixed arity) and is NOT a general AC-unifier with "remainder"
   absorption (e.g. matching `a+b` against an n-ary sum by letting `b` soak up everything
   left over). That is a materially harder problem (related to subset-sum search) that the
   actual rule sets here do not need; where an operation genuinely needs "find this shape
   somewhere inside an arbitrary-arity sum, leave the rest untouched" (e.g. combining two
   logarithms out of a longer sum), it is implemented as its own small traversal in
   directed.js, using this matcher only for the fixed-shape leaf check. Building a full AC
   unifier is future work if a rule set ever needs it — not this one. */

class PatternVar {
  constructor(name, predicate) {
    this.kind = "PVar";
    this.name = name;
    this.predicate = predicate || null;
  }
}

const Pattern = {
  var: (name) => new PatternVar(name),
  varIf: (name, predicate) => new PatternVar(name, predicate),
  any: () => ({ kind: "PAny" }),
  int: (n) => ({ kind: "PInt", value: typeof n === "bigint" ? n : BigInt(n) }),
  exact: (expr) => ({ kind: "PExact", expr }),
  sym: (name) => ({ kind: "PSym", name }),
  add: (...args) => ({ kind: "PAdd", args }),
  mul: (...args) => ({ kind: "PMul", args }),
  pow: (base, exp) => ({ kind: "PPow", base, exp }),
  func: (name, ...args) => ({ kind: "PFunc", name, args }),
  // Matches a Func whose name is ANY of `names` — e.g. "ln" and "log" as synonyms for
  // natural log, the convention this codebase already uses elsewhere (assumptions.js).
  // Indexed under the wildcard bucket in rules.js since it isn't tied to one head symbol.
  funcAny: (names, ...args) => ({ kind: "PFuncAny", names, args }),
};

// matchPattern(pattern, expr, bindings) -> Map | null. `bindings` is never mutated — matching
// returns a new Map on success, so callers can backtrack (try the next permutation, the next
// rule) just by discarding a failed attempt's bindings.
function matchPattern(pattern, expr, bindings) {
  switch (pattern.kind) {
    case "PVar": {
      if (pattern.predicate && !pattern.predicate(expr)) return null;
      const existing = bindings.get(pattern.name);
      if (existing === undefined) {
        const next = new Map(bindings);
        next.set(pattern.name, expr);
        return next;
      }
      return existing === expr ? bindings : null; // non-linear pattern: must match consistently
    }
    case "PAny":
      return bindings;
    case "PInt":
      return expr.kind === "Integer" && expr.value === pattern.value ? bindings : null;
    case "PExact":
      return expr === pattern.expr ? bindings : null;
    case "PSym":
      return expr.kind === "Symbol" && expr.name === pattern.name ? bindings : null;
    case "PPow": {
      if (expr.kind !== "Pow") return null;
      const b1 = matchPattern(pattern.base, expr.base, bindings);
      if (!b1) return null;
      return matchPattern(pattern.exp, expr.exp, b1);
    }
    case "PFunc": {
      if (expr.kind !== "Func" || expr.name !== pattern.name || expr.args.length !== pattern.args.length) {
        return null;
      }
      let b = bindings;
      for (let i = 0; i < pattern.args.length; i++) {
        b = matchPattern(pattern.args[i], expr.args[i], b);
        if (!b) return null;
      }
      return b;
    }
    case "PFuncAny": {
      if (expr.kind !== "Func" || !pattern.names.includes(expr.name) || expr.args.length !== pattern.args.length) {
        return null;
      }
      let b = bindings;
      for (let i = 0; i < pattern.args.length; i++) {
        b = matchPattern(pattern.args[i], expr.args[i], b);
        if (!b) return null;
      }
      return b;
    }
    case "PAdd":
    case "PMul": {
      const exprKind = pattern.kind === "PAdd" ? "Add" : "Mul";
      let actualArgs;
      if (expr.kind === exprKind) actualArgs = expr.args;
      else if (pattern.args.length === 1) actualArgs = [expr]; // degenerate 1-term "sum"/"product"
      else return null;
      if (actualArgs.length !== pattern.args.length) return null; // exact arity — see scope note above
      return matchCommutative(pattern.args, actualArgs, bindings);
    }
    default:
      throw new Error("matchPattern: unknown pattern kind " + pattern.kind);
  }
}

// Try every permutation of actualArgs against patterns positionally, short-circuiting on the
// first success. Fine for the small arities (2-4) that hand-written rules use; would need
// pruning for larger arities, which is not a case this rule set produces.
function matchCommutative(patterns, actualArgs, bindings) {
  const n = actualArgs.length;
  const used = new Array(n).fill(false);
  const order = new Array(n);

  function rec(k, b) {
    if (k === patterns.length) return b;
    for (let i = 0; i < n; i++) {
      if (used[i]) continue;
      const b2 = matchPattern(patterns[k], actualArgs[i], b);
      if (b2) {
        used[i] = true;
        order[k] = i;
        const result = rec(k + 1, b2);
        if (result) return result;
        used[i] = false;
      }
    }
    return null;
  }

  return rec(0, bindings);
}

// Entry point: match against a fresh, empty binding set.
function match(pattern, expr) {
  return matchPattern(pattern, expr, new Map());
}

module.exports = { Pattern, match, matchPattern };
