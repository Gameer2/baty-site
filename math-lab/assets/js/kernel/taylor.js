"use strict";
/* L3 — Taylor / Maclaurin series to symbolic order. See docs/kernel/04_BUILD_PHASES.md
   Phase 4 task 1 (Taylor series with symbolic order) and docs/kernel/08_ENGINE_CALCULUS.md
   (Taylor / power series capability).

   taylor(expr, varName, center, order) -> { refused, result, derivation } where
     result = Sum_{k=0}^{order} f^(k)(a) / k! * (varName - a)^k,
   computed by repeated symbolic differentiation (differentiate.js) and exact evaluation of each
   derivative at the center a. Center 0 is the Maclaurin series.

   Coefficients are EXACT: each derivative is substituted with varName -> a (a Rational literal,
   via Expr.subst) and then reduced by `reduceConstants`, which evaluates elementary functions at
   rational arguments to exact Rationals in the cases that yield rationals — exp(0)=1, sin(0)=0,
   cos(0)=1, ln(1)=0, sqrt(perfect square), abs(numeric), and the Pow folds Expr already performs
   (1^anything=1, 0^positive=0, numeric^integer). At a general center a coefficient may be
   transcendental (e.g. exp(1) for e^x about x=1); it is then carried symbolically as an exact
   Expr coefficient — the Taylor polynomial is still correct, just not rational-coefficiented.

   There is no numeric (Math.*) evaluator in the kernel (it is exact-arithmetic only);
   `reduceConstants` is the symbolic route to exact coefficients. Numeric verification
   (truncated partial sum vs the function on the interval of convergence) lives in the tests
   (docs/kernel/03_ARCHITECTURE.md §3 L4).

   Refuses if any derivative refuses (differentiate.js refusal propagates). Production wiring
   deferred — same kernel-vs-production boundary as Phases 1-3. */

const { Expr, Rational } = require("./expr");
const { Derivation } = require("./derivation");
const { differentiate } = require("./differentiate");

const ZERO = Expr.ZERO;
const ONE = Expr.ONE;

// Coerce a center spec (Rational | BigInt | number | numeric Expr) to a numeric Expr.
function centerToExpr(center) {
  if (Expr.isNumeric(center)) return center;
  if (center && typeof center === "object" && "num" in center && "den" in center) {
    // Rational instance
    return center.isInteger ? Expr.int(center.num) : Expr.rat(center.num, center.den);
  }
  if (typeof center === "number" || typeof center === "bigint") {
    const r = Rational.of(center, 1n);
    return r.isInteger ? Expr.int(r.num) : Expr.rat(r.num, r.den);
  }
  throw new TypeError("taylor: center must be a Rational, BigInt, number, or numeric Expr");
}

// Exact value of an elementary function at a Rational argument, when that value is itself a
// Rational; otherwise null (leave symbolic). This is the only "evaluation" the kernel does —
// it never approximates a transcendental value.
function funcRational(name, r) {
  switch (name) {
    case "exp":
      return r.isZero ? ONE : null; // exp(0)=1; exp(nonzero rational) is transcendental
    case "ln":
    case "log":
      return r.isZero ? null : r.isOne ? ZERO : null; // ln(1)=0; ln(other rational) transcendental
    case "sin":
      return r.isZero ? ZERO : null;
    case "cos":
      return r.isZero ? ONE : null;
    case "tan":
      return r.isZero ? ZERO : null;
    case "sinh":
      return r.isZero ? ZERO : null;
    case "cosh":
      return r.isZero ? ONE : null;
    case "tanh":
      return r.isZero ? ZERO : null;
    case "asin":
      return r.isZero ? ZERO : null; // asin(0)=0; asin(±1)=±π/2 not rational
    case "atan":
      return r.isZero ? ZERO : null;
    case "abs": {
      const a = r.abs();
      return a.isInteger ? Expr.int(a.num) : Expr.rat(a.num, a.den);
    }
    case "sqrt": {
      const root = rationalSqrt(r);
      if (root) return root.isInteger ? Expr.int(root.num) : Expr.rat(root.num, root.den);
      return null; // sqrt(non-perfect-square) stays symbolic (exact algebraic constant)
    }
    default:
      return null;
  }
}

