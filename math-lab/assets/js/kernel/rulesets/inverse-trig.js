"use strict";
/* L2 rule set — inverse-trig composition. See docs/kernel/03_ARCHITECTURE.md §3 L2 rule 1
   and docs/kernel/04_BUILD_PHASES.md Phase 2 task 4. Measured baseline: 0/4. Clears 4
   measured integration failures once wired into trig-substitution (deferred — see
   04_BUILD_PHASES.md Phase 2 status for the kernel-vs-production-wiring boundary).

   The full standard table for {sin,cos,tan,cot,sec,csc} composed with {asin,acos,atan},
   derived from a right triangle for each inverse function's principal branch:

     asin(u): opposite=u, hypotenuse=1, adjacent=sqrt(1-u^2)   (branch: cos(asin u) >= 0)
     acos(u): adjacent=u, hypotenuse=1, opposite=sqrt(1-u^2)   (branch: sin(acos u) >= 0)
     atan(u): opposite=u, adjacent=1, hypotenuse=sqrt(1+u^2)   (branch: cos(atan u) >  0)

   No assumption guards: these are the standard well-defined textbook identities on each
   principal branch, same treatment as 03_ARCHITECTURE.md §3 L2 describes them ("finite,
   well-defined"), unlike log/exp separation which genuinely needs positivity guards. */

const { Expr } = require("../expr");
const { Pattern } = require("../pattern");
const { makeRule } = require("../rules");
const printer = require("../printer");

const ONE = Expr.int(1);
const sqrt1MinusUSq = (u) => Expr.func("sqrt", [Expr.sub(ONE, Expr.pow(u, Expr.int(2)))]);
const sqrt1PlusUSq = (u) => Expr.func("sqrt", [Expr.add(ONE, Expr.pow(u, Expr.int(2)))]);

function rule(name, outer, inner, build, formula) {
  return makeRule({
    name,
    category: "inverse-trig",
    pattern: Pattern.func(outer, Pattern.func(inner, Pattern.var("u"))),
    replacement: (b) => build(b.u),
    describe: (b, goal, result) => ({
      text: `${outer}(${inner}(${printer.text(b.u)})) = ${printer.text(result)}`,
      latex: `${formula(printer.latex(b.u))}`,
    }),
  });
}

const RULES = [
  // --- asin(u) ---
  rule("sin-asin", "sin", "asin", (u) => u, (u) => `\\sin(\\arcsin ${u}) = ${u}`),
  rule("cos-asin", "cos", "asin", (u) => sqrt1MinusUSq(u), (u) => `\\cos(\\arcsin ${u}) = \\sqrt{1-${u}^2}`),
  rule("tan-asin", "tan", "asin", (u) => Expr.div(u, sqrt1MinusUSq(u)), (u) => `\\tan(\\arcsin ${u}) = \\frac{${u}}{\\sqrt{1-${u}^2}}`),
  rule("cot-asin", "cot", "asin", (u) => Expr.div(sqrt1MinusUSq(u), u), (u) => `\\cot(\\arcsin ${u}) = \\frac{\\sqrt{1-${u}^2}}{${u}}`),
  rule("sec-asin", "sec", "asin", (u) => Expr.div(ONE, sqrt1MinusUSq(u)), (u) => `\\sec(\\arcsin ${u}) = \\frac{1}{\\sqrt{1-${u}^2}}`),
  rule("csc-asin", "csc", "asin", (u) => Expr.div(ONE, u), (u) => `\\csc(\\arcsin ${u}) = \\frac{1}{${u}}`),

  // --- acos(u) ---
  rule("cos-acos", "cos", "acos", (u) => u, (u) => `\\cos(\\arccos ${u}) = ${u}`),
  rule("sin-acos", "sin", "acos", (u) => sqrt1MinusUSq(u), (u) => `\\sin(\\arccos ${u}) = \\sqrt{1-${u}^2}`),
  rule("tan-acos", "tan", "acos", (u) => Expr.div(sqrt1MinusUSq(u), u), (u) => `\\tan(\\arccos ${u}) = \\frac{\\sqrt{1-${u}^2}}{${u}}`),
  rule("cot-acos", "cot", "acos", (u) => Expr.div(u, sqrt1MinusUSq(u)), (u) => `\\cot(\\arccos ${u}) = \\frac{${u}}{\\sqrt{1-${u}^2}}`),
  rule("sec-acos", "sec", "acos", (u) => Expr.div(ONE, u), (u) => `\\sec(\\arccos ${u}) = \\frac{1}{${u}}`),
  rule("csc-acos", "csc", "acos", (u) => Expr.div(ONE, sqrt1MinusUSq(u)), (u) => `\\csc(\\arccos ${u}) = \\frac{1}{\\sqrt{1-${u}^2}}`),

  // --- atan(u) ---
  rule("tan-atan", "tan", "atan", (u) => u, (u) => `\\tan(\\arctan ${u}) = ${u}`),
  rule("sin-atan", "sin", "atan", (u) => Expr.div(u, sqrt1PlusUSq(u)), (u) => `\\sin(\\arctan ${u}) = \\frac{${u}}{\\sqrt{1+${u}^2}}`),
  rule("cos-atan", "cos", "atan", (u) => Expr.div(ONE, sqrt1PlusUSq(u)), (u) => `\\cos(\\arctan ${u}) = \\frac{1}{\\sqrt{1+${u}^2}}`),
  rule("cot-atan", "cot", "atan", (u) => Expr.div(ONE, u), (u) => `\\cot(\\arctan ${u}) = \\frac{1}{${u}}`),
  rule("sec-atan", "sec", "atan", (u) => sqrt1PlusUSq(u), (u) => `\\sec(\\arctan ${u}) = \\sqrt{1+${u}^2}`),
  rule("csc-atan", "csc", "atan", (u) => Expr.div(sqrt1PlusUSq(u), u), (u) => `\\csc(\\arctan ${u}) = \\frac{\\sqrt{1+${u}^2}}{${u}}`),
];

module.exports = { RULES };
