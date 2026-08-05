"use strict";
/* Symbolic Kernel — Phase 2 verification suite (L2 rewrite engine).
   Run with: node tests/verify-rewrite.js

   Covers the Phase 2 gate in docs/kernel/04_BUILD_PHASES.md verbatim — this file IS the
   runnable artifact that Phase 2 status claims must cite (docs/kernel/12_RISKS.md R12). */

const path = require("path");
const { Expr } = require(path.join(__dirname, "..", "assets", "js", "kernel", "expr.js"));
const printer = require(path.join(__dirname, "..", "assets", "js", "kernel", "printer.js"));
const { AssumptionContext } = require(path.join(__dirname, "..", "assets", "js", "kernel", "assumptions.js"));
const { RuleSet } = require(path.join(__dirname, "..", "assets", "js", "kernel", "rules.js"));
const { normalize: rewriteNormalize, RewriteBudgetExceeded } = require(path.join(__dirname, "..", "assets", "js", "kernel", "rewrite.js"));
const directed = require(path.join(__dirname, "..", "assets", "js", "kernel", "directed.js"));
const { Pattern } = require(path.join(__dirname, "..", "assets", "js", "kernel", "pattern.js"));
const { makeRule } = require(path.join(__dirname, "..", "assets", "js", "kernel", "rules.js"));
const { cost } = require(path.join(__dirname, "..", "assets", "js", "kernel", "cost.js"));

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

console.log("Symbolic Kernel — Phase 2 verification suite\n");

const x = Expr.sym("x");
const TWO = Expr.int(2);

console.log("Phase 2 gate — inverse-trig composition (measured baseline: 0/4)");
{
  const probes = [
    ["cos(asin(x)) -> sqrt(1-x^2)", Expr.func("cos", [Expr.func("asin", [x])]), "sqrt(1 - x^2)"],
    ["sin(acos(x)) -> sqrt(1-x^2)", Expr.func("sin", [Expr.func("acos", [x])]), "sqrt(1 - x^2)"],
    ["tan(asin(x)) -> x/sqrt(1-x^2)", Expr.func("tan", [Expr.func("asin", [x])]), "x/sqrt(1 - x^2)"],
    ["sec(atan(x)) -> sqrt(1+x^2)", Expr.func("sec", [Expr.func("atan", [x])]), "sqrt(1 + x^2)"],
  ];
  for (const [label, expr, expectedText] of probes) {
    const out = directed.normalize(expr, null);
    ok(!out.refused && printer.text(out.result) === expectedText, label);
  }
}

console.log("\nPhase 2 gate — log/exp: log(xy)-log(x)-log(y) -> 0 under x,y>0, not corrupted");
{
  const y = Expr.sym("y");
  let ctx = AssumptionContext.create();
  ctx.assume("x", "positive");
  ctx.assume("y", "positive");
  const expr = Expr.sub(Expr.sub(Expr.func("ln", [Expr.mul(x, y)]), Expr.func("ln", [x])), Expr.func("ln", [y]));
  const out = directed.combine(expr, ctx);
  ok(!out.refused, "combine fires on log(xy)-log(x)-log(y)");
  ok(out.result === Expr.int(0), "log(xy)-log(x)-log(y) -> 0 exactly (not -log(x*y)^2 or any other corruption)");

  // without the positivity assumption, combine must refuse rather than guess
  ctx = AssumptionContext.create();
  const unguarded = directed.combine(expr, ctx);
  ok(unguarded.refused, "combine refuses without positivity assumptions, rather than guessing");
}

console.log("\nPhase 2 gate — sin(2x) - 2 sin(x) cos(x) -> 0");
{
  const expr = Expr.sub(Expr.func("sin", [Expr.mul(TWO, x)]), Expr.mul(TWO, Expr.func("sin", [x]), Expr.func("cos", [x])));
  const out = directed.normalize(expr, null);
  ok(!out.refused && out.result === Expr.int(0), "sin(2x) - 2 sin(x) cos(x) normalizes to exactly 0");
}

