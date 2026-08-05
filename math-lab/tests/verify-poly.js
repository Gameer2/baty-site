"use strict";
/* Symbolic Kernel — Phase 3 (foundation slice) verification suite.
   Run with: node tests/verify-poly.js

   Covers the foundation-slice gate of Phase 3 in docs/kernel/04_BUILD_PHASES.md — polynomial &
   rational algebra tasks 1-6 (representation, GCD, square-free, resultants, factor over Q,
   correct partial fractions) plus the kernel-level rational integrator that ties them into
   "complete rational integration over Q for denominators splitting into linear and irreducible-
   quadratic factors, including repeated factors." The ℚ(α) cases named in the gate
   (∫dx/(x²-2), ∫(x²+1)/(x⁴+1)dx) are asserted REFUSED with a reason, the honest scope boundary
   for this slice; the full Rothstein-Trager-over-Q(α) machinery (tasks 5b/8) is a named
   follow-up. This file IS the runnable artifact the Phase 3 status note cites, like
   verify-kernel.js / verify-rewrite.js for the earlier phases.

   Integration results are verified by NUMERIC finite-difference differentiation back to the
   integrand, computed with an evaluator independent of the symbolic integration machinery
   (docs/kernel/03_ARCHITECTURE.md §3 L4 — the kernel never verifies itself with its own
   primitives). */

const path = require("path");
const K = (...p) => path.join(__dirname, "..", "assets", "js", "kernel", ...p);
const Poly = require(K("polynomial"));
const { Rational: R } = require(K("rational"));
const { Expr } = require(K("expr"));
const printer = require(K("printer"));
const { polyFromExpr, rfFromExpr, polyToExpr } = require(K("poly-of-expr"));
const { gcd } = require(K("poly-gcd"));
const { resultant, discriminant } = require(K("resultant"));
const { squarefree } = require(K("squarefree"));
const { factorOverQ, FactorRefusalError } = require(K("factor-rat"));
const { partialFractions } = require(K("partial-fractions"));
const { integrateRational } = require(K("rational-integrate"));

let pass = 0, fail = 0;
function ok(cond, label) {
  if (cond) { pass++; console.log("  ok    " + label); }
  else { fail++; console.error("  FAIL  " + label); }
}
const r = (n, d = 1n) => R.of(n, d);
const s = (p) => p.map((c) => c.toString()).join(",");
const eq = (a, b) => Poly.equals(a, b);

console.log("Symbolic Kernel — Phase 3 (foundation slice) verification suite\n");

console.log("Polynomial representation & arithmetic");
{
  ok(s(Poly.mul(Poly.of([r(1), r(2), r(3)]), Poly.of([r(1), r(1)]))) === "1,3,5,3", "(3x^2+2x+1)(x+1) = 3x^3+5x^2+3x+1");
  const dr = Poly.divRem(Poly.of([r(1), r(2), r(3)]), Poly.of([r(1), r(1)]));
  ok(eq(dr.q, Poly.of([r(-1), r(3)])) && eq(dr.r, Poly.of([r(2)])), "divRem (3x^2+2x+1)/(x+1) = 3x-1 r 2");
  ok(s(Poly.pseudoRemainder(Poly.of([r(1), r(0), r(1)]), Poly.of([r(-1), r(1)]))) === "2", "prem(x^2+1, x-1) = 2");
  const cp = Poly.contentAndPrimitivePart(Poly.of([r(6), r(4), r(2)]));
  ok(cp.content.equals(r(2)) && s(cp.primitive) === "3,2,1", "content/primitive of 2x^2+4x+6 = 2*(x^2+2x+3)");
}

console.log("\nExpr <-> Polynomial round trip");
{
  const e = Expr.add(Expr.mul(Expr.int(3), Expr.pow(Expr.sym("x"), Expr.int(2))), Expr.mul(Expr.int(2), Expr.sym("x")), Expr.int(1));
  ok(s(polyFromExpr(e, "x")) === "1,2,3", "polyFromExpr(3x^2+2x+1) = [1,2,3]");
  ok(printer.text(polyToExpr(Poly.of([r(-1), r(0), r(1)]), "x")) === "-1 + x^2", "polyToExpr round trips x^2-1");
  ok(polyFromExpr(Expr.func("exp", [Expr.sym("x")]), "x") === null, "polyFromExpr refuses e^x");
}

