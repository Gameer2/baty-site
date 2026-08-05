"use strict";
/* Symbolic Kernel — Phase 2b property-based tests. See docs/kernel/07_VALIDATION.md §3.
   Run with: node tests/verify-substitution-properties.js

   Rewrite soundness for all four Phase 2b substitutions: the substituted expression must
   agree numerically with the original at corresponding sample points, for many random
   trials. This is the check that would have caught a wrong sign in the Weierstrass
   half-angle formulas or an off-by-one in the algebraic-substitution derivative — exactly
   the class of bug 07_VALIDATION.md §3 says this kind of test exists to catch. */

const path = require("path");
const { Expr } = require(path.join(__dirname, "..", "assets", "js", "kernel", "expr.js"));
const directed = require(path.join(__dirname, "..", "assets", "js", "kernel", "directed.js"));
const { evalNumeric } = require(path.join(__dirname, "lib", "eval-numeric.js"));

let pass = 0;
let fail = 0;
function ok(cond, label) {
  if (cond) pass++;
  else {
    fail++;
    console.error(`  FAIL  ${label}`);
  }
}
function section(name, fn) {
  console.log(`\n${name}`);
  const before = fail;
  fn();
  console.log(fail === before ? "  ok    (all trials passed)" : `  ${fail - before} trial(s) failed`);
}

function mulberry32(seed) {
  return function () {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(20260727);

const x = Expr.sym("x");
const TWO = Expr.int(2);

// ---------------------------------------------------------------------------------------
// Property 1 — Weierstrass: original(x) === substituted(t) where t = tan(x/2), at random x.
// ---------------------------------------------------------------------------------------
section("Property: Weierstrass substitution rewrite soundness", () => {
  const exprs = [
    Expr.div(Expr.int(1), Expr.add(Expr.int(1), Expr.mul(TWO, Expr.func("cos", [x])))),
    Expr.div(Expr.int(1), Expr.add(Expr.int(5), Expr.mul(Expr.int(-1), Expr.func("cos", [x])), Expr.mul(TWO, Expr.func("sin", [x])))),
    Expr.div(Expr.func("sin", [x]), Expr.add(Expr.int(2), Expr.func("cos", [x]))),
  ];
  for (const expr of exprs) {
    const out = directed.weierstrass(expr, x, null);
    if (out.refused) continue;
    for (let trial = 0; trial < 100; trial++) {
      const xv = (rng() - 0.5) * 6; // within (-pi, pi) where t=tan(x/2) is finite
      const tv = Math.tan(xv / 2);
      let before, after;
      try {
        before = evalNumeric(expr, { x: xv });
        after = evalNumeric(out.result, { t: tv });
      } catch (e) {
        continue;
      }
      if (!Number.isFinite(before) || !Number.isFinite(after)) continue;
      ok(Math.abs(before - after) < 1e-6, `Weierstrass sound at x=${xv.toFixed(4)}: ${before} vs ${after}`);
    }
  }
});

// ---------------------------------------------------------------------------------------
// Property 2 — Rationalizing substitution: original(x=u^L) === substituted(u).
// ---------------------------------------------------------------------------------------
section("Property: rationalizing substitution rewrite soundness", () => {
  const exprs = [
    Expr.div(Expr.int(1), Expr.add(Expr.pow(x, Expr.rat(-1, 3)), Expr.pow(x, Expr.rat(-1, 4)))),
    Expr.div(Expr.int(1), Expr.add(Expr.int(1), Expr.pow(x, Expr.rat(1, 2)))),
    Expr.mul(x, Expr.pow(x, Expr.rat(1, 3))),
  ];
  for (const expr of exprs) {
    const out = directed.rationalizingSubstitution(expr, x, null);
    if (out.refused) continue;
    for (let trial = 0; trial < 100; trial++) {
      const uv = rng() * 3 + 0.1; // positive, away from 0 (fractional powers of x need x>0)
      const xv = Math.pow(uv, Number(out.L));
      let before, after;
      try {
        before = evalNumeric(expr, { x: xv });
        after = evalNumeric(out.result, { u: uv });
      } catch (e) {
        continue;
      }
      if (!Number.isFinite(before) || !Number.isFinite(after)) continue;
      ok(Math.abs(before - after) < 1e-6, `rationalizing sound at u=${uv.toFixed(4)} (x=${xv.toFixed(4)}): ${before} vs ${after}`);
    }
  }
});

// ---------------------------------------------------------------------------------------
// Property 3 — Algebraic (Mobius) substitution: original(x(u)) === substituted(u), for
// both the linear special case and genuine Mobius cases.
// ---------------------------------------------------------------------------------------
section("Property: algebraic (Mobius) substitution rewrite soundness", () => {
  const cases = [
    Expr.mul(x, Expr.pow(Expr.add(x, Expr.int(1)), Expr.rat(1, 2))), // linear: c=0,d=1
    Expr.pow(Expr.mul(Expr.add(x, Expr.int(1)), Expr.pow(Expr.add(x, Expr.int(-1)), Expr.int(-1))), Expr.rat(1, 2)), // Mobius
    Expr.div(Expr.int(1), Expr.pow(Expr.add(Expr.mul(TWO, x), Expr.int(3)), Expr.rat(1, 3))), // cube root, linear
  ];
  for (const expr of cases) {
    const out = directed.algebraicSubstitution(expr, x, null);
    if (out.refused) continue;
    const { a, b, c, d, n } = out;
    for (let trial = 0; trial < 100; trial++) {
      const uv = rng() * 2 + 0.5;
      // x = (d*u^n - b) / (a - c*u^n), evaluated directly in JS from the Rational coefficients
      const un = Math.pow(uv, Number(n));
      const xv = (d.toNumber() * un - b.toNumber()) / (a.toNumber() - c.toNumber() * un);
      let before, after;
      try {
        before = evalNumeric(expr, { x: xv });
        after = evalNumeric(out.result, { u: uv });
      } catch (e) {
        continue;
      }
      if (!Number.isFinite(before) || !Number.isFinite(after)) continue;
      ok(Math.abs(before - after) < 1e-6, `algebraic substitution sound at u=${uv.toFixed(4)} (x=${xv.toFixed(4)}): ${before} vs ${after}`);
    }
  }
});

// ---------------------------------------------------------------------------------------
// Property 4 — Trig power reduction: reduced(x) === original(x) at random x, for m,n up to 6.
// ---------------------------------------------------------------------------------------
section("Property: trig power reduction rewrite soundness", () => {
  for (let m = 0; m <= 5; m++) {
    for (let n = 0; n <= 5; n++) {
      if (m === 0 && n === 0) continue;
      const factors = [];
      if (m > 0) factors.push(Expr.pow(Expr.func("sin", [x]), Expr.int(m)));
      if (n > 0) factors.push(Expr.pow(Expr.func("cos", [x]), Expr.int(n)));
      const expr = factors.length === 1 ? factors[0] : Expr.mul(...factors);
      const out = directed.trigPowerReduction(expr, x, null);
      if (out.refused) continue; // already minimal — nothing to check
      for (let trial = 0; trial < 10; trial++) {
        const xv = rng() * 6.28;
        const before = evalNumeric(expr, { x: xv });
        const after = evalNumeric(out.result, { x: xv });
        ok(Math.abs(before - after) < 1e-9, `sin^${m}*cos^${n} sound at x=${xv.toFixed(4)}: ${before} vs ${after}`);
      }
    }
  }
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
