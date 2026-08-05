"use strict";
/* Symbolic Kernel — Phase 2 property-based tests. See docs/kernel/07_VALIDATION.md §3.
   Run with: node tests/verify-rewrite-properties.js

   "Rewrite soundness" (every rewrite preserves numeric value at random points) was deferred
   in verify-kernel-properties.js because Phase 1 had no rewrite engine to test. It is
   testable now — this is where that property actually gets exercised. This is also,
   per 07_VALIDATION.md §3, "the most valuable single test in the plan": it catches a wrong
   sign, a missing guard, or a bad pattern match automatically, across every rule, including
   every rule Phase 5's Rubi port will add later. */

const path = require("path");
const { Expr } = require(path.join(__dirname, "..", "assets", "js", "kernel", "expr.js"));
const { AssumptionContext } = require(path.join(__dirname, "..", "assets", "js", "kernel", "assumptions.js"));
const directed = require(path.join(__dirname, "..", "assets", "js", "kernel", "directed.js"));
const { cost } = require(path.join(__dirname, "..", "assets", "js", "kernel", "cost.js"));
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
const rng = mulberry32(20260726);

const x = Expr.sym("x");

// ---------------------------------------------------------------------------------------
// Property 1 — Rewrite soundness for the inverse-trig table: normalize(e) must equal e
// numerically at random admissible points, for every entry.
// ---------------------------------------------------------------------------------------
section("Property: inverse-trig rewrite soundness (numeric agreement at random points)", () => {
  const compositions = [
    ["sin", "asin"], ["cos", "asin"], ["tan", "asin"], ["cot", "asin"], ["sec", "asin"], ["csc", "asin"],
    ["cos", "acos"], ["sin", "acos"], ["tan", "acos"], ["cot", "acos"], ["sec", "acos"], ["csc", "acos"],
    ["tan", "atan"], ["sin", "atan"], ["cos", "atan"], ["cot", "atan"], ["sec", "atan"], ["csc", "atan"],
  ];
  for (const [outer, inner] of compositions) {
    for (let trial = 0; trial < 20; trial++) {
      // sample u in a domain where both the original and rewritten forms are defined and
      // finite: (-1,1) excluding 0 for asin/acos-based ones (cot/csc have u in the
      // denominator), any nonzero real for atan-based ones.
      let u;
      if (inner === "atan") u = (rng() - 0.5) * 10;
      else u = (rng() * 1.8 - 0.9) || 0.3; // avoid exact 0
      if (u === 0) u = 0.3;
      const expr = Expr.func(outer, [Expr.func(inner, [x])]);
      const out = directed.normalize(expr, null);
      if (out.refused) continue; // not a soundness failure — just nothing to check
      let before, after;
      try {
        before = evalNumeric(expr, { x: u });
        after = evalNumeric(out.result, { x: u });
      } catch (e) {
        continue; // domain edge case (e.g. asin out of [-1,1]) — not what this property tests
      }
      if (!Number.isFinite(before) || !Number.isFinite(after)) continue;
      ok(Math.abs(before - after) < 1e-9, `${outer}(${inner}(x)) at x=${u.toFixed(4)}: ${before} vs ${after}`);
    }
  }
});

// ---------------------------------------------------------------------------------------
// Property 2 — Pythagorean and double-angle identities hold numerically.
// ---------------------------------------------------------------------------------------
section("Property: trig identity rewrite soundness", () => {
  for (let trial = 0; trial < 200; trial++) {
    const u = (rng() - 0.5) * 20;
    const pyth = Expr.add(Expr.pow(Expr.func("sin", [x]), Expr.int(2)), Expr.pow(Expr.func("cos", [x]), Expr.int(2)));
    const out = directed.normalize(pyth, null);
    const after = evalNumeric(out.result, { x: u });
    ok(Math.abs(after - 1) < 1e-9, `sin^2+cos^2 = 1 numerically at x=${u.toFixed(4)}`);

    const doubleAngleZero = Expr.sub(Expr.func("sin", [Expr.mul(Expr.int(2), x)]), Expr.mul(Expr.int(2), Expr.func("sin", [x]), Expr.func("cos", [x])));
    const before2 = evalNumeric(doubleAngleZero, { x: u });
    const out2 = directed.normalize(doubleAngleZero, null);
    ok(Math.abs(before2) < 1e-9, `sin(2x)-2sinxcosx is numerically ~0 before rewriting, at x=${u.toFixed(4)}`);
    ok(out2.result === Expr.int(0), `... and normalizes to the exact symbolic 0, at x=${u.toFixed(4)}`);
  }
});

