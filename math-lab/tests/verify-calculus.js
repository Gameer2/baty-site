"use strict";
/* Calculus Engine — verification suite.
   Runs the exact code the pages ship (assets/js/calculus-symbolic.js) against known
   textbook answers. Run with: node tests/verify-calculus.js

   Symbolic results can be correct while looking nothing like the book's answer
   (nerdamer's (-1/2)*cos(x^2) vs. a book's -cos(x^2)/2, or an antiderivative that differs
   by a constant), so cases assert on *behaviour* rather than on string equality:
     - the returned antiderivative differentiates back to the integrand, and
     - the chosen substitution u is the one a student would be taught to pick.
   String comparison here would produce a suite that fails on cosmetics and passes on
   nothing that matters. */

const path = require("path");
const math = require(path.join(__dirname, "..", "assets", "vendor", "math.min.js"));
const loadNerdamer = require(path.join(__dirname, "lib", "load-cas.js"));
const lnToLog = require(path.join(__dirname, "lib", "ln-to-log.js"));
const CalculusSymbolic = require(path.join(__dirname, "..", "assets", "js", "calculus-symbolic.js"));

const nerdamer = loadNerdamer();
CalculusSymbolic.configure({ nerdamer, math });

let pass = 0;
let fail = 0;

function ok(cond, label, detail) {
  if (cond) {
    pass++;
    console.log(`  ok    ${label}${detail ? ": " + detail : ""}`);
  } else {
    fail++;
    console.error(`  FAIL  ${label}${detail ? ": " + detail : ""}`);
  }
  return cond;
}

// Independent of the module's own check: differentiate the reported answer here, in the
// test, and compare to the integrand numerically. If verification inside the module were
// ever silently weakened, this would still catch it.
function differentiatesBackTo(result, integrand, v) {
  const d = nerdamer(`diff(${result},${v})`).toString();
  for (const x of [0.41, 0.83, 1.29, 1.77, 2.34]) {
    let a, b;
    try {
      a = parseFloat(nerdamer(d).evaluate({ [v]: x }).text("decimals"));
      b = parseFloat(nerdamer(integrand).evaluate({ [v]: x }).text("decimals"));
    } catch (e) { return false; }
    if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
    if (Math.abs(a - b) > 1e-7 * Math.max(1, Math.abs(a))) return false;
  }
  return true;
}

// u equal up to nerdamer's own normalisation ("2*x+1" may come back as "1+2*x").
function sameExpr(a, b) {
  try { return nerdamer(`(${a})-(${b})`).simplify().toString() === "0"; } catch (e) { return false; }
}

console.log("Calculus Engine — verification suite\n");

/* ---- Cases that must succeed ---------------------------------------------------------
   Each is a standard first-course u-substitution exercise, with the substitution the
   textbook teaches for it. */
const cases = [
  { integrand: "x*sin(x^2)",        u: "x^2",       note: "Stewart §5.5 classic — u = inner function of the composition" },
  { integrand: "2*x*e^(x^2)",       u: "x^2",       note: "exponential composition" },
  { integrand: "(2*x+1)^5",         u: "2*x+1",     note: "linear inner function, du is a constant" },
  { integrand: "1/(x*log(x))",      u: "log(x)",    note: "u = log(x), the case students miss" },
  { integrand: "cos(x)*sin(x)^3",   u: "sin(x)",    note: "odd power of sine peeled off as du" },
  { integrand: "x/(x^2+1)",         u: "x^2+1",     note: "denominator as u — yields a log" },
  { integrand: "x^2*sqrt(x^3+2)",   u: "x^3+2",     note: "radical, non-linear inner function" }
];

for (const c of cases) {
  const r = CalculusSymbolic.uSubstitution(c.integrand, "x");
  if (!ok(r.ok, `∫ ${c.integrand} dx solves by u-sub`, r.ok ? `u = ${r.u}` : r.reason)) continue;
  ok(sameExpr(r.u, c.u), `  picks the textbook substitution for ∫ ${c.integrand} dx`, `got u = ${r.u}, expected ${c.u}`);
  ok(differentiatesBackTo(r.result, c.integrand, "x"), `  answer differentiates back for ∫ ${c.integrand} dx`, r.result);
  ok(r.steps.length === 6 && r.steps.every((s) => s.rule && s.text && s.latex),
     `  emits a complete 6-step derivation for ∫ ${c.integrand} dx`);
}

/* ---- Cases that must be REFUSED ------------------------------------------------------
   The point of the verification gate. These are not u-substitution problems, and reporting
   a confident derivation for them would be the worst possible failure mode — worse than
   returning nothing, because a student cannot tell it is wrong. */
{
  const r = CalculusSymbolic.uSubstitution("x*e^x", "x");
  ok(!r.ok, "refuses ∫ x*e^x dx (that is integration by parts, not u-sub)",
     r.ok ? `wrongly returned u = ${r.u}` : "declined");
}
{
  const r = CalculusSymbolic.uSubstitution("e^(x^2)", "x");
  ok(!r.ok, "refuses ∫ e^(x^2) dx (no elementary antiderivative)",
     r.ok ? `wrongly returned ${r.result}` : "declined");
}
{
  const r = CalculusSymbolic.uSubstitution("1/(x^2-1)", "x");
  ok(!r.ok, "refuses ∫ 1/(x^2-1) dx (partial fractions, not u-sub)",
     r.ok ? `wrongly returned u = ${r.u}` : "declined");
}

/* ---- Contract checks ----------------------------------------------------------------- */
{
  let threw = false;
  try { CalculusSymbolic.uSubstitution("", "x"); } catch (e) { threw = true; }
  ok(threw, "throws a clear error on an empty integrand");
}
{
  // The substitution symbol must not collide with a variable already in the integrand.
  const r = CalculusSymbolic.uSubstitution("u*sin(u^2)", "u");
  ok(r.ok, "handles an integrand whose variable is literally u", r.ok ? `u_1 = ${r.u}` : r.reason);
}

/* ---- Integration by Parts --------------------------------------------------------------
   Each case names the LIATE winner the textbook would pick. e^x*sin(x) is the one that
   needs the "integrate by parts twice, solve for I" trick — confirmed nerdamer resolves the
   reduced integral in one call, which is why this engine only decomposes one level deep. */
const ibpCases = [
  { integrand: "x*e^x",       u: "x",      note: "algebraic beats exponential" },
  { integrand: "x^2*e^x",     u: "x^2",    note: "needs by-parts twice — nerdamer's integrate() absorbs the second round" },
  { integrand: "x*sin(x)",    u: "x",      note: "algebraic beats trig" },
  { integrand: "x*cos(x)",    u: "x",      note: "algebraic beats trig" },
  { integrand: "log(x)",      u: "log(x)", note: "single factor — dv = dx" },
  { integrand: "x*log(x)",    u: "log(x)", note: "logarithmic beats algebraic" },
  { integrand: "atan(x)",     u: "atan(x)", note: "single factor — dv = dx" },
  { integrand: "e^x*sin(x)",  u: null,     note: "no clear LIATE winner, but must still resolve via the solve-for-I trick" }
];
for (const c of ibpCases) {
  const r = CalculusSymbolic.integrationByParts(c.integrand, "x");
  if (!ok(r.ok, `∫ ${c.integrand} dx solves by parts`, r.ok ? `u = ${r.u}` : r.reason)) continue;
  if (c.u !== null) ok(sameExpr(r.u, c.u), `  picks u = ${c.u} for ∫ ${c.integrand} dx`, `got u = ${r.u}`);
  ok(differentiatesBackTo(r.result, c.integrand, "x"), `  answer differentiates back for ∫ ${c.integrand} dx`, r.result);
  ok(r.steps.length === 7 && r.steps.every((s) => s.rule && s.text && s.latex),
     `  emits a complete 7-step derivation for ∫ ${c.integrand} dx`);
}
{
  // sin(x^2) has no elementary antiderivative at all (a Fresnel integral) — dv fails to
  // integrate, and the refusal is the correct behaviour, not a wrong answer.
  const r = CalculusSymbolic.integrationByParts("x*sin(x^2)", "x");
  ok(!r.ok, "refuses ∫ x*sin(x^2) dx (dv has no elementary antiderivative — this is u-substitution's turf)",
     r.ok ? `wrongly returned ${r.result}` : r.reason);
}
{
  let threw = false;
  try { CalculusSymbolic.integrationByParts("", "x"); } catch (e) { threw = true; }
  ok(threw, "throws a clear error on an empty integrand");
}
{
  // A constant multiplier out front must survive to the final answer.
  const r = CalculusSymbolic.integrationByParts("3*x*e^x", "x");
  ok(r.ok && differentiatesBackTo(r.result, "3*x*e^x", "x"), "handles a constant multiplier (3*x*e^x)", r.ok ? r.result : r.reason);
}

/* ---- Partial Fractions ---------------------------------------------------------------
   nerdamer's partfrac() does the decomposition itself (incl. irreducible quadratics, repeated
   factors, and the long division for improper fractions), so these cases assert only that the
   decomposition succeeds and the result differentiates back — the technique is mechanical. */
const pfCases = [
  { integrand: "1/(x^2-1)",        note: "two distinct linear factors → logs" },
  { integrand: "x/(x^2-1)",        note: "numerator present" },
  { integrand: "(2*x+1)/(x^2+x-2)", note: "Stewart §7.4 exercise" },
  { integrand: "1/(x^3+x)",        note: "an irreducible quadratic factor (x²+1) → an atan" },
  { integrand: "1/(x^2+1)",        note: "single irreducible quadratic → atan(x)" },
  { integrand: "1/(x^3+2*x^2+x)",  note: "a repeated linear factor (x+1)²" },
  { integrand: "x^3/(x^2-1)",      note: "improper — partfrac does the long division itself" },
  { integrand: "1/((x-1)^2*(x+2))", note: "repeated + distinct linear factors" }
];
for (const c of pfCases) {
  const r = CalculusSymbolic.partialFractions(c.integrand, "x");
  if (!ok(r.ok, `∫ ${c.integrand} dx decomposes by partial fractions (${c.note})`, r.ok ? `decomp = ${r.decomposition}` : r.reason)) continue;
  ok(differentiatesBackTo(r.result, c.integrand, "x"), `  answer differentiates back for ∫ ${c.integrand} dx`, r.result);
  ok(r.steps.length === 6 && r.steps.every((s) => s.rule && s.text && s.latex),
     `  emits a complete 6-step derivation for ∫ ${c.integrand} dx`);
}
{
  // Not a rational function at all — by-parts territory. Refusal is the correct answer.
  const r = CalculusSymbolic.partialFractions("x*e^x", "x");
  ok(!r.ok, "refuses ∫ x*e^x dx (not a rational function — that's integration by parts)",
     r.ok ? `wrongly returned ${r.result}` : r.reason);
}
{
  // A quotient but one side isn't a polynomial in x (sqrt in the denominator) — this is trig
  // substitution's turf, and the refusal should say so rather than hand back a wrong answer.
  const r = CalculusSymbolic.partialFractions("1/sqrt(4-x^2)", "x");
  ok(!r.ok, "refuses ∫ 1/sqrt(4-x^2) dx (denominator isn't a polynomial — trig substitution's turf)",
     r.ok ? `wrongly returned ${r.result}` : r.reason);
}
{
  let threw = false;
  try { CalculusSymbolic.partialFractions("", "x"); } catch (e) { threw = true; }
  ok(threw, "throws a clear error on an empty integrand");
}

/* ---- Trigonometric Substitution ------------------------------------------------------
   The three radical forms. Verified with an INDEPENDENT math.js finite-difference check
   (fdCheck), not the suite's differentiatesBackTo: that helper differentiates via nerdamer,
   whose diff() is wrong on the √(quadratic) forms this technique produces — it would reject
   correct answers. fdCheck never asks nerdamer to differentiate. */
