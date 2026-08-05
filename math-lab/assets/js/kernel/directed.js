"use strict";
/* L2 — Directed operations. See docs/kernel/03_ARCHITECTURE.md §3 L2.

   Six named operations, each a chosen DIRECTION of rewriting — this is the whole point of
   L2 over nerdamer's one fixed simplify(): expand/factor/combine/separate/normalize/
   rationalize are different questions, not the same question asked harder.

   `combine` (logs) is NOT expressed as a single fixed-arity pattern rule. It has to find
   log terms anywhere inside an arbitrary-length sum and leave everything else untouched —
   exactly the AC-with-remainder matching that pattern.js explicitly scopes out of the
   generic matcher. So this is a small dedicated traversal, using the rule-based engine only
   to clean up the term it produces (e.g. collapsing ln(1) to 0 via the log-exp rule set). */

const { Expr } = require("./expr");
const { RuleSet } = require("./rules");
const { normalize: rewriteNormalize } = require("./rewrite");
const { Derivation } = require("./derivation");

const inverseTrig = require("./rulesets/inverse-trig");
const logExp = require("./rulesets/log-exp");
const trigIdentities = require("./rulesets/trig-identities");
const radicals = require("./rulesets/radicals");
const { completeSquareExpr } = require("./rulesets/completing-square");
const { factorExpr } = require("./rulesets/factor");
const { rationalizeExpr } = require("./rulesets/rationalize");
const { weierstrassSubstitution } = require("./rulesets/weierstrass");
const { rationalizingSubstitution } = require("./rulesets/rationalizing-substitution");
const { algebraicSubstitution } = require("./rulesets/algebraic-substitution");
const { trigPowerReduce } = require("./rulesets/trig-power-reduction");

const ALL_RULES = [...inverseTrig.RULES, ...logExp.RULES, ...trigIdentities.RULES, ...radicals.RULES];

function byDirection(dir) {
  return new RuleSet(ALL_RULES.filter((r) => r.direction === dir));
}

// DEFAULT_RULESET backs the generic `normalize` entry point and deliberately excludes
// direction:'expand'/'separate' rules. Reason: a forward rule like sin(2u) -> 2 sin u cos u
// fires bottom-up on EVERY sin(2*_) it finds, including inside a whole-pattern identity like
// `sin(2x) - 2 sin x cos x -> 0` — if that forward rule ran first, it would rewrite away the
// sin(2x) term before the identity rule ever got a chance to recognise the pair, and the
// expression would be left as an un-simplified (and un-cancel-able, absent a separate
// term-collection pass) difference instead of 0. Keeping expand/separate as deliberately
// invoked operations (matching the docs' "six distinct directions" framing) avoids this
// race entirely, rather than papering over it with rule-priority ordering.
const DEFAULT_RULESET = new RuleSet(ALL_RULES.filter((r) => r.direction === "normalize"));

// normalize(expr, ctx, opts) — apply direction:'normalize' rules to a fixed point, under budget.
function normalize(expr, ctx, opts) {
  const ruleSet = (opts && opts.ruleSet) || DEFAULT_RULESET;
  return rewriteNormalize(expr, ruleSet, ctx, opts && opts.budget);
}

// separate(expr, ctx) — apply only direction:'separate' rules (log(ab) -> log a + log b, etc).
function separate(expr, ctx, opts) {
  return rewriteNormalize(expr, byDirection("separate"), ctx, opts && opts.budget);
}

// expand(expr, ctx) — apply only direction:'expand' rules (exp(a+b) -> exp(a)*exp(b), etc).
// Polynomial (x+1)^2 -> x^2+2x+1 style expansion needs polynomial algebra and is Phase 3
// scope (docs/kernel/04_BUILD_PHASES.md Phase 3) — this covers what Phase 2's rule sets
// actually produce today.
function expand(expr, ctx, opts) {
  return rewriteNormalize(expr, byDirection("expand"), ctx, opts && opts.budget);
}

// combine(expr, ctx) — combine ln(a) + ln(b) + ... - ln(c) - ... into one ln(product/product),
// guarded by positivity on every argument involved. Leaves non-log terms untouched.
function combineLogs(addExpr, ctx) {
  if (addExpr.kind !== "Add") return null;

  const positiveLogArgs = [];
  const negativeLogArgs = [];
  const otherTerms = [];
  const matchedGoals = [];

  const isLog = (f) => f.kind === "Func" && (f.name === "ln" || f.name === "log") && f.args.length === 1;

  for (const term of addExpr.args) {
    if (isLog(term)) {
      positiveLogArgs.push(term.args[0]);
      matchedGoals.push(term);
    } else if (
      term.kind === "Mul" &&
      term.args.length === 2 &&
      term.args[0].kind === "Integer" &&
      term.args[0].value === -1n &&
      isLog(term.args[1])
    ) {
      negativeLogArgs.push(term.args[1].args[0]);
      matchedGoals.push(term);
    } else {
      otherTerms.push(term);
    }
  }

  if (positiveLogArgs.length + negativeLogArgs.length < 2) return null;

  const allArgs = [...positiveLogArgs, ...negativeLogArgs];
  if (!allArgs.every((a) => ctx && ctx.ask(a, "positive") === true)) return null;

  const numerator = positiveLogArgs.length ? Expr.mul(...positiveLogArgs) : Expr.int(1);
  const denominator = negativeLogArgs.length ? Expr.mul(...negativeLogArgs) : Expr.int(1);
  // Exact cancellation when the numerator and denominator are the SAME hash-consed
  // expression (e.g. log(xy) - log(x) - log(y): numerator and denominator both build to
  // the identical Mul(x,y) object). L0 does not cancel a*a^-1 algebraically on its own —
  // this is the one targeted case combine needs, not a general GCD/rationalize pass.
  const combinedArg = numerator === denominator ? Expr.int(1) : Expr.div(numerator, denominator);

  let combinedTerm = Expr.func("ln", [combinedArg]);
  const cleaned = rewriteNormalize(combinedTerm, byDirection("normalize"), ctx);
  let combinedDerivation = Derivation.leaf(combinedTerm, ctx);
  if (!cleaned.refused) {
    combinedTerm = cleaned.result;
    combinedDerivation = cleaned.derivation;
  }

  const result = Expr.add(combinedTerm, ...otherTerms);
  const rule = {
    id: "kernel:combine-logs",
    name: "combine-logs",
    source: "kernel",
    describe: () => {
      const printer = require("./printer");
      return {
        text: `combined ${matchedGoals.length} log term(s) into ${printer.text(combinedTerm)}`,
        latex: `\\ln(\\cdots) \\text{ combined}`,
      };
    },
  };
  return { result, derivation: Derivation.step(rule, {}, addExpr, result, ctx, [combinedDerivation]) };
}

