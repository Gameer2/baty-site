"use strict";
/* Symbolic Kernel — Phase 1 verification suite (L0 expression + L1 assumptions).
   Run with: node tests/verify-kernel.js

   Covers every Phase 1 gate criterion in docs/kernel/04_BUILD_PHASES.md verbatim — this file
   IS the runnable artifact that status claims about Phase 1 must cite (see
   docs/kernel/12_RISKS.md R12). */

const path = require("path");
const { Expr } = require(path.join(__dirname, "..", "assets", "js", "kernel", "expr.js"));
const { parse } = require(path.join(__dirname, "..", "assets", "js", "kernel", "parser.js"));
const printer = require(path.join(__dirname, "..", "assets", "js", "kernel", "printer.js"));
const {
  AssumptionContext,
  Rel,
  UNKNOWN,
  Contradiction,
} = require(path.join(__dirname, "..", "assets", "js", "kernel", "assumptions.js"));
const { simplifySqrt, sqrtDomainOk } = require(path.join(__dirname, "..", "assets", "js", "kernel", "branch.js"));

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

function throws(fn, label, ErrType) {
  try {
    fn();
    fail++;
    console.error(`  FAIL  ${label} (did not throw)`);
  } catch (e) {
    if (ErrType && !(e instanceof ErrType)) {
      fail++;
      console.error(`  FAIL  ${label} (wrong error type: ${e.constructor.name})`);
    } else {
      pass++;
      console.log(`  ok    ${label}`);
    }
  }
}

console.log("Symbolic Kernel — Phase 1 verification suite\n");

console.log("L0 — Expression representation");
{
  const x = Expr.sym("x"), y = Expr.sym("y");
  ok(Expr.add(x, y) === Expr.add(y, x), "canonical ordering: x+y === y+x (hash-consed)");
  ok(Expr.add() === Expr.int(0), "Add() collapses to 0");
  ok(Expr.add(x) === x, "Add(x) collapses to x");
  ok(Expr.mul(Expr.int(0), x) === Expr.int(0), "Mul(0,x) collapses to 0");
  ok(Expr.mul(Expr.int(1), x) === x, "Mul(1,x) collapses to x");
  ok(Expr.pow(x, Expr.int(0)) === Expr.int(1), "x^0 === 1");
  ok(Expr.pow(x, Expr.int(1)) === x, "x^1 === x");
  ok(Expr.pow(Expr.int(1), x) === Expr.int(1), "1^x === 1");
  ok(Expr.pow(Expr.int(2), Expr.int(10)).value === 1024n, "2^10 folds exactly to 1024");

  const sub = Expr.sub(x, y);
  ok(sub.kind === "Add" && sub.args.some((a) => a.kind === "Mul"), "a-b is Add(a, Mul(-1,b)), no Sub kind");
  const div = Expr.div(x, y);
  ok(
    div.kind === "Mul" && div.args.some((a) => a.kind === "Pow" && a.exp.value === -1n),
    "a/b is Mul(a, Pow(b,-1)), no Div kind"
  );

  const r = Expr.rat(1, 3);
  ok(r.kind === "Rational" && r.value.toString() === "1/3", "1/3 stays exact");
  ok(Expr.rat(4, 2) === Expr.int(2), "4/2 collapses to Integer(2), not a Rational node");

  const e1 = Expr.add(Expr.int(2), x);
  const e2 = Expr.add(x, Expr.int(2));
  ok(e1 === e2 && e1.hash() === e2.hash(), "hash consistency: structurally equal exprs share hash and identity");

  ok(Expr.pow(Expr.pow(x, Expr.int(2)), Expr.int(3)) === Expr.pow(x, Expr.int(6)), "(x^2)^3 folds to x^6");

  ok(Object.isFrozen(e1), "constructed nodes are immutable (frozen)");
}

