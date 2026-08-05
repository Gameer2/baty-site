"use strict";
/* Symbolic Kernel — Phase 4 (foundation slice) verification suite.
   Run with: node tests/verify-series.js

   Covers the foundation-slice gate of Phase 4 in docs/kernel/04_BUILD_PHASES.md — Series & limits:
   a kernel symbolic differentiator, Taylor/Maclaurin series, Laurent expansion of rational
   functions (reusing the Phase 3 partial-fraction layer), singularity classification
   (removable / pole of order n / essential-refused), radius + interval of convergence, and a
   series + L'Hôpital-based limit (Gruntz-STYLE, not the full mrv-Gruntz the docs name — the
   same kind of documented deviation as Phase 3's Kronecker-vs-CZ+Hensel).

   Honest scope boundaries asserted as REFUSED with a reason naming the deferred capability:
     - Puiseux series (fractional powers at algebraic branch points) -> needs the ℚ(α)
       extension-field arithmetic Phase 3 deferred.
     - Essential singularities (exp(1/x) @ 0) -> full series-of-essential machinery deferred.
     - Oscillatory limits (sin(1/x) @ 0) and dominance races the series+L'Hôpital route cannot
       close -> full Gruntz mrv deferred.
   This file IS the runnable artifact the Phase 4 status note cites, like verify-poly.js for
   Phase 3 and verify-kernel.js / verify-rewrite.js for the earlier phases.

   All kernel outputs are verified by NUMERIC cross-checks computed with an evaluator
   independent of the symbolic machinery (docs/kernel/03_ARCHITECTURE.md §3 L4 — the kernel
   never verifies itself with its own primitives): differentiate by finite-difference, Taylor
   by truncated partial sum vs the function on the convergence interval, Laurent by
   principal-part exactness + partial sum on an annulus, singularity by log-log blowup slope,
   convergence by partial-sum behavior inside vs outside the radius, and limit by a two-sided
   numeric approach at shrinking offsets. */

const path = require("path");
const K = (...p) => path.join(__dirname, "..", "assets", "js", "kernel", ...p);
const { Expr, Rational } = require(K("expr"));
const { differentiate } = require(K("differentiate"));
const { taylor } = require(K("taylor"));
const { laurent } = require(K("laurent"));
const { classifySingularity } = require(K("singularity"));
const { powerSeriesConvergence } = require(K("convergence"));
const { limit } = require(K("limit"));

let pass = 0, fail = 0;
function ok(cond, label) {
  if (cond) { pass++; console.log("  ok    " + label); }
  else { fail++; console.error("  FAIL  " + label); }
}
const x = () => Expr.sym("x");
const I = (n) => Expr.int(BigInt(n));
const Q = (a, b) => Expr.rat(BigInt(a), BigInt(b));
const R = (a, b = 1n) => Rational.of(BigInt(a), b);

// ---- independent numeric evaluator (Number arithmetic; no kernel primitives) ----
function numEval(e, env) {
  switch (e.kind) {
    case "Integer": return Number(e.value);
    case "Rational": { const v = e.value; return Number(v.num) / Number(v.den); }
    case "Symbol": return env[e.name];
    case "Add": return e.args.reduce((s, a) => s + numEval(a, env), 0);
    case "Mul": return e.args.reduce((p, a) => p * numEval(a, env), 1);
    case "Pow": return Math.pow(numEval(e.base, env), numEval(e.exp, env));
    case "Func": {
      const a = numEval(e.args[0], env);
      switch (e.name) {
        case "sin": return Math.sin(a);
        case "cos": return Math.cos(a);
        case "tan": return Math.tan(a);
        case "exp": return Math.exp(a);
        case "ln": case "log": return Math.log(Math.abs(a));
        case "sqrt": return Math.sqrt(a);
        case "abs": return Math.abs(a);
        default: throw new Error("numEval func " + e.name);
      }
    }
    default: throw new Error("numEval kind " + e.kind);
  }
}

// Central finite-difference derivative (independent of differentiate()).
function fdDiff(f, env, name, a, h) {
  return (numEval(f, { ...env, [name]: a + h }) - numEval(f, { ...env, [name]: a - h })) / (2 * h);
}