function combine(expr, ctx) {
  const logResult = combineLogs(expr, ctx);
  if (logResult) return { refused: false, ...logResult };
  return { refused: true, reason: "combine: no combinable terms found", result: expr, derivation: Derivation.leaf(expr, ctx) };
}

// Shared helper: wrap a procedural (non-rule-table) transform as a directed-operation result
// with a proper Derivation node, refusing honestly when the transform declines to fire.
function proceduralOp(id, name, transform) {
  return (expr, ctx) => {
    const result = transform(expr, ctx);
    if (!result) {
      return { refused: true, reason: `${name}: does not apply to this expression`, result: expr, derivation: Derivation.leaf(expr, ctx) };
    }
    const rule = {
      id: "kernel:" + id,
      name,
      source: "kernel",
      describe: (b, goal, res) => {
        const printer = require("./printer");
        return { text: `${printer.text(goal)} = ${printer.text(res)}`, latex: `${printer.latex(goal)} = ${printer.latex(res)}` };
      },
    };
    return { refused: false, result, derivation: Derivation.step(rule, {}, expr, result, ctx, []) };
  };
}

// completeSquare(expr, ctx) — x^2+bx+c -> (x+b/2)^2 + (c-b^2/4). A dedicated procedural
// transform (see rulesets/completing-square.js for why), not part of automatic normalize.
const completeSquare = proceduralOp("complete-the-square", "complete-the-square", (expr) => completeSquareExpr(expr));

// factor(expr, ctx) — perfect-square trinomials and integer-GCD common-factor extraction
// only; general polynomial factorization is Phase 3 (see rulesets/factor.js).
const factor = proceduralOp("factor", "factor", (expr) => factorExpr(expr));

// rationalize(expr, ctx) — combine fractions over a common denominator (unreduced);
// reducing to lowest terms needs polynomial GCD (Phase 3) (see rulesets/rationalize.js).
const rationalize = proceduralOp("rationalize", "rationalize", (expr, ctx) => rationalizeExpr(expr, ctx));

// Phase 2b — normalize-to-rational-form substitutions. Each returns richer metadata than a
// plain Expr (the new variable, dx/d(new var), etc — needed by whatever eventually feeds on
// this once Phase 3's rational integrator exists), so they share this wrapper rather than
// proceduralOp's plain-Expr contract.
function substitutionOp(id, name, transform) {
  return (expr, x, ctx) => {
    const out = transform(expr, x, ctx);
    if (!out) {
      return { refused: true, reason: `${name}: does not apply to this expression`, result: expr, derivation: Derivation.leaf(expr, ctx) };
    }
    const rule = {
      id: "kernel:" + id,
      name,
      source: "kernel",
      describe: (b, goal, res) => {
        const printer = require("./printer");
        return { text: `${printer.text(goal)} -> ${printer.text(res)}`, latex: `${printer.latex(goal)} \\to ${printer.latex(res)}` };
      },
    };
    const children = out.derivation ? [out.derivation] : [];
    return { refused: false, ...out, derivation: Derivation.step(rule, {}, expr, out.result, ctx, children) };
  };
}

// weierstrass(expr, x, ctx) — t = tan(x/2); turns a rational function of sin(x)/cos(x)/
// tan(x) into a rational function of t. See rulesets/weierstrass.js.
const weierstrass = substitutionOp("weierstrass", "weierstrass-substitution", (expr, x) => weierstrassSubstitution(expr, x));

// rationalizingSubstitution(expr, x, ctx) — u = x^(1/L); clears fractional powers of x.
// See rulesets/rationalizing-substitution.js.
const rationalizingSub = substitutionOp("rationalizing-substitution", "rationalizing-substitution", (expr, x) => rationalizingSubstitution(expr, x));

// algebraicSubstitution(expr, x, ctx) — u = ((ax+b)/(cx+d))^(1/n). See
// rulesets/algebraic-substitution.js.
const algebraicSub = substitutionOp("algebraic-substitution", "algebraic-substitution", (expr, x) => algebraicSubstitution(expr, x));

// trigPowerReduction(expr, x, ctx) — parity reduction for sin(x)^m*cos(x)^n. See
// rulesets/trig-power-reduction.js.
const trigPowerReduction = substitutionOp("trig-power-reduction", "trig-power-reduction", (expr, x) => {
  const result = trigPowerReduce(expr, x);
  return result ? { result } : null;
});

module.exports = {
  normalize,
  separate,
  expand,
  combine,
  completeSquare,
  factor,
  rationalize,
  weierstrass,
  rationalizingSubstitution: rationalizingSub,
  algebraicSubstitution: algebraicSub,
  trigPowerReduction,
  byDirection,
  DEFAULT_RULESET,
  ALL_RULES,
};