console.log("\nL0 — Bind nodes: alpha-equivalence and capture-avoidance");
{
  const x = Expr.sym("x"), t = Expr.sym("t"), y = Expr.sym("y");
  const int1 = Expr.bind("Integral", "x", Expr.func("f", [x]), []);
  const int2 = Expr.bind("Integral", "t", Expr.func("f", [t]), []);
  ok(int1 === int2, "integral f(x)dx === integral f(t)dt (alpha-equivalence via hash-consing)");

  const intxy = Expr.bind("Integral", "x", Expr.mul(x, y), []);
  const substituted = Expr.subst(intxy, "y", x);
  ok(
    substituted.body.kind === "Mul" && substituted.body.args.some((a) => a.kind === "BoundVar"),
    "subst(integral x*y dx, y->x): the bound x remains BoundVar, untouched by substitution"
  );
  ok(
    substituted.body.args.some((a) => a.kind === "Symbol" && a.name === "x"),
    "subst(integral x*y dx, y->x): the substituted x is a free Symbol, distinct from the bound one"
  );

  const f = Expr.func("f", [x, y]);
  const inner = Expr.bind("Integral", "y", f, [Expr.int(0), x]);
  const outer = Expr.bind("Integral", "x", inner, [Expr.int(0), Expr.int(1)]);
  const text = printer.text(outer);
  ok(
    text === "integral(integral(f(x,y),y,0,x),x,0,1)",
    `double integral prints with bounds resolved to the correct scope: got "${text}"`
  );
  ok(parse(text) === outer, "double integral round-trips through text");
}

console.log('\nL0 — Parser/printer round-trip: parse(print(e)) === e (the Phase 1 gate)');
{
  const cases = [
    "x+y", "y+x", "2*x+3", "x^2+2*x+1", "1/2", "x/y", "1/(x+1)",
    "(x+1)*(x-1)", "-x", "x^-2", "(-2)^3", "x^y^z", "(x^y)^z",
    "sin(x)", "sqrt(x^2)", "2x", "3(x+1)", "0.5*x", "3.14",
    "integral(f(x),x,0,1)", "sum(k^2,k,1,n)", "limit(f(x),x,0)",
  ];
  for (const c of cases) {
    const e = parse(c);
    const roundtrip = parse(printer.text(e)) === e;
    ok(roundtrip, `parse(print(parse("${c}"))) === parse("${c}")`);
  }

  const sen = parse("sen(x)");
  ok(
    sen.kind === "Func" && sen.name === "sen" && sen.args.length === 1,
    "sen(x) parses as one opaque Func — never as a product s*e*n*x (the independent-parse gate)"
  );
  const arctg = parse("arctg(x)");
  ok(arctg.kind === "Func" && arctg.name === "arctg", "arctg(x) parses as one Func, not a product");
  const lg = parse("lg(x)");
  ok(lg.kind === "Func" && lg.name === "lg", "lg(x) parses as one Func, not a product");

  ok(parse("0.1").kind === "Rational", "0.1 parses to an exact Rational, never a float");
  ok(parse("0.1").value.toString() === "1/10", "0.1 is exactly 1/10");
}

console.log("\nL1 — Assumptions: three-valued logic and propagation");
{
  let ctx = AssumptionContext.create();
  ctx.assume("x", "positive");
  ok(ctx.ask("x", "nonzero") === true, "x positive => nonzero (propagation)");
  ok(ctx.ask("x", "real") === true, "x positive => real (propagation)");
  ok(ctx.ask("x", "integer") === UNKNOWN, "x positive => integer is UNKNOWN, never false");
  ok(ctx.ask("y", "positive") === UNKNOWN, "unrelated symbol y is UNKNOWN, never false");

  ctx = AssumptionContext.create();
  ctx.assume("n", "even");
  ok(ctx.ask("n", "integer") === true, "even => integer");
  ok(ctx.ask("n", "odd") === false, "even => NOT odd (exclusion)");

  ctx = AssumptionContext.create();
  const x = Expr.sym("x");
  ctx.assume("x", "positive");
  ok(ctx.ask(Expr.pow(x, Expr.int(2)), "positive") === true, "x positive => x^2 positive");
  ok(ctx.ask(Expr.func("ln", [x]), "real") === true, "x positive => ln(x) real");

  ctx = AssumptionContext.create();
  ctx.assume("x", "nonnegative");
  ok(ctx.ask(Expr.func("sqrt", [x]), "real") === true, "x nonnegative => sqrt(x) real");

  ctx = AssumptionContext.create();
  ok(ctx.ask(Expr.func("sqrt", [x]), "real") === UNKNOWN, "sqrt(x) real is UNKNOWN with no assumption");
}

