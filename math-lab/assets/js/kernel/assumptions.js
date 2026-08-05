"use strict";
/* L1 — Assumptions. See docs/kernel/03_ARCHITECTURE.md §3 L1.

   Three-valued logic (true / false / UNKNOWN — never collapse unknown into false), unary
   predicates with propagation, and relational predicates (x > y, both sides symbolic) with
   transitive closure over a small difference-logic constraint store. Contradiction is
   rejected at assertion time, because an inconsistent context proves everything and no
   downstream numeric check can catch the resulting unsound branch selection — see
   docs/kernel/12_RISKS.md R3b.

   Deliberately NOT a general theorem prover: the constraint store handles pairwise
   comparisons between symbols and rational constants plus transitivity, nothing nonlinear.
   That scope boundary is intentional (docs/kernel/03_ARCHITECTURE.md §3 L1). */

const { Expr } = require("./expr");
const { Rational } = require("./rational");

const UNKNOWN = "unknown";

class Contradiction extends Error {
  constructor(message) {
    super(message);
    this.name = "Contradiction";
  }
}

// ---------------------------------------------------------------------------------------
// Unary predicate implication / exclusion tables
// ---------------------------------------------------------------------------------------

const UNARY_PREDICATES = new Set([
  "real", "positive", "negative", "nonnegative", "nonpositive", "nonzero",
  "integer", "rational", "even", "odd", "finite",
]);

const IMPLIES = {
  positive: ["nonzero", "nonnegative", "real"],
  negative: ["nonzero", "nonpositive", "real"],
  nonnegative: ["real"],
  nonpositive: ["real"],
  nonzero: ["real"],
  integer: ["rational", "real"],
  rational: ["real"],
  even: ["integer", "rational", "real"],
  odd: ["integer", "rational", "real", "nonzero"],
  finite: [],
  real: [],
};

const EXCLUDES = {
  positive: ["negative", "nonpositive"],
  negative: ["positive", "nonnegative"],
  nonnegative: ["negative"],
  nonpositive: ["positive"],
  even: ["odd"],
  odd: ["even"],
};

function closeImplications(pred) {
  const seen = new Set([pred]);
  const queue = [pred];
  while (queue.length) {
    const p = queue.pop();
    for (const q of IMPLIES[p] || []) {
      if (!seen.has(q)) {
        seen.add(q);
        queue.push(q);
      }
    }
  }
  return seen;
}

function literalPredicate(e, predicate) {
  const v = Expr.numericValue(e);
  switch (predicate) {
    case "real": return true;
    case "rational": return true;
    case "integer": return v.isInteger;
    case "positive": return v.sign > 0;
    case "negative": return v.sign < 0;
    case "nonnegative": return v.sign >= 0;
    case "nonpositive": return v.sign <= 0;
    case "nonzero": return v.sign !== 0;
    case "finite": return true;
    case "even": return v.isInteger && v.num % 2n === 0n;
    case "odd": return v.isInteger && (v.num % 2n === 1n || v.num % 2n === -1n);
    default: return UNKNOWN;
  }
}

// ---------------------------------------------------------------------------------------
// Relational store — pairwise comparisons between symbols and rational constants, plus
// transitive closure. Rebuilt from the flat fact list on every query; deliberately simple,
// adequate for corpus-sized assumption sets (see docs/kernel/03_ARCHITECTURE.md §3 L1).
// ---------------------------------------------------------------------------------------

function termOf(expr) {
  if (typeof expr === "string") expr = Expr.sym(expr);
  if (expr.kind === "Symbol") return { key: "S:" + expr.name, numeric: undefined };
  if (Expr.isNumeric(expr)) {
    const v = Expr.numericValue(expr);
    return { key: "N:" + v.toString(), numeric: v };
  }
  throw new TypeError("Assumptions: relational terms must be a Symbol or numeric literal, got " + expr.kind);
}

const Rel = {
  gt: (a, b) => ({ type: "gt", a: termOf(a), b: termOf(b) }),
  ge: (a, b) => ({ type: "ge", a: termOf(a), b: termOf(b) }),
  eq: (a, b) => ({ type: "eq", a: termOf(a), b: termOf(b) }),
  ne: (a, b) => ({ type: "ne", a: termOf(a), b: termOf(b) }),
};