function fdCheck(result, integrand, v) {
  let F, g;
  // math.js has no "ln" function (only "log" for natural log); the kernel canonicalizes
  // natural log to "ln(...)". Translate before parsing — see tests/lib/ln-to-log.js.
  try { F = math.parse(lnToLog(result)).compile(); } catch (e) { return false; }
  try { g = math.parse(integrand).compile(); } catch (e) { return false; }
  const h = 1e-5;
  let hits = 0;
  for (const x of [0.21, 0.43, 0.67, 0.91, 1.17, 1.41, 1.63, 1.87]) {
    let fp, gx;
    try { fp = (F.evaluate({ [v]: x + h }) - F.evaluate({ [v]: x - h })) / (2 * h); } catch (e) { continue; }
    try { gx = g.evaluate({ [v]: x }); } catch (e) { continue; }
    if (!Number.isFinite(fp) || !Number.isFinite(gx)) continue;
    hits++;
    if (Math.abs(fp - gx) > 1e-4 * Math.max(1, Math.abs(gx))) return false;
  }
  return hits >= 4;
}
const tsCases = [
  { integrand: "sqrt(4-x^2)",       note: "√(a²−x²), a=2 — the signature case" },
  { integrand: "x^2*sqrt(4-x^2)",  note: "√(a²−x²) with an x² factor" },
  { integrand: "1/sqrt(4-x^2)",    note: "√(a²−x²) in the denominator → asin" },
  { integrand: "sqrt(9-x^2)",      note: "√(a²−x²), a=3" },
  { integrand: "1/sqrt(4+x^2)",    note: "√(a²+x²) in the denominator → asinh/log form" },
  { integrand: "sqrt(x^2-1)",      note: "√(x²−a²), a=1" },
  { integrand: "1/(x^2*sqrt(x^2-1))", note: "√(x²−a²) in a denominator product → asec" }
];
for (const c of tsCases) {
  const r = CalculusSymbolic.trigSubstitution(c.integrand, "x");
  if (!ok(r.ok, `∫ ${c.integrand} dx solves by trig substitution (${c.note})`, r.ok ? `sub = ${r.substitution}, result = ${r.result}` : r.reason)) continue;
  ok(r.verified, `  engine self-verifies ∫ ${c.integrand} dx`, "verified=false");
  ok(fdCheck(r.result, c.integrand, "x"), `  independently differentiates back for ∫ ${c.integrand} dx`, r.result);
  ok(r.steps.length === 6 && r.steps.every((s) => s.rule && s.text && s.latex),
     `  emits a complete 6-step derivation for ∫ ${c.integrand} dx`);
}
{
  // No radical of the recognised form — u-substitution territory, not trig sub.
  const r = CalculusSymbolic.trigSubstitution("x*sin(x^2)", "x");
  ok(!r.ok, "refuses ∫ x*sin(x^2) dx (no √(a²±x²) or √(x²−a²) form — u-substitution's turf)",
     r.ok ? `wrongly returned ${r.result}` : r.reason);
}
{
  let threw = false;
  try { CalculusSymbolic.trigSubstitution("", "x"); } catch (e) { threw = true; }
  ok(threw, "throws a clear error on an empty integrand");
}

/* ---- Limits ---------------------------------------------------------------------------
   Asserted on numeric value rather than string, for the same reason as above: "1/2", "0.5"
   and "(1/2)" are all correct answers and only one of them is the string nerdamer happens
   to emit today. */
function valueOf(r) {
  if (!r.ok || r.value === null) return null;
  if (/^-?Infinity$/i.test(String(r.value))) return String(r.value).startsWith("-") ? -Infinity : Infinity;
  try { return parseFloat(nerdamer(r.value).evaluate().text("decimals")); } catch (e) { return NaN; }
}

const limitCases = [
  { f: "sin(x)/x",            at: 0,          want: 1,       note: "the defining 0/0 limit of the whole subject" },
  { f: "(1-cos(x))/x^2",      at: 0,          want: 0.5,     note: "needs L'Hôpital twice" },
  { f: "(e^x-1)/x",           at: 0,          want: 1,       note: "0/0" },
  { f: "(x^2-1)/(x-1)",       at: 1,          want: 2,       note: "0/0 that also factors" },
  { f: "x^2+3*x",             at: 2,          want: 10,      note: "continuous — direct substitution" },
  { f: "(x^2+1)/(2*x^2-3)",   at: "Infinity", want: 0.5,     note: "∞/∞ at infinity" },
  { f: "log(x)/x",            at: "Infinity", want: 0,       note: "∞/∞, log grows slower" },
  { f: "(1+1/x)^x",           at: "Infinity", want: Math.E,  note: "the definition of e (1^∞)" }
];

for (const c of limitCases) {
  const r = CalculusSymbolic.limit(c.f, "x", c.at);
  if (!ok(r.ok, `lim ${c.f} as x→${c.at} resolves`, r.ok ? String(r.value) : r.reason)) continue;
  const got = valueOf(r);
  ok(Number.isFinite(got) && Math.abs(got - c.want) < 1e-4,
     `  lim ${c.f} as x→${c.at} = ${c.want}`, `got ${r.value} (${got}) — ${c.note}`);
  ok(r.steps.length >= 2 && r.steps.every((s) => s.rule && s.text && s.latex),
     `  emits a derivation for lim ${c.f} as x→${c.at}`, `${r.steps.length} steps`);
}

/* ---- Limits that do NOT exist -------------------------------------------------------
   nerdamer's own limit() answers Infinity for 1/x at 0, which is wrong — the two sides run
   to opposite infinities. These cases are the reason the engine probes both sides itself
   instead of trusting the CAS. */
{
  const r = CalculusSymbolic.limit("1/x", "x", 0);
  ok(r.ok && r.kind === "dne", "lim 1/x as x→0 is reported as DNE, not Infinity",
     r.kind === "dne" ? `left ${r.sides.left}, right ${r.sides.right}` : `got kind=${r.kind}, value=${r.value}`);
}
{
  // Also the hang case: nerdamer's limit() never returns on this input. Reaching this
  // assertion at all proves the engine never called it.
  const r = CalculusSymbolic.limit("abs(x)/x", "x", 0);
  ok(r.ok && r.kind === "dne", "lim abs(x)/x as x→0 is DNE — and does not hang",
     r.kind === "dne" ? `left ${r.sides.left}, right ${r.sides.right}` : `got kind=${r.kind}`);
}
{
  const r = CalculusSymbolic.limit("1/x^2", "x", 0);
  ok(r.ok && r.kind === "infinite" && valueOf(r) === Infinity,
     "lim 1/x² as x→0 diverges to +∞ (both sides agree, unlike 1/x)", String(r.value));
}
{
  let threw = false;
  try { CalculusSymbolic.limit("x", "x", "banana"); } catch (e) { threw = true; }
  ok(threw, "throws a clear error on a non-numeric limit point");
}

/* ---- kind is classified from the answer, not the probe ----
   lim(log(x)/x) as x→∞ is 0: a finite limit, even though the probe values are still
   shrinking at the last sample. Pages branch on `kind` to decide whether to draw an
   asymptote, so a mislabel here is silently visible on screen. */
{
  const r = CalculusSymbolic.limit("log(x)/x", "x", "Infinity");
  ok(r.ok && r.kind === "finite", "a finite limit at infinity is labelled finite, not infinite", `kind=${r.kind}, value=${r.value}`);
}
{
  const r = CalculusSymbolic.limit("1/x^2", "x", 0);
  ok(r.ok && r.kind === "infinite", "a genuine divergence is still labelled infinite", `kind=${r.kind}`);
}

/* ---- the approach table (roadmap §2A.1) ---- */
{
  const r = CalculusSymbolic.limit("sin(x)/x", "x", 0);
  ok(r.table.length >= 3, "returns an approach table", `${r.table.length} rows`);
  const closest = r.table[r.table.length - 1];
  ok(Math.abs(closest.fLeft - 1) < 1e-6 && Math.abs(closest.fRight - 1) < 1e-6,
     "both columns of the table close in on the limit", `left ${closest.fLeft}, right ${closest.fRight}`);
  ok(Math.abs(closest.xLeft) < Math.abs(r.table[0].xLeft),
     "rows get closer to the point as they go down");
}
{
  // The table must be present on every outcome, including the ones that are not a number.
  const dne = CalculusSymbolic.limit("1/x", "x", 0);
  ok(dne.table.length >= 3, "a DNE result still carries its evidence table", `${dne.table.length} rows`);
  ok(dne.table[dne.table.length - 1].fLeft < 0 && dne.table[dne.table.length - 1].fRight > 0,
     "the DNE table visibly shows the two sides going opposite ways");
}
{
  const inf = CalculusSymbolic.limit("(x^2+1)/(2*x^2-3)", "x", "Infinity");
  ok(inf.table.length >= 3 && inf.table[0].xLeft === null,
     "an at-infinity table is one-sided", `${inf.table.length} rows`);
  ok(Math.abs(inf.table[inf.table.length - 1].fRight - 0.5) < 1e-4,
     "the at-infinity table approaches the limit", String(inf.table[inf.table.length - 1].fRight));
}

/* ---- Taylor series --------------------------------------------------------------------
   Asserted against known Maclaurin/Taylor expansions. Coefficients compared numerically
   (same reasoning as everywhere else: exact strings vary, values don't). */
{
  const r = CalculusSymbolic.taylorSeries("e^x", "x", 0, 4);
  ok(r.ok, "Taylor series of e^x around 0, degree 4", r.ok ? r.result : r.reason);
  if (r.ok) {
    const want = [1, 1, 1 / 2, 1 / 6, 1 / 24];
    ok(want.every((w, k) => Math.abs(r.coeffs[k] - w) < 1e-9),
       "  e^x Maclaurin coefficients are 1, 1, 1/2, 1/6, 1/24", r.coeffs.join(", "));
  }
}
{
  const r = CalculusSymbolic.taylorSeries("sin(x)", "x", 0, 5);
  ok(r.ok, "Taylor series of sin(x) around 0, degree 5", r.ok ? r.result : r.reason);
  if (r.ok) {
    const want = [0, 1, 0, -1 / 6, 0, 1 / 120];
    ok(want.every((w, k) => Math.abs(r.coeffs[k] - w) < 1e-9),
       "  sin(x) Maclaurin coefficients are 0, 1, 0, -1/6, 0, 1/120", r.coeffs.join(", "));
  }
}
{
  const r = CalculusSymbolic.taylorSeries("log(x)", "x", 1, 3);
  ok(r.ok, "Taylor series of ln(x) around a=1, degree 3", r.ok ? r.result : r.reason);
  if (r.ok) {
    const want = [0, 1, -1 / 2, 1 / 3];
    ok(want.every((w, k) => Math.abs(r.coeffs[k] - w) < 1e-9),
       "  ln(x) Taylor coefficients around 1 are 0, 1, -1/2, 1/3", r.coeffs.join(", "));
  }
}
{
  // Degree 0 is just f(a) — a boundary the code must not choke on.
  const r = CalculusSymbolic.taylorSeries("cos(x)", "x", 0, 0);
  ok(r.ok && Math.abs(r.coeffs[0] - 1) < 1e-9, "Taylor series degree 0 is just f(a)", r.ok ? r.coeffs.join(",") : r.reason);
}
{
  const r = CalculusSymbolic.taylorSeries("x^2+3*x-1", "x", 2, 6);
  // A polynomial's Taylor series about any point IS itself (truncation is moot past its
  // own degree) — the strongest possible sanity check on the machinery.
  ok(r.ok, "Taylor series of a polynomial reproduces itself", r.ok ? r.result : r.reason);
  if (r.ok) {
    for (const x of [-3, 0, 1.5, 5, 12]) {
      const got = r.coeffs.reduce((s, c, k) => s + c * Math.pow(x - 2, k), 0);
      const want = x * x + 3 * x - 1;
      ok(Math.abs(got - want) < 1e-6, `  matches x^2+3x-1 at x=${x}`, `${got} vs ${want}`);
    }
  }
}
{
  let threw = false;
  try { CalculusSymbolic.taylorSeries("sin(x)", "x", 0, -1); } catch (e) { threw = true; }
  ok(threw, "throws a clear error on a negative degree");
}
{
  let threw = false;
  try { CalculusSymbolic.taylorSeries("sin(x)", "x", NaN, 3); } catch (e) { threw = true; }
  ok(threw, "throws a clear error on a non-finite center");
}
{
  const r = CalculusSymbolic.taylorSeries("e^x", "x", 0, 3);
  ok(r.ok && r.steps.length >= 3 && r.steps.every((s) => s.rule && s.text && s.latex),
     "emits a derivation for the Taylor series", r.ok ? `${r.steps.length} steps` : r.reason);
}

/* ---- L'Hopital's Rule ------------------------------------------------------------------
   Same textbook cases as limit()'s own indeterminate-form path, but through the standalone
   entry point — and, crucially, cases that must be REFUSED because they are not
   indeterminate forms at all, which is the entire reason this gets its own page. */
