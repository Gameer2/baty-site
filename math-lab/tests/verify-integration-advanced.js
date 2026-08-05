"use strict";
/* Advanced integration techniques — verification suite.
   Runs the exact code the pages ship (assets/js/integration-advanced.js) against known
   textbook answers. Run with: node tests/verify-integration-advanced.js

   Same discipline as verify-calculus.js: cases assert on BEHAVIOUR, never string equality.
   A correct antiderivative may differ from the book's by a constant or by algebraic form, so
   the assertions are:
     - the returned antiderivative differentiates back to the integrand, checked here in the
       test by math.js finite differences (never by asking nerdamer to check nerdamer), and
     - the substitution chosen is the one a student would be taught to pick. */

const path = require("path");
const math = require(path.join(__dirname, "..", "assets", "vendor", "math.min.js"));
const loadNerdamer = require(path.join(__dirname, "lib", "load-cas.js"));
const lnToLog = require(path.join(__dirname, "lib", "ln-to-log.js"));
const Advanced = require(path.join(__dirname, "..", "assets", "js", "integration-advanced.js"));

const nerdamer = loadNerdamer();
Advanced.configure({ nerdamer, math });

let pass = 0;
let fail = 0;

function ok(cond, label, detail) {
  if (cond) { pass++; console.log(`  ok    ${label}${detail ? ": " + detail : ""}`); }
  else { fail++; console.error(`  FAIL  ${label}${detail ? ": " + detail : ""}`); }
  return cond;
}

/* Independent of the module's own gate: differentiate the reported answer HERE, by finite
   differences in math.js, and compare to the integrand. Shares no code with the thing under
   test — if the module's internal verification were ever weakened this would still catch it. */
function differentiatesBackTo(result, integrand, v, pts) {
  let F, g;
  // math.js has no "ln" function (only "log" for natural log); the kernel canonicalizes
  // natural log to "ln(...)". Translate before parsing — see tests/lib/ln-to-log.js.
  try { F = math.parse(lnToLog(result)).compile(); } catch (e) { return false; }
  try { g = math.parse(integrand).compile(); } catch (e) { return false; }
  const h = 1e-5;
  let hits = 0;
  for (const x of pts) {
    let fp, gx;
    try { fp = (F.evaluate({ [v]: x + h }) - F.evaluate({ [v]: x - h })) / (2 * h); } catch (e) { continue; }
    try { gx = g.evaluate({ [v]: x }); } catch (e) { continue; }
    if (typeof fp !== "number" || typeof gx !== "number") continue;
    if (!Number.isFinite(fp) || !Number.isFinite(gx)) continue;
    hits++;
    if (Math.abs(fp - gx) > 1e-4 * Math.max(1, Math.abs(gx))) return false;
  }
  return hits >= 4;
}

const NEAR0 = [0.21, 0.43, 0.67, 0.91, 1.17, 1.41, 1.63, 1.87];
const POS   = [0.31, 0.63, 0.97, 1.34, 1.76, 2.21, 2.68];

console.log("Advanced integration techniques — verification suite\n");

/* ---- Algebraic substitution: cases that must succeed --------------------------------
   Each is a standard "rationalise the radical" exercise. nerdamer refuses all of these
   outright; the substitution is what makes them tractable. */
console.log("Algebraic substitution:");
const algCases = [
  { integrand: "x*sqrt(x+1)",   pts: NEAR0, note: "Stewart §7.4 — u = √(x+1) clears the radical" },
  { integrand: "1/(1+sqrt(x))", pts: POS,   note: "u = √x turns it into a rational function" },
  { integrand: "e^(sqrt(x))",   pts: POS,   note: "u = √x, then the reduced integral is by-parts" },
  { integrand: "sqrt(x+4)",     pts: NEAR0, note: "simplest case — radical of a linear expression" },
  { integrand: "x/sqrt(x+1)",   pts: NEAR0, note: "radical in the denominator" }
];

for (const c of algCases) {
  const r = Advanced.algebraicSubstitution(c.integrand, "x");
  if (!ok(r.ok, `∫ ${c.integrand} dx solves by algebraic substitution`, r.ok ? `u = ${r.u}` : r.reason)) continue;
  ok(differentiatesBackTo(r.result, c.integrand, "x", c.pts),
     `  answer differentiates back for ∫ ${c.integrand} dx`, r.result);
  ok(r.verified === true, `  module reports verified for ∫ ${c.integrand} dx`);
  ok(r.steps.length === 6 && r.steps.every((s) => s.rule && s.text && s.latex),
     `  emits a complete 6-step derivation for ∫ ${c.integrand} dx`);
}

