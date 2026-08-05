"use strict";
/* Symbolic Kernel — Phase 2b verification suite (normalization to rational form).
   Run with: node tests/verify-substitution.js

   Covers the Phase 2b gate in docs/kernel/04_BUILD_PHASES.md: "trig-rational and
   radical-of-rational classes are normalized to rational form before dispatch, whether or
   not Phase 3 can yet finish them." This file IS the runnable artifact Phase 2b status
   claims must cite (docs/kernel/12_RISKS.md R12). */

const path = require("path");
const { Expr } = require(path.join(__dirname, "..", "assets", "js", "kernel", "expr.js"));
const printer = require(path.join(__dirname, "..", "assets", "js", "kernel", "printer.js"));
const directed = require(path.join(__dirname, "..", "assets", "js", "kernel", "directed.js"));

let pass = 0;
let fail = 0;
function ok(cond, label) {
  if (cond) {
    pass++;
    console.log(`  ok    ${label}`);
  } else {
    fail++;
    console.error(`  FAIL  ${label}`);
  }
}

console.log("Symbolic Kernel — Phase 2b verification suite\n");

const x = Expr.sym("x");
const TWO = Expr.int(2);

console.log("Weierstrass substitution t = tan(x/2)");
{
  // the measured hang cases from 05_BENCHMARKS.md
  const case1 = Expr.div(Expr.int(1), Expr.add(Expr.int(1), Expr.mul(TWO, Expr.func("cos", [x]))));
  const out1 = directed.weierstrass(case1, x, null);
  ok(!out1.refused, "1/(1+2cos x) normalizes to rational form in t (measured hang case)");
  ok(!Expr.freeSymbols(out1.result).has("x"), "result contains no more x, only t");
  ok(printer.text(out1.dxdt) === "2/(1 + t^2)", "dx = 2/(1+t^2) dt is returned alongside the substitution");

  // 1/(5 - cos x + 2 sin x)
  const case2 = Expr.div(Expr.int(1), Expr.add(Expr.int(5), Expr.mul(Expr.int(-1), Expr.func("cos", [x])), Expr.mul(TWO, Expr.func("sin", [x]))));
  const out2 = directed.weierstrass(case2, x, null);
  ok(!out2.refused, "1/(5-cos x+2sin x) normalizes to rational form in t (measured hang case)");

  // refusal: x used bare (not wrapped in sin/cos/tan) means the substitution doesn't fully apply
  const bad = Expr.add(x, Expr.func("cos", [x]));
  ok(directed.weierstrass(bad, x, null).refused, "refuses honestly when x appears outside sin/cos/tan");
}

console.log("\nRationalizing substitution u = x^(1/L)");
{
  // the measured hang case from 04_BUILD_PHASES.md Phase 2b
  const expr = Expr.div(Expr.int(1), Expr.add(Expr.pow(x, Expr.rat(-1, 3)), Expr.pow(x, Expr.rat(-1, 4))));
  const out = directed.rationalizingSubstitution(expr, x, null);
  ok(!out.refused, "1/(x^(-1/3)+x^(-1/4)) normalizes to rational form (measured hang case)");
  ok(out.L === 12n, "L is the LCM of the fractional denominators (3, 4) -> 12");
  ok(!Expr.freeSymbols(out.result).has("x"), "result contains no more x, only u");

  ok(directed.rationalizingSubstitution(Expr.add(x, Expr.int(1)), x, null).refused, "refuses when x has no fractional powers (nothing to clear)");
}

console.log("\nGeneralised algebraic substitution nth-root((ax+b)/(cx+d))");
{
  // the linear case (the "already shipped" special case, c=0,d=1)
  const linear = Expr.mul(x, Expr.pow(Expr.add(x, Expr.int(1)), Expr.rat(1, 2)));
  const outLinear = directed.algebraicSubstitution(linear, x, null);
  ok(!outLinear.refused && outLinear.c.isZero && outLinear.d.isOne, "x*sqrt(x+1): recognises the linear special case (c=0, d=1)");

  // the genuine Mobius case: sqrt((x+1)/(x-1))
  const mobius = Expr.pow(Expr.mul(Expr.add(x, Expr.int(1)), Expr.pow(Expr.add(x, Expr.int(-1)), Expr.int(-1))), Expr.rat(1, 2));
  const outMobius = directed.algebraicSubstitution(mobius, x, null);
  ok(!outMobius.refused && !outMobius.c.isZero, "sqrt((x+1)/(x-1)): recognises the full Mobius case (c != 0)");
  ok(outMobius.result === outMobius.u, "the radical itself substitutes to exactly u");

  ok(directed.algebraicSubstitution(Expr.add(x, Expr.int(1)), x, null).refused, "refuses when no nth-root-of-Mobius shape is present");
}

console.log("\nSystematic trig power reduction (parity rules)");
{
  const odd = directed.trigPowerReduction(Expr.pow(Expr.func("sin", [x]), Expr.int(3)), x, null);
  ok(!odd.refused && printer.text(odd.result) === "(1 - cos(x)^2)*sin(x)", "sin^3(x): odd power expands via Pythagorean, polynomial in cos times sin");

  const bothEven = directed.trigPowerReduction(Expr.mul(Expr.pow(Expr.func("sin", [x]), TWO), Expr.pow(Expr.func("cos", [x]), TWO)), x, null);
  ok(!bothEven.refused, "sin^2(x)cos^2(x): both-even case reduces via half-angle");

  ok(directed.trigPowerReduction(Expr.func("sin", [x]), x, null).refused, "sin(x) alone refuses: already minimal, nothing to reduce");
  ok(directed.trigPowerReduction(Expr.mul(Expr.pow(Expr.func("sin", [x]), Expr.int(6)), Expr.func("cos", [x])), x, null).refused, "sin^6(x)cos(x) refuses: already substitution-ready (n=1)");
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