const lhopitalCases = [
  { f: "sin(x)/x",            at: 0,          want: 1,       note: "0/0, one pass" },
  { f: "(1-cos(x))/x^2",      at: 0,          want: 0.5,     note: "0/0, two passes" },
  { f: "(e^x-1)/x",           at: 0,          want: 1,       note: "0/0" },
  { f: "(x^2+1)/(2*x^2-3)",   at: "Infinity", want: 0.5,     note: "∞/∞ at infinity" },
  { f: "log(x)/x",            at: "Infinity", want: 0,       note: "∞/∞, log grows slower" }
];
for (const c of lhopitalCases) {
  const r = CalculusSymbolic.lhopital(c.f, "x", c.at);
  if (!ok(r.ok, `L'Hopital on ${c.f} as x→${c.at} resolves`, r.ok ? String(r.value) : r.reason)) continue;
  const got = valueOf(r);
  ok(Number.isFinite(got) && Math.abs(got - c.want) < 1e-4,
     `  L'Hopital on ${c.f} as x→${c.at} = ${c.want}`, `got ${r.value} (${got}) — ${c.note}`);
  ok(r.steps.some((s) => /indeterminate/i.test(s.rule)),
     `  shows the indeterminate form being detected for ${c.f}`);
}
{
  // The whole point: a continuous function is refused, not silently evaluated, even though
  // limit() itself would happily answer this by direct substitution.
  const r = CalculusSymbolic.lhopital("x^2+3*x", "x", 2);
  ok(!r.ok, "refuses x^2+3*x at x=2 (continuous — not an indeterminate form)",
     r.ok ? `wrongly applied L'Hopital, got ${r.value}` : r.reason);
}
{
  // Same point, but this time it IS a quotient — just not an indeterminate one (1/2, not
  // 0/0) — so the refusal must come from the form check, not the "not a quotient" gate.
  const r = CalculusSymbolic.lhopital("x/(x+1)", "x", 1);
  ok(!r.ok && /not an indeterminate/i.test(r.reason), "refuses x/(x+1) at x=1 (a quotient, but 1/2 — not indeterminate)",
     r.ok ? `wrongly applied L'Hopital, got ${r.value}` : r.reason);
}
{
  // (x^2-1)/(x-1) at x=1 IS 0/0, so this one must succeed.
  const r = CalculusSymbolic.lhopital("(x^2-1)/(x-1)", "x", 1);
  ok(r.ok && Math.abs(valueOf(r) - 2) < 1e-6, "L'Hopital solves (x^2-1)/(x-1) at x=1 (0/0)", r.ok ? r.value : r.reason);
}
{
  // Not a quotient at all.
  const r = CalculusSymbolic.lhopital("x^2+3*x", "x", "Infinity");
  ok(!r.ok, "refuses a non-quotient expression", r.ok ? "wrongly accepted" : r.reason);
}
{
  const r = CalculusSymbolic.lhopital("1/x", "x", 0);
  ok(!r.ok, "refuses 1/x at x=0 (the limit does not exist — nothing to resolve)", r.ok ? "wrongly resolved" : r.reason);
}

/* ---- Curve Sketching -------------------------------------------------------------------
   Textbook examples where the exact critical/inflection points are known, so coefficients
   and classifications can be checked precisely — and the trig case that exists specifically
   because nerdamer's solve() cannot be trusted on it (see the comment above findRoots). */
{
  // f = x^3 - 3x: f' = 3x^2-3 -> critical points at x=-1 (max) and x=1 (min).
  // f'' = 6x -> inflection at x=0.
  const r = CalculusSymbolic.curveAnalysis("x^3-3*x", "x", -3, 3);
  ok(r.ok, "curve analysis of x^3-3x", r.ok ? "ok" : r.reason);
  if (r.ok) {
    ok(r.criticalPoints.length === 2, "  x^3-3x has 2 critical points", r.criticalPoints.length);
    const max = r.criticalPoints.find((c) => Math.abs(c.x - (-1)) < 1e-6);
    const min = r.criticalPoints.find((c) => Math.abs(c.x - 1) < 1e-6);
    ok(!!max && max.kind === "max", "  x=-1 classified as a local max", max && max.kind);
    ok(!!min && min.kind === "min", "  x=1 classified as a local min", min && min.kind);
    ok(max && max.exact === "-1" && min && min.exact === "1", "  critical points are exact, not approximated", `${max && max.exact}, ${min && min.exact}`);
    ok(r.inflectionPoints.length === 1 && Math.abs(r.inflectionPoints[0].x) < 1e-6,
       "  inflection point at x=0", r.inflectionPoints.map((p) => p.x));
  }
}
{
  // f = x^4 - 4x^2: f' = 4x^3-8x -> critical points at x=0 (max), x=±sqrt(2) (min).
  const r = CalculusSymbolic.curveAnalysis("x^4-4*x^2", "x", -3, 3);
  ok(r.ok, "curve analysis of x^4-4x^2", r.ok ? "ok" : r.reason);
  if (r.ok) {
    ok(r.criticalPoints.length === 3, "  x^4-4x^2 has 3 critical points", r.criticalPoints.length);
    const zero = r.criticalPoints.find((c) => Math.abs(c.x) < 1e-6);
    ok(!!zero && zero.kind === "max", "  x=0 classified as a local max", zero && zero.kind);
    const mins = r.criticalPoints.filter((c) => c.kind === "min");
    ok(mins.length === 2 && mins.every((c) => Math.abs(Math.abs(c.x) - Math.SQRT2) < 1e-6),
       "  x=±sqrt(2) classified as local minima", mins.map((c) => c.x));
    ok(mins.every((c) => c.exact && /sqrt/.test(c.exact)), "  minima reported with an exact sqrt(2) form, not decimals", mins.map((c) => c.exact));
  }
}
{
  // f = x^4 has a min at x=0 where f''(0)=0 too — the classic case the second-derivative
  // test alone cannot resolve, which is exactly why classification here uses the SIGN
  // CHANGE of f' rather than the sign of f'' at the point.
  const r = CalculusSymbolic.curveAnalysis("x^4", "x", -2, 2);
  ok(r.ok, "curve analysis of x^4", r.ok ? "ok" : r.reason);
  if (r.ok) {
    ok(r.criticalPoints.length === 1 && r.criticalPoints[0].kind === "min",
       "  x^4 has one critical point, classified as a min despite f''=0 there", r.criticalPoints);
  }
}
{
  // The trig case: cos(x)'s roots are NOT reliable via nerdamer's solve() (confirmed by
  // direct experiment — it returns ~38 rational-approximation "roots" instead of pi/2+k*pi).
  // sin(x) on [-2pi, 2pi] must still come out with the textbook critical points, via the
  // numeric bisection fallback, each marked inexact.
  const r = CalculusSymbolic.curveAnalysis("sin(x)", "x", -2 * Math.PI, 2 * Math.PI);
  ok(r.ok, "curve analysis of sin(x) on [-2pi, 2pi]", r.ok ? "ok" : r.reason);
  if (r.ok) {
    ok(r.criticalPoints.length === 4, "  sin(x) on [-2pi,2pi] has 4 critical points", r.criticalPoints.length);
    ok(r.criticalPoints.every((c) => c.exact === null), "  sin(x)'s critical points are marked inexact (solve() is untrustworthy here)");
    const near = (x, target) => Math.abs(x - target) < 1e-3;
    ok(r.criticalPoints.some((c) => near(c.x, Math.PI / 2) && c.kind === "max"), "  pi/2 found and classified as a max", r.criticalPoints.map((c) => c.x));
    ok(r.criticalPoints.some((c) => near(c.x, -Math.PI / 2) && c.kind === "min"), "  -pi/2 found and classified as a min", r.criticalPoints.map((c) => c.x));
  }
}
{
  // A monotonic function on the window has no critical points at all — a legitimate result,
  // not a refusal, same idiom as everywhere else in this file.
  const r = CalculusSymbolic.curveAnalysis("e^x", "x", -2, 2);
  ok(r.ok && r.criticalPoints.length === 0 && r.monotonic.length === 1 && r.monotonic[0].sign === "+",
     "e^x on [-2,2] is monotonic increasing with no critical points", r.ok ? JSON.stringify(r.monotonic) : r.reason);
}
{
  let threw = false;
  try { CalculusSymbolic.curveAnalysis("x^2", "x", 2, -2); } catch (e) { threw = true; }
  ok(threw, "throws a clear error when b <= a");
}
{
  const r = CalculusSymbolic.curveAnalysis("x^3-3*x", "x", -3, 3);
  ok(r.ok && r.steps.length >= 5 && r.steps.every((s) => s.rule && s.text && s.latex),
     "emits a derivation for curve sketching", r.ok ? `${r.steps.length} steps` : r.reason);
}

/* ---- Applied Optimization ---------------------------------------------------------------
   Classic word-problem numbers: box-from-a-flat-sheet and fence-along-a-river, each with a
   hand-computable optimum, plus the boundary case where the true optimum sits at an endpoint
   rather than a critical point (the reason endpoints must always be candidates too). */
{
  // Box from a 20x20 sheet, squares of side x cut from the corners: V(x) = x*(20-2*x)^2.
  // V'(x) = 12x^2 - 160x + 400, and the textbook answer is x = 10/3,
  // V = (10/3)*(40/3)^2 = 16000/27 ≈ 592.59.
  const r = CalculusSymbolic.appliedOptimization("x*(20-2*x)^2", "x", 0, 10, "max");
  ok(r.ok, "box-from-a-sheet optimization resolves", r.ok ? "ok" : r.reason);
  if (r.ok) {
    ok(Math.abs(r.x - 10 / 3) < 1e-4, "  optimal x = 10/3", r.x);
    ok(Math.abs(r.value - 16000 / 27) < 1e-2, "  optimal volume = 16000/27 ≈ 592.59", r.value);
    ok(!r.atEndpoint, "  the optimum is an interior critical point, not an endpoint");
  }
}
{
  // Fence along a river, total fencing P=200 split as two sides of length x plus one side
  // of length (200-2x) parallel to the river: A(x) = x*(200-2x). Maximized at x=50, A=5000.
  const r = CalculusSymbolic.appliedOptimization("x*(200-2*x)", "x", 0, 100, "max");
  ok(r.ok, "fence-along-a-river optimization resolves", r.ok ? "ok" : r.reason);
  if (r.ok) {
    ok(Math.abs(r.x - 50) < 1e-4, "  optimal x = 50", r.x);
    ok(Math.abs(r.value - 5000) < 1e-2, "  optimal area = 5000", r.value);
  }
}
{
  // A strictly increasing function on [0,5]: the max is at the right endpoint, not a
  // critical point — the case that justifies always checking endpoints too.
  const r = CalculusSymbolic.appliedOptimization("x^2", "x", 0, 5, "max");
  ok(r.ok && r.atEndpoint && Math.abs(r.x - 5) < 1e-9 && Math.abs(r.value - 25) < 1e-9,
     "x^2 on [0,5] is maximized at the right endpoint", r.ok ? `x=${r.x}, atEndpoint=${r.atEndpoint}` : r.reason);
}
{
  // Same function, minimized: the answer flips to the left endpoint.
  const r = CalculusSymbolic.appliedOptimization("x^2", "x", 0, 5, "min");
  ok(r.ok && r.atEndpoint && Math.abs(r.x - 0) < 1e-9, "x^2 on [0,5] is minimized at the left endpoint", r.ok ? r.x : r.reason);
}
{
  let threw = false;
  try { CalculusSymbolic.appliedOptimization("x^2", "x", 0, 5, "sideways"); } catch (e) { threw = true; }
  ok(threw, "throws a clear error on an invalid goal");
}
{
  const r = CalculusSymbolic.appliedOptimization("x*(20-2*x)^2", "x", 0, 10, "max");
  ok(r.ok && r.steps.length >= 4 && r.steps.every((s) => s.rule && s.text && s.latex),
     "emits a derivation for applied optimization", r.ok ? `${r.steps.length} steps` : r.reason);
}

/* ---- Convergence Tests ----------------------------------------------------------------
   The full decision tree (Stewart §11.3–11.6): each standard series is classified by the
   test a course would reach for it, and every verdict is verified by the partial-sum gate
   (verified:true). Refusals are first-class results: a term with a free variable x is the
   Power Series method's turf; an unparsable term is refused. */