console.log("\nRule representation, pattern matching, provenance");
{
  const rule = makeRule({
    name: "test-rule",
    pattern: Pattern.func("cos", Pattern.func("asin", Pattern.var("u"))),
    replacement: (b) => Expr.func("sqrt", [Expr.sub(Expr.int(1), Expr.pow(b.u, TWO))]),
    describe: (b) => ({ text: `cos(asin(${b.u.name}))`, latex: "x" }),
  });
  ok(rule.id === "kernel:test-rule" && rule.source === "kernel" && rule.direction === "normalize", "makeRule fills in sensible defaults (id, source, direction)");

  const rs = new RuleSet([rule]);
  const target = Expr.func("cos", [Expr.func("asin", [x])]);
  const out = rewriteNormalize(target, rs, null);
  ok(!out.refused, "rule fires via the rewrite engine");
  const flat = out.derivation.flatten();
  ok(flat.length === 1 && flat[0].rule.name === "test-rule", "derivation records exactly which rule fired");
  ok(typeof flat[0].narration.text === "string" && flat[0].narration.text.length > 0, "narration is non-empty and computed, not stored raw");
  ok(out.derivation.countBySource().kernel === 1, "countBySource reflects rule.source (fall-through rate is computable from the tree)");
}

console.log("\nSearch control (Phase 2d): budget, refusal, idempotence, determinism");
{
  // a deliberately non-terminating rule pair must refuse, never hang or return garbage
  const flipA = makeRule({ name: "flip-a", pattern: Pattern.sym("x"), replacement: () => Expr.sym("y") });
  const flipB = makeRule({ name: "flip-b", pattern: Pattern.sym("y"), replacement: () => Expr.sym("x") });
  const badSet = new RuleSet([flipA, flipB]);
  const badOut = rewriteNormalize(x, badSet, null, { maxSteps: 100, maxNodes: 500 });
  ok(badOut.refused === true, "a non-terminating rule pair refuses rather than hanging");
  ok(badOut.limit === "maxSteps", "refusal names the specific limit that was exceeded");
  ok(badOut.reason.includes("maxSteps"), "refusal reason is a stated cause, not a silent failure");

  // idempotence: normalize(normalize(e)) === normalize(e)
  const target = Expr.func("cos", [Expr.func("asin", [x])]);
  const once = directed.normalize(target, null);
  const twice = directed.normalize(once.result, null);
  ok(twice.result === once.result, "normalize is idempotent: normalize(normalize(e)) === normalize(e)");

  // determinism across a rule-database reordering
  const rsForward = new RuleSet(directed.ALL_RULES);
  const rsReversed = new RuleSet(directed.ALL_RULES.slice().reverse());
  const outForward = rewriteNormalize(target, rsForward, null);
  const outReversed = rewriteNormalize(target, rsReversed, null);
  ok(outForward.result === outReversed.result, "output is identical regardless of rule insertion order (the Phase 2d determinism gate)");

  // peak/final cost is trackable per problem (the Phase 2d benchmark instrumentation)
  ok(typeof cost(once.result) === "number" && cost(once.result) > 0, "cost(e) is available for per-problem tracking");
}

console.log("\nDirected operations: completeSquare, factor, rationalize");
{
  const y = Expr.sym("y");
  const quad = Expr.add(Expr.pow(x, TWO), Expr.mul(TWO, x), Expr.int(5));
  const cs = directed.completeSquare(quad, null);
  ok(!cs.refused && printer.text(cs.result) === "4 + (1 + x)^2", "x^2+2x+5 -> (x+1)^2+4");

  const perfectSquare = Expr.add(Expr.pow(x, TWO), Expr.mul(TWO, x), Expr.int(1));
  const f1 = directed.factor(perfectSquare, null);
  ok(!f1.refused && printer.text(f1.result) === "(1 + x)^2", "x^2+2x+1 factors to (x+1)^2 (perfect square trinomial)");

  const commonFactor = Expr.add(Expr.mul(Expr.int(2), x), Expr.mul(Expr.int(4), y));
  const f2 = directed.factor(commonFactor, null);
  ok(!f2.refused && printer.text(f2.result) === "2*(x + 2*y)", "2x+4y factors to 2(x+2y) (integer GCD extraction)");

  let ctx = AssumptionContext.create();
  ctx.assume("x", "nonzero");
  ctx.assume("y", "nonzero");
  const frac = Expr.add(Expr.div(Expr.int(1), x), Expr.div(Expr.int(1), y));
  const r = directed.rationalize(frac, ctx);
  ok(!r.refused && printer.text(r.result) === "(x + y)/(x*y)", "1/x + 1/y -> (x+y)/(x*y)");

  ctx = AssumptionContext.create(); // no nonzero assumption
  const rUnguarded = directed.rationalize(frac, ctx);
  ok(rUnguarded.refused, "rationalize refuses without nonzero assumptions on the denominators");
}