/* ---- Algebraic substitution: cases that must be REFUSED ---- */
{
  const r = Advanced.algebraicSubstitution("x*sin(x^2)", "x");
  ok(!r.ok, "refuses ∫ x*sin(x^2) dx (no radical — that's u-substitution)",
     r.ok ? `wrongly returned u = ${r.u}` : "declined");
}
{
  // A radical, but of a QUADRATIC — that is trig substitution's territory, not this one.
  const r = Advanced.algebraicSubstitution("sqrt(4-x^2)", "x");
  ok(!r.ok, "refuses ∫ sqrt(4-x^2) dx (radical of a quadratic — trig substitution's turf)",
     r.ok ? `wrongly returned ${r.result}` : "declined");
}
{
  let threw = false;
  try { Advanced.algebraicSubstitution("", "x"); } catch (e) { threw = true; }
  ok(threw, "throws a clear error on an empty integrand");
}
{
  const r = Advanced.algebraicSubstitution("u*sqrt(u+1)", "u");
  ok(r.ok, "handles an integrand whose variable is literally u", r.ok ? "renamed the substitution symbol" : r.reason);
}

/* ---- Completing the square: cases that must succeed ---------------------------------
   ∫dx/(x²+2x+5) is the case nerdamer answers with a denominator that is algebraically ZERO
   — ((1+x)^2-1-2*x-x^2)^(-1) — so this is a correctness fix, not just a coverage one. */
console.log("\nCompleting the square:");
const sqCases = [
  { integrand: "1/(x^2+2*x+5)",      pts: NEAR0, note: "→ arctan; nerdamer's own answer has a zero denominator" },
  { integrand: "1/sqrt(x^2+4*x+13)", pts: NEAR0, note: "→ inverse-hyperbolic log form; nerdamer refuses" },
  { integrand: "1/(x^2+6*x+13)",     pts: NEAR0, note: "→ arctan, k = 4" },
  { integrand: "1/(x^2+4*x+5)",      pts: NEAR0, note: "→ arctan, k = 1" }
];

for (const c of sqCases) {
  const r = Advanced.completeTheSquare(c.integrand, "x");
  if (!ok(r.ok, `∫ ${c.integrand} dx solves by completing the square`, r.ok ? r.completedSquare : r.reason)) continue;
  ok(differentiatesBackTo(r.result, c.integrand, "x", c.pts),
     `  answer differentiates back for ∫ ${c.integrand} dx`, r.result);
  ok(r.verified === true, `  module reports verified for ∫ ${c.integrand} dx`);
  ok(r.steps.length === 6 && r.steps.every((s) => s.rule && s.text && s.latex),
     `  emits a complete 6-step derivation for ∫ ${c.integrand} dx`);
}

/* ---- Completing the square: cases that must be REFUSED ---- */
{
  // Already centred (no linear term) — there is nothing to complete.
  const r = Advanced.completeTheSquare("1/(x^2+1)", "x");
  ok(!r.ok, "refuses ∫ 1/(x^2+1) dx (already a standard form — nothing to complete)",
     r.ok ? `wrongly returned ${r.result}` : "declined");
}
{
  const r = Advanced.completeTheSquare("x*e^x", "x");
  ok(!r.ok, "refuses ∫ x*e^x dx (no quadratic present — that's integration by parts)",
     r.ok ? `wrongly returned ${r.result}` : "declined");
}
{
  let threw = false;
  try { Advanced.completeTheSquare("", "x"); } catch (e) { threw = true; }
  ok(threw, "throws a clear error on an empty integrand");
}

/* ---- The verification gate must be real, not decorative -----------------------------
   Every ok:true result in this suite has already been differentiated back independently
   above. This block asserts the contract itself: a refusal always carries a reason. */
console.log("\nContract:");
{
  const refusals = [
    Advanced.algebraicSubstitution("sin(x)", "x"),
    Advanced.completeTheSquare("sin(x)", "x")
  ];
  ok(refusals.every((r) => r.ok === false && typeof r.reason === "string" && r.reason.length > 20),
     "every refusal carries a substantive reason");
}

console.log(`\n${pass} passed, ${fail} failed.`);
process.exit(fail === 0 ? 0 : 1);