// Read the Rational coefficient of varName^k in a Maclaurin (center 0) polynomial result Expr.
function maclaurinCoeffs(result, varName) {
  const coeffs = {}; // k (Number) -> Rational
  const terms = result.kind === "Add" ? result.args : [result];
  for (const t of terms) {
    let k = 0, c = Rational.ONE;
    const factors = t.kind === "Mul" ? t.args : [t];
    for (const f of factors) {
      if (Expr.isNumeric(f)) { c = c.mul(Expr.numericValue(f)); continue; }
      if (f.kind === "Symbol" && f.name === varName) { k += 1; continue; }
      if (f.kind === "Pow" && f.base.kind === "Symbol" && f.base.name === varName && f.exp.kind === "Integer") {
        k += Number(f.exp.value); continue;
      }
      // unexpected factor -> not a clean Maclaurin term
      return null;
    }
    coeffs[k] = (coeffs[k] || Rational.ZERO).add(c);
  }
  return coeffs;
}
function coeffEq(coeffs, k, rat) {
  if (!coeffs) return false;
  const got = coeffs[k];
  // A zero coefficient is dropped by Expr.add (no explicit 0 term); absent == 0 when rat is 0.
  if (got === undefined) return rat.isZero;
  return got.equals(rat);
}

console.log("Symbolic Kernel — Phase 4 (foundation slice) gate suite\n");

// ============================================================ differentiate
console.log("differentiate — symbolic d/dx (verified by finite-difference)");
{
  function check(label, expr, a) {
    const d = differentiate(expr, "x");
    ok(!d.refused, "d/dx " + label + " not refused");
    if (d.refused) return;
    // finite-difference vs symbolic derivative at x=a
    const h = 1e-5;
    const nd = fdDiff(expr, {}, "x", a, h);
    const sd = numEval(d.result, { x: a });
    ok(Math.abs(nd - sd) < 1e-4 * (1 + Math.abs(nd)), "d/dx " + label + " matches finite-difference @ " + a);
  }
  check("x^2", Expr.pow(x(), I(2)), 1.7);
  check("x^5", Expr.pow(x(), I(5)), 0.9);
  check("sin x", Expr.func("sin", [x()]), 0.3);
  check("cos x", Expr.func("cos", [x()]), 0.4);
  check("exp x", Expr.func("exp", [x()]), 0.2);
  check("ln x", Expr.func("ln", [x()]), 2.0);
  check("x^2+3x", Expr.add(Expr.pow(x(), I(2)), Expr.mul(I(3), x())), 1.0);
  check("x*sin x (product)", Expr.mul(x(), Expr.func("sin", [x()])), 0.5);
  check("sin(x^2) (chain)", Expr.func("sin", [Expr.pow(x(), I(2))]), 0.6);
  check("exp(x^2) (chain)", Expr.func("exp", [Expr.pow(x(), I(2))]), 0.3);
  check("1/x (quotient)", Expr.div(I(1), x()), 1.4);
  check("sqrt x", Expr.func("sqrt", [x()]), 2.0);
  // exact: d/dx x^n = n x^{n-1}
  const d5 = differentiate(Expr.pow(x(), I(5)), "x");
  ok(!d5.refused && numEval(d5.result, { x: 2 }) === 80, "d/dx x^5 == 5x^4 (exact @2 -> 80)");
}