console.log("\nCollect like terms (unconditional canonicalization, not an opt-in operation)");
{
  // x - x -> 0 : a bare symbol and its negation don't share a numeric coefficient at L0,
  // so this needs the L2-level collect step, not just Add's own arithmetic folding.
  const out1 = directed.normalize(Expr.sub(x, x), null);
  ok(out1.result === Expr.int(0), "x - x -> 0");

  // the case that surfaced the gap: log(exp(x)) - x, after the log-of-exp rule fires,
  // leaves x - x behind unless collect-like-terms runs too.
  let ctx = AssumptionContext.create();
  ctx.assume("x", "real");
  const out2 = directed.normalize(Expr.sub(Expr.func("log", [Expr.func("exp", [x])]), x), ctx);
  ok(out2.result === Expr.int(0), "log(exp(x)) - x -> 0 under x real (the case that found this gap)");

  // 3x - x -> 2x, not left as two separate terms
  const out3 = directed.normalize(Expr.sub(Expr.mul(Expr.int(3), x), x), null);
  ok(out3.result === Expr.mul(Expr.int(2), x), "3x - x -> 2x");
}

console.log("\nPythagorean and completing-the-square identities");
{
  const pyth = directed.normalize(Expr.add(Expr.pow(Expr.func("sin", [x]), TWO), Expr.pow(Expr.func("cos", [x]), TWO)), null);
  ok(pyth.result === Expr.int(1), "sin^2(x) + cos^2(x) -> 1");
}

console.log("\nRules found missing while wiring against the real benchmark probes");
{
  const y = Expr.sym("y");
  let ctx = AssumptionContext.create();
  ctx.assume("x", "positive");
  ctx.assume("y", "positive");

  // sin^2+cos^2-1 -> 0 (the 3-term shape, distinct from the bare 2-term identity: the
  // matcher is exact-arity, so a rule for one shape does not fire on the other)
  const pythZero = directed.normalize(
    Expr.sub(Expr.add(Expr.pow(Expr.func("sin", [x]), TWO), Expr.pow(Expr.func("cos", [x]), TWO)), Expr.int(1)),
    ctx
  );
  ok(pythZero.result === Expr.int(0), "sin^2(x) + cos^2(x) - 1 -> 0 (the 3-term probe shape)");

  // log(x*y) - log(x) - log(y) -> 0, using "log" (not "ln") — the actual benchmark spelling
  const logProbe = Expr.sub(Expr.sub(Expr.func("log", [Expr.mul(x, y)]), Expr.func("log", [x])), Expr.func("log", [y]));
  ok(directed.combine(logProbe, ctx).result === Expr.int(0), '"log" is accepted as a synonym for "ln" (combine)');

  // log(e^x) - x -> 0 : "e^x" parses as Pow(Symbol("e"), x), not Func("exp",[x])
  const eToX = Expr.sub(Expr.func("log", [Expr.pow(Expr.sym("e"), x)]), x);
  ok(directed.normalize(eToX, ctx).result === Expr.int(0), "log(e^x) - x -> 0 (symbolic base e, not exp())");

  // sqrt(x^2) - abs(x) -> 0 : branch.js's reduceSqrtOfSquare existed since Phase 1 but was
  // never reachable through directed.normalize, and abs(x) had no rule at all
  const nestedRadical = Expr.sub(Expr.func("sqrt", [Expr.pow(x, TWO)]), Expr.func("abs", [x]));
  ok(directed.normalize(nestedRadical, ctx).result === Expr.int(0), "sqrt(x^2) - abs(x) -> 0 under x>0");
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