console.log("\nPolynomial GCD (monic Euclid PRS)");
{
  ok(eq(gcd(Poly.of([r(-1), r(0), r(1)]), Poly.of([r(1), r(-2), r(1)])), Poly.of([r(-1), r(1)])), "gcd(x^2-1, (x-1)^2) = x-1");
  ok(eq(gcd(Poly.mul(Poly.of([r(1), r(1)]), Poly.of([r(2), r(1)])), Poly.mul(Poly.of([r(2), r(1)]), Poly.of([r(3), r(1)]))), Poly.of([r(2), r(1)])), "gcd((x+1)(x+2),(x+2)(x+3)) = x+2");
}

console.log("\nResultants & discriminants (Euclidean recurrence)");
{
  ok(resultant(Poly.of([r(-2), r(1)]), Poly.of([r(-3), r(1)])).equals(r(-1)), "res(x-2, x-3) = a-b = -1");
  ok(resultant(Poly.of([r(-2), r(0), r(1)]), Poly.of([r(-3), r(0), r(1)])).equals(r(1)), "res(x^2-2, x^2-3) = 1");
  ok(discriminant(Poly.of([r(1), r(0), r(1)])).equals(r(-4)), "disc(x^2+1) = -4");
  ok(resultant(Poly.of([r(-1), r(0), r(1)]), Poly.of([r(-1), r(1)])).isZero, "res(x^2-1, x-1) = 0 (shared root)");
  ok(resultant(Poly.of([r(1), r(0), r(0), r(1)]), Poly.of([r(-1), r(1)])).equals(r(-2)), "res(x^3+1, x-1) = -2");
}

console.log("\nSquare-free factorization (Yun)");
{
  const fm = Poly.mul(Poly.mul(Poly.pow(Poly.of([r(-1), r(1)]), 2), Poly.pow(Poly.of([r(-2), r(1)]), 3)), Poly.of([r(5), r(1)]));
  const out = squarefree(fm);
  const byMult = {};
  for (const { factor, mult } of out.factors) byMult[mult] = factor;
  ok(eq(byMult[1], Poly.of([r(5), r(1)])) && eq(byMult[2], Poly.of([r(-1), r(1)])) && eq(byMult[3], Poly.of([r(-2), r(1)])), "(x-1)^2 (x-2)^3 (x+5) -> mult 1:(x+5), 2:(x-1), 3:(x-2)");
}

console.log("\nFactorization over Q");
{
  function recon(f) {
    const out = factorOverQ(f);
    let acc = Poly.constant(out.content);
    for (const { factor, mult } of out.factors) acc = Poly.mul(acc, Poly.pow(factor, mult));
    return { out, ok: eq(acc, f) };
  }
  let t = recon(Poly.mul(Poly.pow(Poly.of([r(-1), r(1)]), 2), Poly.of([r(2), r(1)])));
  ok(t.ok && t.out.factors.length === 2, "(x-1)^2 (x+2) factors into two irreducibles with multiplicities");
  t = recon(Poly.mul(Poly.of([r(1), r(0), r(1)]), Poly.of([r(4), r(0), r(1)])));
  ok(t.ok && t.out.factors.length === 2, "(x^2+1)(x^2+4) -> two irreducible quadratics");
  t = recon(Poly.of([r(1), r(0), r(1), r(0), r(1)])); // x^4+x^2+1 = (x^2+x+1)(x^2-x+1)
  ok(t.ok && t.out.factors.length === 2 && t.out.factors.every((f) => Poly.degree(f.factor) === 2), "x^4+x^2+1 -> two quadratics (no rational roots)");
  t = recon(Poly.of([r(-2), r(0), r(0), r(1)])); // x^3-2 irreducible
  ok(t.ok && t.out.factors.length === 1, "x^3-2 is irreducible over Q");
}