const convCases = [
  { term: "1/n^2",     want: "converges", test: "p-series",           note: "p=2>1" },
  { term: "1/n",       want: "diverges",  test: "p-series",           note: "p=1" },
  { term: "1/sqrt(n)", want: "diverges",  test: "p-series",           note: "p=1/2" },
  { term: "1/(n^2+1)", want: "converges", test: "integral",           note: "atan -> pi/2" },
  { term: "n/(n^2+1)", want: "diverges",  test: "limit-comparison",   note: "~1/n, p=1" },
  { term: "n^2/2^n",   want: "converges", test: "ratio",              note: "L=1/2" },
  { term: "2^n/n!",    want: "converges", test: "ratio",              note: "L=0" },
  { term: "n!/n^n",    want: "converges", test: "ratio",              note: "L=1/e" },
  { term: "(-1)^n/n",  want: "converges", test: "alternating",        note: "Leibniz" },
  { term: "(-1)^n*n",  want: "diverges",  test: "nth-term",           note: "terms grow" },
  { term: "1/2^n",     want: "converges", test: "geometric",          note: "r=1/2, sum=1", sum: 1 },
  { term: "2^n",       want: "diverges",  test: "nth-term",           note: "terms -> inf" },
  { term: "n/(n+1)",   want: "diverges",  test: "nth-term",           note: "terms -> 1" }
];
for (const c of convCases) {
  const r = CalculusSymbolic.convergenceTests(c.term, "n");
  if (!ok(r.ok, `convergence of ${c.term} resolves`, r.ok ? r.verdict : r.reason)) continue;
  ok(r.verdict === c.want, `  ${c.term} ${c.want} via ${c.test}`, `got ${r.verdict} via ${r.test} — ${c.note}`);
  ok(r.verified === true, `  ${c.term} verdict verified by the partial-sum gate`, r.verified);
  ok(r.test === c.test, `  ${c.term} attributed to the ${c.test} test`, `got ${r.test}`);
  ok(r.steps.length >= 1 && r.steps.every((s) => s.rule && s.text && typeof s.latex === "string"),
     `  ${c.term} emits a derivation`, `${r.steps.length} steps`);
  if (c.sum !== undefined)
    ok(Math.abs(r.sum - c.sum) < 1e-6, `  ${c.term} geometric sum = ${c.sum}`, r.sum);
}
{
  // Refused: a term with a free variable x is the Power Series method's turf.
  const r = CalculusSymbolic.convergenceTests("x^n/2", "n");
  ok(!r.ok && /power-series/i.test(r.reason), "refuses x^n/2 (Power Series turf)", r.ok ? "wrongly accepted" : r.reason);
}
{
  // Refused: an unparsable term.
  const r = CalculusSymbolic.convergenceTests("1/", "n");
  ok(!r.ok, "refuses an unparsable term", r.ok ? "wrongly accepted" : r.reason);
}
{
  // Refused (honest): a slow-log-divergent series no standard numeric probe can crack — the
  // engine says "no conclusive verdict" rather than guessing.
  const r = CalculusSymbolic.convergenceTests("1/(n*log(n))", "n");
  ok(!r.ok, "1/(n*log(n)) is honestly refused (no standard test gives a conclusive verdict)", r.ok ? `wrongly claimed ${r.verdict}` : "ok — refused");
}
{
  const r = CalculusSymbolic.convergenceTests("1/n^2", "n");
  ok(r.ok && r.steps.some((s) => /nth-term/i.test(s.rule)) && r.steps.some((s) => /p-series/i.test(s.rule)),
     "the decision tree records the inconclusive nth-term step before the conclusive p-series step",
     r.steps.map((s) => s.rule).join(" -> "));
}

/* ---- Power Series & Radius of Convergence ------------------------------------------
   ∑ cₙ(x−a)ⁿ: the radius R comes from the coefficients (ratio test, root fallback), the two
   endpoints x = a ± R are classified by reusing the convergence decision tree (constant
   endpoint terms like cₙ=1, R=1 → term = 1 are handled directly), and the interval is
   assembled from R and the endpoint verdicts. Every case is verified:true (the partial-sum
   gate confirms convergence inside the radius and divergence outside). */
const psCases = [
  { coeffs: "1",        v: "x", a: 0, R: 1,         interval: "(-1, 1)",   note: "geometric ∑xⁿ, both endpoints diverge" },
  { coeffs: "1/n",      v: "x", a: 0, R: 1,         interval: "[-1, 1)",   note: "left endpoint alternating-converges" },
  { coeffs: "1/n^2",    v: "x", a: 0, R: 1,         interval: "[-1, 1]",   note: "both endpoints p-series converge" },
  { coeffs: "n",        v: "x", a: 0, R: 1,         interval: "(-1, 1)",   note: "coefficients grow linearly, endpoints diverge" },
  { coeffs: "n!",       v: "x", a: 0, R: 0,         interval: "{0}",       note: "ratio → ∞, converges only at the centre" },
  { coeffs: "1/n!",     v: "x", a: 0, R: Infinity,  interval: "(-∞, ∞)",  note: "ratio → 0, converges everywhere" },
  { coeffs: "1",        v: "x", a: 2, R: 1,         interval: "(1, 3)",    note: "centre a=2, both endpoints diverge" },
  { coeffs: "n/2^n",    v: "x", a: 0, R: 2,         interval: "(-2, 2)",   note: "ratio = 1/2, R = 2, endpoints diverge" },
  { coeffs: "1/sqrt(n)",v: "x", a: 0, R: 1,         interval: "[-1, 1)",   note: "left endpoint alternating-converges (bₙ→0)" }
];
for (const c of psCases) {
  const r = CalculusSymbolic.powerSeries(c.coeffs, c.v, c.a);
  if (!ok(r.ok, `power series of ${c.coeffs} (a=${c.a}) resolves`, r.ok ? `R=${r.radiusText}` : r.reason)) continue;
  ok(r.verified === true, `  ${c.coeffs} radius verified by the partial-sum gate`, r.verified);
  ok(r.radius === c.R, `  ${c.coeffs} radius = ${c.R}`, `got ${r.radius} (${r.radiusText}) — ${c.note}`);
  ok(r.interval === c.interval, `  ${c.coeffs} interval = ${c.interval}`, `got ${r.interval}`);
  ok(r.steps.length >= 1 && r.steps.every((s) => s.rule && s.text && typeof s.latex === "string"),
     `  ${c.coeffs} emits a derivation`, `${r.steps.length} steps`);
}
{
  // Refused: coefficients depending on the series variable x (not the index n).
  const r = CalculusSymbolic.powerSeries("x*n", "x", 0);
  ok(!r.ok && /depend on.*x|must depend on n/i.test(r.reason), "refuses x*n (coefficients depend on x, not n)", r.ok ? "wrongly accepted" : r.reason);
}
{
  // Refused: unparsable coefficients.
  const r = CalculusSymbolic.powerSeries("1/", "x", 0);
  ok(!r.ok, "refuses unparsable coefficients", r.ok ? "wrongly accepted" : r.reason);
}
{
  // Constant coefficients are legitimate (cₙ = 1 is the geometric series ∑xⁿ), not refused.
  const r = CalculusSymbolic.powerSeries("1", "x", 0);
  ok(r.ok && r.radius === 1, "constant coefficients (cₙ = 1) are accepted as the geometric series", r.ok ? `R=${r.radiusText}` : r.reason);
}

/* ---- Vectors in Space -------------------------------------------------------------
   Exact vector algebra with a numeric verification gate. Cases assert on the numeric
   value of the result (nerdamer's exact form varies — sqrt(14) vs. 14^1/2 — but the value
   is invariant) and on the gate: every successful result carries verified:true, and the
   geometric identities a result must satisfy (perpendicularity of a cross product, unit
   norm of a unit vector, coplanarity ⇒ zero triple product) are checked here too. */
function approxEq(a, b, tol) {
  return Math.abs(a - b) <= (tol || 1e-7) * Math.max(1, Math.abs(a), Math.abs(b));
}
function vecApprox(nums, expect, tol) {
  return nums.length === 3 && nums.every((n, i) => approxEq(n, expect[i], tol));
}
const vecCases = [
  { op: "add",            args: [["1","2","3"],["4","-5","6"]],   kind: "vector", expect: [5,-3,9],        note: "componentwise add" },
  { op: "subtract",      args: [["1","2","3"],["4","-5","6"]],   kind: "vector", expect: [-3,7,-3],       note: "componentwise subtract" },
  { op: "scalarMultiply", args: ["2",["1","2","3"]],            kind: "vector", expect: [2,4,6],          note: "scale by an integer" },
  { op: "scalarMultiply", args: ["1/2",["1","2","3"]],           kind: "vector", expect: [0.5,1,1.5],     note: "scale by an exact fraction" },
  { op: "dot",            args: [["1","2","3"],["4","-5","6"]],  kind: "scalar", expect: 12,              note: "1·4+2·(-5)+3·6 = 12" },
  { op: "cross",          args: [["1","0","0"],["0","1","0"]],    kind: "vector", expect: [0,0,1],         note: "basis vectors: i×j = k" },
  { op: "cross",          args: [["1","2","3"],["4","5","6"]],   kind: "vector", expect: [-3,6,-3],      note: "2·6-3·5, 3·4-1·6, 1·5-2·4" },
  { op: "magnitude",      args: [["1","2","3"]],                 kind: "scalar", expect: Math.sqrt(14),  note: "√(1+4+9) = √14" },
  { op: "unit",           args: [["1","2","3"]],                 kind: "vector", expect: [1/Math.sqrt(14),2/Math.sqrt(14),3/Math.sqrt(14)], note: "normalize ⟨1,2,3⟩" },
  { op: "distance",       args: [["1","2","3"],["4","-5","6"]],  kind: "scalar", expect: Math.sqrt(67),   note: "‖u−v‖ = √(9+49+9)" },
  { op: "projection",     args: [["1","2","3"],["0","0","1"]],   kind: "vector", expect: [0,0,3],        note: "proj onto z-axis keeps the z component" },
  { op: "tripleProduct",  args: [["1","0","0"],["0","1","0"],["0","0","1"]], kind: "scalar", expect: 1, note: "unit parallelepiped volume" }
];
for (const c of vecCases) {
  const r = CalculusSymbolic.vectorOps(c.op, c.args);
  if (!ok(r.ok, `${c.op} resolves (${c.note})`, r.ok ? "" : r.reason)) continue;
  ok(r.kind === c.kind, `  ${c.op} reports kind ${c.kind}`, `got ${r.kind}`);
  ok(r.verified === true, `  ${c.op} passes the verification gate`, r.verified ? "verified" : "NOT verified");
  ok(r.steps.length >= 1 && r.steps.every((s) => s.rule && s.text && typeof s.latex === "string"),
     `  ${c.op} emits a derivation`, `${r.steps.length} steps`);
  if (c.kind === "vector") {
    ok(vecApprox(r.numeric, c.expect, 1e-7), `  ${c.op} numeric result = ⟨${c.expect.join(",")}⟩`, `got ⟨${r.numeric.map((n) => +n.toFixed(6)).join(",")}⟩`);
  } else {
    ok(approxEq(r.numeric, c.expect, 1e-7), `  ${c.op} numeric result = ${c.expect}`, `got ${r.numeric}`);
  }
}
{
  // Cross product perpendicularity, checked independently of the module's own gate.
  const r = CalculusSymbolic.vectorOps("cross", [["1","2","3"],["4","5","6"]]);
  ok(r.ok && Math.abs(r.numeric[0]*1 + r.numeric[1]*2 + r.numeric[2]*3) < 1e-7 &&
     Math.abs(r.numeric[0]*4 + r.numeric[1]*5 + r.numeric[2]*6) < 1e-7,
     "cross product is perpendicular to both inputs (u·(u×v)=v·(u×v)=0)",
     r.ok ? "ok" : r.reason);
}
{
  // Unit vector norm is 1.
  const r = CalculusSymbolic.vectorOps("unit", [["1","2","3"]]);
  const n = Math.hypot(r.numeric[0], r.numeric[1], r.numeric[2]);
  ok(r.ok && Math.abs(n - 1) < 1e-7, "a unit vector has norm 1", `‖û‖ = ${n}`);
}
{
  // Angle: orthogonal vectors give 90°, parallel vectors give 0°.
  const orth = CalculusSymbolic.vectorOps("angle", [["1","0","0"],["0","1","0"]]);
  ok(orth.ok && approxEq(orth.angleDegrees, 90, 1e-6), "angle between i and j is 90°", `${orth.angleDegrees}°`);
  const par = CalculusSymbolic.vectorOps("angle", [["1","2","3"],["2","4","6"]]);
  ok(par.ok && approxEq(par.angleDegrees, 0, 1e-6), "angle between parallel vectors is 0°", `${par.angleDegrees}°`);
  ok(par.ok && approxEq(par.numeric, 1, 1e-7), "cos of the angle between parallel vectors is 1", `${par.numeric}`);
}
{
  // Coplanar vectors have a zero scalar triple product.
  const r = CalculusSymbolic.vectorOps("tripleProduct", [["1","0","0"],["0","1","0"],["1","1","0"]]);
  ok(r.ok && Math.abs(r.numeric) < 1e-7, "coplanar vectors ⇒ scalar triple product = 0", `${r.numeric}`);
}
{
  // Refusals — these are first-class answers, not errors.
  ok(!CalculusSymbolic.vectorOps("unit", [["0","0","0"]]).ok, "refuses to normalize the zero vector");
  ok(!CalculusSymbolic.vectorOps("projection", [["1","2","3"],["0","0","0"]]).ok, "refuses projection onto the zero vector");
  ok(!CalculusSymbolic.vectorOps("angle", [["0","0","0"],["1","0","0"]]).ok, "refuses the angle with a zero vector");
  ok(!CalculusSymbolic.vectorOps("cross", ["not enough"]).ok, "refuses a cross with the wrong operand count");
  ok(!CalculusSymbolic.vectorOps("frobnicate", [["1","0","0"],["0","1","0"]]).ok, "refuses an unknown operation");
  ok(!CalculusSymbolic.vectorOps("magnitude", [["1","2","banana"]]).ok, "refuses a non-numeric component");
}

