"use strict";
/* Symbolic Kernel — Phase 1 property-based tests. See docs/kernel/07_VALIDATION.md §3.
   Run with: node tests/verify-kernel-properties.js

   Seeded PRNG for reproducibility — a failing property must fail the same way every run,
   or it cannot be turned into a regression case (docs/kernel/07_VALIDATION.md §9).

   Scope note: two properties listed in 07_VALIDATION.md §3 depend on layers that do not
   exist yet — "normalize(a) equals normalize(b) whenever numerically equal" and "every
   rewrite preserves numeric value" both name Phase 2's `normalize`/rewrite engine, which
   this suite does not build. Testing them honestly here would mean testing nothing (there
   is no normalize to call). This file tests the L0/L1-appropriate analogues instead —
   canonical-form confluence (construction order-independence) and construction soundness —
   and the omission is deliberate, not an oversight: extend this file when Phase 2 lands. */

const path = require("path");
const { Expr } = require(path.join(__dirname, "..", "assets", "js", "kernel", "expr.js"));
const { parse } = require(path.join(__dirname, "..", "assets", "js", "kernel", "parser.js"));
const printer = require(path.join(__dirname, "..", "assets", "js", "kernel", "printer.js"));
const {
  AssumptionContext,
  UNKNOWN,
  Contradiction,
} = require(path.join(__dirname, "..", "assets", "js", "kernel", "assumptions.js"));

