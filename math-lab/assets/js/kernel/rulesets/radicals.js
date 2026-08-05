"use strict";
/* L2 rule set — wires branch.js's assumption-driven sqrt(x^2) reduction into the ordinary
   rewrite pipeline. See docs/kernel/03_ARCHITECTURE.md §3 L1 "Branch selection" and the
   Phase 1 gate. branch.js's `reduceSqrtOfSquare` existed since Phase 1 as a standalone
   function but was never actually reachable through `directed.normalize` — found while
   wiring the kernel into the benchmark harness, whose `sqrt(x^2)-abs(x)` probe exposed it. */

const { Expr } = require("../expr");
const { Pattern } = require("../pattern");
const { makeRule } = require("../rules");
const { reduceSqrtOfSquare } = require("../branch");
const printer = require("../printer");

// abs(x) had no simplification rule at all — found via the same probe, where sqrt(x^2)
// correctly reduced to the bare symbol x under x>0, but the ORIGINAL abs(x) elsewhere in
// the expression stayed as Func("abs",[x]), so collectLikeTerms (correctly) did not treat
// `x` and `abs(x)` as the same term, since as far as the kernel could tell, they weren't.
const absOfSigned = makeRule({
  name: "abs-of-signed",
  category: "radicals",
  direction: "normalize",
  pattern: Pattern.func("abs", Pattern.var("u")),
  guard: (b, ctx) => ctx && (ctx.ask(b.u, "nonnegative") === true || ctx.ask(b.u, "negative") === true),
  replacement: (b, ctx) => (ctx.ask(b.u, "nonnegative") === true ? b.u : Expr.neg(b.u)),
  describe: (b, goal, result) => ({
    text: `abs(${printer.text(b.u)}) = ${printer.text(result)}`,
    latex: `|${printer.latex(b.u)}| = ${printer.latex(result)}`,
  }),
});

const sqrtOfSquare = makeRule({
  name: "sqrt-of-square",
  category: "radicals",
  direction: "normalize",
  pattern: Pattern.func("sqrt", Pattern.pow(Pattern.var("u"), Pattern.int(2))),
  guard: (b, ctx) => ctx && reduceSqrtOfSquare(ctx, b.u) !== null,
  replacement: (b, ctx) => reduceSqrtOfSquare(ctx, b.u),
  describe: (b, goal, result) => ({
    text: `sqrt(${printer.text(b.u)}^2) = ${printer.text(result)}`,
    latex: `\\sqrt{${printer.latex(b.u)}^2} = ${printer.latex(result)}`,
  }),
});

const RULES = [absOfSigned, sqrtOfSquare];

module.exports = { RULES };
