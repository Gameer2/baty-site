"use strict";
/* L2 rule set — log/exp laws with assumption guards. See docs/kernel/03_ARCHITECTURE.md §3
   L2 rule 2 and the Phase 2 gate in docs/kernel/04_BUILD_PHASES.md: `log(xy)-log x-log y -> 0`
   under `x,y>0`, and must NOT be corrupted (the measured nerdamer failure this replaces).

   `separate` (log(ab) -> log a + log b) is only valid when every factor is positive — this
   is the direct demonstration in 03_ARCHITECTURE.md §3 that L2 depends on L1. `combine`
   (the reverse direction) needs the same guard and is NOT expressible as a single
   fixed-arity pattern rule (it has to find log terms anywhere in an arbitrary-length sum,
   leaving everything else untouched) — see combineLogs in directed.js, and the scope note
   in pattern.js about why that is a deliberate boundary, not an oversight.

   "log" and "ln" are treated as synonyms for natural log throughout — the convention this
   codebase already uses (assumptions.js's real-of-log check does the same), and the one the
   benchmark corpus and production engine both use ("log(x)" means natural log, not base 10).
   Rules match either name on input; output always canonicalizes to "ln". */

const { Expr } = require("../expr");
const { Pattern } = require("../pattern");
const { makeRule } = require("../rules");
const printer = require("../printer");

function allFactorsPositive(mulExpr, ctx) {
  const factors = mulExpr.kind === "Mul" ? mulExpr.args : [mulExpr];
  return factors.every((f) => ctx && ctx.ask(f, "positive") === true);
}

const separateLog = makeRule({
  name: "separate-log",
  category: "log-exp",
  direction: "separate",
  pattern: Pattern.funcAny(["ln", "log"], Pattern.varIf("m", (e) => e.kind === "Mul")),
  guard: (b, ctx) => allFactorsPositive(b.m, ctx),
  replacement: (b) => Expr.add(...b.m.args.map((f) => Expr.func("ln", [f]))),
  describe: (b, goal, result) => ({
    text: `ln(${printer.text(b.m)}) = ${printer.text(result)}  [valid since every factor is positive]`,
    latex: `\\ln(${printer.latex(b.m)}) = ${printer.latex(result)}`,
  }),
});

const expOfLn = makeRule({
  name: "exp-of-ln",
  category: "log-exp",
  direction: "normalize",
  pattern: Pattern.func("exp", Pattern.funcAny(["ln", "log"], Pattern.var("x"))),
  guard: (b, ctx) => ctx && ctx.ask(b.x, "positive") === true,
  replacement: (b) => b.x,
  describe: (b) => ({
    text: `exp(ln(${printer.text(b.x)})) = ${printer.text(b.x)}  [valid since ${printer.text(b.x)} > 0]`,
    latex: `e^{\\ln ${printer.latex(b.x)}} = ${printer.latex(b.x)}`,
  }),
});

// ln(e^x) -> x: "e^x" from parsed input is Pow(Symbol("e"), x), a structurally different
// shape from Func("exp",[x]) — the literal symbol named "e" is treated as Euler's number
// only in this targeted context (as the base of a Pow directly under ln/log), not as a
// blanket "e is always special" policy that could surprise a user who names a variable e.
const lnOfEToThe = makeRule({
  name: "ln-of-e-to-the",
  category: "log-exp",
  direction: "normalize",
  pattern: Pattern.funcAny(["ln", "log"], Pattern.pow(Pattern.sym("e"), Pattern.var("x"))),
  guard: (b, ctx) => ctx && ctx.ask(b.x, "real") === true,
  replacement: (b) => b.x,
  describe: (b) => ({
    text: `ln(e^${printer.text(b.x)}) = ${printer.text(b.x)}`,
    latex: `\\ln(e^{${printer.latex(b.x)}}) = ${printer.latex(b.x)}`,
  }),
});

const lnOfExp = makeRule({
  name: "ln-of-exp",
  category: "log-exp",
  direction: "normalize",
  pattern: Pattern.funcAny(["ln", "log"], Pattern.func("exp", Pattern.var("x"))),
  guard: (b, ctx) => ctx && ctx.ask(b.x, "real") === true,
  replacement: (b) => b.x,
  describe: (b) => ({
    text: `ln(exp(${printer.text(b.x)})) = ${printer.text(b.x)}`,
    latex: `\\ln(e^{${printer.latex(b.x)}}) = ${printer.latex(b.x)}`,
  }),
});

const expOfSum = makeRule({
  name: "exp-of-sum",
  category: "log-exp",
  direction: "expand",
  pattern: Pattern.func("exp", Pattern.varIf("s", (e) => e.kind === "Add")),
  replacement: (b) => Expr.mul(...b.s.args.map((t) => Expr.func("exp", [t]))),
  describe: (b, goal, result) => ({
    text: `exp(${printer.text(b.s)}) = ${printer.text(result)}`,
    latex: `e^{${printer.latex(b.s)}} = ${printer.latex(result)}`,
  }),
});

const logOfPower = makeRule({
  name: "log-of-power",
  category: "log-exp",
  direction: "separate",
  pattern: Pattern.funcAny(["ln", "log"], Pattern.pow(Pattern.var("a"), Pattern.var("n"))),
  guard: (b, ctx) => (ctx && ctx.ask(b.a, "positive") === true) || b.n.kind === "Integer",
  replacement: (b) => Expr.mul(b.n, Expr.func("ln", [b.a])),
  describe: (b, goal, result) => ({
    text: `ln(${printer.text(b.a)}^${printer.text(b.n)}) = ${printer.text(result)}`,
    latex: `\\ln(${printer.latex(b.a)}^{${printer.latex(b.n)}}) = ${printer.latex(result)}`,
  }),
});

const lnOfOne = makeRule({
  name: "ln-of-one",
  category: "log-exp",
  direction: "normalize",
  pattern: Pattern.funcAny(["ln", "log"], Pattern.int(1)),
  replacement: () => Expr.int(0),
  describe: () => ({ text: "ln(1) = 0", latex: "\\ln(1) = 0" }),
});

const expOfZero = makeRule({
  name: "exp-of-zero",
  category: "log-exp",
  direction: "normalize",
  pattern: Pattern.func("exp", Pattern.int(0)),
  replacement: () => Expr.int(1),
  describe: () => ({ text: "exp(0) = 1", latex: "e^0 = 1" }),
});

const RULES = [separateLog, expOfLn, lnOfEToThe, lnOfExp, expOfSum, logOfPower, lnOfOne, expOfZero];

module.exports = { RULES, allFactorsPositive };