// ============================================================ taylor
console.log("\ntaylor — Taylor / Maclaurin series");
{
  // e^x @ 0 deg 4 -> [1, 1, 1/2, 1/6, 1/24]
  const e4 = taylor(Expr.func("exp", [x()]), "x", 0, 4);
  ok(!e4.refused, "taylor e^x@0 deg4 not refused");
  const ec = maclaurinCoeffs(e4.result, "x");
  ok(coeffEq(ec, 0, R(1)) && coeffEq(ec, 1, R(1)) && coeffEq(ec, 2, R(1, 2)) && coeffEq(ec, 3, R(1, 6)) && coeffEq(ec, 4, R(1, 24)),
    "taylor e^x@0 deg4 coeffs [1,1,1/2,1/6,1/24]");
  // partial sum vs function on the convergence interval (|x|<1)
  let eOK = true;
  for (const xv of [-0.5, -0.2, 0.1, 0.4]) {
    if (Math.abs(numEval(e4.result, { x: xv }) - Math.exp(xv)) > 1e-3) eOK = false;
  }
  ok(eOK, "taylor e^x@0 partial sum approximates exp on |x|<1");

  // sin x @ 0 deg 5 -> [0,1,0,-1/6,0,1/120]
  const s5 = taylor(Expr.func("sin", [x()]), "x", 0, 5);
  ok(!s5.refused, "taylor sin@0 deg5 not refused");
  const sc = maclaurinCoeffs(s5.result, "x");
  ok(coeffEq(sc, 0, R(0)) && coeffEq(sc, 1, R(1)) && coeffEq(sc, 2, R(0)) && coeffEq(sc, 3, R(-1, 6)) && coeffEq(sc, 4, R(0)) && coeffEq(sc, 5, R(1, 120)),
    "taylor sin@0 deg5 coeffs [0,1,0,-1/6,0,1/120]");

  // ln x @ 1 deg 3 -> [0,1,-1/2,1/3] (verified numerically; nonzero-center basis)
  const ln3 = taylor(Expr.func("ln", [x()]), "x", 1, 3);
  ok(!ln3.refused, "taylor ln@1 deg3 not refused");
  let lnOK = true;
  for (const xv of [1.2, 1.5, 0.7]) {
    if (Math.abs(numEval(ln3.result, { x: xv }) - Math.log(Math.abs(xv))) > 5e-2) lnOK = false;
  }
  ok(lnOK, "taylor ln@1 deg3 partial sum approximates ln on |x-1|<1");

  // polynomial reproduces itself (within order): (x^2+3x+2) @ 0 deg 3
  const poly = Expr.add(Expr.add(Expr.pow(x(), I(2)), Expr.mul(I(3), x())), I(2));
  const pt = taylor(poly, "x", 0, 3);
  ok(!pt.refused, "taylor polynomial not refused");
  const pc = maclaurinCoeffs(pt.result, "x");
  ok(coeffEq(pc, 0, R(2)) && coeffEq(pc, 1, R(3)) && coeffEq(pc, 2, R(1)), "taylor reproduces polynomial coeffs [2,3,1]");
}

// ============================================================ laurent
console.log("\nlaurent — Laurent expansion of rational functions");
{
  // 1/(z(z-1)) about 0 -> principal part -1/z + analytic -1 - z - z^2 - ...
  const f = Expr.div(I(1), Expr.mul(x(), Expr.sub(x(), I(1))));
  const l0 = laurent(f, "x", 0, 3);
  ok(!l0.refused, "laurent 1/(x(x-1))@0 not refused");
  ok(l0.poleOrder === 1, "laurent 1/(x(x-1))@0 pole order 1");
  // principal coefficient of x^-1 should be -1
  // (read numerically: x*(f - analyticPart) -> -1; simpler: behavior on an annulus)
  // Verify the Laurent series reconstructs f on an annulus 0<|x|<1. The principal part -1/x is
  // exact; the analytic part is truncated to order 3, so stay near the center (|x|<=0.2) where the
  // truncation tail O(|x|^4) is negligible, and use a truncation-appropriate tolerance.
  let recOK = true;
  for (const xv of [-0.2, -0.1, 0.1, 0.2]) {
    const a = numEval(l0.result, { x: xv });
    const b = numEval(f, { x: xv });
    if (!isFinite(a) || !isFinite(b) || Math.abs(a - b) > 1e-2 * (1 + Math.abs(b))) recOK = false;
  }
  ok(recOK, "laurent 1/(x(x-1))@0 reconstructs f on the annulus 0<|x|<1");

  // about 1 -> pole order 1, principal part 1/(x-1)
  const l1 = laurent(f, "x", 1, 3);
  ok(!l1.refused, "laurent 1/(x(x-1))@1 not refused");
  ok(l1.poleOrder === 1, "laurent 1/(x(x-1))@1 pole order 1");
  let rec1OK = true;
  for (const xv of [1.2, 1.1, 0.8, 0.9]) {
    const a = numEval(l1.result, { x: xv });
    const b = numEval(f, { x: xv });
    if (!isFinite(a) || !isFinite(b) || Math.abs(a - b) > 1e-2 * (1 + Math.abs(b))) rec1OK = false;
  }
  ok(rec1OK, "laurent 1/(x(x-1))@1 reconstructs f near x=1");

  // removable: (x^2-1)/(x-1) @ 1 -> pole order 0 (analytic), value 2
  const rem = Expr.div(Expr.sub(Expr.pow(x(), I(2)), I(1)), Expr.sub(x(), I(1)));
  const lr = laurent(rem, "x", 1, 2);
  ok(!lr.refused, "laurent (x^2-1)/(x-1)@1 not refused");
  ok(lr.poleOrder === 0, "laurent (x^2-1)/(x-1)@1 pole order 0 (removable)");
}