console.log("\nL1 — Contradiction detection (R3b: the one failure L4 verification cannot catch)");
{
  let ctx = AssumptionContext.create();
  ctx.assume("x", "positive");
  throws(() => ctx.assume("x", "negative"), "assume(x,negative) after assume(x,positive) throws", Contradiction);

  ctx = AssumptionContext.create();
  ctx.assume("n", "even");
  throws(() => ctx.assume("n", "odd"), "assume(n,odd) after assume(n,even) throws", Contradiction);

  const x = Expr.sym("x");
  ctx = AssumptionContext.create();
  ctx.assume(Rel.gt(x, Expr.ZERO));
  throws(() => ctx.assume(Rel.gt(Expr.ZERO, x)), "relational contradiction: x>0 then 0>x throws", Contradiction);

  ctx = AssumptionContext.create();
  ctx.assume(Rel.eq(x, Expr.int(5)));
  throws(() => ctx.assume(Rel.ne(x, Expr.int(5))), "x=5 then x!=5 throws", Contradiction);
}

console.log("\nL1 — Relational predicates and transitive closure (symbolic bounds)");
{
  const x = Expr.sym("x"), a = Expr.sym("a");
  let ctx = AssumptionContext.create();
  ctx.assume(Rel.gt(x, a));
  ctx.assume("a", "positive");
  ok(ctx.ask("x", "positive") === true, "x>a, a>0 => x positive (transitivity through a symbolic bound)");
  ok(ctx.askRelation(x, a, "gt") === true, "askRelation(x,a,'gt') directly true");
  ok(ctx.askRelation(a, x, "gt") === false, "askRelation(a,x,'gt') is false (a is not > x)");

  ctx = AssumptionContext.create();
  ok(ctx.ask("x", "integer") === UNKNOWN, "ask never returns false for an unproven predicate");
}

console.log("\nL1 — Scoped contexts (withScope)");
{
  let ctx = AssumptionContext.create();
  ctx.assume("x", "real");
  let insideVal;
  ctx.withScope((child) => {
    child.assume("x", "positive");
    insideVal = child.ask("x", "positive");
  });
  ok(insideVal === true, "assumption holds inside the scope");
  ok(ctx.ask("x", "positive") === UNKNOWN, "assumption is discarded once the scope ends");
  ok(ctx.ask("x", "real") === true, "outer assumptions survive a child scope");
}

console.log("\nL1 — Branch selection (the literal Phase 1 gate examples)");
{
  const x = Expr.sym("x"), a = Expr.sym("a");
  const TWO = Expr.int(2);

  let ctx = AssumptionContext.create();
  ctx.assume("x", "positive");
  ok(simplifySqrt(ctx, Expr.pow(x, TWO)) === x, "sqrt(x^2) -> x under x>0");

  ctx = AssumptionContext.create();
  ctx.assume("x", "real");
  const abs = simplifySqrt(ctx, Expr.pow(x, TWO));
  ok(abs.kind === "Func" && abs.name === "abs" && abs.args[0] === x, "sqrt(x^2) -> |x| under x real (sign unknown)");

  ctx = AssumptionContext.create();
  ok(simplifySqrt(ctx, Expr.pow(x, TWO)) === null, "sqrt(x^2) unevaluated with no assumptions");

  ctx = AssumptionContext.create();
  ctx.assume(Rel.gt(x, Expr.int(3)));
  ok(
    sqrtDomainOk(ctx, Expr.sub(Expr.pow(x, TWO), Expr.int(9))) === true,
    "sqrt(x^2-9) is real/nonneg under x>3 -- the measured baseline failure (integral x^2/sqrt(x^2-9))"
  );

  ctx = AssumptionContext.create();
  ok(
    sqrtDomainOk(ctx, Expr.sub(Expr.pow(x, TWO), Expr.int(9))) === UNKNOWN,
    "sqrt(x^2-9) domain is UNKNOWN with no assumptions -- never silently guesses a branch"
  );

  ctx = AssumptionContext.create();
  ctx.assume(Rel.gt(x, a));
  ctx.assume("a", "nonnegative");
  ok(
    sqrtDomainOk(ctx, Expr.sub(Expr.pow(x, TWO), Expr.pow(a, TWO))) === true,
    "sqrt(x^2-a^2) is real/nonneg under x>a, a>=0 (a symbolic) -- the doc's own Phase 1 gate example"
  );

  ctx = AssumptionContext.create();
  ok(
    sqrtDomainOk(ctx, Expr.sub(Expr.pow(x, TWO), Expr.pow(a, TWO))) === UNKNOWN,
    "sqrt(x^2-a^2) domain is UNKNOWN with no assumptions about a or the x-a relation"
  );
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