/* ---- Partial Derivatives, Gradient, Tangent Planes -------------------------------
   Each case asserts the exact partials (by numeric value, since nerdamer's form varies),
   the gradient at the point, f at the point, and that the tangent plane touches the surface
   at the point with matching slopes — checked independently here with central differences,
   not just trusted from the module's own gate. */
function evalExprAt(str, scope) {
  try { return parseFloat(nerdamer(str).evaluate(scope).text("decimals")); }
  catch (e) { return NaN; }
}
const pdCases = [
  { f: "x^2*y^3", pt: ["1","2"], fx: "2*x*y^3", fy: "3*x^2*y^2", fNum: 8,    gradNum: [16, 12], note: "polynomial" },
  { f: "sin(x)*cos(y)", pt: ["0","0"], fx: "cos(x)*cos(y)", fy: "-sin(x)*sin(y)", fNum: 0, gradNum: [1, 0], note: "transcendental — the CAS-reliability case" },
  { f: "x*y", pt: ["2","3"], fx: "y", fy: "x", fNum: 6, gradNum: [3, 2], note: "mixed term" },
  { f: "x^2+y^2", pt: ["1","1"], fx: "2*x", fy: "2*y", fNum: 2, gradNum: [2, 2], note: "paraboloid" },
  { f: "e^(x*y)", pt: ["0","0"], fx: "e^(x*y)*y", fy: "e^(x*y)*x", fNum: 1, gradNum: [0, 0], note: "exponential at the saddle" },
  { f: "x^2-y^2", pt: ["1","1"], fx: "2*x", fy: "-2*y", fNum: 0, gradNum: [2, -2], note: "saddle point — gradient nonzero, f = 0" }
];
for (const c of pdCases) {
  const r = CalculusSymbolic.partialDerivatives(c.f, ["x", "y"], c.pt);
  if (!ok(r.ok, `partials of ${c.f} at (${c.pt}) resolve (${c.note})`, r.ok ? "" : r.reason)) continue;
  ok(r.verified === true, `  ${c.f} passes the numeric verification gate`, r.verified ? "verified" : "NOT verified");
  ok(r.steps.length >= 5 && r.steps.every((s) => s.rule && s.text && typeof s.latex === "string"),
     `  ${c.f} emits a derivation`, `${r.steps.length} steps`);
  // partials agree numerically with the expected forms at a spread of points
  ok(approxEq(evalExprAt(r.fx, { x: 1.3, y: 0.7 }), evalExprAt(c.fx, { x: 1.3, y: 0.7 }), 1e-7),
     `  ${c.f} ∂f/∂x matches ${c.fx}`, r.fx);
  ok(approxEq(evalExprAt(r.fy, { x: 1.3, y: 0.7 }), evalExprAt(c.fy, { x: 1.3, y: 0.7 }), 1e-7),
     `  ${c.f} ∂f/∂y matches ${c.fy}`, r.fy);
  ok(approxEq(r.fAtPointNum, c.fNum, 1e-7), `  ${c.f} f(${c.pt}) = ${c.fNum}`, `got ${r.fAtPointNum}`);
  ok(r.gradAtPointNum.every((n, i) => approxEq(n, c.gradNum[i], 1e-6)),
     `  ${c.f} ∇f at the point = ⟨${c.gradNum}⟩`, `got ⟨${r.gradAtPointNum}⟩`);
  // Independent check: the tangent plane touches the surface at the point and shares its slopes.
  const [a, b] = c.pt.map(Number);
  const planeAt = evalExprAt(r.tangentPlane, { x: a, y: b });
  ok(approxEq(planeAt, c.fNum, 1e-7), `  ${c.f} tangent plane touches the surface at the point`, `plane=${planeAt}, f=${c.fNum}`);
  const eps = 1e-4;
  const planeSlopeX = (evalExprAt(r.tangentPlane, { x: a + eps, y: b }) - evalExprAt(r.tangentPlane, { x: a - eps, y: b })) / (2 * eps);
  const fSlopeX = (evalExprAt(c.f, { x: a + eps, y: b }) - evalExprAt(c.f, { x: a - eps, y: b })) / (2 * eps);
  ok(approxEq(planeSlopeX, fSlopeX, 1e-3), `  ${c.f} tangent plane's x-slope matches the surface's`, `plane ${planeSlopeX} vs f ${fSlopeX}`);
}
{
  // Refusals.
  ok(!CalculusSymbolic.partialDerivatives("1/x", ["x", "y"], ["0", "0"]).ok, "refuses a point where f is undefined");
  ok(!CalculusSymbolic.partialDerivatives("x*y", ["x", "y"], ["a", "b"]).ok, "refuses a non-numeric point");
  ok(!CalculusSymbolic.partialDerivatives("x*y", ["x", "y"], ["1"]).ok, "refuses a point with the wrong arity");
}

/* ---- Volumes of Revolution -------------------------------------------------------
   Each case asserts the numeric volume (the exact form varies — 8*pi/3 vs. (8/3)*pi — but the
   value is invariant), the verification gate, that a π-bounded result keeps π symbolic (a
   rational approximation of π would be the wrong kind of answer), and the refusals. */
const volCases = [
  { f: "x^2",       a: "0", b: "2",  opts: { method: "disk" },                        expect: 32 * Math.PI / 5,       hasPi: true,  note: "disk: π∫x⁴ = 32π/5" },
  { f: "sin(x)",    a: "0", b: "pi", opts: { method: "disk" },                        expect: Math.PI * Math.PI / 2, hasPi: true,  note: "disk: π∫sin² = π²/2 (π kept symbolic)" },
  { f: "x",         a: "0", b: "1",  opts: { method: "shell" },                       expect: 2 * Math.PI / 3,       hasPi: true,  note: "shell about y-axis: 2π∫x² = 2π/3" },
  { f: "x*sin(x)",  a: "0", b: "pi", opts: { method: "shell" },                      expect: 2 * Math.PI * (Math.PI * Math.PI - 4), hasPi: true, note: "shell: 2π∫x²sinx = 2π(π²−4)" },
  { f: "x",         a: "0", b: "2",  opts: { method: "washer", inner: "x/2" },        expect: 2 * Math.PI,           hasPi: true,  note: "washer: π∫(x²−(x/2)²) = 2π" },
  { f: "e^(2*x)",   a: "0", b: "1",  opts: { method: "disk" },                        expect: Math.PI * (Math.exp(4) - 1) / 4, hasPi: true, note: "disk: π∫e^(4x) = π(e⁴−1)/4" },
  { f: "1/(x+1)",   a: "0", b: "1",  opts: { method: "disk" },                        expect: Math.PI / 2,           hasPi: true,  note: "disk: π∫1/(x+1)² = π/2" }
];
for (const c of volCases) {
  const r = CalculusSymbolic.volumeOfRevolution(c.f, "x", c.a, c.b, c.opts);
  if (!ok(r.ok, `${c.opts.method} of ${c.f} on [${c.a},${c.b}] resolves (${c.note})`, r.ok ? "" : r.reason)) continue;
  ok(r.verified === true, `  ${c.f} ${c.opts.method} passes the Simpson verification gate`, r.verified ? "verified" : "NOT verified");
  ok(r.steps.length >= 6 && r.steps.every((s) => s.rule && s.text && typeof s.latex === "string"),
     `  ${c.f} ${c.opts.method} emits a derivation`, `${r.steps.length} steps`);
  ok(approxEq(r.numeric, c.expect, 1e-3), `  ${c.f} ${c.opts.method} volume = ${c.expect.toExponential(4)}`, `got ${r.numeric}`);
  if (c.hasPi) {
    ok(/pi/.test(r.volume), `  ${c.f} ${c.opts.method} keeps π symbolic in the exact form`, `got ${r.volume}`);
  }
}
{
  // Refusals.
  ok(!CalculusSymbolic.volumeOfRevolution("x^2", "x", "2", "0", {}).ok, "refuses a lower bound ≥ upper bound");
  ok(!CalculusSymbolic.volumeOfRevolution("x^2", "x", "0", "1", { method: "frobnicate" }).ok, "refuses an unknown method");
  ok(!CalculusSymbolic.volumeOfRevolution("x^2", "x", "0", "1", { method: "washer" }).ok, "refuses a washer with no inner curve");
  ok(!CalculusSymbolic.volumeOfRevolution("1/x", "x", "-1", "1", { method: "disk" }).ok, "refuses f undefined on the interval");
}

/* ---- Multiple Integrals -----------------------------------------------------------
   Each case asserts the numeric value (again the exact form varies, e.g. "e-2" vs. "-2+e"),
   the nested-Simpson verification gate, and that a derivation is emitted. Cartesian cases use
   Type I regions (y between two curves of x); polar cases carry the extra r Jacobian factor
   automatically. */
const multIntCases = [
  { f: "x*y", opts: { mode: "cartesian", a: "0", b: "1", lower: "0", upper: "x" }, expect: 1 / 8, note: "triangle, polynomial" },
  { f: "1",   opts: { mode: "cartesian", a: "0", b: "2", lower: "0", upper: "x" }, expect: 2, note: "area of the triangle itself" },
  { f: "e^y", opts: { mode: "cartesian", a: "0", b: "1", lower: "0", upper: "x" }, expect: Math.E - 2, note: "exponential inner integrand" },
  { f: "sin(x+y)", opts: { mode: "cartesian", a: "0", b: "pi", lower: "0", upper: "pi/2" }, expect: 2, note: "trig, constant bounds" },
  { f: "1", opts: { mode: "polar", a: "0", b: "2*pi", lower: "0", upper: "2" }, expect: 4 * Math.PI, note: "polar: area of a radius-2 disk" },
  { f: "1", opts: { mode: "polar", a: "0", b: "pi", lower: "0", upper: "1" }, expect: Math.PI / 2, note: "polar: area of a radius-1 half-disk" }
];
for (const c of multIntCases) {
  const r = CalculusSymbolic.multipleIntegral(c.f, c.opts);
  if (!ok(r.ok, `∬ ${c.f} (${c.opts.mode}) resolves (${c.note})`, r.ok ? "" : r.reason)) continue;
  ok(r.verified === true, `  ${c.f} passes the nested-Simpson verification gate`, r.verified ? "verified" : "NOT verified");
  ok(r.steps.length >= 6 && r.steps.every((s) => s.rule && s.text && typeof s.latex === "string"),
     `  ${c.f} emits a derivation`, `${r.steps.length} steps`);
  ok(approxEq(r.numeric, c.expect, 1e-3), `  ${c.f} value = ${c.expect}`, `got ${r.numeric}`);
}
{
  // Refusals.
  ok(!CalculusSymbolic.multipleIntegral("1", { mode: "spherical", a: "0", b: "1", lower: "0", upper: "1" }).ok,
     "refuses an unknown mode");
  ok(!CalculusSymbolic.multipleIntegral("1", { mode: "cartesian", a: "0", b: "1", upper: "1" }).ok,
     "refuses a missing lower bound");
  ok(!CalculusSymbolic.multipleIntegral("1", { mode: "cartesian", a: "1", b: "0", lower: "0", upper: "1" }).ok,
     "refuses an outer lower bound ≥ upper bound");
  ok(!CalculusSymbolic.multipleIntegral("1", { mode: "cartesian", a: "0", b: "1", lower: "1", upper: "0" }).ok,
     "refuses an inverted inner region");
  ok(!CalculusSymbolic.multipleIntegral("sqrt(-1-x-y)", { mode: "cartesian", a: "0", b: "1", lower: "0", upper: "1" }).ok,
     "refuses a region where the integrand is nowhere defined");
  ok(!CalculusSymbolic.multipleIntegral("e^(y^2)", { mode: "cartesian", a: "0", b: "1", lower: "0", upper: "1" }).ok,
     "refuses an inner integrand with no elementary antiderivative (e^(y²) → erf)");
  // A Type I region that legitimately pinches to zero width at an endpoint (a triangle's
  // apex) must NOT be refused as "inverted" — this is the case that caught a boundary bug.
  ok(CalculusSymbolic.multipleIntegral("x*y", { mode: "cartesian", a: "0", b: "1", lower: "0", upper: "x" }).ok,
     "does not refuse a region that pinches to zero width at an endpoint");
}