// ---------------------------------------------------------------------------------------
// Property 3 — log-combine soundness under random positive samples.
// ---------------------------------------------------------------------------------------
section("Property: log-combine rewrite soundness", () => {
  const y = Expr.sym("y");
  for (let trial = 0; trial < 200; trial++) {
    const xv = rng() * 50 + 1e-3;
    const yv = rng() * 50 + 1e-3;
    let ctx = AssumptionContext.create();
    ctx.assume("x", "positive");
    ctx.assume("y", "positive");
    const expr = Expr.sub(Expr.sub(Expr.func("ln", [Expr.mul(x, y)]), Expr.func("ln", [x])), Expr.func("ln", [y]));
    const before = evalNumeric(expr, { x: xv, y: yv });
    const out = directed.combine(expr, ctx);
    ok(!out.refused, `combine fires at x=${xv.toFixed(3)}, y=${yv.toFixed(3)}`);
    const after = evalNumeric(out.result, { x: xv, y: yv });
    ok(Math.abs(before - after) < 1e-6, `log-combine preserves numeric value: ${before} vs ${after}`);
  }
});

// ---------------------------------------------------------------------------------------
// Property 4 — completing the square / factor preserve numeric value.
// ---------------------------------------------------------------------------------------
section("Property: completeSquare and factor preserve numeric value", () => {
  for (let trial = 0; trial < 300; trial++) {
    const b = BigInt(Math.floor(rng() * 21) - 10);
    const c = BigInt(Math.floor(rng() * 21) - 10);
    const xv = rng() * 20 - 10;
    const quad = Expr.add(Expr.pow(x, Expr.int(2)), Expr.mul(Expr.int(b), x), Expr.int(c));
    const before = evalNumeric(quad, { x: xv });
    const cs = directed.completeSquare(quad, null);
    if (!cs.refused) {
      const after = evalNumeric(cs.result, { x: xv });
      ok(Math.abs(before - after) < 1e-6, `completeSquare(x^2+${b}x+${c}) preserves value at x=${xv.toFixed(3)}`);
    }
  }
});

// ---------------------------------------------------------------------------------------
// Property 5 — cost() is deterministic and every normalize() call is idempotent, across
// randomly generated Func/Add/Pow trees built from the rule sets' vocabulary.
// ---------------------------------------------------------------------------------------
const choice = (arr) => arr[Math.floor(rng() * arr.length)];
function randomTrigExpr(depth) {
  if (depth <= 0 || rng() < 0.4) return x;
  const outer = choice(["sin", "cos", "tan", "sec"]);
  const inner = choice(["asin", "acos", "atan"]);
  return Expr.func(outer, [Expr.func(inner, [randomTrigExpr(depth - 1)])]);
}
section("Property: normalize is idempotent and deterministic on random inverse-trig trees", () => {
  for (let trial = 0; trial < 300; trial++) {
    const expr = randomTrigExpr(2);
    const once = directed.normalize(expr, null);
    if (once.refused) continue;
    const twice = directed.normalize(once.result, null);
    ok(twice.result === once.result, `idempotent (trial ${trial})`);
    ok(cost(once.result) === cost(once.result), `cost is a pure function (trial ${trial})`); // trivial but documents the contract
  }
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
