"use strict";
/* L0 — Expression representation. See docs/kernel/03_ARCHITECTURE.md §3.

   Node kinds: Integer, Rational, Symbol, BoundVar, Add, Mul, Pow, Func, Bind.
   There is no Sub or Div — `a-b` is Add(a, Mul(-1,b)); `a/b` is Mul(a, Pow(b,-1)).

   Every node is hash-consed: structurally identical expressions are the SAME object, so
   `.equals` is reference equality and canonical ordering makes commutative operands
   (x+y vs y+x) collapse to one object. This is what makes the rest of the kernel possible.

   Binder nodes (Integral/Derivative/Limit/Sum/Product) are `Bind`, not `Func` — a binder is
   not a function of its bound variable. Bound variables are represented with de Bruijn
   indices (`BoundVar`), which makes alpha-equivalence automatic (it falls out of hash-consing
   for free) and makes variable capture during substitution structurally impossible, because a
   free `Symbol` and a `BoundVar` are different node kinds that can never collide by name. See
   docs/kernel/03_ARCHITECTURE.md §3 L0 for the failure modes this avoids. */

const { Rational } = require("./rational");

// ---------------------------------------------------------------------------------------
// Hash / intern infrastructure
// ---------------------------------------------------------------------------------------

function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

const internTable = new Map();

function intern(node) {
  const key = node._key;
  const existing = internTable.get(key);
  if (existing) return existing;
  node._hash = fnv1a(key);
  node.hash = function () {
    return this._hash;
  };
  node.equals = function (other) {
    return this === other;
  };
  if (node.args) Object.freeze(node.args);
  if (node.extra) Object.freeze(node.extra);
  Object.freeze(node);
  internTable.set(key, node);
  return node;
}

// Exposed for tests: production usage will scope this per-request once the server
// boundary lands (Phase 8); a single global table is correct and adequate for Phase 1.
function clearInternTable() {
  internTable.clear();
}

function internSize() {
  return internTable.size;
}

// ---------------------------------------------------------------------------------------
// Canonical total order — see docs/kernel/03_ARCHITECTURE.md §3 L0 "Canonical ordering"
// ---------------------------------------------------------------------------------------

const RANK = {
  Integer: 0,
  Rational: 0,
  Symbol: 1,
  BoundVar: 2,
  Pow: 3,
  Mul: 4,
  Add: 5,
  Func: 6,
  Bind: 7,
};

function isNumeric(e) {
  return e.kind === "Integer" || e.kind === "Rational";
}

function numericValue(e) {
  return e.kind === "Integer" ? Rational.of(e.value, 1n) : e.value;
}

function compareArrays(a, b) {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const c = compareExpr(a[i], b[i]);
    if (c !== 0) return c;
  }
  return a.length - b.length;
}

function compareExpr(a, b) {
  if (a === b) return 0;
  const ra = RANK[a.kind];
  const rb = RANK[b.kind];
  if (ra !== rb) return ra - rb;
  switch (a.kind) {
    case "Integer":
    case "Rational":
      return numericValue(a).compare(numericValue(b));
    case "Symbol":
      return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
    case "BoundVar":
      return a.depth - b.depth;
    case "Pow": {
      const c = compareExpr(a.base, b.base);
      return c !== 0 ? c : compareExpr(a.exp, b.exp);
    }
    case "Mul":
    case "Add":
      return compareArrays(a.args, b.args);
    case "Func": {
      if (a.name !== b.name) return a.name < b.name ? -1 : 1;
      return compareArrays(a.args, b.args);
    }
    case "Bind": {
      if (a.head !== b.head) return a.head < b.head ? -1 : 1;
      const c = compareExpr(a.body, b.body);
      if (c !== 0) return c;
      return compareArrays(a.extra, b.extra);
    }
    default:
      throw new Error("compareExpr: unknown kind " + a.kind);
  }
}

// ---------------------------------------------------------------------------------------
// Leaf constructors
// ---------------------------------------------------------------------------------------

function numericExprFromRational(r) {
  return r.isInteger ? intExpr(r.num) : ratExpr(r);
}

