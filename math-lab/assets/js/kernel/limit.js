"use strict";
/* L3 — Series + L'Hopital-based limit (Gruntz-style, NOT full mrv-Gruntz). See
   docs/kernel/04_BUILD_PHASES.md Phase 4 task 5 (limits) and docs/kernel/08_ENGINE_CALCULUS.md.

   limit(expr, varName, point, ctx?) ->
     { refused, kind, result, sign?, derivation } | { refused, reason }
   where point is a Rational | number | BigInt | numeric Expr | +/-Infinity; kind in
   "finite" | "infinite" | "dne". For "finite", `result` is an exact Expr (a Rational, or a
   symbolic constant such as exp(1) for e). For "infinite", `sign` is +1/-1. For "dne" the
   two one-sided limits disagree (e.g. 1/x @ 0).

   Algorithm (exact-arithmetic; the kernel has no Math.* evaluator — numeric verification lives
   in the tests, docs/kernel/03_ARCHITECTURE.md §3 L4):

   1. Point = +/-Infinity: substitute x = 1/t and take the one-sided limit as t -> 0 (right for
      +Infinity, left for -Infinity). If the transformed expression is an indeterminate quotient,
      L'Hopital applies in t-space; if the transform collapses the quotient (e.g. ln(x)/x ->
      t*ln(1/t), a 0*infinity form), fall back to L'Hopital in x-space (both numerator and
      denominator diverge -> infinity/infinity).

   2. Finite point a:
      a. Direct substitution x -> a; if it reduces to a Rational, that is the limit.
      b. 1^infinity form Pow(base, exp) with base -> 1 and exp -> infinity: rewrite as
         exp(exp * ln(base)) and return exp(limit(exp * ln(base))). Covers (1+1/x)^x -> e.
      c. Quotient 0/0 or infinity/infinity: L'Hopital (differentiate numerator and denominator,
         recurse), depth-limited.
      d. Rational function: laurent() about a. poleOrder 0 -> the constant term is the finite
         limit; poleOrder m > 0 -> the leading principal coefficient A_m decides: m even ->
         +/-infinity (sign A_m) on both sides; m odd -> does-not-exist (two-sided).
      e. Sign-dependent / abs form (e.g. |x|/x @ 0): one-sided sign-aware reduction. Substitute
         x = a + s*t with t a fresh symbol assumed positive (ctx.assume); resolve abs(u) via
         ctx.ask(u, "positive"/"negative"). If the two sides give different finite values -> dne.

   Honest refusals (the same "refuse rather than guess" discipline as Phases 3/4), naming the
   deferred capability in the reason:
   - Oscillatory limits (sin(1/x) @ 0): the residual depends on sin/cos of an unbounded argument
     and cannot be resolved to a value -> refused, naming full Gruntz mrv.
   - Essential / transcendental-unresolvable one-sided limits (exp(1/x) @ 0): refused.
   - L'Hopital non-termination (recursion depth exceeded) and 0*infinity / growth-dominance forms
     the series+L'Hopital route cannot close -> refused, naming full Gruntz mrv.
   This is the documented deviation called out in the plan: the limit algorithm is series +
   L'Hopital based, NOT the full Gruntz mrv algorithm the docs name — correct and verifiable for
   the non-oscillatory closed subset, with full Gruntz mrv reserved as a follow-up (the same kind
   of honest scope boundary as Phase 3's Kronecker-vs-CZ+Hensel). Production wiring deferred. */

const { Expr, Rational } = require("./expr");
const { Derivation } = require("./derivation");
const { AssumptionContext } = require("./assumptions");
const { differentiate } = require("./differentiate");
const { laurent } = require("./laurent");
const { reduceConstants } = require("./taylor");

const ZERO = Expr.ZERO;
const ONE = Expr.ONE;

const MAX_DEPTH = 10;

const RULE = {
  id: "kernel:limit",
  name: "limit",
  source: "kernel",
  describe: () => ({ text: "limit via direct substitution, L'Hopital, Laurent, and one-sided sign analysis", latex: "" }),
};