// BigInt integer square root (floor). Returns null if n is not a perfect square.
function bigIntSqrt(n) {
  if (n < 0n) return null;
  if (n < 2n) return n;
  let x = n, y = (x + 1n) / 2n;
  while (y < x) { x = y; y = (x + n / x) / 2n; }
  return x * x === n ? x : null;
}

// Exact sqrt of a non-negative Rational if it is a perfect square (num and den both perfect
// squares); else null.
function rationalSqrt(r) {
  if (r.sign < 0) return null;
  const ns = bigIntSqrt(r.num);
  const ds = bigIntSqrt(r.den);
  if (ns === null || ds === null) return null;
  return Rational.of(ns, ds);
}

// Reduce an Expr by evaluating elementary functions / powers at constant sub-expressions to
// exact Rationals where possible. Recursive bottom-up. Non-reducible parts are rebuilt unchanged.
function reduceConstants(e) {
  switch (e.kind) {
    case "Integer":
    case "Rational":
    case "Symbol":
    case "BoundVar":
      return e;
    case "Add":
      return Expr.add(...e.args.map(reduceConstants));
    case "Mul":
      return Expr.mul(...e.args.map(reduceConstants));
    case "Pow": {
      const b = reduceConstants(e.base);
      const ex = reduceConstants(e.exp);
      if (Expr.isNumeric(b) && Expr.isNumeric(ex)) {
        const bv = Expr.numericValue(b);
        const ev = Expr.numericValue(ex);
        // 0 to a non-positive power is undefined (a pole / branch-point residue): negative integer
        // OR negative fractional (e.g. 0^(-1/2) from d/dx sqrt(x) = 1/(2 sqrt x) at 0). Throw so
        // callers like taylor() catch RangeError and refuse honestly instead of keeping a symbolic
        // Pow(0, negative) "coefficient" (which would build a garbage series at a branch point).
        if (bv.isZero && ev.sign < 0) {
          throw new RangeError("Pow: 0 to a negative power");
        }
        // integer exponent of a numeric base -> exact Rational (Expr.pow folds this, but compute
        // directly so a Rational base is handled too)
        if (ev.isInteger) {
          const p = bv.pow(ev.num);
          return p.isInteger ? Expr.int(p.num) : Expr.rat(p.num, p.den);
        }
        // fractional exponent 1/d of a perfect-d-th-power Rational -> exact root
        if (ev.num === 1n) {
          const root = rationalRoot(bv, ev.den);
          if (root) return root.isInteger ? Expr.int(root.num) : Expr.rat(root.num, root.den);
        }
        // else leave symbolic (e.g. 2^(1/2) is an exact algebraic constant)
        return Expr.pow(b, ex);
      }
      return Expr.pow(b, ex);
    }
    case "Func": {
      const args = e.args.map(reduceConstants);
      if (args.length === 1 && Expr.isNumeric(args[0])) {
        const v = funcRational(e.name, Expr.numericValue(args[0]));
        if (v !== null) return v;
      }
      return Expr.func(e.name, args);
    }
    case "Bind":
      return Expr.bindRaw(e.head, reduceConstants(e.body), e.extra.map(reduceConstants), e.displayName);
    default:
      return e;
  }
}

// d-th root of a non-negative Rational r if r = (p/q)^d exactly; else null. d >= 2.
function rationalRoot(r, d) {
  if (r.sign < 0) return null;
  const nroot = bigIntRoot(r.num, d);
  const droot = bigIntRoot(r.den, d);
  if (nroot === null || droot === null) return null;
  return Rational.of(nroot, droot);
}