/* ---- Lagrange Multipliers ----------------------------------------------------------
   Each case is a textbook constrained-optimization problem with a known closed-form answer.
   nerdamer's own system solver was tried and rejected (see the doc comment above the
   function) — solveEquations on the circle case below returns exactly one of the four real
   solutions, and as an inexact decimal. So these assert against the textbook numbers
   directly, via the numeric multi-start search the function actually runs. */
const lagrangeCases = [
  { f: "x*y", g: "x^2+y^2", c: "1", opts: { range: 3 },
    maxVal: 0.5, minVal: -0.5, count: 4, note: "xy on the unit circle" },
  { f: "x+y", g: "x*y", c: "16", opts: { range: 6 },
    maxVal: 8, minVal: -8, count: 2, note: "x+y on xy=16 (both branches)" },
  { f: "x^2+y^2", g: "x^2/4+y^2/9", c: "1", opts: { range: 4 },
    maxVal: 9, minVal: 4, count: 4, note: "distance² on an ellipse — near/far points" }
];
for (const c of lagrangeCases) {
  const r = CalculusSymbolic.lagrangeMultipliers(c.f, c.g, c.c, ["x", "y"], c.opts);
  if (!ok(r.ok, `Lagrange: ${c.f} s.t. ${c.g}=${c.c} resolves (${c.note})`, r.ok ? "" : r.reason)) continue;
  ok(r.verified === true, `  ${c.note} passes the directional-derivative verification gate`, r.verified ? "verified" : "NOT verified");
  ok(r.steps.length >= 6 && r.steps.every((s) => s.rule && s.text && typeof s.latex === "string"),
     `  ${c.note} emits a derivation`, `${r.steps.length} steps`);
  ok(r.points.length === c.count, `  ${c.note} finds ${c.count} critical point(s)`, `got ${r.points.length}`);
  ok(r.max !== null && approxEq(r.max.value, c.maxVal, 1e-3), `  ${c.note} max f = ${c.maxVal}`, r.max ? `got ${r.max.value}` : "no max reported");
  ok(r.min !== null && approxEq(r.min.value, c.minVal, 1e-3), `  ${c.note} min f = ${c.minVal}`, r.min ? `got ${r.min.value}` : "no min reported");
  // Every reported point is an independent numeric fixed point of the Lagrange condition:
  // ∇f is parallel to ∇g there (cross-ratio check, not reusing the search's own residual).
  for (const p of r.points) {
    const fx = evalExprAt(r.grad.fx, { x: p.x, y: p.y });
    const fy = evalExprAt(r.grad.fy, { x: p.x, y: p.y });
    const gx = evalExprAt(r.grad.gx, { x: p.x, y: p.y });
    const gy = evalExprAt(r.grad.gy, { x: p.x, y: p.y });
    ok(approxEq(fx * gy - fy * gx, 0, 1e-3), `  ${c.note} ∇f ∥ ∇g at (${p.x.toFixed(3)}, ${p.y.toFixed(3)})`, `cross = ${fx * gy - fy * gx}`);
  }
}
{
  // Refusals.
  ok(!CalculusSymbolic.lagrangeMultipliers("x*y", "x^2+y^2", "abc").ok, "refuses a non-numeric constraint value");
  ok(!CalculusSymbolic.lagrangeMultipliers("x+y", "x+y", "5", ["x", "y"], { range: 4 }).ok,
     "refuses a degenerate constraint with no isolated critical point (f and g parallel everywhere)");
}

/* ---- Related Rates ------------------------------------------------------------------
   Each case is a canonical word problem: differentiate an implicit relationship w.r.t. time,
   substitute the givens, solve for the unknown rate. Every answer is checked against the
   textbook value AND the engine's own total-derivative residual gate. The exact form keeps
   π symbolic (the engine builds -B/A by hand rather than calling solve(), which numericizes
   π — see the comment in calculus-symbolic.js). */
const rrCases = [
  { eq: "x^2+y^2=25", vars: ["x","y"], values: {x:3,y:4}, rates: {x:2}, unknown: "y", expect: -1.5, note: "ladder sliding down a wall" },
  { eq: "V=(4/3)*pi*r^3", vars: ["V","r"], values: {V:4000/3*Math.PI, r:10}, rates: {V:100}, unknown: "r", expect: 100/(400*Math.PI), note: "expanding balloon — π in the answer" },
  { eq: "V=(1/3)*pi*r^2*h", vars: ["V","h"], values: {V:18*Math.PI, r:3, h:6}, rates: {V:2}, unknown: "h", expect: 2/(3*Math.PI), note: "cone filling, r held fixed (constant left out of vars)" },
  { eq: "A=4*pi*r^2", vars: ["A","r"], values: {A:36*Math.PI, r:3}, rates: {r:-1}, unknown: "A", expect: -24*Math.PI, note: "melting snowball — surface area rate" },
  { eq: "x^2+y^2=L^2", vars: ["x","y"], values: {x:0.8, y:0.6, L:1}, rates: {x:0.5}, unknown: "y", expect: -(0.8/0.6)*0.5, note: "unit rod — L a fixed constant, not a variable" },
  { eq: "y=x^3", vars: ["x","y"], values: {x:2, y:8}, rates: {x:1}, unknown: "y", expect: 12, note: "direct relationship, dy/dt = 3x²·dx/dt" }
];
for (const c of rrCases) {
  const r = CalculusSymbolic.relatedRates(c.eq, c.vars, c.values, c.rates, c.unknown);
  if (!ok(r.ok, `related rates: ${c.note}`, r.ok ? `result ${r.result}` : r.reason)) continue;
  ok(r.verified === true, `  ${c.note} passes the total-derivative residual gate`, r.verified ? "verified" : "NOT verified");
  ok(r.steps.length === 6 && r.steps.every((s) => s.rule && typeof s.text === "string" && typeof s.latex === "string"),
     `  ${c.note} emits a 6-step derivation`, `${r.steps.length} steps`);
  ok(approxEq(r.numeric, c.expect, 1e-3), `  ${c.note} value = ${c.expect}`, `got ${r.numeric}`);
  // The exact form must round-trip to the numeric value (catches a solve()-style π-numericized garbage form).
  const exactNum = parseFloat(nerdamer(r.result).evaluate().text("decimals"));
  ok(Number.isFinite(exactNum) && approxEq(exactNum, c.expect, 1e-3), `  ${c.note} exact form ${r.result} evaluates to the right number`, `got ${exactNum}`);
}
{
  // Refusals.
  ok(!CalculusSymbolic.relatedRates("x^2+y^2=25", ["x","y"], {x:3,y:5}, {x:2}, "y").ok,
     "refuses givens that don't satisfy the relationship (x=3,y=5 against x²+y²=25)");
  ok(!CalculusSymbolic.relatedRates("x^2+y^2", ["x","y"], {}, {}, "y").ok,
     "refuses a relationship with no '=' sign");
  ok(!CalculusSymbolic.relatedRates("x^2+y^2=25", ["x","y"], {x:3}, {x:2}, "y").ok,
     "refuses when a time-dependent quantity has no value");
  ok(!CalculusSymbolic.relatedRates("x^2+y^2=25", ["x","y"], {x:3,y:4}, {}, "y").ok,
     "refuses when a known rate is missing");
  ok(!CalculusSymbolic.relatedRates("x^2+y^2=25", ["x","y"], {x:3,y:4}, {x:2}, "z").ok,
     "refuses when the unknown is not one of the named variables");
  let threw = false;
  try { CalculusSymbolic.relatedRates("", ["x"], {}, {}, "x"); } catch (e) { threw = true; }
  ok(threw, "throws a clear error on an empty relationship");
}

/* ---- Arc Length & Surface Area --------------------------------------------------
   Arc length L = ∫√(1+(f')²) dx and surface area S = 2π∫f√(1+(f')²) dx. Each case asserts the
   numeric value, the Simpson verification gate, that a π-bearing answer keeps π symbolic, and
   that genuinely non-elementary cases (elliptic integrals) are REFUSED honestly rather than
   returning a wrong form. */
const arcCases = [
  { f: "x^(3/2)", a: "0", b: "4", mode: "arc-length",   expect: 9.07341528938779,           hasPi: false, note: "arc length of x^(3/2) on [0,4] = (8/27)(10^(3/2)−1)" },
  { f: "x",       a: "0", b: "1", mode: "arc-length",   expect: Math.sqrt(2),               hasPi: false, note: "arc length of a line = √2 (constant integrand)" },
  { f: "x",       a: "0", b: "1", mode: "surface-area", expect: Math.PI * Math.sqrt(2),     hasPi: true,  note: "SA of x on [0,1] = π√2" },
  { f: "x",       a: "0", b: "2", mode: "surface-area", expect: 4 * Math.PI * Math.sqrt(2), hasPi: true,  note: "SA of x on [0,2] = 4π√2" },
  { f: "2",       a: "0", b: "3", mode: "surface-area", expect: 12 * Math.PI,               hasPi: true,  note: "SA of a constant cylinder (f=2) = 12π" }
];
for (const c of arcCases) {
  const r = CalculusSymbolic.arcLengthSurfaceArea(c.f, "x", c.a, c.b, { mode: c.mode });
  if (!ok(r.ok, `${c.mode} of ${c.f} on [${c.a},${c.b}] resolves (${c.note})`, r.ok ? "" : r.reason)) continue;
  ok(r.verified === true, `  ${c.f} ${c.mode} passes the Simpson verification gate`, r.verified ? "verified" : "NOT verified");
  ok(r.steps.length >= 6 && r.steps.every((s) => s.rule && s.text && typeof s.latex === "string"),
     `  ${c.f} ${c.mode} emits a derivation`, `${r.steps.length} steps`);
  ok(approxEq(r.numeric, c.expect, 1e-3), `  ${c.f} ${c.mode} value = ${c.expect.toExponential(4)}`, `got ${r.numeric}`);
  if (c.hasPi) ok(/pi/.test(r.value), `  ${c.f} ${c.mode} keeps π symbolic in the exact form`, `got ${r.value}`);
}
{
  // Refusals: non-elementary arc lengths (elliptic integrals) and a SA whose product-of-sqrts
  // integrand nerdamer can't reduce — all must come back ok:false, never a wrong number.
  ok(!CalculusSymbolic.arcLengthSurfaceArea("x^2", "x", "0", "1", { mode: "arc-length" }).ok,
     "refuses arc length of x² (elliptic — no elementary closed form)");
  ok(!CalculusSymbolic.arcLengthSurfaceArea("sin(x)", "x", "0", "pi", { mode: "arc-length" }).ok,
     "refuses arc length of sin x (elliptic)");
  ok(!CalculusSymbolic.arcLengthSurfaceArea("sqrt(x)", "x", "0", "4", { mode: "surface-area" }).ok,
     "refuses SA of √x (integrand doesn't reduce — the gate catches it)");
  ok(!CalculusSymbolic.arcLengthSurfaceArea("x^2", "x", "0", "1", { mode: "surface-area" }).ok,
     "refuses SA of x² (no elementary closed form)");
  ok(!CalculusSymbolic.arcLengthSurfaceArea("x", "x", "1", "0", { mode: "arc-length" }).ok,
     "refuses a lower bound ≥ upper bound");
  ok(!CalculusSymbolic.arcLengthSurfaceArea("x^2", "x", "0", "1", { mode: "frobnicate" }).ok,
     "refuses an unknown mode");
  ok(!CalculusSymbolic.arcLengthSurfaceArea("-1", "x", "0", "1", { mode: "surface-area" }).ok,
     "refuses SA when f dips below the axis (needs f ≥ 0)");
  let threw = false;
  try { CalculusSymbolic.arcLengthSurfaceArea("", "x", "0", "1", { mode: "arc-length" }); } catch (e) { threw = true; }
  ok(threw, "throws a clear error on an empty curve");
}

/* ---- Parametric & Polar Coordinates ---------------------------------------------
   Parametric slope/arc-length/area and polar slope/arc-length/area. The headline cases are the
   circle and rose curves, where the integrand collapses to a constant (sin²+cos²=1) that
   nerdamer can't simplify on its own — the constant-integrand fallback rescues them with exact
   symbolic π. Slope at the midpoint is cross-checked against a central difference. */