// Coerce a point spec to {inf: +1|-1|0, rat: Rational|null, expr: Expr|null}.
function coercePoint(point) {
  if (point === Infinity) return { inf: 1 };
  if (point === -Infinity) return { inf: -1 };
  if (typeof point === "string") {
    if (point === "Infinity" || point === "+Infinity") return { inf: 1 };
    if (point === "-Infinity") return { inf: -1 };
  }
  let r;
  if (point && typeof point === "object" && "num" in point && "den" in point) r = point;
  else if (typeof point === "number" || typeof point === "bigint") r = Rational.of(point, 1n);
  else if (Expr.isNumeric(point)) r = Expr.numericValue(point);
  else throw new TypeError("limit: point must be a Rational, number, BigInt, numeric Expr, or +/-Infinity");
  return { inf: 0, rat: r, expr: r.isInteger ? Expr.int(r.num) : Expr.rat(r.num, r.den) };
}

// Evaluate an expression at varName = aExpr (a numeric Expr), reducing constants. Returns
// { t: "num", v: Rational } | { t: "pole" } (substitution produced an undefined unbounded form,
// e.g. 0^negative) | { t: "sym", e: Expr } (reduced but still symbolic, OR an indeterminate form
// such as 0*(1/0) that must NOT be collapsed to a finite value).
//
// Pole-aware over Mul/Add: Expr.subst builds the substituted Mul via Expr.mul, which canonicalizes
// `0 * anything -> 0` at construction time. That folds a literal-zero factor away BEFORE any sibling
// factor is evaluated, masking a pole in a sibling (e.g. x/abs(x) at 0 = Mul(0, Pow(abs(0), -1))
// substitutes to Integer 0, hiding the 1/0). Direct substitution would then wrongly return a finite
// limit for an indeterminate 0*infinity form. So for Mul/Add we recurse on the ORIGINAL structure
// and substitute each factor/term independently — the zero-fold never happens across siblings —
// then combine pole-aware: a product with a pole factor and a zero factor is indeterminate ->
// {sym} (fall through to L'Hopital / one-sided); a product with a pole and no zero -> {pole};
// a sum of two+ poles (infinity - infinity) or pole + symbolic -> {sym}.
function valOf(expr, varName, aExpr) {
  if (expr.kind === "Mul") {
    const parts = expr.args.map((a) => valOf(a, varName, aExpr));
    let hasPole = false, hasZeroNum = false, allNum = true;
    let prod = Rational.ONE;
    const rest = [];
    for (const p of parts) {
      if (p.t === "pole") { hasPole = true; continue; }
      if (p.t === "sym") { allNum = false; rest.push(p.e); continue; }
      if (p.v.isZero) hasZeroNum = true;
      prod = prod.mul(p.v);
    }
    if (hasPole) {
      // 0 * (1/0) is indeterminate — do not claim a finite value; let the caller fall through.
      if (hasZeroNum) return { t: "sym", e: expr };
      return { t: "pole" };
    }
    if (allNum) return { t: "num", v: prod };
    const numExpr = prod.isOne ? null : (prod.isInteger ? Expr.int(prod.num) : Expr.rat(prod.num, prod.den));
    const restExpr = rest.length === 1 ? rest[0] : Expr.mul(...rest);
    return { t: "sym", e: numExpr ? Expr.mul(numExpr, restExpr) : restExpr };
  }
  if (expr.kind === "Add") {
    const parts = expr.args.map((a) => valOf(a, varName, aExpr));
    let poleCount = 0, allNum = true;
    let sum = Rational.ZERO;
    const rest = [];
    for (const p of parts) {
      if (p.t === "pole") { poleCount++; continue; }
      if (p.t === "sym") { allNum = false; rest.push(p.e); continue; }
      sum = sum.add(p.v);
    }
    if (poleCount > 0) {
      // infinity - infinity (two+ poles) or pole + symbolic is indeterminate -> {sym};
      // a lone pole plus only finite numerics -> {pole}.
      if (poleCount >= 2 || rest.length > 0) return { t: "sym", e: expr };
      return { t: "pole" };
    }
    if (allNum) return { t: "num", v: sum };
    const numExpr = sum.isZero ? null : (sum.isInteger ? Expr.int(sum.num) : Expr.rat(sum.num, sum.den));
    const restExpr = rest.length === 1 ? rest[0] : Expr.add(...rest);
    return { t: "sym", e: numExpr ? Expr.add(numExpr, restExpr) : restExpr };
  }
  // Leaf / Pow / Func / Symbol: no sibling zero can mask a pole here, so substitute the whole
  // node and reduceConstants. subst may itself throw RangeError constructing Pow(0, negative)
  // (e.g. 1/x @ 0), and reduceConstants throws the same on 0^negative — both are the pole signal.
  let v;
  try {
    v = reduceConstants(Expr.subst(expr, varName, aExpr));
  } catch (e) {
    if (e instanceof RangeError) return { t: "pole" };
    throw e;
  }
  if (Expr.isNumeric(v)) return { t: "num", v: Expr.numericValue(v) };
  return { t: "sym", e: v };
}