function buildGraph(facts) {
  const parent = new Map();
  function find(k) {
    if (!parent.has(k)) parent.set(k, k);
    let r = k;
    while (parent.get(r) !== r) r = parent.get(r);
    let cur = k;
    while (parent.get(cur) !== r) {
      const next = parent.get(cur);
      parent.set(cur, r);
      cur = next;
    }
    return r;
  }
  function union(a, b) {
    const ra = find(a), rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  }

  const known = new Map();
  for (const f of facts) {
    known.set(f.a.key, f.a);
    known.set(f.b.key, f.b);
    find(f.a.key);
    find(f.b.key);
  }

  for (const f of facts) if (f.type === "eq") union(f.a.key, f.b.key);

  const numericTerms = [...known.values()].filter((t) => t.numeric !== undefined);
  for (let i = 0; i < numericTerms.length; i++) {
    for (let j = i + 1; j < numericTerms.length; j++) {
      if (numericTerms[i].numeric.compare(numericTerms[j].numeric) === 0) {
        union(numericTerms[i].key, numericTerms[j].key);
      }
    }
  }

  const gt = new Map(); // root -> Set(root) : key is strictly greater than each member
  const ge = new Map();
  function addEdge(map, a, b) {
    if (!map.has(a)) map.set(a, new Set());
    map.get(a).add(b);
  }
  for (const f of facts) {
    if (f.type === "gt") addEdge(gt, find(f.a.key), find(f.b.key));
    else if (f.type === "ge") addEdge(ge, find(f.a.key), find(f.b.key));
  }
  for (let i = 0; i < numericTerms.length; i++) {
    for (let j = 0; j < numericTerms.length; j++) {
      if (i !== j && numericTerms[i].numeric.compare(numericTerms[j].numeric) > 0) {
        addEdge(gt, find(numericTerms[i].key), find(numericTerms[j].key));
      }
    }
  }

  const neRoots = facts.filter((f) => f.type === "ne").map((f) => [find(f.a.key), find(f.b.key)]);

  // Reachability from `startRoot` to `targetRoot` over gt ∪ ge edges, via a path of AT LEAST
  // ONE real edge (so reach(root, root) correctly answers "is there a cycle back to root?",
  // which hasStrictCycle relies on) — tracking whether the best path found used at least one
  // strict (gt) edge. Returns 'strict' | 'nonstrict' | null (unreachable).
  function reach(startRoot, targetRoot) {
    const reached = new Map(); // node -> 'strict' | 'nonstrict', best found so far
    const queue = [];
    function relax(node, strict) {
      if (reached.get(node) === "strict") return;
      if (reached.get(node) === "nonstrict" && !strict) return;
      reached.set(node, strict ? "strict" : "nonstrict");
      queue.push(node);
    }
    const gtStart = gt.get(startRoot);
    if (gtStart) for (const nxt of gtStart) relax(nxt, true);
    const geStart = ge.get(startRoot);
    if (geStart) for (const nxt of geStart) relax(nxt, false);

    let head = 0;
    while (head < queue.length) {
      const node = queue[head++];
      const strict = reached.get(node) === "strict";
      const gtNext = gt.get(node);
      if (gtNext) for (const nxt of gtNext) relax(nxt, true);
      const geNext = ge.get(node);
      if (geNext) for (const nxt of geNext) relax(nxt, strict);
    }
    return reached.has(targetRoot) ? reached.get(targetRoot) : null;
  }

  return { find, gt, ge, neRoots, reach };
}

function hasStrictCycle(graph, allKeys) {
  // Detect any root reachable from itself via a path containing at least one strict edge.
  for (const k of allKeys) {
    const root = graph.find(k);
    const r = graph.reach(root, root);
    if (r === "strict") return true;
  }
  return false;
}

function checkConsistency(facts) {
  const graph = buildGraph(facts);
  const allKeys = new Set();
  for (const f of facts) {
    allKeys.add(f.a.key);
    allKeys.add(f.b.key);
  }
  for (const [ra, rb] of graph.neRoots) {
    if (ra === rb) return { ok: false, reason: "a term was asserted both equal to and distinct from itself" };
  }
  if (hasStrictCycle(graph, allKeys)) {
    return { ok: false, reason: "a strict-order cycle exists (something would have to be greater than itself)" };
  }
  return { ok: true };
}

// query: 'gt' | 'ge' | 'eq' | 'ne' -> true | false | UNKNOWN
function queryRelation(facts, aExpr, bExpr, type) {
  const a = termOf(aExpr);
  const b = termOf(bExpr);
  const graph = buildGraph([...facts, { type: "ge", a, b: a }]); // ensure a,b are known nodes
  const ra = graph.find(a.key);
  const rb = graph.find(b.key);

  if (ra === rb) {
    // Equal: settles every query directly.
    if (type === "eq") return true;
    if (type === "ne") return false;
    if (type === "gt") return false;
    if (type === "ge") return true;
  }

  const forward = graph.reach(ra, rb); // best proof that a >(=) b
  const backward = graph.reach(rb, ra); // best proof that b >(=) a

  if (type === "eq") return UNKNOWN; // ra !== rb here, and order info alone can't prove equality
  if (type === "ne") {
    if (forward === "strict" || backward === "strict") return true;
    for (const f of facts) {
      if (f.type === "ne") {
        const fra = graph.find(f.a.key), frb = graph.find(f.b.key);
        if ((fra === ra && frb === rb) || (fra === rb && frb === ra)) return true;
      }
    }
    return UNKNOWN;
  }
  if (type === "gt") return forward === "strict" ? true : backward !== null ? false : UNKNOWN;
  if (type === "ge") return forward !== null ? true : backward === "strict" ? false : UNKNOWN;
  return UNKNOWN;
}