console.log("\nPartial fractions (the measured partfrac repeated-factor bug)");
{
  function pfd(label, P, den) {
    const f = factorOverQ(den);
    const out = partialFractions(P, den, f.factors, f.content);
    let reconNum = Poly.mul(out.polyPart, den);
    for (const t of out.terms) reconNum = Poly.add(reconNum, Poly.mul(t.num, Poly.divExact(den, Poly.pow(t.factor, t.mult))));
    ok(eq(reconNum, P), "PFD recombines to numerator: " + label);
    return out;
  }
  // The measured bug case: 1/((x-1)^2(x+2)) -> (1/3)/(x-1)^2 - (1/9)/(x-1) + (1/9)/(x+2)
  const bug = pfd("1/((x-1)^2(x+2))", Poly.of([r(1)]), Poly.mul(Poly.pow(Poly.of([r(-1), r(1)]), 2), Poly.of([r(2), r(1)])));
  const want = [
    { num: Poly.of([r(1, 9)]), factor: Poly.of([r(2), r(1)]), mult: 1 },
    { num: Poly.of([r(-1, 9)]), factor: Poly.of([r(-1), r(1)]), mult: 1 },
    { num: Poly.of([r(1, 3)]), factor: Poly.of([r(-1), r(1)]), mult: 2 },
  ];
  ok(bug.terms.length === 3 && want.every((w) => bug.terms.some((t) => t.mult === w.mult && eq(t.factor, w.factor) && eq(t.num, w.num))), "1/((x-1)^2(x+2)) decomposes to (1/3)/(x-1)^2 - (1/9)/(x-1) + (1/9)/(x+2)");
  pfd("1/(x^2-1)", Poly.of([r(1)]), Poly.of([r(-1), r(0), r(1)]));
  pfd("1/(x^2+1)^2 (repeated irreducible quadratic)", Poly.of([r(1)]), Poly.pow(Poly.of([r(1), r(0), r(1)]), 2));
  pfd("x^3/(x^2-1) (improper)", Poly.of([r(0), r(0), r(0), r(1)]), Poly.of([r(-1), r(0), r(1)]));
}