// Split a quotient Mul(num, Pow(den, -1)) (or Pow(den, n<0)) into {num, den}, or null if `expr`
// is not a quotient. Handles folded integer powers (1/x^2 = Pow(x,-2) -> num=1, den=x^2).
function splitQuotient(expr) {
  if (expr.kind === "Pow" && expr.exp.kind === "Integer") {
    const n = expr.exp.value;
    if (n < 0n) return { num: ONE, den: Expr.pow(expr.base, Expr.int(-n)) };
    return null;
  }
  if (expr.kind !== "Mul") return null;
  const numArgs = [];
  const denArgs = [];
  for (const a of expr.args) {
    if (a.kind === "Pow" && a.exp.kind === "Integer" && a.exp.value < 0n) {
      denArgs.push(Expr.pow(a.base, Expr.int(-a.exp.value)));
    } else {
      numArgs.push(a);
    }
  }
  if (denArgs.length === 0) return null;
  const num = numArgs.length === 0 ? ONE : numArgs.length === 1 ? numArgs[0] : Expr.mul(...numArgs);
  const den = denArgs.length === 1 ? denArgs[0] : Expr.mul(...denArgs);
  return { num, den };
}

// Pick a symbol name not free in `expr`.
function freshName(expr, base) {
  const free = Expr.freeSymbols(expr);
  let n = 0, name = base;
  while (free.has(name)) name = base + ++n;
  return name;
}

// Sign-aware constant reduction: reduceConstants, then resolve abs(u) via ctx sign queries.
function signReduce(e, ctx) {
  const r = reduceConstants(e);
  return combinePowers(signReduceAbs(r, ctx));
}

// Split a product base into {num: Rational, rest: Expr} with base = num * rest (num is the
// numeric content). Used to pull coefficients out of Pow bases so inverse powers cancel: e.g.
// Pow(-t, -1) = (-1)^-1 * Pow(t, -1), which then combines with a bare `t` factor to 1, leaving -1.
function splitNumeric(e) {
  if (Expr.isNumeric(e)) return { num: Expr.numericValue(e), rest: ONE };
  if (e.kind === "Mul") {
    let num = Rational.ONE;
    const restArgs = [];
    for (const a of e.args) {
      if (Expr.isNumeric(a)) num = num.mul(Expr.numericValue(a));
      else restArgs.push(a);
    }
    const rest = restArgs.length === 0 ? ONE : restArgs.length === 1 ? restArgs[0] : Expr.mul(...restArgs);
    return { num, rest };
  }
  return { num: Rational.ONE, rest: e };
}