function intExpr(value) {
  if (typeof value === "number") value = BigInt(value);
  if (typeof value === "string") value = BigInt(value);
  const node = { kind: "Integer", value, _key: "I:" + value.toString() };
  return intern(node);
}

function ratExpr(r) {
  if (r.isInteger) return intExpr(r.num);
  const node = { kind: "Rational", value: r, _key: "R:" + r.num.toString() + "/" + r.den.toString() };
  return intern(node);
}

function symExpr(name) {
  if (typeof name !== "string" || name.length === 0) {
    throw new TypeError("Expr.sym: name must be a non-empty string");
  }
  const node = { kind: "Symbol", name, _key: "S:" + name };
  return intern(node);
}

function boundVarExpr(depth) {
  if (!Number.isInteger(depth) || depth < 0) {
    throw new TypeError("BoundVar: depth must be a non-negative integer");
  }
  const node = { kind: "BoundVar", depth, _key: "V:" + depth };
  return intern(node);
}

// ---------------------------------------------------------------------------------------
// Add / Mul — n-ary, flattened, canonically sorted, numeric-folded
// ---------------------------------------------------------------------------------------

function addFromArray(argsIn) {
  const flat = [];
  for (const a of argsIn) {
    if (a.kind === "Add") flat.push(...a.args);
    else flat.push(a);
  }
  let numSum = Rational.ZERO;
  const others = [];
  for (const a of flat) {
    if (isNumeric(a)) numSum = numSum.add(numericValue(a));
    else others.push(a);
  }
  others.sort(compareExpr);
  const terms = [];
  if (!numSum.isZero || others.length === 0) terms.push(numericExprFromRational(numSum));
  terms.push(...others);
  if (terms.length === 0) return intExpr(0n);
  if (terms.length === 1) return terms[0];
  const node = { kind: "Add", args: terms, _key: "A(" + terms.map((t) => t._key).join(",") + ")" };
  return intern(node);
}

function mulFromArray(argsIn) {
  const flat = [];
  for (const a of argsIn) {
    if (a.kind === "Mul") flat.push(...a.args);
    else flat.push(a);
  }
  let coeff = Rational.ONE;
  const others = [];
  for (const a of flat) {
    if (isNumeric(a)) coeff = coeff.mul(numericValue(a));
    else others.push(a);
  }
  if (coeff.isZero) return intExpr(0n);
  others.sort(compareExpr);
  const terms = [];
  if (!coeff.isOne || others.length === 0) terms.push(numericExprFromRational(coeff));
  terms.push(...others);
  if (terms.length === 0) return intExpr(1n);
  if (terms.length === 1) return terms[0];
  const node = { kind: "Mul", args: terms, _key: "M(" + terms.map((t) => t._key).join(",") + ")" };
  return intern(node);
}

// ---------------------------------------------------------------------------------------
// Pow — integer exponents fold arithmetically; fractional/symbolic exponents stay symbolic
// (radical reduction under assumptions is L1's job, not L0's — see docs/kernel/03 L1)
// ---------------------------------------------------------------------------------------

function powExpr(base, exp) {
  if (exp.kind === "Integer") {
    const e = exp.value;
    if (e === 0n) return intExpr(1n); // 0^0 := 1, documented convention (empty product)
    if (isNumeric(base)) {
      const rv = numericValue(base);
      if (rv.isZero) {
        if (e < 0n) throw new RangeError("Pow: 0 to a negative power");
        return intExpr(0n);
      }
      return numericExprFromRational(rv.pow(e));
    }
    if (e === 1n) return base;
    // (b^m)^n = b^(mn) for integer m, n is unconditional arithmetic (associativity of
    // repeated multiplication for any nonzero b), not an algebraic identity requiring
    // assumptions — unlike fractional exponents, e.g. (x^2)^(1/2), which do. Folding this
    // at L0 also keeps division ("1/x^2") and direct negative-exponent forms ("x^-2")
    // structurally identical, which the printer's round-trip gate depends on.
    if (base.kind === "Pow" && base.exp.kind === "Integer") {
      return powExpr(base.base, intExpr(base.exp.value * e));
    }
    const node = { kind: "Pow", base, exp, _key: "P(" + base._key + "," + exp._key + ")" };
    return intern(node);
  }
  if (base.kind === "Integer" && base.value === 1n) return intExpr(1n);
  if (base.kind === "Integer" && base.value === 0n && isNumeric(exp)) {
    const rv = numericValue(exp);
    if (rv.sign > 0) return intExpr(0n); // 0^(positive rational) = 0
  }
  const node = { kind: "Pow", base, exp, _key: "P(" + base._key + "," + exp._key + ")" };
  return intern(node);
}