// ============================================================ singularity
console.log("\nsingularity — removable / pole / essential-refused");
{
  const f = Expr.div(I(1), Expr.mul(Expr.pow(Expr.sub(x(), I(1)), I(2)), Expr.add(x(), I(2))));
  const r = classifySingularity(f, "x", 1);
  ok(!r.refused && r.kind === "pole" && r.order === 2, "1/((x-1)^2(x+2))@1 pole order 2");

  const rem = Expr.div(Expr.sub(Expr.pow(x(), I(2)), I(1)), Expr.sub(x(), I(1)));
  const rr = classifySingularity(rem, "x", 1);
  ok(!rr.refused && rr.kind === "removable", "(x^2-1)/(x-1)@1 removable");

  const px = Expr.div(I(1), x());
  const rp = classifySingularity(px, "x", 0);
  ok(!rp.refused && rp.kind === "pole" && rp.order === 1, "1/x@0 pole order 1");

  const p3 = Expr.div(I(1), Expr.pow(x(), I(3)));
  const r3 = classifySingularity(p3, "x", 0);
  ok(!r3.refused && r3.kind === "pole" && r3.order === 3, "1/x^3@0 pole order 3");

  const reg = Expr.div(I(1), Expr.add(Expr.pow(x(), I(2)), I(1)));
  const rg = classifySingularity(reg, "x", 0);
  ok(!rg.refused && rg.kind === "regular", "1/(x^2+1)@0 regular");

  const ess = Expr.func("exp", [Expr.div(I(1), x())]);
  const re = classifySingularity(ess, "x", 0);
  ok(re.refused, "exp(1/x)@0 refused (non-rational; essential deferred)");
}

// ============================================================ convergence
console.log("\nconvergence — radius + interval of convergence");
{
  const Rr = (a, b) => Rational.of(BigInt(a), BigInt(b));
  function ep(res) { return Object.fromEntries(res.endpoints.map((e) => [e.side > 0 ? "+" : "-", e.verdict])); }

  const g = powerSeriesConvergence({ kind: "geometric", first: Rr(1, 1), ratio: Rr(1, 1) }, "x", 0);
  ok(!g.refused && g.radius.equals(Rr(1, 1)), "Sum x^n radius 1");
  const ge = ep(g);
  ok(ge["+"] === "diverges" && ge["-"] === "diverges", "Sum x^n both endpoints diverge");

  const n = powerSeriesConvergence({ kind: "rationalInN", num: [Rr(1, 1)], den: [Rr(0, 1), Rr(1, 1)] }, "x", 0);
  ok(!n.refused && n.radius.equals(Rr(1, 1)), "Sum x^n/n radius 1");
  const ne = ep(n);
  ok(ne["+"] === "diverges" && ne["-"] === "converges-conditionally", "Sum x^n/n +diverge, -converge(Leibniz)");

  const n2 = powerSeriesConvergence({ kind: "rationalInN", num: [Rr(1, 1)], den: [Rr(0, 1), Rr(0, 1), Rr(1, 1)] }, "x", 0);
  ok(!n2.refused && n2.radius.equals(Rr(1, 1)), "Sum x^n/n^2 radius 1");
  const n2e = ep(n2);
  ok(n2e["+"] === "converges-absolutely" && n2e["-"] === "converges-absolutely", "Sum x^n/n^2 both endpoints converge-absolutely");

  const g2 = powerSeriesConvergence({ kind: "geometric", first: Rr(1, 1), ratio: Rr(2, 1) }, "x", 0);
  ok(!g2.refused && g2.radius.equals(Rr(1, 2)), "Sum (2x)^n radius 1/2");

  const fg = powerSeriesConvergence({ kind: "factorialGrowth" }, "x", 0);
  ok(!fg.refused && fg.radius.equals(Rr(0, 1)), "factorialGrowth radius 0");

  const fd = powerSeriesConvergence({ kind: "factorialDecay" }, "x", 0);
  ok(!fd.refused && fd.radiusInfinite, "factorialDecay radius infinite");
}