// Combine same-base integer powers in a Mul (including bare Symbols as base^1), after extracting
// numeric coefficients from Pow bases. Recurses into Add/Pow/Func. This is the cancellation
// Expr.mul does not perform (it does not fold Pow(b, n) * Pow(b, -n) or Symbol * Pow(symbol, -1)).
function combinePowers(e) {
  switch (e.kind) {
    case "Add":
      return Expr.add(...e.args.map(combinePowers));
    case "Mul": {
      const args = e.args.map(combinePowers);
      const combined = []; // {base: Expr, exp: BigInt}
      const rest = []; // non-integer-power factors (including extracted numerics)
      for (const a of args) {
        if (a.kind === "Pow" && a.exp.kind === "Integer") {
          const n = a.exp.value;
          const { num, rest: base } = splitNumeric(a.base);
          if (!num.isOne) {
            const c = num.pow(n);
            rest.push(c.isInteger ? Expr.int(c.num) : Expr.rat(c.num, c.den));
          }
          if (base !== ONE && n !== 0n) {
            const idx = combined.findIndex((c) => structEq(c.base, base));
            if (idx >= 0) combined[idx].exp += n;
            else combined.push({ base, exp: n });
          }
        } else if (a.kind === "Symbol") {
          const idx = combined.findIndex((c) => structEq(c.base, a));
          if (idx >= 0) combined[idx].exp += 1n;
          else combined.push({ base: a, exp: 1n });
        } else {
          rest.push(a);
        }
      }
      const factors = [];
      for (const c of combined) {
        if (c.exp === 0n) continue;
        if (c.exp === 1n) factors.push(c.base);
        else factors.push(Expr.pow(c.base, Expr.int(c.exp)));
      }
      const all = [...rest, ...factors];
      if (all.length === 0) return ONE;
      if (all.length === 1) return all[0];
      return Expr.mul(...all);
    }
    case "Pow":
      return Expr.pow(combinePowers(e.base), combinePowers(e.exp));
    case "Func":
      return Expr.func(e.name, e.args.map(combinePowers));
    default:
      return e;
  }
}
function signReduceAbs(e, ctx) {
  switch (e.kind) {
    case "Func":
      if (e.name === "abs" && e.args.length === 1) {
        const u = signReduceAbs(e.args[0], ctx);
        if (ctx) {
          if (ctx.ask(u, "positive") === true) return u;
          if (ctx.ask(u, "negative") === true) return Expr.neg(u);
        }
        return Expr.func("abs", [u]);
      }
      return Expr.func(e.name, e.args.map((a) => signReduceAbs(a, ctx)));
    case "Add":
      return Expr.add(...e.args.map((a) => signReduceAbs(a, ctx)));
    case "Mul":
      return Expr.mul(...e.args.map((a) => signReduceAbs(a, ctx)));
    case "Pow":
      return Expr.pow(signReduceAbs(e.base, ctx), signReduceAbs(e.exp, ctx));
    default:
      return e;
  }
}

// One-sided limit at a finite point via sign-aware reduction: substitute x = a + side*t with
// t > 0 assumed. Returns { t: "num", v } | { t: "pole" } | { t: "sym" }.
function oneSidedSign(expr, varName, aExpr, side, ctx) {
  const tName = freshName(expr, "t");
  const shift = Expr.add(aExpr, Expr.mul(Expr.int(BigInt(side)), Expr.sym(tName))); // a + side*t
  const g = Expr.subst(expr, varName, shift);
  const base = ctx || AssumptionContext.create();
  const sideCtx = base.withScope((child) => { child.assume(tName, "positive"); return child; });
  let r;
  try {
    r = signReduce(g, sideCtx);
  } catch (e) {
    if (e instanceof RangeError) return { t: "pole" };
    throw e;
  }
  if (Expr.isNumeric(r)) return { t: "num", v: Expr.numericValue(r) };
  return { t: "sym", e: r };
}

// Decide infinite/dne from a Laurent pole of order m with leading coefficient sign signA, given
// the side (0 = two-sided, +1 = right, -1 = left).
function poleLimitKind(m, signA, side) {
  if (side === 0) {
    if (m % 2 === 0) return { kind: "infinite", sign: signA > 0 ? 1 : -1 };
    return { kind: "dne" };
  }
  if (side > 0) return { kind: "infinite", sign: signA > 0 ? 1 : -1 };
  // left side: sign flips when m is odd
  const s = m % 2 === 0 ? signA : -signA;
  return { kind: "infinite", sign: s > 0 ? 1 : -1 };
}

