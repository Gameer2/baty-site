"use strict";
/* L2 rule set — trig identities: Pythagorean, double/half angle. See
   docs/kernel/03_ARCHITECTURE.md §3 L2 rule 3 and the Phase 2 gate in
   docs/kernel/04_BUILD_PHASES.md: `sin(2x) - 2 sin x cos x -> 0`.

   Scope note on that gate: rather than build a general "collect like terms across an
   arbitrary-arity sum" pass (a real piece of normalize/rational-normal-form machinery that
   Phase 2 does not otherwise need), the specific cancellation is recognised as its OWN
   whole-pattern identity — `sin(2u) - 2 sin(u) cos(u)` is a fixed 2-term shape, matched
   exactly like Pythagorean below. The forward double-angle rewrite (sin(2u) -> 2 sin u cos u
   alone, as a technique step) is a separate rule from the "this equals zero" identity,
   because a student asking to expand sin(2x) wants the expanded form, not to be told it's
   zero minus itself. General like-term collection remains future work if a rule set ever
   needs it beyond hand-curated identities such as these. */

const { Expr } = require("../expr");
const { Pattern } = require("../pattern");
const { makeRule } = require("../rules");
const printer = require("../printer");

const sinFn = (u) => Expr.func("sin", [u]);
const cosFn = (u) => Expr.func("cos", [u]);

// --- Pythagorean ---

// Both the bare 2-term form (sin^2+cos^2) and the 3-term "-1" form (sin^2+cos^2-1) need
// their own whole-pattern rule — the matcher does exact-arity matching (see pattern.js), so
// a rule for one shape does not fire on the other. Found missing when the benchmark probe
// `sin(x)^2+cos(x)^2-1` (which parses as a 3-term sum, not "the 2-term identity minus 1")
// failed to reduce even though the plain 2-term rule below already existed.
const pythagoreanZero = makeRule({
  name: "pythagorean-identity-zero",
  category: "trig-identity",
  direction: "normalize",
  priority: 10,
  pattern: Pattern.add(
    Pattern.pow(Pattern.func("sin", Pattern.var("u")), Pattern.int(2)),
    Pattern.pow(Pattern.func("cos", Pattern.var("u")), Pattern.int(2)),
    Pattern.int(-1)
  ),
  replacement: () => Expr.int(0),
  describe: (b) => ({
    text: `sin^2(${printer.text(b.u)}) + cos^2(${printer.text(b.u)}) - 1 = 0`,
    latex: `\\sin^2 ${printer.latex(b.u)} + \\cos^2 ${printer.latex(b.u)} - 1 = 0`,
  }),
});

const pythagorean = makeRule({
  name: "pythagorean-identity",
  category: "trig-identity",
  direction: "normalize",
  pattern: Pattern.add(Pattern.pow(Pattern.func("sin", Pattern.var("u")), Pattern.int(2)), Pattern.pow(Pattern.func("cos", Pattern.var("u")), Pattern.int(2))),
  replacement: () => Expr.int(1),
  describe: (b) => ({
    text: `sin^2(${printer.text(b.u)}) + cos^2(${printer.text(b.u)}) = 1`,
    latex: `\\sin^2 ${printer.latex(b.u)} + \\cos^2 ${printer.latex(b.u)} = 1`,
  }),
});

const oneMinusSinSq = makeRule({
  name: "one-minus-sin-sq",
  category: "trig-identity",
  direction: "normalize",
  pattern: Pattern.add(Pattern.int(1), Pattern.mul(Pattern.int(-1), Pattern.pow(Pattern.func("sin", Pattern.var("u")), Pattern.int(2)))),
  replacement: (b) => Expr.pow(cosFn(b.u), Expr.int(2)),
  describe: (b, goal, result) => ({ text: `1 - sin^2(${printer.text(b.u)}) = ${printer.text(result)}`, latex: `1-\\sin^2 ${printer.latex(b.u)} = \\cos^2 ${printer.latex(b.u)}` }),
});

const oneMinusCosSq = makeRule({
  name: "one-minus-cos-sq",
  category: "trig-identity",
  direction: "normalize",
  pattern: Pattern.add(Pattern.int(1), Pattern.mul(Pattern.int(-1), Pattern.pow(Pattern.func("cos", Pattern.var("u")), Pattern.int(2)))),
  replacement: (b) => Expr.pow(sinFn(b.u), Expr.int(2)),
  describe: (b, goal, result) => ({ text: `1 - cos^2(${printer.text(b.u)}) = ${printer.text(result)}`, latex: `1-\\cos^2 ${printer.latex(b.u)} = \\sin^2 ${printer.latex(b.u)}` }),
});

// --- Double angle ---

const sinDoubleAngle = makeRule({
  name: "sin-double-angle",
  category: "trig-identity",
  direction: "expand",
  pattern: Pattern.func("sin", Pattern.mul(Pattern.int(2), Pattern.var("u"))),
  replacement: (b) => Expr.mul(Expr.int(2), sinFn(b.u), cosFn(b.u)),
  describe: (b, goal, result) => ({ text: `sin(2*${printer.text(b.u)}) = ${printer.text(result)}`, latex: `\\sin(2${printer.latex(b.u)}) = 2\\sin ${printer.latex(b.u)} \\cos ${printer.latex(b.u)}` }),
});

const cosDoubleAngle = makeRule({
  name: "cos-double-angle",
  category: "trig-identity",
  direction: "expand",
  pattern: Pattern.func("cos", Pattern.mul(Pattern.int(2), Pattern.var("u"))),
  replacement: (b) => Expr.sub(Expr.pow(cosFn(b.u), Expr.int(2)), Expr.pow(sinFn(b.u), Expr.int(2))),
  describe: (b, goal, result) => ({ text: `cos(2*${printer.text(b.u)}) = ${printer.text(result)}`, latex: `\\cos(2${printer.latex(b.u)}) = \\cos^2 ${printer.latex(b.u)} - \\sin^2 ${printer.latex(b.u)}` }),
});

// The Phase 2 gate identity itself: sin(2x) - 2 sin x cos x -> 0, as one whole-pattern rule
// (see the scope note at the top of this file for why it is not derived from the forward
// double-angle rule via general term collection).
const sinDoubleAngleIdentityZero = makeRule({
  name: "sin-double-angle-identity-zero",
  category: "trig-identity",
  direction: "normalize",
  priority: 10, // try before the forward expand rule so the identity is recognised whole
  pattern: Pattern.add(
    Pattern.func("sin", Pattern.mul(Pattern.int(2), Pattern.var("u"))),
    Pattern.mul(Pattern.int(-2), Pattern.func("sin", Pattern.var("u")), Pattern.func("cos", Pattern.var("u")))
  ),
  replacement: () => Expr.int(0),
  describe: (b) => ({ text: `sin(2*${printer.text(b.u)}) - 2 sin(${printer.text(b.u)}) cos(${printer.text(b.u)}) = 0`, latex: "\\sin 2u - 2\\sin u\\cos u = 0" }),
});

const RULES = [pythagoreanZero, pythagorean, oneMinusSinSq, oneMinusCosSq, sinDoubleAngle, cosDoubleAngle, sinDoubleAngleIdentityZero];

module.exports = { RULES };
