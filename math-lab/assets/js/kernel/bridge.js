"use strict";
/* Kernel bridge — the seam production engines (calculus-symbolic.js, integration-advanced.js)
   use to reach the L0-L2 kernel (docs/kernel/03_ARCHITECTURE.md, 04_BUILD_PHASES.md Phase
   1/2/2b/2d) without depending on its internals directly.

   Two things live here, both narrow on purpose:

     1. simplify(text, assumeFn) — runs the kernel's directed.normalize/combine (the same
        best-of-both-candidates selection tests/bench/baseline.js's runNewKernelProbes uses)
        on a text expression and returns the lower-cost result as text, or null if the
        kernel can't parse the input or every rule set refuses. null means "say nothing" —
        callers fall back to their existing nerdamer-based simplification untouched. This is
        the strangler-fig discipline from docs/kernel/03_ARCHITECTURE.md §4: a kernel miss
        degrades to the old behaviour, never to a worse one.

     2. sqrtDifferenceOfSquaresValidUnderGT() — the literal Phase 1 gate case
        (04_BUILD_PHASES.md: "sqrt(x^2 - a^2) selects its branch from x>a, with a symbolic"),
        exposed as a cached boolean so production code can confirm — from the kernel, not by
        re-deriving the fact locally — that sampling a differentiate-back check on the x>a
        side of a sec-substitution is domain-valid. See calculus-symbolic.js trigSubstitution.

   Loaded two ways, both landing on plain require()/module.exports like every other kernel
   file: directly by Node (tests, tests/bench, calculus-symbolic.js's own require() branch),
   and inside cas-worker.js under the require-shim installed there so the Worker-side
   production pipeline reaches the same kernel the test suites exercise. */

const { Expr } = require("./expr");
const { AssumptionContext, Rel } = require("./assumptions");
const branch = require("./branch");
const { parse } = require("./parser");
const printer = require("./printer");
const directed = require("./directed");
const { cost } = require("./cost");
const { rfFromExpr } = require("./poly-of-expr");
const { integrateRational } = require("./rational-integrate");
const { limit: kernelLimitFn } = require("./limit");

function tryParse(text) {
  try { return parse(text); } catch (e) { return null; }
}

// Mirrors tests/bench/baseline.js's bestResult(): try normalize and combine, keep whichever
// non-refused candidate has the lower cost. Two directed operations, not the whole L2
// surface — expand/factor/rationalize are deliberately narrow (04_BUILD_PHASES.md Phase 2
// scope note) and are not safe to apply unconditionally as a display-tidy pass.
function bestResult(expr, ctx) {
  const candidates = [];
  const n = directed.normalize(expr, ctx);
  if (!n.refused) candidates.push(n);
  const c = directed.combine(expr, ctx);
  if (!c.refused) candidates.push(c);
  if (!candidates.length) return null;
  candidates.sort((a, b) => cost(a.result) - cost(b.result));
  return candidates[0];
}

// simplify(text, assumeFn?) -> simplified text, or null (kernel had nothing better / couldn't
// parse). assumeFn(ctx), if given, is called once to install assumptions before rewriting.
function simplify(text, assumeFn) {
  const expr = tryParse(text);
  if (!expr) return null;
  const ctx = AssumptionContext.create();
  if (assumeFn) {
    try { assumeFn(ctx); } catch (e) { return null; } // a contradictory assumption: don't guess
  }
  const best = bestResult(expr, ctx);
  if (!best) return null;
  try { return printer.text(best.result); } catch (e) { return null; }
}

// The Phase 1 gate fact, computed once: under x > a with a >= 0, sqrt(x^2 - a^2) is on the
// real, principal (nonnegative-radicand) branch. Structural — independent of the concrete
// value of a — so it justifies domain-aware sampling for ANY sec-substitution case, not just
// the one measured example (see docs/kernel/04_BUILD_PHASES.md Phase 1 status note).
let _secDomainConfirmed = null;
function sqrtDifferenceOfSquaresValidUnderGT() {
  if (_secDomainConfirmed !== null) return _secDomainConfirmed;
  try {
    const ctx = AssumptionContext.create();
    const x = Expr.sym("x"), a = Expr.sym("a");
    ctx.assume("a", "nonnegative");
    ctx.assume(Rel.gt(x, a));
    const inner = Expr.sub(Expr.pow(x, Expr.TWO), Expr.pow(a, Expr.TWO));
    _secDomainConfirmed = branch.sqrtDomainOk(ctx, inner) === true;
  } catch (e) {
    _secDomainConfirmed = false;
  }
  return _secDomainConfirmed;
}