// Structural equality of two canonical Expr (Expr.mul does not fold Pow(b,n)*Pow(b,-n), so we
// cannot rely on algebraic cancellation to isolate a principal coefficient — we read it from the
// Laurent result's term structure directly).
function structEq(a, b) {
  if (a.kind !== b.kind) return false;
  switch (a.kind) {
    case "Integer": return a.value === b.value;
    case "Rational": { const av = a.value, bv = b.value; return av.num === bv.num && av.den === bv.den; }
    case "Symbol": return a.name === b.name;
    case "BoundVar": return a.depth === b.depth;
    case "Pow": return structEq(a.base, b.base) && structEq(a.exp, b.exp);
    case "Add":
    case "Mul":
      if (a.args.length !== b.args.length) return false;
      for (let i = 0; i < a.args.length; i++) if (!structEq(a.args[i], b.args[i])) return false;
      return true;
    case "Func":
      if (a.name !== b.name || a.args.length !== b.args.length) return false;
      for (let i = 0; i < a.args.length; i++) if (!structEq(a.args[i], b.args[i])) return false;
      return true;
    default: return false;
  }
}

// In a single Laurent term, identify the basis^k factor (k a BigInt integer exponent) and return
// { pow: BigInt|null, coeff: Expr }. pow === null means the term has no basis factor (constant
// or analytic-power term); coeff is the remaining product.
function termBasisPower(term, basis) {
  if (term.kind === "Pow" && term.exp.kind === "Integer" && structEq(term.base, basis)) {
    return { pow: term.exp.value, coeff: ONE };
  }
  if (term.kind === "Mul") {
    let pow = null;
    const coeffArgs = [];
    for (const f of term.args) {
      if (f.kind === "Pow" && f.exp.kind === "Integer" && structEq(f.base, basis)) {
        pow = pow === null ? f.exp.value : pow + f.exp.value; // combine (should already be folded)
      } else {
        coeffArgs.push(f);
      }
    }
    if (pow === null) return { pow: null, coeff: term };
    const coeff = coeffArgs.length === 0 ? ONE : coeffArgs.length === 1 ? coeffArgs[0] : Expr.mul(...coeffArgs);
    return { pow, coeff };
  }
  return { pow: null, coeff: term };
}

// Coefficient of basis^(-m) in the Laurent result, reduced to a Rational Expr if possible.
function principalCoeff(result, basis, m) {
  const terms = result.kind === "Add" ? result.args : [result];
  const target = BigInt(-m);
  for (const t of terms) {
    const { pow, coeff } = termBasisPower(t, basis);
    if (pow !== null && pow === target) {
      const red = reduceConstants(coeff);
      return Expr.isNumeric(red) ? Expr.numericValue(red) : null;
    }
  }
  return null;
}