let pass = 0;
let fail = 0;
function ok(cond, label) {
  if (cond) {
    pass++;
  } else {
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

// ---------------------------------------------------------------------------------------
// Seeded PRNG (mulberry32) — deterministic across runs.
// ---------------------------------------------------------------------------------------
function mulberry32(seed) {
  return function () {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const SEED = 20260726;
const rng = mulberry32(SEED);
const randInt = (lo, hi) => lo + Math.floor(rng() * (hi - lo + 1));
const choice = (arr) => arr[randInt(0, arr.length - 1)];

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = randInt(0, i);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ---------------------------------------------------------------------------------------
// Random expression generator: weighted grammar over + - * ^ sin cos exp, small integer
// coefficients, bounded depth. See docs/kernel/07_VALIDATION.md §3 "Generator design".
// ---------------------------------------------------------------------------------------
const SYMBOLS = ["x", "y"];

function randomExpr(depth) {
  if (depth <= 0 || rng() < 0.3) {
    if (rng() < 0.5) return Expr.int(randInt(-5, 5));
    return Expr.sym(choice(SYMBOLS));
  }
  switch (randInt(0, 4)) {
    case 0:
      return Expr.add(randomExpr(depth - 1), randomExpr(depth - 1));
    case 1:
      return Expr.mul(randomExpr(depth - 1), randomExpr(depth - 1));
    case 2:
      return Expr.sub(randomExpr(depth - 1), randomExpr(depth - 1));
    case 3:
      return Expr.pow(randomExpr(depth - 1), Expr.int(randInt(0, 3)));
    default:
      return Expr.func(choice(["sin", "cos", "exp"]), [randomExpr(depth - 1)]);
  }
}

// TEST-ONLY numeric evaluator. Not a kernel deliverable — floats belong only at this kind
// of boundary (docs/kernel/03_ARCHITECTURE.md §3 L0), and property tests need real numbers.
const FUNCS = { sin: Math.sin, cos: Math.cos, tan: Math.tan, exp: Math.exp, ln: Math.log, log: Math.log, sqrt: Math.sqrt, abs: Math.abs };
function evalNumeric(expr, bindings) {
  switch (expr.kind) {
    case "Integer":
      return Number(expr.value);
    case "Rational":
      return expr.value.toNumber();
    case "Symbol":
      if (!(expr.name in bindings)) throw new Error("unbound symbol " + expr.name);
      return bindings[expr.name];
    case "Add":
      return expr.args.reduce((s, a) => s + evalNumeric(a, bindings), 0);
    case "Mul":
      return expr.args.reduce((s, a) => s * evalNumeric(a, bindings), 1);
    case "Pow":
      return Math.pow(evalNumeric(expr.base, bindings), evalNumeric(expr.exp, bindings));
    case "Func": {
      const args = expr.args.map((a) => evalNumeric(a, bindings));
      if (!(expr.name in FUNCS)) throw new Error("cannot evaluate func " + expr.name);
      return FUNCS[expr.name](...args);
    }
    default:
      throw new Error("cannot evaluate kind " + expr.kind);
  }
}

// ---------------------------------------------------------------------------------------
// Property 1 — Canonical-form confluence: Add/Mul of the same multiset of terms in any
// order produces the identical object, for randomly generated term lists.
// ---------------------------------------------------------------------------------------
section("Property: canonical-form confluence (order-independent construction)", () => {
  for (let trial = 0; trial < 500; trial++) {
    const n = randInt(2, 6);
    const terms = Array.from({ length: n }, () => randomExpr(2));
    const a = Expr.add(...terms);
    const b = Expr.add(...shuffle(terms));
    ok(a === b, `Add of a shuffled term list is order-independent (trial ${trial})`);
    const m = Expr.mul(...terms);
    const m2 = Expr.mul(...shuffle(terms));
    ok(m === m2, `Mul of a shuffled term list is order-independent (trial ${trial})`);
  }
});

// ---------------------------------------------------------------------------------------
// Property 2 — Parse round-trip on randomly generated expressions (not just the fixed
// corpus in verify-kernel.js): parse(print(e)) === e.
// ---------------------------------------------------------------------------------------
section("Property: parse(print(e)) === e on random expressions", () => {
  for (let trial = 0; trial < 1000; trial++) {
    const e = randomExpr(4);
    const text = printer.text(e);
    let reparsed;
    try {
      reparsed = parse(text);
    } catch (err) {
      fail++;
      console.error(`  FAIL  trial ${trial}: "${text}" failed to reparse: ${err.message}`);
      continue;
    }
    ok(reparsed === e, `round-trip trial ${trial}: "${text}"`);
  }
});

// ---------------------------------------------------------------------------------------
// Property 3 — Hash determinism across separate intern-table sessions: the SAME structural
// expression, built from scratch after clearing the intern table, must hash identically.
// This is the "Determinism" non-functional target (docs/kernel/02_TARGET_STATE.md §5)
// applied to the hash function specifically.
// ---------------------------------------------------------------------------------------
section("Property: hash is deterministic across cleared intern-table sessions", () => {
  for (let trial = 0; trial < 300; trial++) {
    const build = () => {
      const localRng = mulberry32(SEED + trial);
      const localRandInt = (lo, hi) => lo + Math.floor(localRng() * (hi - lo + 1));
      const localChoice = (arr) => arr[localRandInt(0, arr.length - 1)];
      function gen(depth) {
        if (depth <= 0 || localRng() < 0.3) {
          if (localRng() < 0.5) return Expr.int(localRandInt(-5, 5));
          return Expr.sym(localChoice(SYMBOLS));
        }
        switch (localRandInt(0, 4)) {
          case 0: return Expr.add(gen(depth - 1), gen(depth - 1));
          case 1: return Expr.mul(gen(depth - 1), gen(depth - 1));
          case 2: return Expr.sub(gen(depth - 1), gen(depth - 1));
          case 3: return Expr.pow(gen(depth - 1), Expr.int(localRandInt(0, 3)));
          default: return Expr.func(localChoice(["sin", "cos", "exp"]), [gen(depth - 1)]);
        }
      }
      return gen(3);
    };
    const first = build();
    const firstHash = first.hash();
    const firstText = printer.text(first);
    Expr.clearInternTable();
    const second = build();
    ok(second.hash() === firstHash, `hash reproducible after clearInternTable (trial ${trial})`);
    ok(printer.text(second) === firstText, `print output reproducible after clearInternTable (trial ${trial})`);
  }
});

// ---------------------------------------------------------------------------------------
// Property 4 — Assumption soundness: the specific propagation rules this kernel implements
// (x positive => x^2 positive; x positive => ln(x) real; x nonnegative => sqrt(x) real)
// must hold numerically at every sampled admissible point, not just symbolically.
// ---------------------------------------------------------------------------------------
section("Property: assumption soundness (propagation rules hold numerically)", () => {
  const x = Expr.sym("x");
  for (let trial = 0; trial < 500; trial++) {
    const sample = rng() * 100 + 1e-6; // strictly positive sample
    let ctx = AssumptionContext.create();
    ctx.assume("x", "positive");
    if (ctx.ask(Expr.pow(x, Expr.int(2)), "positive") === true) {
      ok(evalNumeric(Expr.pow(x, Expr.int(2)), { x: sample }) > 0, `x^2 > 0 at sample ${sample} (trial ${trial})`);
    }
    if (ctx.ask(Expr.func("ln", [x]), "real") === true) {
      const v = evalNumeric(Expr.func("ln", [x]), { x: sample });
      ok(Number.isFinite(v), `ln(x) finite/real at positive sample ${sample} (trial ${trial})`);
    }
  }
  for (let trial = 0; trial < 500; trial++) {
    const sample = rng() * 100; // nonnegative sample, including near zero
    let ctx = AssumptionContext.create();
    ctx.assume("x", "nonnegative");
    if (ctx.ask(Expr.func("sqrt", [x]), "real") === true) {
      const v = evalNumeric(Expr.func("sqrt", [x]), { x: sample });
      ok(Number.isFinite(v) && !Number.isNaN(v), `sqrt(x) real at nonnegative sample ${sample} (trial ${trial})`);
    }
  }
});

// ---------------------------------------------------------------------------------------
// Property 5 — Assumption consistency: no context ever answers true to both P and NOT P.
// Random predicate pairs, some deliberately conflicting, applied to fresh symbols each
// trial (docs/kernel/12_RISKS.md R3b).
// ---------------------------------------------------------------------------------------
const CONFLICTS = [
  ["positive", "negative"], ["positive", "nonpositive"], ["negative", "nonnegative"], ["even", "odd"],
];
const COMPATIBLE = [
  ["positive", "integer"], ["negative", "rational"], ["even", "nonzero"], ["positive", "finite"],
];
section("Property: assumption consistency (never true for both P and not-P)", () => {
  let counter = 0;
  for (let trial = 0; trial < 300; trial++) {
    const name = "s" + counter++;
    const [p, q] = trial % 2 === 0 ? choice(CONFLICTS) : choice(COMPATIBLE);
    const ctx = AssumptionContext.create();
    ctx.assume(name, p);
    if (trial % 2 === 0) {
      let threw = false;
      try {
        ctx.assume(name, q);
      } catch (e) {
        threw = e instanceof Contradiction;
      }
      ok(threw, `conflicting pair (${p},${q}) on fresh symbol correctly throws (trial ${trial})`);
    } else {
      let threw = false;
      try {
        ctx.assume(name, q);
      } catch (e) {
        threw = true;
      }
      ok(!threw, `compatible pair (${p},${q}) on fresh symbol does not throw (trial ${trial})`);
      ok(ctx.ask(name, p) === true && ctx.ask(name, q) === true, `both (${p},${q}) hold after assuming both (trial ${trial})`);
    }
  }
});

// ---------------------------------------------------------------------------------------
// Property 6 — Alpha-equivalence and capture-avoidance: for random bound-variable renames
// and random substitutions, free-symbol bookkeeping matches naive set arithmetic exactly.
// This is the general form of the hand-picked example in verify-kernel.js.
// ---------------------------------------------------------------------------------------
section("Property: alpha-equivalence and capture-avoidance (free-symbol bookkeeping)", () => {
  for (let trial = 0; trial < 500; trial++) {
    const boundName = choice(["x", "y", "z"]);
    const otherName = choice(["x", "y", "z"].filter((n) => n !== boundName));
    const body = randomExpr(3); // may or may not mention boundName / otherName
    const bind1 = Expr.bind("Integral", boundName, body, []);
    const renameTo = choice(["u", "v", "w"]);
    const renamedBody = Expr.subst(body, boundName, Expr.sym("__temp__"));
    // Build the same logical binder under a different surface name by constructing it
    // directly with the alternate name over an equivalent body (substitute the bound
    // name for a fresh placeholder symbol, then bind under the new name using that
    // placeholder consistently) — simplest robust check: alpha-equivalence via hash.
    const bind2 = Expr.bind("Integral", renameTo, Expr.subst(body, boundName, Expr.sym(renameTo)), []);
    ok(bind1 === bind2, `bind(${boundName}, body) === bind(${renameTo}, body[${boundName}->${renameTo}]) (trial ${trial})`);

    // capture-avoidance: substituting a symbol NOT equal to the bound name must not
    // touch the BoundVar, and free-symbol set after substitution matches set arithmetic.
    if (otherName) {
      const freeBefore = Expr.freeSymbols(bind1);
      const replacement = Expr.sym(boundName); // deliberately colliding name — the classic capture case
      const substituted = Expr.subst(bind1, otherName, replacement);
      const expectedFree = new Set(freeBefore);
      if (expectedFree.has(otherName)) {
        expectedFree.delete(otherName);
        expectedFree.add(boundName);
      }
      const actualFree = Expr.freeSymbols(substituted);
      const same = expectedFree.size === actualFree.size && [...expectedFree].every((n) => actualFree.has(n));
      ok(same, `free-symbol bookkeeping matches after subst(bind, ${otherName}->${boundName}) (trial ${trial})`);
    }
  }
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
