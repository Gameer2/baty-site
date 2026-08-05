"use strict";
/* L3 — Symbolic differentiation d/dx -> Expr. See docs/kernel/04_BUILD_PHASES.md Phase 4 task 1
   (Taylor series with symbolic order) — differentiation is the prerequisite primitive for both
   Taylor expansion and the L'Hopital branch of the limit algorithm (Phase 4 task 5), and it
   unblocks the ODE kernel (Phase 6).

   The kernel had no symbolic differentiator before this: production calculus-symbolic.js uses
   nerdamer's `diff`. This module is exact, over the kernel's own Expr (no floats, no nerdamer),
   and returns the {refused, result, derivation} shape established by rational-integrate.js.

   Rules (standard, one variable; `varName` is the free Symbol differentiated, all other free
   Symbols treated as constants):
     Integer/Rational            -> 0
     Symbol varName              -> 1 ;  other Symbol -> 0
     Add                         -> sum of derivatives
     Mul                         -> n-ary product rule: Sum_i d(a_i) * Prod_{j!=i} a_j
     Pow(base, exp):
       exp Integer n             -> n * base^(n-1) * base'
       exp constant Rational e   -> e * base^(e-1) * base'           (covers Pow(x, 1/2) = sqrt)
       base constant, exp on x   -> base^exp * ln(base) * exp'
       both on x                 -> base^exp * ( exp*base'/base + exp'*ln(base) )   (x^x case)
     Func:
       sin  -> cos(u)*u'         cos  -> -sin(u)*u'        tan  -> u'/(cos u)^2
       exp  -> exp(u)*u'         ln/log -> u'/u
       sqrt -> u'/(2*sqrt u)     abs  -> (u/abs u)*u'      (sign(u)*u', left symbolic)
       sinh -> cosh(u)*u'        cosh -> sinh(u)*u'        tanh -> u'/(cosh u)^2
       asin -> u'/sqrt(1-u^2)    acos -> -u'/sqrt(1-u^2)   atan -> u'/(1+u^2)
       cot  -> -u'/(sin u)^2     sec  -> sec(u)tan(u)*u'   csc  -> -csc(u)cot(u)*u'
     Bind (Integral/Derivative/Limit/Sum/Product) -> REFUSED (do not differentiate through a
       binder in this slice).

   Refusal is honest and narrow: unsupported Func names, and Pow with a fractional/symbolic
   exponent whose base-sign the formula would need to resolve (we do NOT need to resolve sign
   for the standard formula — base^exp*(...) is the identity — so the only true refuses here are
   genuinely unsupported functions and Bind nodes). Sign-sensitive SIMPLIFICATION (sqrt(x^2)=|x|)
   is L1/L2's job, not the differentiator's; this module produces the chain-rule form faithfully.

   Production wiring (the L3 dispatch in calculus-symbolic.js) is deferred, same kernel-vs-
   production boundary as Phases 1-3. Verified by NUMERIC finite-differentiation in
   tests/verify-series.js / verify-series-properties.js — independent of the symbolic machinery
   (docs/kernel/03_ARCHITECTURE.md §3 L4: the kernel never verifies itself with its own
   primitives). */

const { Expr, Rational } = require("./expr");
const { Derivation } = require("./derivation");

const ZERO = Expr.ZERO;
const ONE = Expr.ONE;

// Does `e` depend on the free Symbol `varName`?
function depends(e, varName) {
  return Expr.freeSymbols(e).has(varName);
}

// Differentiate and return an Expr (internal: never refuses on the supported node set; throws
// only for genuinely unsupported constructs, which the public entry catches into a refusal).
function diffExpr(e, v) {
  switch (e.kind) {
    case "Integer":
    case "Rational":
      return ZERO;
    case "Symbol":
      return e.name === v ? ONE : ZERO;
    case "BoundVar":
      return ZERO;
    case "Add":
      return Expr.add(...e.args.map((a) => diffExpr(a, v)));
    case "Mul": {
      // n-ary product rule. The folded numeric coefficient (if any) is args[0] and differentiates
      // to 0, so its term drops naturally.
      const n = e.args.length;
      const terms = [];
      for (let i = 0; i < n; i++) {
        const di = diffExpr(e.args[i], v);
        if (di === ZERO) continue;
        const rest = e.args.filter((_, j) => j !== i);
        terms.push(Expr.mul(di, ...rest));
      }
      return Expr.add(...terms);
    }
    case "Pow":
      return diffPow(e, v);
    case "Func":
      return diffFunc(e, v);
    case "Bind":
      throw new DiffRefusalError(
        "differentiate: cannot differentiate through a binder (" + e.head + "); bound-variable derivatives are not in this slice"
      );
    default:
      throw new DiffRefusalError("differentiate: unknown node kind " + e.kind);
  }
}