// Limit at a finite point a (Rational). `side` in {0, +1, -1}; 0 means two-sided.
function limitAtFinite(expr, varName, aExpr, aRat, side, ctx, depth) {
  if (depth > MAX_DEPTH) {
    return { refused: true, reason: "limit: recursion depth exceeded (L'Hopital non-termination or unresolved indeterminate); full Gruntz mrv deferred" };
  }

  // (a) direct substitution
  const direct = valOf(expr, varName, aExpr);
  if (direct.t === "num") return finiteResult(direct.v);

  // (b) 1^infinity form
  if (expr.kind === "Pow") {
    const baseV = valOf(expr.base, varName, aExpr);
    const expV = valOf(expr.exp, varName, aExpr);
    if (baseV.t === "num" && baseV.v.isOne && expV.t === "pole") {
      const exponent = Expr.mul(expr.exp, Expr.func("ln", [expr.base]));
      const L = limitRec(exponent, varName, aRat, side, ctx, depth + 1);
      if (!L.refused && L.kind === "finite") {
        return { refused: false, kind: "finite", result: Expr.func("exp", [L.result]) };
      }
    }
  }

  // (c) quotient L'Hopital (0/0 or infinity/infinity)
  const q = splitQuotient(expr);
  if (q) {
    const nV = valOf(q.num, varName, aExpr);
    const dV = valOf(q.den, varName, aExpr);
    const zeroZero = nV.t === "num" && nV.v.isZero && dV.t === "num" && dV.v.isZero;
    const infInf = nV.t === "pole" && dV.t === "pole";
    if (zeroZero || infInf) {
      const f2 = differentiate(q.num, varName, ctx);
      const g2 = differentiate(q.den, varName, ctx);
      if (!f2.refused && !g2.refused) {
        const newq = Expr.mul(f2.result, Expr.pow(g2.result, Expr.int(-1n)));
        const lh = limitRec(newq, varName, aRat, side, ctx, depth + 1);
        // Only commit to L'Hopital if it resolved; otherwise fall through to laurent / one-sided
        // (e.g. |x|/x, where L'Hopital cycles but the one-sided sign route resolves it to dne).
        if (!lh.refused) return lh;
      }
    }
    // finite nonzero / 0 -> pole (let laurent decide); 0 / pole -> 0
    if (nV.t === "num" && !nV.v.isZero && dV.t === "num" && dV.v.isZero) {
      // pole; fall through to laurent
    } else if (nV.t === "num" && nV.v.isZero && dV.t === "pole") {
      return finiteResult(Rational.ZERO);
    }
  }

  // (d) rational function -> laurent
  const l = laurent(expr, varName, aRat, 0, ctx);
  if (!l.refused) {
    if (l.poleOrder === 0) {
      const c = valOf(l.result, varName, aExpr);
      if (c.t === "num") return finiteResult(c.v);
    } else {
      const m = l.poleOrder;
      const basis = Expr.sub(Expr.sym(varName), aExpr);
      const Am = principalCoeff(l.result, basis, m);
      if (Am !== null && !Am.isZero) {
        const k = poleLimitKind(m, Am.sign, side);
        return { refused: false, kind: k.kind, result: null, sign: k.sign || null };
      }
    }
  }

  // (e) one-sided sign-aware reduction (abs / sign-dependent forms)
  if (side === 0) {
    const r = oneSidedSign(expr, varName, aExpr, +1, ctx);
    const lf = oneSidedSign(expr, varName, aExpr, -1, ctx);
    if (r.t === "num" && lf.t === "num") {
      if (r.v.equals(lf.v)) return finiteResult(r.v);
      return { refused: false, kind: "dne", result: null };
    }
    if (r.t === "pole" && lf.t === "pole") {
      // both sides unbounded; could still be same/opposite sign — laurent already handled
      // rational cases, so a non-rational double-pole is out of scope.
    }
  } else {
    const r = oneSidedSign(expr, varName, aExpr, side, ctx);
    if (r.t === "num") return finiteResult(r.v);
    if (r.t === "pole") return { refused: false, kind: "infinite", result: null, sign: 1 };
  }

  // (f) refuse
  return refuseWith(expr, varName, aExpr);
}

// Build a finite-limit result Expr from a Rational.
function finiteResult(v) {
  return { refused: false, kind: "finite", result: v.isInteger ? Expr.int(v.num) : Expr.rat(v.num, v.den) };
}

// Inspect the (already substituted/reduced) residual for oscillatory / essential signatures and
// produce an honest refusal naming the deferred capability.
function refuseWith(expr, varName, aExpr) {
  // Detect oscillatory: a sin/cos/tan of an argument that diverges at the point (1/u form).
  const residual = (function walk(e) {
    if (e.kind === "Func" && ["sin", "cos", "tan", "cot", "sec", "csc"].includes(e.name)) {
      const a = e.args[0];
      // argument diverges if it has a Pow(base, negative-integer) of something that -> 0 at a
      if (a.kind === "Pow" && a.exp.kind === "Integer" && a.exp.value < 0n) return "oscillatory";
      if (a.kind === "Mul" && a.args.some((x) => x.kind === "Pow" && x.exp.kind === "Integer" && x.exp.value < 0n)) return "oscillatory";
    }
    if (e.kind === "Func" && e.name === "exp") {
      const a = e.args[0];
      if (a.kind === "Pow" && a.exp.kind === "Integer" && a.exp.value < 0n) return "essential";
      if (a.kind === "Mul" && a.args.some((x) => x.kind === "Pow" && x.exp.kind === "Integer" && x.exp.value < 0n)) return "essential";
    }
    if (e.kind === "Add" || e.kind === "Mul") {
      for (const c of e.args) { const r = walk(c); if (r) return r; }
    }
    if (e.kind === "Pow") return walk(e.base) || walk(e.exp);
    if (e.kind === "Func") for (const c of e.args) { const r = walk(c); if (r) return r; }
    return null;
  })(expr);
  if (residual === "oscillatory") {
    return { refused: true, reason: "limit: oscillatory (sin/cos/tan of an unbounded argument, e.g. sin(1/x) @ 0); full Gruntz mrv deferred" };
  }
  if (residual === "essential") {
    return { refused: true, reason: "limit: essential-singularity / unbounded transcendental composition (e.g. exp(1/x) @ 0); full series-of-essential machinery deferred with Gruntz" };
  }
  return { refused: true, reason: "limit: indeterminate form the series+L'Hopital route could not close (0*infinity / growth dominance / non-resolution); full Gruntz mrv deferred" };
}