// ---------------------------------------------------------------------------------------
// Func — plain function application; no auto-evaluation (that is L2/L3's job)
// ---------------------------------------------------------------------------------------

function funcExpr(name, args) {
  if (typeof name !== "string" || name.length === 0) {
    throw new TypeError("Expr.func: name must be a non-empty string");
  }
  const node = {
    kind: "Func",
    name,
    args: args.slice(),
    _key: "F:" + name + "(" + args.map((a) => a._key).join(",") + ")",
  };
  return intern(node);
}

// ---------------------------------------------------------------------------------------
// Bind — Integral / Derivative / Limit / Sum / Product. De Bruijn indices under the hood.
//
// Invariant (see docs/kernel/03_ARCHITECTURE.md §3 L0): a Bind's `body` sits one more
// body-scope layer in than its own position; its `extra` (bounds, limit point, etc.) does
// NOT — extra is evaluated in the enclosing scope, not the bound variable's scope. This
// asymmetry (body: depth+1, extra: depth+0) is applied uniformly, including at the moment
// a fresh Bind is constructed, which is why nested binders (double integrals) resolve
// correctly without special-casing the top level.
// ---------------------------------------------------------------------------------------

function bindRaw(head, body, extra, displayName) {
  const node = {
    kind: "Bind",
    head,
    body,
    extra: extra.slice(),
    displayName,
    _key: "D:" + head + "(" + body._key + ";" + extra.map((e) => e._key).join(",") + ")",
  };
  return intern(node);
}

function walk(expr, name, depth, leafFn) {
  switch (expr.kind) {
    case "Symbol":
      return expr.name === name ? leafFn(depth) : expr;
    case "BoundVar":
    case "Integer":
    case "Rational":
      return expr;
    case "Add":
      return addFromArray(expr.args.map((a) => walk(a, name, depth, leafFn)));
    case "Mul":
      return mulFromArray(expr.args.map((a) => walk(a, name, depth, leafFn)));
    case "Pow":
      return powExpr(walk(expr.base, name, depth, leafFn), walk(expr.exp, name, depth, leafFn));
    case "Func":
      return funcExpr(expr.name, expr.args.map((a) => walk(a, name, depth, leafFn)));
    case "Bind":
      return bindRaw(
        expr.head,
        walk(expr.body, name, depth + 1, leafFn),
        expr.extra.map((e) => walk(e, name, depth, leafFn)),
        expr.displayName
      );
    default:
      throw new Error("walk: unknown kind " + expr.kind);
  }
}

function bindifyWalk(expr, name, depth) {
  return walk(expr, name, depth, (d) => boundVarExpr(d));
}

function bindExpr(head, nameOrSymbol, bodyArg, extraArgs, displayName) {
  extraArgs = extraArgs || [];
  const name = typeof nameOrSymbol === "string" ? nameOrSymbol : nameOrSymbol.name;
  const dn = displayName || name;
  const newBody = bindifyWalk(bodyArg, name, 0);
  const newExtra = extraArgs.map((e) => bindifyWalk(e, name, 0));
  return bindRaw(head, newBody, newExtra, dn);
}