// ---------------------------------------------------------------------------------------
// Assumption context
// ---------------------------------------------------------------------------------------

let scopeCounter = 0;

class AssumptionContext {
  constructor(parent) {
    this.parent = parent || null;
    this.unaryTrue = new Map(); // symbolName -> Set<predicate>
    this.unaryFalse = new Map();
    this.relFacts = []; // local relational facts only
    this._id = ++scopeCounter;
  }

  static create() {
    return new AssumptionContext(null);
  }

  withScope(fn) {
    const child = new AssumptionContext(this);
    return fn(child);
  }

  allRelFacts() {
    const chain = [];
    for (let c = this; c; c = c.parent) chain.push(...c.relFacts);
    return chain;
  }

  isConsistent() {
    return checkConsistency(this.allRelFacts()).ok;
  }

  _localTrue(name) {
    return this.unaryTrue.get(name);
  }
  _localFalse(name) {
    return this.unaryFalse.get(name);
  }

  // ask(target, predicate) — target is a symbol name (string) or an Expr.
  ask(target, predicate) {
    if (typeof target === "string") target = Expr.sym(target);
    return this._askExpr(target, predicate);
  }

  _askExpr(e, predicate) {
    if (Expr.isNumeric(e)) return literalPredicate(e, predicate);

    if (e.kind === "Symbol") return this._askSymbol(e.name, predicate);

    if (e.kind === "Pow" && e.exp.kind === "Integer" && e.exp.value === 2n) {
      if (predicate === "nonnegative") return true;
      if (predicate === "real") return this._askExpr(e.base, "real");
      if (predicate === "positive") return this._threeValued(this._askExpr(e.base, "nonzero"));
      if (predicate === "nonzero") return this._threeValued(this._askExpr(e.base, "nonzero"));
    }

    // Sign propagation through Add and Mul — e.g. x>0, y>0 => x*y > 0. This is what lets
    // `ctx.ask(Mul(x,y), 'positive')` resolve, which the log-combine rule (Phase 2) needs:
    // combining log(x)+log(y) into log(xy) requires knowing xy is positive, not just x and y.
    if (
      (e.kind === "Mul" || e.kind === "Add") &&
      ["positive", "negative", "nonnegative", "nonpositive", "nonzero"].includes(predicate)
    ) {
      const s = this._signOf(e);
      if (s !== null) {
        if (predicate === "positive") return s > 0;
        if (predicate === "negative") return s < 0;
        if (predicate === "nonnegative") return s >= 0;
        if (predicate === "nonpositive") return s <= 0;
        if (predicate === "nonzero") return s !== 0;
      }
    }

    if (e.kind === "Func" && e.args.length === 1) {
      if (e.name === "sqrt") {
        if (predicate === "nonnegative") return true;
        if (predicate === "real") return this._threeValued(this._askExpr(e.args[0], "nonnegative"));
      }
      if (e.name === "ln" || e.name === "log") {
        if (predicate === "real") return this._threeValued(this._askExpr(e.args[0], "positive"));
      }
    }

    return UNKNOWN;
  }

  _threeValued(v) {
    return v === true ? true : v === false ? false : UNKNOWN;
  }

  // Sign of an expression: 1 | -1 | 0 | null (unknown). Recurses through Mul/Add structurally
  // (a product is positive iff every factor is nonzero and the count of negative factors is
  // even; a sum is resolvable only when every term shares — or is silent on — one sign);
  // anything else delegates back to the ordinary predicate machinery for its base case.
  _signOf(e) {
    if (Expr.isNumeric(e)) return Expr.numericValue(e).sign;
    if (e.kind === "Mul") {
      let sign = 1;
      for (const f of e.args) {
        const s = this._signOf(f);
        if (s === null) return null;
        if (s === 0) return 0;
        sign *= s;
      }
      return sign;
    }
    if (e.kind === "Add") {
      let sawPositive = false, sawNegative = false, allNonNegative = true, allNonPositive = true;
      for (const t of e.args) {
        const s = this._signOf(t);
        if (s === null) return null;
        if (s > 0) {
          sawPositive = true;
          allNonPositive = false;
        } else if (s < 0) {
          sawNegative = true;
          allNonNegative = false;
        }
      }
      if (sawPositive && allNonNegative) return 1;
      if (sawNegative && allNonPositive) return -1;
      if (!sawPositive && !sawNegative) return 0;
      return null; // genuinely mixed signs — this helper does not attempt cancellation
    }
    if (this._askExpr(e, "positive") === true) return 1;
    if (this._askExpr(e, "negative") === true) return -1;
    return null;
  }