console.log("\nRational integration (numeric differentiate-back gate)");
{
  function numEval(e, env) {
    switch (e.kind) {
      case "Integer": return Number(e.value);
      case "Rational": return e.value.toNumber();
      case "Symbol": return env[e.name] !== undefined ? env[e.name] : 0;
      case "Add": return e.args.reduce((a, x) => a + numEval(x, env), 0);
      case "Mul": return e.args.reduce((a, x) => a * numEval(x, env), 1);
      case "Pow": return Math.pow(numEval(e.base, env), numEval(e.exp, env));
      case "Func": {
        const a = e.args.map((x) => numEval(x, env));
        // The kernel emits ln(x - r) (complex branch); the real antiderivative is ln|x - r|,
        // whose derivative 1/(x - r) is identical. Differentiate-back verifies the real branch,
        // so ln/log use |arg| — the independent real reference, not the kernel's output.
        const fn = { ln: (v) => Math.log(Math.abs(v)), log: (v) => Math.log(Math.abs(v)), sqrt: Math.sqrt, atan: Math.atan, abs: Math.abs }[e.name];
        if (!fn) throw new Error("numEval func " + e.name);
        return fn(a[0]);
      }
      default: throw new Error("numEval kind " + e.kind);
    }
  }
  function fdOK(integrand, result, points) {
    const h = 1e-5;
    for (const p of points) {
      const env = { x: p, C: 0 };
      const d = (numEval(result, { x: p + h, C: 0 }) - numEval(result, { x: p - h, C: 0 })) / (2 * h);
      const f = numEval(integrand, env);
      if (!isFinite(d) || !isFinite(f) || Math.abs(d - f) > Math.max(1e-6, 1e-6 * Math.abs(f))) return false;
    }
    return true;
  }
  function integ(label, expr, points) {
    const rf = rfFromExpr(expr, "x");
    const out = integrateRational(rf.num, rf.den, "x");
    ok(!out.refused && fdOK(expr, out.result, points), "∫ " + label + " differentiates back to the integrand");
    if (out.refused) console.log("      (refused: " + out.reason + ")");
  }
  const x = Expr.sym("x");
  integ("1/((x-1)^2(x+2))", Expr.div(Expr.int(1), Expr.mul(Expr.pow(Expr.sub(x, Expr.int(1)), Expr.int(2)), Expr.add(x, Expr.int(2)))), [3, 4, 5]);
  integ("1/(x^2-1)", Expr.div(Expr.int(1), Expr.sub(Expr.pow(x, Expr.int(2)), Expr.int(1))), [3, 4, 5]);
  integ("1/(x^2+1)", Expr.div(Expr.int(1), Expr.add(Expr.pow(x, Expr.int(2)), Expr.int(1))), [0.5, 1, 2]);
  integ("1/(x^2+1)^2", Expr.div(Expr.int(1), Expr.pow(Expr.add(Expr.pow(x, Expr.int(2)), Expr.int(1)), Expr.int(2))), [0.5, 1, 2]);
  integ("1/(x^2+x+1)", Expr.div(Expr.int(1), Expr.add(Expr.add(Expr.pow(x, Expr.int(2)), x), Expr.int(1))), [0.5, 1, 2]);
  integ("(x^2+1)/(x^4+5x^2+4)", Expr.div(Expr.add(Expr.pow(x, Expr.int(2)), Expr.int(1)), Expr.add(Expr.add(Expr.pow(x, Expr.int(4)), Expr.mul(Expr.int(5), Expr.pow(x, Expr.int(2)))), Expr.int(4))), [0.5, 1, 2]);
  integ("x^3/(x^2-1) (improper)", Expr.div(Expr.pow(x, Expr.int(3)), Expr.sub(Expr.pow(x, Expr.int(2)), Expr.int(1))), [3, 4, 5]);
  integ("(x+1)/(x^3-1)", Expr.div(Expr.add(x, Expr.int(1)), Expr.sub(Expr.pow(x, Expr.int(3)), Expr.int(1))), [3, 4, 5]);
  // Δ<0 irreducible quadratic (real irrational roots): closed via completing-the-square real
  // logs, NOT Rothstein-Trager/Q(α) — see rational-integrate.js's integrateInverseQuadraticPower.
  // This is one of the gate's two canonical Q(α) probes; it does not actually need Q(α).
  integ("dx/(x^2-2)", Expr.div(Expr.int(1), Expr.sub(Expr.pow(x, Expr.int(2)), Expr.int(2))), [3.4, 4.1, -3.7]);
  integ("dx/(x^2-2)^2", Expr.div(Expr.int(1), Expr.pow(Expr.sub(Expr.pow(x, Expr.int(2)), Expr.int(2)), Expr.int(2))), [3.4, 4.1, -3.7]);
}

console.log("\nQ(α) scope boundary — genuinely-degree>=3 irreducible factors are REFUSED (deferred to tasks 5b/8)");
{
  const x = Expr.sym("x");
  function refuse(label, expr) {
    const rf = rfFromExpr(expr, "x");
    const out = integrateRational(rf.num, rf.den, "x");
    ok(out.refused && /Q\(α\)|Rothstein|degree \d+/.test(out.reason), "∫ " + label + " is REFUSED with a reason naming the deferred Q(α)/LRT capability");
  }
  refuse("(x^2+1)/(x^4+1)", Expr.div(Expr.add(Expr.pow(x, Expr.int(2)), Expr.int(1)), Expr.add(Expr.pow(x, Expr.int(4)), Expr.int(1))));
  refuse("1/(x^3-2)", Expr.div(Expr.int(1), Expr.sub(Expr.pow(x, Expr.int(3)), Expr.int(2))));
}

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);