// Integer d-th root of a non-negative BigInt n if exact; else null.
function bigIntRoot(n, d) {
  if (n < 0n) return null;
  if (n === 0n) return 0n;
  if (n === 1n) return 1n;
  // Newton iteration for the d-th root.
  let x = 1n;
  // initial guess: 2^(ceil(bitlen/d))
  const bits = n.toString(2).length;
  x = 1n << BigInt(Math.ceil(bits / Number(d)));
  for (;;) {
    const xpow = powBigInt(x, d - 1n);
    const next = ((d - 1n) * x + n / xpow) / d;
    if (next >= x) break;
    x = next;
  }
  return powBigInt(x, d) === n ? x : null;
}

function powBigInt(base, exp) {
  let r = 1n;
  while (exp > 0n) { if (exp & 1n) r *= base; base *= base; exp >>= 1n; }
  return r;
}

// Extract a Rational coefficient from a numeric Expr, else null (symbolic coefficient).
function coeffRational(e) {
  return Expr.isNumeric(e) ? Expr.numericValue(e) : null;
}

const RULE = {
  id: "kernel:taylor",
  name: "taylor",
  source: "kernel",
  describe: () => ({ text: "Taylor expansion via repeated differentiation", latex: "" }),
};

// taylor(expr, varName, center, order, ctx?) -> { refused, result, derivation } | { refused, reason }.
function taylor(expr, varName, center, order, ctx) {
  if (!Number.isInteger(order) || order < 0) {
    return { refused: true, reason: "taylor: order must be a non-negative integer" };
  }
  const centerExpr = centerToExpr(center);
  const basis = Expr.sub(Expr.sym(varName), centerExpr); // (varName - a)
  const terms = [];
  let fact = Rational.ONE; // k!
  let f = expr;
  for (let k = 0; k <= order; k++) {
    if (k > 0) fact = fact.mul(Rational.of(k, 1n));
    let subbed;
    try {
      subbed = reduceConstants(Expr.subst(f, varName, centerExpr));
    } catch (e) {
      // Substitution produced an undefined form (e.g. 0^(negative) from a pole or removable
      // singularity still present in the unreduced expression). The function is not analytic at
      // the center in this representation; refuse honestly rather than throw. laurent() handles
      // these by reducing first, so route expansions about singular points there.
      if (e instanceof RangeError) {
        return { refused: true, reason: "taylor: function is not analytic at the center in this form (a pole, removable singularity, or branch point remains unreduced — e.g. a fractional power at the center is Puiseux territory, which needs the ℚ(α) extension-field arithmetic deferred in Phase 3); use laurent() for expansions about rational poles" };
      }
      throw e;
    }
    const c = coeffRational(subbed);
    if (c !== null) {
      if (c.isZero) { /* skip zero term, unless it is the only one */ if (k === order && terms.length === 0) terms.push(ZERO); }
      else {
        const ck = c.div(fact);
        const cExpr = ck.isInteger ? Expr.int(ck.num) : Expr.rat(ck.num, ck.den);
        terms.push(k === 0 ? cExpr : Expr.mul(cExpr, Expr.pow(basis, Expr.int(k))));
      }
    } else {
      // symbolic coefficient: (subbed / k!) * (x-a)^k
      const cExpr = fact.isOne ? subbed : Expr.div(subbed, fact.isInteger ? Expr.int(fact.num) : Expr.rat(fact.num, fact.den));
      terms.push(k === 0 ? cExpr : Expr.mul(cExpr, Expr.pow(basis, Expr.int(k))));
    }
    if (k < order) {
      const d = differentiate(f, varName, ctx);
      if (d.refused) return { refused: true, reason: "taylor: " + d.reason };
      f = d.result;
    }
  }
  const result = terms.length ? Expr.add(...terms) : ZERO;
  const goal = Expr.bindRaw("Sum", /* symbol not needed for display */ result, [], "taylor");
  // A simpler, informative goal: the Taylor polynomial is its own goal-display; record the
  // expansion as a single derivation step (sub-derivations of each differentiate are omitted to
  // keep the tree shallow — the per-derivative provenance is available via differentiate.js).
  const derivation = Derivation.step(RULE, {}, expr, result, ctx || null, []);
  return { refused: false, result, derivation };
}

module.exports = { taylor, reduceConstants };