const ppCases = [
  { mode: "parametric", spec: { x: "t", y: "t^2", a: "0", b: "1" },         slope: 1,    area: 1/3,          areaPi: false, arc: null,       arcPi: false, note: "x=t, y=t² on [0,1]" },
  { mode: "parametric", spec: { x: "t", y: "sin(t)", a: "0", b: "pi" },     slope: 0,    area: 2,            areaPi: false, arc: null,       arcPi: false, note: "x=t, y=sin t on [0,π]" },
  { mode: "parametric", spec: { x: "cos(t)", y: "sin(t)", a: "0", b: "2*pi" }, slope: null, area: -Math.PI,  areaPi: true,  arc: 2*Math.PI, arcPi: true,  note: "unit circle (parametric)" },
  { mode: "polar",      spec: { r: "1", a: "0", b: "2*pi" },                slope: null, area: Math.PI,      areaPi: true,  arc: 2*Math.PI, arcPi: true,  note: "r=1 circle (polar)" },
  { mode: "polar",      spec: { r: "2*cos(theta)", a: "0", b: "pi/2" },     slope: 0,    area: Math.PI/2,    areaPi: true,  arc: Math.PI,   arcPi: true,  note: "r=2cosθ circle" },
  { mode: "polar",      spec: { r: "sin(theta)", a: "0", b: "pi" },         slope: 0,    area: Math.PI/4,    areaPi: true,  arc: Math.PI,   arcPi: true,  note: "r=sinθ circle" },
  { mode: "polar",      spec: { r: "1+cos(theta)", a: "0", b: "2*pi" },     slope: null, area: 3*Math.PI/2,  areaPi: true,  arc: null,      arcPi: false, note: "cardioid r=1+cosθ" }
];
for (const c of ppCases) {
  const r = CalculusSymbolic.parametricAndPolar(c.mode, c.spec);
  if (!ok(r.ok, `${c.mode}: ${c.note} resolves`, r.ok ? "" : r.reason)) continue;
  const q = r.quantities;
  if (c.slope === null) {
    ok(!q.slope.ok, `  ${c.note} slope correctly refused (vertical tangent at the midpoint)`, q.slope.ok ? "should have refused" : "refused");
  } else if (q.slope.ok) {
    ok(q.slope.verified === true && approxEq(q.slope.numeric, c.slope, 1e-3),
       `  ${c.note} slope = ${c.slope}`, `got ${q.slope.numeric}`);
  }
  if (c.area === null) {
    ok(!q.area.ok, `  ${c.note} area refused`);
  } else {
    ok(q.area.ok && q.area.verified === true && approxEq(q.area.numeric, c.area, 1e-3),
       `  ${c.note} area = ${c.area}`, q.area.ok ? `got ${q.area.numeric}` : q.area.reason);
    if (q.area.ok && c.areaPi) ok(/pi/.test(q.area.value), `  ${c.note} area keeps π symbolic`, `got ${q.area.value}`);
  }
  if (c.arc === null) {
    ok(!q.arcLength.ok, `  ${c.note} arc length refused (no elementary form)`, q.arcLength.ok ? "should have refused" : "refused");
  } else {
    ok(q.arcLength.ok && q.arcLength.verified === true && approxEq(q.arcLength.numeric, c.arc, 1e-3),
       `  ${c.note} arc length = ${c.arc}`, q.arcLength.ok ? `got ${q.arcLength.numeric}` : q.arcLength.reason);
    if (q.arcLength.ok && c.arcPi) ok(/pi/.test(q.arcLength.value), `  ${c.note} arc length keeps π symbolic`, `got ${q.arcLength.value}`);
  }
}
{
  // Refusals / bad input.
  ok(!CalculusSymbolic.parametricAndPolar("sideways", { r: "1" }).ok, "refuses an unknown mode");
  ok(!CalculusSymbolic.parametricAndPolar("parametric", { x: "t" }).ok, "refuses parametric with a missing component");
  ok(!CalculusSymbolic.parametricAndPolar("polar", { r: "1", a: "0", b: "0" }).ok, "refuses polar with a ≥ b");
}

/* ---- Vector Calculus -------------------------------------------------------------
   Divergence/curl (with a conservative test and, when conservative, a potential φ), line
   integrals (work ∫F·dr and flux ∫F·n ds), and Green's theorem — the double-integral area side
   checked against the four-edge line side, which must agree. */
{
  const r = CalculusSymbolic.vectorCalculus("divergence-curl", { P: "2*x", Q: "6*y" });
  ok(r.ok, "div/curl of ⟨2x, 6y⟩ resolves", r.ok ? "" : r.reason);
  ok(r.div.verified && r.curl.verified, "  ⟨2x,6y⟩ div & curl pass the central-difference gate");
  ok(sameExpr(r.div.value, "8") && sameExpr(r.curl.value, "0"), "  ⟨2x,6y⟩ div = 8, curl = 0", `div=${r.div.value} curl=${r.curl.value}`);
  ok(r.conservative.isConservative === true, "  ⟨2x,6y⟩ is conservative (curl = 0)");
  ok(r.potential && r.potential.verified === true, "  ⟨2x,6y⟩ potential verified (∂φ/∂x=P, ∂φ/∂y=Q)");
  ok(r.potential && sameExpr(r.potential.value, "x^2+3*y^2"), "  ⟨2x,6y⟩ potential φ = x²+3y²", r.potential ? r.potential.value : "none");
}
{
  const r = CalculusSymbolic.vectorCalculus("divergence-curl", { P: "-y", Q: "x" });
  ok(r.ok && sameExpr(r.div.value, "0") && sameExpr(r.curl.value, "2"),
     "  ⟨-y, x⟩ div = 0, curl = 2 (a pure rotation field)", `div=${r.div.value} curl=${r.curl.value}`);
  ok(r.ok && r.conservative.isConservative === false, "  ⟨-y, x⟩ is NOT conservative (curl ≠ 0)");
  ok(r.ok && r.potential === null, "  ⟨-y, x⟩ reports no potential (not conservative)");
}
{
  // div/curl are functions of position here — the symbolic forms must match independent
  // derivatives, and the reported numeric values must match the field's central differences.
  const r = CalculusSymbolic.vectorCalculus("divergence-curl", { P: "x^2+y", Q: "x*y^2" });
  ok(r.ok, "div/curl of ⟨x²+y, xy²⟩ resolves", r.ok ? "" : r.reason);
  ok(r.div.verified && r.curl.verified, "  ⟨x²+y, xy²⟩ div & curl pass the gate");
  ok(sameExpr(r.div.value, "2*x+2*x*y") && sameExpr(r.curl.value, "y^2-1"),
     "  ⟨x²+y, xy²⟩ div = 2x+2xy, curl = y²−1", `div=${r.div.value} curl=${r.curl.value}`);
}
{
  const r = CalculusSymbolic.vectorCalculus("line-integral", { P: "y", Q: "x", x: "t", y: "t^2", a: "0", b: "1" });
  ok(r.ok, "line integral of ⟨y, x⟩ along (t, t²) resolves", r.ok ? "" : r.reason);
  ok(r.quantities.work.ok && r.quantities.work.verified && approxEq(r.quantities.work.numeric, 1, 1e-3),
     "  work ∫F·dr = 1", r.quantities.work.ok ? `got ${r.quantities.work.numeric}` : r.quantities.work.reason);
  ok(r.quantities.flux.ok && r.quantities.flux.verified && approxEq(r.quantities.flux.numeric, 0, 1e-3),
     "  flux ∫F·n ds = 0", r.quantities.flux.ok ? `got ${r.quantities.flux.numeric}` : r.quantities.flux.reason);
}
{
  const r = CalculusSymbolic.vectorCalculus("line-integral", { P: "2*x", Q: "6*y", x: "t", y: "t", a: "0", b: "1" });
  ok(r.ok, "line integral of ⟨2x, 6y⟩ along (t, t) resolves", r.ok ? "" : r.reason);
  ok(r.quantities.work.ok && approxEq(r.quantities.work.numeric, 4, 1e-3), "  work = 4", `got ${r.quantities.work.numeric}`);
  ok(r.quantities.flux.ok && approxEq(r.quantities.flux.numeric, -2, 1e-3), "  flux = -2", `got ${r.quantities.flux.numeric}`);
}
{
  const r = CalculusSymbolic.vectorCalculus("greens", { P: "-y", Q: "x", x0: "-1", x1: "1", y0: "-1", y1: "1" });
  ok(r.ok, "Green's theorem on ⟨-y, x⟩ over [-1,1]² resolves", r.ok ? "" : r.reason);
  ok(r.verified === true, "  Green's: the area-side and line-side agree (the gate)");
  ok(r.ok && approxEq(r.areaSide.numeric, 8, 1e-3) && approxEq(r.lineSide.numeric, 8, 1e-3),
     "  Green's: both sides = 8 (area 4 × curl 2)", `area=${r.areaSide.numeric} line=${r.lineSide.numeric}`);
}
{
  const r = CalculusSymbolic.vectorCalculus("greens", { P: "0", Q: "x", x0: "0", x1: "1", y0: "0", y1: "1" });
  ok(r.ok && r.verified === true, "Green's on ⟨0, x⟩ over [0,1]² verifies");
  ok(r.ok && approxEq(r.areaSide.numeric, 1, 1e-3) && approxEq(r.lineSide.numeric, 1, 1e-3),
     "  Green's: both sides = 1", `area=${r.areaSide.numeric} line=${r.lineSide.numeric}`);
}
{
  // Refusals / bad input.
  ok(!CalculusSymbolic.vectorCalculus("frobnicate", { P: "x", Q: "y" }).ok, "refuses an unknown vector operation");
  ok(!CalculusSymbolic.vectorCalculus("divergence-curl", { P: "x" }).ok, "refuses div/curl with a missing component");
  ok(!CalculusSymbolic.vectorCalculus("greens", { P: "-y", Q: "x", x0: "1", x1: "-1", y0: "-1", y1: "1" }).ok,
     "refuses Green's with reversed rectangle bounds (x0 ≥ x1)");
}

/* ---- Improper Integrals ----------------------------------------------------------
   ∫_a^b f where a bound may be ±∞ or a vertical asymptote. The defining move is replacing the
   troublesome bound with a limit; the integral converges iff every one-sided piece does. The
   headline traps: the slow log divergence of ∫_1^∞ 1/x (a fixed cutoff would miss it — the
   sequence-of-increments classifier catches it), and the Cauchy principal value of ∫_{-1}^1 1/x
   (symmetric partials are all 0, so the two sides MUST be split or the engine would report a
   convergent 0 for a divergent integral). Numeric partial-sum tolerances are looser (1e-2). */
const impConv = [
  { f: "1/x^2",       a: "1",        b: "Infinity", expect: 1,             exact: "1",  note: "p-series p>1: ∫_1^∞ 1/x² = 1" },
  { f: "1/sqrt(x)",   a: "0",        b: "1",        expect: 2,             exact: "2",  note: "singularity at the lower bound: ∫_0^1 1/√x = 2" },
  { f: "e^(-x)",      a: "0",        b: "Infinity", expect: 1,             exact: "1",  note: "exponential tail: ∫_0^∞ e^(-x) = 1" },
  { f: "1/x^(3/2)",   a: "1",        b: "Infinity", expect: 2,             exact: null, note: "p-series p=3/2: ∫_1^∞ 1/x^(3/2) = 2" },
  { f: "1/(1+x^2)",   a: "0",        b: "Infinity", expect: Math.PI / 2,   exact: null, note: "arctan tail: ∫_0^∞ 1/(1+x²) = π/2" }
];
for (const c of impConv) {
  const r = CalculusSymbolic.improperIntegral(c.f, "x", c.a, c.b);
  if (!ok(r.ok, `${c.note} resolves`, r.ok ? "" : r.reason)) continue;
  ok(r.verdict === "converges", `  ${c.f} on [${c.a},${c.b}] verdict = converges`, r.verdict);
  ok(r.verified === true, `  ${c.f} the symbolic and numeric paths agree (verified)`, r.verified ? "verified" : "NOT verified");
  ok(approxEq(r.numeric, c.expect, 1e-2), `  ${c.f} value ≈ ${c.expect}`, `got ${r.numeric}`);
  if (c.exact !== null) ok(sameExpr(r.value, c.exact), `  ${c.f} exact value = ${c.exact}`, `got ${r.value}`);
  ok(r.steps.length >= 3 && r.steps.every((s) => s.rule && typeof s.latex === "string"),
     `  ${c.f} emits a derivation`, `${r.steps.length} steps`);
}
{
  // The antiderivative is reported for elementary forms and withheld for non-elementary ones.
  const r = CalculusSymbolic.improperIntegral("1/x^2", "x", "1", "Infinity");
  ok(r.ok && sameExpr(r.antideriv, "-1/x"), "  ∫_1^∞ 1/x² reports the antiderivative −1/x", `got ${r.antideriv}`);
}