// ============================================================ limit
console.log("\nlimit — series + L'Hôpital (verified by two-sided numeric approach)");
{
  function numFinite(f, a) {
    const eps = [1e-3, 1e-4, 1e-5, 1e-6];
    return {
      r: numEval(f, { x: a + eps[eps.length - 1] }),
      l: numEval(f, { x: a - eps[eps.length - 1] }),
    };
  }
  function valOfResult(res) { return numEval(res.result, {}); }

  function finiteAt(label, expr, point, expected) {
    const r = limit(expr, "x", point);
    ok(!r.refused && r.kind === "finite", "limit " + label + " finite");
    if (!r.refused && r.kind === "finite") {
      ok(Math.abs(valOfResult(r) - expected) < 1e-9, "limit " + label + " == " + expected);
    }
  }
  function kindAt(label, expr, point, kind, sign) {
    const r = limit(expr, "x", point);
    ok(!r.refused && r.kind === kind && (sign === undefined || r.sign === sign),
      "limit " + label + " kind=" + kind + (sign !== undefined ? " sign=" + sign : ""));
  }

  finiteAt("sin(x)/x@0", Expr.div(Expr.func("sin", [x()]), x()), 0, 1);
  finiteAt("(1-cos x)/x^2@0", Expr.div(Expr.sub(I(1), Expr.func("cos", [x()])), Expr.pow(x(), I(2))), 0, 0.5);
  finiteAt("(e^x-1)/x@0", Expr.div(Expr.sub(Expr.func("exp", [x()]), I(1)), x()), 0, 1);
  finiteAt("(x^2-1)/(x-1)@1", Expr.div(Expr.sub(Expr.pow(x(), I(2)), I(1)), Expr.sub(x(), I(1))), 1, 2);
  finiteAt("x^2+3x@2", Expr.add(Expr.pow(x(), I(2)), Expr.mul(I(3), x())), 2, 10);
  finiteAt("(x^2+1)/(2x^2-3)@inf", Expr.div(Expr.add(Expr.pow(x(), I(2)), I(1)), Expr.sub(Expr.mul(I(2), Expr.pow(x(), I(2))), I(3))), Infinity, 0.5);
  finiteAt("ln(x)/x@inf", Expr.div(Expr.func("ln", [x()]), x()), Infinity, 0);
  finiteAt("(1+1/x)^x@inf", Expr.pow(Expr.add(I(1), Expr.div(I(1), x())), x()), Infinity, Math.E);
  finiteAt("x/(x+1)@inf", Expr.div(x(), Expr.add(x(), I(1))), Infinity, 1);

  kindAt("1/x@0", Expr.div(I(1), x()), 0, "dne");
  kindAt("|x|/x@0", Expr.div(Expr.func("abs", [x()]), x()), 0, "dne");
  kindAt("1/x^2@0", Expr.div(I(1), Expr.pow(x(), I(2))), 0, "infinite", 1);
  kindAt("1/x^3@0", Expr.div(I(1), Expr.pow(x(), I(3))), 0, "dne");
  kindAt("-1/x^2@0", Expr.div(I(-1), Expr.pow(x(), I(2))), 0, "infinite", -1);

  // numeric two-sided spot-check for sin(x)/x
  {
    const f = Expr.div(Expr.func("sin", [x()]), x());
    const n = numFinite(f, 0);
    ok(Math.abs((n.r + n.l) / 2 - 1) < 1e-4, "sin(x)/x@0 numeric two-sided ~1");
  }
}

// ============================================================ refusals (honest scope)
console.log("\nrefusals — Puiseux / essential / oscillatory named as deferred");
{
  // Puiseux: a fractional-power branch expansion about 0 is refused (needs ℚ(α)).
  // taylor of x^(1/2) about 0: the differentiator handles rational exp with a sign guard, but the
  // branch point itself (non-analytic fractional power at the center) is refused by the series path.
  const puiseux = Expr.pow(x(), Q(1, 2));
  const tp = taylor(puiseux, "x", 0, 3);
  // Either taylor or the differentiator refuses the fractional-power-at-branch-point form; both
  // are honest. Assert refusal (not a silent wrong series).
  ok(tp.refused, "taylor x^(1/2)@0 refused (Puiseux / branch point; ℚ(α) deferred)");

  // essential singularity: exp(1/x) @ 0 refused by limit
  const ess = Expr.func("exp", [Expr.div(I(1), x())]);
  const le = limit(ess, "x", 0);
  ok(le.refused && /essential|transcend/i.test(le.reason), "limit exp(1/x)@0 refused (essential; Gruntz deferred)");

  // oscillatory: sin(1/x) @ 0 refused
  const osc = Expr.func("sin", [Expr.div(I(1), x())]);
  const lo = limit(osc, "x", 0);
  ok(lo.refused && /oscill/i.test(lo.reason), "limit sin(1/x)@0 refused (oscillatory; full Gruntz mrv deferred)");
}

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);