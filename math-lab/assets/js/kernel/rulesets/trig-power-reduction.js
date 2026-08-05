"use strict";
/* Phase 2b — Systematic trig power reduction. See docs/kernel/04_BUILD_PHASES.md Phase 2b:
   parity rules for sin^m(x)*cos^n(x). Measured target: 65 failures (23 wrong, 39 refused).

   Three standard cases, tried in order:
     - m odd:  sin^m cos^n = sin(x) * (1-cos^2 x)^((m-1)/2) * cos^n x, binomial-expanded into
               a polynomial in cos(x) times a single sin(x) factor.
     - n odd:  symmetric, expanded into a polynomial in sin(x) times a single cos(x) factor.
     - both even: half-angle (sin^2 = (1-cos2x)/2, cos^2 = (1+cos2x)/2), expanded into a
               polynomial in cos(2x), whose higher powers are reduced by calling this same
               function again on cos(2x)^k — the argument doubles each recursion, and the
               power drops, so this terminates. */

const { Expr } = require("../expr");
const { Rational } = require("../rational");

function sinFn(u) { return Expr.func("sin", [u]); }
function cosFn(u) { return Expr.func("cos", [u]); }

function binom(k, i) {
  let result = 1;
  for (let j = 0; j < i; j++) result = (result * (k - j)) / (j + 1);
  return Math.round(result);
}

function powerTerm(coeff, base, exponent) {
  if (coeff === 0) return null;
  if (exponent === 0) return Expr.int(coeff);
  return Expr.mul(Expr.int(coeff), Expr.pow(base, Expr.int(exponent)));
}

// parseSinCosPower(expr, xArg) -> {m, n} (as JS numbers) for sin(xArg)^m * cos(xArg)^n, or null.
function parseSinCosPower(expr, xArg) {
  function factorPower(f) {
    if (f.kind === "Func" && f.name === "sin" && f.args.length === 1 && f.args[0] === xArg) return { m: 1, n: 0 };
    if (f.kind === "Func" && f.name === "cos" && f.args.length === 1 && f.args[0] === xArg) return { m: 0, n: 1 };
    if (f.kind === "Pow" && f.exp.kind === "Integer" && f.exp.value >= 0n && f.base.kind === "Func" && f.base.args.length === 1 && f.base.args[0] === xArg) {
      if (f.base.name === "sin") return { m: Number(f.exp.value), n: 0 };
      if (f.base.name === "cos") return { m: 0, n: Number(f.exp.value) };
    }
    return null;
  }
  if (expr.kind === "Mul") {
    let m = 0, n = 0;
    for (const f of expr.args) {
      const p = factorPower(f);
      if (!p) return null;
      m += p.m;
      n += p.n;
    }
    return { m, n };
  }
  const p = factorPower(expr);
  return p || null;
}

function expandOddSin(xArg, m, n) {
  const k = (m - 1) / 2;
  const terms = [];
  for (let i = 0; i <= k; i++) {
    const t = powerTerm(binom(k, i) * (i % 2 === 0 ? 1 : -1), cosFn(xArg), 2 * i + n);
    if (t) terms.push(t);
  }
  return Expr.mul(sinFn(xArg), Expr.add(...terms));
}

function expandOddCos(xArg, m, n) {
  const k = (n - 1) / 2;
  const terms = [];
  for (let i = 0; i <= k; i++) {
    const t = powerTerm(binom(k, i) * (i % 2 === 0 ? 1 : -1), sinFn(xArg), 2 * i + m);
    if (t) terms.push(t);
  }
  return Expr.mul(cosFn(xArg), Expr.add(...terms));
}

function expandBothEven(xArg, m, n) {
  const p = m / 2, q = n / 2; // sin^m = ((1-C)/2)^p, cos^n = ((1+C)/2)^q, C = cos(2*xArg)
  const twoX = Expr.mul(Expr.int(2), xArg);
  const coeffOf = new Map(); // power of C -> integer coefficient
  for (let i = 0; i <= p; i++) {
    for (let j = 0; j <= q; j++) {
      const c = binom(p, i) * (i % 2 === 0 ? 1 : -1) * binom(q, j);
      const power = i + j;
      coeffOf.set(power, (coeffOf.get(power) || 0) + c);
    }
  }
  const denom = 2 ** (p + q);
  const terms = [];
  for (const [power, coeff] of coeffOf) {
    if (coeff === 0) continue;
    const scaled = Rational.of(coeff, 1n).div(Rational.of(denom, 1n));
    let cPower;
    if (power === 0) cPower = Expr.int(1);
    else if (power === 1) cPower = cosFn(twoX);
    else {
      const reduced = trigPowerReduce(Expr.pow(cosFn(twoX), Expr.int(power)), twoX);
      cPower = reduced || Expr.pow(cosFn(twoX), Expr.int(power));
    }
    terms.push(scaled.isOne ? cPower : Expr.mul(Expr.rat(scaled.num, scaled.den), cPower));
  }
  return Expr.add(...terms);
}

// trigPowerReduce(expr, xArg) -> Expr | null. `expr` must be exactly
// sin(xArg)^m * cos(xArg)^n (any other factor present means this refuses, honestly, rather
// than guessing); returns null when there is nothing left to reduce.
//
// Termination is "already substitution-ready", not merely "small": sin(x)^m*cos(x)^1 (n=1,
// m arbitrary) is already poly(sin)*cos, ready for u=sin — no reduction needed regardless of
// how large m is. Symmetrically for m=1. Getting this wrong (e.g. checking oddness before
// checking m===1/n===1) doesn't produce a WRONG answer — sin(x) alone would still correctly
// re-expand to itself — but it produces a needless rebuild instead of the null a caller
// checking "is there anything left to do" expects, so the order below is deliberate.
function trigPowerReduce(expr, xArg) {
  const parsed = parseSinCosPower(expr, xArg);
  if (!parsed) return null;
  const { m, n } = parsed;
  if (m === 0 && n === 0) return null;
  if (m === 1 && n === 1) return Expr.mul(Expr.rat(1, 2), sinFn(Expr.mul(Expr.int(2), xArg)));
  if (m === 1 || n === 1) return null; // already poly(other) * single factor: substitution-ready
  if (m % 2 === 1) return expandOddSin(xArg, m, n);
  if (n % 2 === 1) return expandOddCos(xArg, m, n);
  return expandBothEven(xArg, m, n);
}

module.exports = { trigPowerReduce, parseSinCosPower };