const impDiv = [
  { f: "1/x",       a: "1", b: "Infinity", note: "the slow log divergence of ∫_1^∞ 1/x" },
  { f: "1/x",       a: "-1", b: "1",       note: "the principal-value trap: ∫_{-1}^1 1/x diverges (not 0)" },
  { f: "1/x",       a: "0", b: "Infinity", note: "singularity at 0 AND an infinite tail: ∫_0^∞ 1/x diverges" },
  { f: "1/sqrt(x)", a: "1", b: "Infinity", note: "p-series p=1/2 < 1: ∫_1^∞ 1/√x diverges" }
];
for (const c of impDiv) {
  const r = CalculusSymbolic.improperIntegral(c.f, "x", c.a, c.b);
  if (!ok(r.ok, `${c.note} resolves`, r.ok ? "" : r.reason)) continue;
  ok(r.verdict === "diverges", `  ${c.f} on [${c.a},${c.b}] verdict = diverges`, r.verdict);
  ok(r.value === null && r.numeric === null, `  ${c.f} carries no value when it diverges`, `value=${r.value}`);
}
{
  // The principal-value trap specifically: the split into two one-sided pieces is what saves
  // it from reporting a convergent 0. Both pieces must be present and each must diverge.
  const r = CalculusSymbolic.improperIntegral("1/x", "x", "-1", "1");
  ok(r.ok && r.pieces.length === 2, "  ∫_{-1}^1 1/x is split into two one-sided pieces", `${r.pieces.length} pieces`);
  ok(r.ok && r.pieces.every((p) => p.numeric.verdict === "diverges"),
     "  both pieces of ∫_{-1}^1 1/x diverge (so the whole integral diverges, not 0)");
}
{
  // Refusals / bad input.
  ok(!CalculusSymbolic.improperIntegral("1/x^2", "x", "Infinity", "1").ok,
     "refuses +Infinity as a lower bound");
  ok(!CalculusSymbolic.improperIntegral("1/x^2", "x", "0", "-Infinity").ok,
     "refuses -Infinity as an upper bound");
  ok(!CalculusSymbolic.improperIntegral("1/x^2", "x", "1", "0").ok,
     "refuses finite bounds with a ≥ b");
  ok(!CalculusSymbolic.improperIntegral("1/x^2", "x", "banana", "1").ok,
     "refuses an unparseable bound");
  let threw = false;
  try { CalculusSymbolic.improperIntegral("", "x", "0", "1"); } catch (e) { threw = true; }
  ok(threw, "throws a clear error on an empty integrand");
}

// ---------------------------------------------------------------------------
// Fourier series — coefficients against known textbook series, and the
// π-symbolic exact forms for the elementary cases.
// ---------------------------------------------------------------------------
console.log("\nFourier series:");
{
  // f(x) = x on [-π, π], full: a0 = 0, an = 0, bn = 2·(-1)^(n+1)/n.
  const r = CalculusSymbolic.fourierSeries("x", "x", "pi", "full", 6);
  ok(r.ok, "f(x)=x full series resolves");
  if (r.ok) {
    ok(approxEq(r.a0.numeric, 0, 1e-6), "  a0 = 0", `a0=${r.a0.numeric}`);
    ok(r.an.every((a) => approxEq(a.numeric, 0, 1e-6)), "  every an = 0");
    ok(approxEq(r.bn[0].numeric, 2, 1e-3), "  b1 = 2", `b1=${r.bn[0].numeric}`);
    ok(approxEq(r.bn[1].numeric, -1, 1e-3), "  b2 = -1", `b2=${r.bn[1].numeric}`);
    ok(approxEq(r.bn[2].numeric, 2 / 3, 1e-3), "  b3 = 2/3", `b3=${r.bn[2].numeric}`);
    ok(approxEq(r.bn[3].numeric, -0.5, 1e-3), "  b4 = -1/2", `b4=${r.bn[3].numeric}`);
    // Exact π-symbolic forms for the first few n reveal the 1/n pattern.
    ok(r.bn[0].value === "2", "  b1 exact form = 2 (π kept symbolic)", r.bn[0].value);
    ok(r.bn[1].value === "-1", "  b2 exact form = -1", r.bn[1].value);
    ok(r.bn[2].value === "2/3", "  b3 exact form = 2/3", r.bn[2].value);
    ok(r.verified, "  partial sum approximates f where continuous (verified)");
  }
}
{
  // Square wave sign(x) on [-π, π], full: an = 0, bn = 4/(nπ) for odd n, 0 for even n.
  const r = CalculusSymbolic.fourierSeries("sign(x)", "x", "pi", "full", 6);
  ok(r.ok, "sign(x) full series resolves");
  if (r.ok) {
    ok(approxEq(r.bn[0].numeric, 4 / Math.PI, 1e-3), "  b1 = 4/π", `b1=${r.bn[0].numeric}`);
    ok(approxEq(r.bn[1].numeric, 0, 1e-6), "  b2 = 0 (even n vanishes)", `b2=${r.bn[1].numeric}`);
    ok(approxEq(r.bn[2].numeric, 4 / (3 * Math.PI), 1e-3), "  b3 = 4/(3π)", `b3=${r.bn[2].numeric}`);
    ok(approxEq(r.bn[3].numeric, 0, 1e-6), "  b4 = 0 (even n vanishes)", `b4=${r.bn[3].numeric}`);
  }
}
{
  // f(x) = 1 on [0, 2], half-range cosine: a0 = 2, an = 0 (a constant is its own cosine series).
  const r = CalculusSymbolic.fourierSeries("1", "x", "2", "cosine", 4);
  ok(r.ok, "f(x)=1 cosine series resolves");
  if (r.ok) {
    ok(approxEq(r.a0.numeric, 2, 1e-6), "  a0 = 2", `a0=${r.a0.numeric}`);
    ok(r.a0.value === "2", "  a0 exact form = 2", r.a0.value);
    ok(r.an.every((a) => approxEq(a.numeric, 0, 1e-6)), "  every an = 0");
    // The zero coefficients must be a clean "0", never a numericized-π garbage string.
    ok(r.an[0].value === "0", "  a1 reported as clean 0 (no π-numericization leak)", r.an[0].value);
  }
}
{
  // Half-range sine of a constant f(x)=1 on [0, π]: bn = 2/(nπ)·(1 - cos(nπ)) = 4/(nπ) for odd n.
  const r = CalculusSymbolic.fourierSeries("1", "x", "pi", "sine", 5);
  ok(r.ok, "f(x)=1 sine series resolves");
  if (r.ok) {
    ok(approxEq(r.bn[0].numeric, 4 / Math.PI, 1e-3), "  b1 = 4/π", `b1=${r.bn[0].numeric}`);
    ok(approxEq(r.bn[1].numeric, 0, 1e-6), "  b2 = 0", `b2=${r.bn[1].numeric}`);
    ok(approxEq(r.bn[2].numeric, 4 / (3 * Math.PI), 1e-3), "  b3 = 4/(3π)", `b3=${r.bn[2].numeric}`);
  }
}
{
  // Partial-sum evaluator: S_N of f(x)=x at an interior point tracks f (Fourier converges to f
  // where f is continuous). Loose tolerance — partial sums oscillate around f.
  const r = CalculusSymbolic.fourierSeries("x", "x", "pi", "full", 12);
  const s = CalculusSymbolic.fourierSeriesValue(r, "full", r.L, 1, 12);
  ok(approxEq(s, 1, 0.15), "  S_12(1) ≈ f(1) = 1", `S_12(1)=${s.toFixed(4)}`);
}
{
  // Refusals / bad input.
  ok(!CalculusSymbolic.fourierSeries("x", "x", "-1", "full", 4).ok, "refuses a non-positive L");
  ok(!CalculusSymbolic.fourierSeries("x", "x", "banana", "full", 4).ok, "refuses an unparseable L");
  ok(!CalculusSymbolic.fourierSeries("x", "x", "pi", "bogus", 4).ok, "refuses an unknown mode");
  let threw = false;
  try { CalculusSymbolic.fourierSeries("", "x", "pi", "full", 4); } catch (e) { threw = true; }
  ok(threw, "throws a clear error on an empty f(x)");
}

/* ---- ln() parsing, and the independent-parse gate that guards it -----------------

   nerdamer has no ln function. It parses "ln(x)" as the SYMBOL ln MULTIPLIED BY x, silently
   and without error, so ∫ln(x)dx returned (1/2)·ln·x² — and the differentiate-back gate
   PASSED it. That is the part worth understanding: the integrand misparses exactly the way
   the answer does, so the wrong result is internally consistent. d/dx[(1/2)·ln·x²] = ln·x,
   which is precisely the misparsed integrand, and the check agrees with itself.

   No verifier that shares a parser with the thing it verifies can catch a parser bug. So
   these cases assert the TEXTBOOK VALUE, evaluated through math.js — an independent parser
   that rejects unknown function names instead of guessing at them. */
console.log("\nln() normalization and the independent-parse gate:");
{
  const CalcCore = require(path.join(__dirname, "..", "assets", "js", "calc-core.js"));

  // Compares two expressions by value at sample points, parsed by math.js rather than by the
  // library under test. String comparison would fail on equivalent-but-rearranged forms.
  function agreesNumerically(a, b, v) {
    let hits = 0;
    for (const x of [1.3, 1.9, 2.4, 3.1, 4.2]) {
      let fa, fb;
      try {
        fa = math.parse(a).compile().evaluate({ [v]: x });
        fb = math.parse(b).compile().evaluate({ [v]: x });
      } catch (e) { continue; }
      if (!Number.isFinite(fa) || !Number.isFinite(fb)) continue;
      hits++;
      // Antiderivatives are equal only up to a constant, so compare DIFFERENCES across
      // points rather than raw values: F(x) − F(x₀) is what is actually determined.
      if (Math.abs(fa - fb) > 1e-6 * Math.max(1, Math.abs(fa))) return false;
    }
    return hits >= 3;
  }

  const lnI = CalculusSymbolic.integrationByParts("ln(x)", "x");
  const logI = CalculusSymbolic.integrationByParts("log(x)", "x");
  ok(lnI.ok && logI.ok, "∫ln(x)dx and ∫log(x)dx both solve");
  ok(lnI.ok && logI.ok && agreesNumerically(lnI.result, logI.result, "x"),
    "∫ln(x)dx agrees with ∫log(x)dx — same function, same answer", lnI.ok ? lnI.result : "");
  ok(lnI.ok && agreesNumerically(lnI.result, "x*log(x)-x", "x"),
    "∫ln(x)dx = x·ln(x) − x   [was (1/2)·ln·x², and reported verified]", lnI.ok ? lnI.result : "");

  const xlnI = CalculusSymbolic.integrationByParts("x*ln(x)", "x");
  ok(xlnI.ok && agreesNumerically(xlnI.result, "x^2*log(x)/2-x^2/4", "x"),
    "∫x·ln(x)dx = x²ln(x)/2 − x²/4   [was (1/3)·ln·x³]", xlnI.ok ? xlnI.result : "");

  const nested = CalculusSymbolic.uSubstitution("1/(x*ln(x))", "x");
  ok(nested.ok && agreesNumerically(nested.result, "log(log(x))", "x"),
    "∫dx/(x·ln x) = ln|ln x|   [was −ln⁻¹·x⁻¹]", nested.ok ? nested.result : "");

  // The limit path shared the misparse and returned the bare symbol "ln" as its answer.
  const lim = CalculusSymbolic.limit("ln(x)/x", "x", "Infinity");
  ok(lim && String(lim.value) === "0", "lim ln(x)/x as x→∞ = 0   [was the symbol 'ln']",
    lim ? String(lim.value) : "");

  // The gate, both directions. One that blocks valid input would be worse than none at all.
  for (const good of ["ln(x)", "log(x)", "sin(x)", "sqrt(1-x^2)", "e^x", "nthRoot(x,3)", "x*ln(x)/sqrt(x)"]) {
    ok(CalcCore.validateInput(good) === null, `gate passes legitimate input: ${good}`);
  }
  for (const bad of ["foo(x)", "lg(x)", "sen(x)", "arctg(x)"]) {
    ok(typeof CalcCore.validateInput(bad) === "string",
      `gate blocks what nerdamer would silently misread: ${bad}`);
  }
  ok(typeof CalcCore.validateInput("x^2+") === "string", "gate blocks a syntactically broken expression");
  ok(typeof CalcCore.validateInput("") === "string", "gate blocks an empty expression");

  // Rewriting must not maul an identifier that merely ends in "ln".
  ok(CalcCore.normalizeInput("xln(x)") === "xln(x)", "normalizeInput leaves 'xln(' alone");
  // The \s* in the pattern is consumed along with the name, so the space collapses too.
  ok(CalcCore.normalizeInput("ln (x)") === "log(x)", "normalizeInput handles 'ln (x)' written with a space");
  ok(CalcCore.normalizeInput("a*ln(x)+ln(y)") === "a*log(x)+log(y)", "normalizeInput rewrites every occurrence");
}

console.log(`\n${pass} passed, ${fail} failed.`);
process.exit(fail ? 1 : 0);