// Limit at +/-Infinity. sgn = +1 (x -> +Infinity) or -1 (x -> -Infinity); t = 1/x -> 0 with the
// matching side.
function limitAtInfinity(expr, varName, sgn, ctx, depth) {
  if (depth > MAX_DEPTH) {
    return { refused: true, reason: "limit: recursion depth exceeded at infinity; full Gruntz mrv deferred" };
  }
  const tName = freshName(expr, "t");
  const tSym = Expr.sym(tName);
  // x = 1/t  (sgn just selects the side: +Infinity -> t -> 0+, -Infinity -> t -> 0-)
  const g = Expr.subst(expr, varName, Expr.pow(tSym, Expr.int(-1n)));
  const res = limitAtFinite(g, tName, ZERO, Rational.ZERO, sgn, ctx, depth);
  if (!res.refused) return res;

  // Fallback: L'Hopital in x-space for infinity/infinity the 1/t transform collapsed (ln(x)/x).
  const q = splitQuotient(expr);
  if (q && bothDivergeAtInfinity(q.num, q.den, varName)) {
    const f2 = differentiate(q.num, varName, ctx);
    const g2 = differentiate(q.den, varName, ctx);
    if (!f2.refused && !g2.refused) {
      const newq = Expr.mul(f2.result, Expr.pow(g2.result, Expr.int(-1n)));
      return limitAtInfinity(newq, varName, sgn, ctx, depth + 1);
    }
  }
  return refuseWith(expr, varName, ZERO);
}

// Do f and g both diverge (-> infinity) as x -> +/-Infinity? Transform by 1/t and check both are
// poles at t = 0.
function bothDivergeAtInfinity(f, g, varName) {
  const tName = freshName(f, "u");
  const tSym = Expr.sym(tName);
  const F = Expr.subst(f, varName, Expr.pow(tSym, Expr.int(-1n)));
  const G = Expr.subst(g, varName, Expr.pow(tSym, Expr.int(-1n)));
  return valOf(F, tName, ZERO).t === "pole" && valOf(G, tName, ZERO).t === "pole";
}

// Internal recursive entry (finite point, Rational).
function limitRec(expr, varName, aRat, side, ctx, depth) {
  const aExpr = aRat.isInteger ? Expr.int(aRat.num) : Expr.rat(aRat.num, aRat.den);
  return limitAtFinite(expr, varName, aExpr, aRat, side, ctx, depth);
}

// Public entry. limit(expr, varName, point, ctx?) ->
//   { refused, kind, result, sign?, derivation } | { refused, reason }.
function limit(expr, varName, point, ctx) {
  let p;
  try {
    p = coercePoint(point);
  } catch (e) {
    return { refused: true, reason: "limit: " + e.message };
  }
  let res;
  if (p.inf !== 0) {
    res = limitAtInfinity(expr, varName, p.inf, ctx, 0);
  } else {
    res = limitRec(expr, varName, p.rat, 0, ctx, 0);
  }
  if (res.refused) return res;
  const goal = Expr.bind("Limit", varName, expr);
  const derivation = Derivation.step(RULE, {}, goal, res.result || Expr.ZERO, ctx || null, []);
  return { refused: false, kind: res.kind, result: res.result, sign: res.sign, derivation };
}

module.exports = { limit };