// integrateRationalText(text, varName) -> { ok: true, resultText, refused: false }
//   | { ok: false, refused: true, reason }
// Phase 3 seam (docs/kernel/04_BUILD_PHASES.md Phase 3): exact antiderivative for a rational
// function of `varName` whose denominator splits over Q into linear/irreducible-quadratic
// factors. `refused: true` covers both "not recognised as a rational function of this
// variable" (parse-level: any trig/exp/log/foreign symbol) and the kernel's own honest
// refusal (irreducible degree>=3 factor, or an irreducible quadratic with real irrational
// roots — both need the Q(alpha)/Rothstein-Trager follow-up, deferred). Callers must treat
// both the same way: fall back to the existing nerdamer-based technique untouched. Never
// throws — every failure path returns refused:true instead.
// rational-integrate.js always appends a literal Expr.sym("C") term (see its integrateRational,
// which is exercised standalone by tests/verify-poly.js and has no caller-side convention to
// respect). Every production technique in integration-advanced.js/calculus-symbolic.js instead
// returns the antiderivative WITHOUT the constant and appends " + C" only in the display/latex
// string — so a caller here that passed the kernel's raw text through would embed a bare,
// unbound symbol "C" in `result`, which then fails the differentiate-back/numeric verification
// gate (the checker has to evaluate `result` at sample points, and C has no value). Strip it.
function stripIntegrationConstant(expr) {
  if (expr.kind !== "Add") return expr;
  const kept = expr.args.filter((a) => !(a.kind === "Symbol" && a.name === "C"));
  if (kept.length === expr.args.length) return expr;
  if (kept.length === 0) return Expr.ZERO;
  return kept.length === 1 ? kept[0] : Expr.add(...kept);
}

function integrateRationalText(text, varName) {
  try {
    const expr = tryParse(text);
    if (!expr) return { ok: false, refused: true, reason: "kernel could not parse the integrand" };
    const rf = rfFromExpr(expr, varName || "x");
    if (!rf) return { ok: false, refused: true, reason: "not a rational function of " + (varName || "x") + " the kernel recognises" };
    const out = integrateRational(rf.num, rf.den, varName || "x");
    if (out.refused) return { ok: false, refused: true, reason: out.reason };
    const resultText = printer.text(stripIntegrationConstant(out.result));
    return { ok: true, refused: false, resultText };
  } catch (e) {
    return { ok: false, refused: true, reason: "kernel rational-integrate threw: " + (e && e.message) };
  }
}

// limitText(text, varName, pointText, assumeFn?) ->
//   { ok: true, refused: false, kind, resultText, sign } | { ok: false, refused: true, reason }
// Phase 4 seam (docs/kernel/04_BUILD_PHASES.md Phase 4). `pointText` is the point exactly as
// typed ("2", "-3/4", "Infinity", "-Infinity") — parsed by the kernel's own exact-rational
// parser rather than a lossy float, so a fractional limit point stays exact. Same non-throwing,
// fall-back-on-refusal contract as integrateRationalText: oscillatory/essential/non-resolving
// forms come back as refused:true, never a guess.
function limitText(text, varName, pointText, assumeFn) {
  try {
    const expr = tryParse(text);
    if (!expr) return { ok: false, refused: true, reason: "kernel could not parse the expression" };
    const v = varName || "x";
    const s = String(pointText).trim();
    let point;
    if (/^[+]?(inf(inity)?)$/i.test(s)) point = Infinity;
    else if (/^-(inf(inity)?)$/i.test(s)) point = -Infinity;
    else {
      const pointExpr = tryParse(s);
      if (!pointExpr || !Expr.isNumeric(pointExpr)) {
        return { ok: false, refused: true, reason: "kernel could not parse the limit point" };
      }
      point = pointExpr;
    }
    const ctx = AssumptionContext.create();
    if (assumeFn) {
      try { assumeFn(ctx); } catch (e) { return { ok: false, refused: true, reason: "contradictory assumption" }; }
    }
    const res = kernelLimitFn(expr, v, point, ctx);
    if (res.refused) return { ok: false, refused: true, reason: res.reason };
    let resultText = null;
    if (res.result) {
      try { resultText = printer.text(res.result); } catch (e) { resultText = null; }
    }
    return { ok: true, refused: false, kind: res.kind, resultText, sign: res.sign };
  } catch (e) {
    return { ok: false, refused: true, reason: "kernel limit threw: " + (e && e.message) };
  }
}

module.exports = {
  parse: tryParse,
  print: (e) => { try { return printer.text(e); } catch (err) { return null; } },
  createContext: () => AssumptionContext.create(),
  Rel,
  simplify,
  sqrtDifferenceOfSquaresValidUnderGT,
  integrateRationalText,
  limitText,
};