  _askSymbol(name, predicate) {
    if (!UNARY_PREDICATES.has(predicate)) {
      throw new TypeError("Assumptions: unknown predicate '" + predicate + "'");
    }
    for (let c = this; c; c = c.parent) {
      if (c._localTrue(name) && c._localTrue(name).has(predicate)) return true;
      if (c._localFalse(name) && c._localFalse(name).has(predicate)) return false;
    }
    // bridge: unary sign predicates <-> relational comparison against 0
    const sym = Expr.sym(name);
    const facts = this.allRelFacts();
    if (predicate === "positive") return this._threeValued(queryRelation(facts, sym, Expr.ZERO, "gt"));
    if (predicate === "negative") return this._threeValued(queryRelation(facts, Expr.ZERO, sym, "gt"));
    if (predicate === "nonnegative") return this._threeValued(queryRelation(facts, sym, Expr.ZERO, "ge"));
    if (predicate === "nonpositive") return this._threeValued(queryRelation(facts, Expr.ZERO, sym, "ge"));
    if (predicate === "nonzero") return this._threeValued(queryRelation(facts, sym, Expr.ZERO, "ne"));
    return UNKNOWN;
  }

  // assume(name, predicate) — unary form. assume(relDescriptor) — relational form (see Rel.*).
  assume(nameOrRel, predicate) {
    if (predicate === undefined) return this._assumeRelational(nameOrRel);
    return this._assumeUnary(typeof nameOrRel === "string" ? nameOrRel : nameOrRel.name, predicate);
  }

  _assumeUnary(name, predicate) {
    if (!UNARY_PREDICATES.has(predicate)) {
      throw new TypeError("Assumptions: unknown predicate '" + predicate + "'");
    }
    const already = this.ask(name, predicate);
    if (already === false) {
      throw new Contradiction(`Assumptions: '${name}' is already known NOT '${predicate}'`);
    }
    if (already === true) return; // redundant, no-op

    const impliedTrue = closeImplications(predicate);
    const impliedFalse = new Set();
    for (const p of impliedTrue) for (const q of EXCLUDES[p] || []) impliedFalse.add(q);

    for (const p of impliedTrue) {
      if (this.ask(name, p) === false) {
        throw new Contradiction(`Assumptions: asserting '${predicate}' for '${name}' implies '${p}', which is already false`);
      }
    }
    for (const q of impliedFalse) {
      if (this.ask(name, q) === true) {
        throw new Contradiction(`Assumptions: asserting '${predicate}' for '${name}' excludes '${q}', which is already true`);
      }
    }

    if (!this.unaryTrue.has(name)) this.unaryTrue.set(name, new Set());
    if (!this.unaryFalse.has(name)) this.unaryFalse.set(name, new Set());
    for (const p of impliedTrue) this.unaryTrue.get(name).add(p);
    for (const q of impliedFalse) this.unaryFalse.get(name).add(q);

    const sym = Expr.sym(name);
    const bridge = {
      positive: () => this._assumeRelational(Rel.gt(sym, Expr.ZERO)),
      negative: () => this._assumeRelational(Rel.gt(Expr.ZERO, sym)),
      nonnegative: () => this._assumeRelational(Rel.ge(sym, Expr.ZERO)),
      nonpositive: () => this._assumeRelational(Rel.ge(Expr.ZERO, sym)),
      nonzero: () => this._assumeRelational(Rel.ne(sym, Expr.ZERO)),
    };
    for (const p of impliedTrue) if (bridge[p]) bridge[p]();
  }

  _assumeRelational(rel) {
    const proposed = [...this.allRelFacts(), rel];
    const check = checkConsistency(proposed);
    if (!check.ok) {
      throw new Contradiction("Assumptions: relational assumption is inconsistent — " + check.reason);
    }
    this.relFacts.push(rel);
  }

  askRelation(aExpr, bExpr, type) {
    return queryRelation(this.allRelFacts(), aExpr, bExpr, type);
  }
}

module.exports = { AssumptionContext, Rel, UNKNOWN, Contradiction, UNARY_PREDICATES };