function diffPow(e, v) {
  const { base, exp } = e;
  const baseDepends = depends(base, v);
  const expDepends = depends(exp, v);
  if (!baseDepends && !expDepends) return ZERO; // constant^constant
  const dBase = baseDepends ? diffExpr(base, v) : null;

  // Integer exponent: n * base^(n-1) * base'  (base must depend, else handled above as constant).
  if (exp.kind === "Integer") {
    const n = exp.value;
    // n === 0 cannot occur (powExpr folds x^0 -> 1), but guard anyway.
    if (n === 0n) return ZERO;
    const lower = Expr.pow(base, Expr.int(n - 1n));
    return Expr.mul(Expr.int(n), lower, dBase);
  }
  // Constant rational exponent: e * base^(e-1) * base'  (covers sqrt as Pow(x, 1/2)).
  if (exp.kind === "Rational" && !expDepends) {
    const e = exp.value; // Rational
    const elower = e.sub(Rational.ONE); // e - 1
    return Expr.mul(Expr.rat(e.num, e.den), Expr.pow(base, Expr.rat(elower.num, elower.den)), dBase);
  }
  // Exponent depends on x, base is a constant: base^exp * ln(base) * exp'.
  if (expDepends && !baseDepends) {
    const dExp = diffExpr(exp, v);
    return Expr.mul(Expr.pow(base, exp), Expr.func("ln", [base]), dExp);
  }
  // Both depend on x: general power rule  base^exp * ( exp*base'/base + exp'*ln(base) ).
  const dExp = diffExpr(exp, v);
  const logBase = Expr.func("ln", [base]);
  const inner = Expr.add(Expr.mul(exp, Expr.div(dBase, base)), Expr.mul(dExp, logBase));
  return Expr.mul(Expr.pow(base, exp), inner);
}

function diffFunc(e, v) {
  const u = e.args[0];
  const dU = diffExpr(u, v);
  const name = e.name;
  // Helper builders.
  const f = (n, a) => Expr.func(n, a);
  switch (name) {
    case "sin":
      return Expr.mul(f("cos", [u]), dU);
    case "cos":
      return Expr.mul(Expr.neg(f("sin", [u])), dU);
    case "tan":
      // 1/(cos u)^2 * u'
      return Expr.mul(dU, Expr.pow(f("cos", [u]), Expr.int(-2)));
    case "exp":
      return Expr.mul(f("exp", [u]), dU);
    case "ln":
    case "log":
      return Expr.mul(dU, Expr.pow(u, Expr.int(-1)));
    case "sqrt":
      // u'/(2 sqrt u)  =  (1/2) * u' * (sqrt u)^(-1)
      return Expr.mul(Expr.rat(1, 2), dU, Expr.pow(f("sqrt", [u]), Expr.int(-1)));
    case "abs":
      // (u / |u|) * u'  == sign(u)*u', kept symbolic (L1 resolves sign if asked)
      return Expr.mul(Expr.div(u, f("abs", [u])), dU);
    case "sinh":
      return Expr.mul(f("cosh", [u]), dU);
    case "cosh":
      return Expr.mul(f("sinh", [u]), dU);
    case "tanh":
      return Expr.mul(dU, Expr.pow(f("cosh", [u]), Expr.int(-2)));
    case "asin":
      // u' / sqrt(1 - u^2)
      return Expr.mul(dU, Expr.pow(f("sqrt", [Expr.sub(ONE, Expr.pow(u, Expr.int(2)))]), Expr.int(-1)));
    case "acos":
      return Expr.mul(Expr.neg(dU), Expr.pow(f("sqrt", [Expr.sub(ONE, Expr.pow(u, Expr.int(2)))]), Expr.int(-1)));
    case "atan":
      // u' / (1 + u^2)
      return Expr.mul(dU, Expr.pow(Expr.add(ONE, Expr.pow(u, Expr.int(2))), Expr.int(-1)));
    case "cot":
      return Expr.mul(Expr.neg(dU), Expr.pow(f("sin", [u]), Expr.int(-2)));
    case "sec":
      return Expr.mul(f("sec", [u]), f("tan", [u]), dU);
    case "csc":
      return Expr.mul(Expr.neg(f("csc", [u])), f("cot", [u]), dU);
    default:
      throw new DiffRefusalError("differentiate: unsupported function " + name);
  }
}

// Error subclass so the public entry can distinguish a refusal from a real bug.
class DiffRefusalError extends Error {
  constructor(message) {
    super(message);
    this.name = "DiffRefusalError";
  }
}

const RULE = {
  id: "kernel:differentiate",
  name: "differentiate",
  source: "kernel",
  describe: () => ({ text: "symbolic differentiation (chain/product/power rules)", latex: "" }),
};

// Public entry. differentiate(expr, varName, ctx?) -> { refused, result, derivation }.
function differentiate(expr, varName, ctx) {
  let result;
  try {
    result = diffExpr(expr, varName);
  } catch (e) {
    if (e instanceof DiffRefusalError) return { refused: true, reason: e.message };
    throw e;
  }
  const goal = Expr.bind("Derivative", varName, expr);
  const derivation = Derivation.step(RULE, {}, goal, result, ctx || null, []);
  return { refused: false, result, derivation };
}

module.exports = { differentiate, DiffRefusalError };