// Capture-avoiding substitution of a FREE symbol by an arbitrary replacement expression.
// This is the only substitution primitive in the kernel. Capture is structurally
// impossible: a bound occurrence is a BoundVar, never a Symbol, so it can never be
// confused with the free Symbol being replaced, regardless of what the replacement contains.
function shift(expr, amount, cutoff) {
  if (amount === 0) return expr;
  switch (expr.kind) {
    case "BoundVar":
      return expr.depth >= cutoff ? boundVarExpr(expr.depth + amount) : expr;
    case "Symbol":
    case "Integer":
    case "Rational":
      return expr;
    case "Add":
      return addFromArray(expr.args.map((a) => shift(a, amount, cutoff)));
    case "Mul":
      return mulFromArray(expr.args.map((a) => shift(a, amount, cutoff)));
    case "Pow":
      return powExpr(shift(expr.base, amount, cutoff), shift(expr.exp, amount, cutoff));
    case "Func":
      return funcExpr(expr.name, expr.args.map((a) => shift(a, amount, cutoff)));
    case "Bind":
      return bindRaw(
        expr.head,
        shift(expr.body, amount, cutoff + 1),
        expr.extra.map((e) => shift(e, amount, cutoff)),
        expr.displayName
      );
    default:
      throw new Error("shift: unknown kind " + expr.kind);
  }
}

function subst(expr, fromName, toExpr, depth) {
  depth = depth || 0;
  switch (expr.kind) {
    case "Symbol":
      return expr.name === fromName ? shift(toExpr, depth, 0) : expr;
    case "BoundVar":
    case "Integer":
    case "Rational":
      return expr;
    case "Add":
      return addFromArray(expr.args.map((a) => subst(a, fromName, toExpr, depth)));
    case "Mul":
      return mulFromArray(expr.args.map((a) => subst(a, fromName, toExpr, depth)));
    case "Pow":
      return powExpr(subst(expr.base, fromName, toExpr, depth), subst(expr.exp, fromName, toExpr, depth));
    case "Func":
      return funcExpr(expr.name, expr.args.map((a) => subst(a, fromName, toExpr, depth)));
    case "Bind":
      return bindRaw(
        expr.head,
        subst(expr.body, fromName, toExpr, depth + 1),
        expr.extra.map((e) => subst(e, fromName, toExpr, depth)),
        expr.displayName
      );
    default:
      throw new Error("subst: unknown kind " + expr.kind);
  }
}

function freeSymbols(expr, acc) {
  acc = acc || new Set();
  switch (expr.kind) {
    case "Symbol":
      acc.add(expr.name);
      break;
    case "BoundVar":
    case "Integer":
    case "Rational":
      break;
    case "Add":
    case "Mul":
      for (const a of expr.args) freeSymbols(a, acc);
      break;
    case "Pow":
      freeSymbols(expr.base, acc);
      freeSymbols(expr.exp, acc);
      break;
    case "Func":
      for (const a of expr.args) freeSymbols(a, acc);
      break;
    case "Bind":
      freeSymbols(expr.body, acc);
      for (const e of expr.extra) freeSymbols(e, acc);
      break;
    default:
      throw new Error("freeSymbols: unknown kind " + expr.kind);
  }
  return acc;
}

// ---------------------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------------------

const Expr = {
  int: intExpr,
  rat: (num, den) => ratExpr(Rational.of(num, den === undefined ? 1n : den)),
  sym: symExpr,
  boundVar: boundVarExpr,
  add: (...args) => addFromArray(args),
  mul: (...args) => mulFromArray(args),
  pow: powExpr,
  func: funcExpr,
  bind: bindExpr,
  bindRaw,
  neg: (a) => mulFromArray([intExpr(-1n), a]),
  sub: (a, b) => addFromArray([a, mulFromArray([intExpr(-1n), b])]),
  div: (a, b) => mulFromArray([a, powExpr(b, intExpr(-1n))]),

  isNumeric,
  numericValue,
  compare: compareExpr,
  subst,
  freeSymbols,

  clearInternTable,
  internSize,
};

Expr.ZERO = intExpr(0n);
Expr.ONE = intExpr(1n);
Expr.MINUS_ONE = intExpr(-1n);
Expr.TWO = intExpr(2n);

module.exports = { Expr, Rational };
