"use strict";
/* Complex Analysis Engine — symbolic verification suite (Phase 1 items 3 & 4).
   Runs the exact code the pages ship (assets/js/complex-symbolic.js) against known textbook
   answers. Run with: node tests/verify-complex-symbolic.js

   Assertions check exact symbolic behaviour (u, v, verdict) where the answer is unambiguous,
   and numeric values at named points otherwise — same "behaviour, not strings" discipline as
   verify-calculus.js, since nerdamer's output form (e.g. "-y^2+x^2" vs "x^2-y^2") is correct
   either way. */

const path = require("path");
const math = require(path.join(__dirname, "..", "assets", "vendor", "math.min.js"));
const loadNerdamer = require(path.join(__dirname, "lib", "load-cas.js"));
const CalcCore = require(path.join(__dirname, "..", "assets", "js", "calc-core.js"));
const ComplexSymbolic = require(path.join(__dirname, "..", "assets", "js", "complex-symbolic.js"));

const nerdamer = loadNerdamer();
CalcCore.configure({ nerdamer, math });
ComplexSymbolic.configure({ nerdamer, math });

let pass = 0;
let fail = 0;

function ok(cond, label, detail) {
  if (cond) { pass++; console.log(`  ok    ${label}${detail ? ": " + detail : ""}`); }
  else { fail++; console.error(`  FAIL  ${label}${detail ? ": " + detail : ""}`); }
  return cond;
}
function approx(actual, expected, tol, label) {
  return ok(Number.isFinite(actual) && Math.abs(actual - expected) <= tol, label, `got ${actual}, expected ≈${expected}`);
}
// Two nerdamer expression strings are the same function iff they agree at a spread of points.
function sameFn2(exprA, exprB, label, pts) {
  pts = pts || [[0.7, 0.3], [1.3, -0.6], [-0.5, 1.1]];
  const fa = CalcCore.compileFn(exprA), fb = CalcCore.compileFn(exprB);
  if (!fa || !fb) return ok(false, label, `couldn't compile "${exprA}" or "${exprB}"`);
  let allMatch = true;
  for (const [x, y] of pts) {
    let va, vb;
    try { va = fa.evaluate({ x, y }); vb = fb.evaluate({ x, y }); } catch (e) { continue; }
    if (!Number.isFinite(va) || !Number.isFinite(vb)) continue;
    if (Math.abs(va - vb) > 1e-6 * Math.max(1, Math.abs(va), Math.abs(vb))) allMatch = false;
  }
  return ok(allMatch, label, `"${exprA}" vs "${exprB}"`);
}

console.log("Complex Analysis — complex-symbolic.js verification suite\n");

// ==================== decompose() ====================
console.log("decompose(f) — u(x,y), v(x,y) with f(x+iy) = u + iv");
{
  const d = ComplexSymbolic.decompose("z^2");
  ok(d.ok, "z^2 decomposes");
  sameFn2(d.u, "x^2-y^2", "z^2: Re = x^2 - y^2");
  sameFn2(d.v, "2*x*y", "z^2: Im = 2xy");
}
{
  const d = ComplexSymbolic.decompose("z^3");
  ok(d.ok, "z^3 decomposes");
  sameFn2(d.u, "x^3-3*x*y^2", "z^3: Re = x^3 - 3xy^2 (a real term with 2 distinct symbolic factors — exactly what broke nerdamer's imagpart)");
  sameFn2(d.v, "3*x^2*y-y^3", "z^3: Im = 3x^2y - y^3");
}
{
  const d = ComplexSymbolic.decompose("1/z");
  ok(d.ok, "1/z decomposes");
  sameFn2(d.u, "x/(x^2+y^2)", "1/z: Re = x/(x^2+y^2)");
  sameFn2(d.v, "-y/(x^2+y^2)", "1/z: Im = -y/(x^2+y^2)");
}
{
  const d = ComplexSymbolic.decompose("exp(z)");
  ok(d.ok, "exp(z) decomposes");
  sameFn2(d.u, "e^x*cos(y)", "exp(z): Re = e^x cos(y) — the case nerdamer's imagpart gets wrong");
  sameFn2(d.v, "e^x*sin(y)", "exp(z): Im = e^x sin(y)");
}
{
  const d = ComplexSymbolic.decompose("sin(z)");
  ok(d.ok, "sin(z) decomposes");
  sameFn2(d.u, "sin(x)*cosh(y)", "sin(z): Re = sin(x)cosh(y)");
  sameFn2(d.v, "cos(x)*sinh(y)", "sin(z): Im = cos(x)sinh(y)");
}
{
  const d = ComplexSymbolic.decompose("conj(z)");
  ok(d.ok, "conj(z) decomposes");
  sameFn2(d.u, "x", "conj(z): Re = x");
  sameFn2(d.v, "-y", "conj(z): Im = -y");
}
{
  const d = ComplexSymbolic.decompose("abs(z)^2");
  ok(d.ok, "abs(z)^2 decomposes");
  sameFn2(d.u, "x^2+y^2", "|z|^2: Re = x^2+y^2");
  sameFn2(d.v, "0", "|z|^2: Im = 0");
}
{
  const d = ComplexSymbolic.decompose("sqrt(z)");
  ok(!d.ok, "sqrt(z) refuses (multivalued, no branch handling here)", d.reason);
}
{
  const d = ComplexSymbolic.decompose("z^(1/2)");
  ok(!d.ok, "z^(1/2) refuses (fractional power)", d.reason);
}
{
  const d = ComplexSymbolic.decompose("w+1");
  ok(!d.ok, "unknown symbol w refuses by name", d.reason);
}

// ==================== cauchyRiemann() ====================
console.log("\ncauchyRiemann(f, point)");
{
  const r = ComplexSymbolic.cauchyRiemann("z^2", [1, 1]);
  ok(r.ok, "z^2 at (1,1) computes");
  ok(r.satisfiesAtPoint, "z^2: CR satisfied at (1,1)");
  ok(r.verdict === "analytic", "z^2: verdict is analytic (entire function)", r.verdict);
  ok(r.verified, "z^2: finite-difference cross-check passes");
}
{
  const r = ComplexSymbolic.cauchyRiemann("exp(z)", [0.4, -0.7]);
  ok(r.ok && r.satisfiesAtPoint && r.verdict === "analytic", "exp(z): analytic — the case that would have been silently wrong via nerdamer's imagpart");
}
{
  const r = ComplexSymbolic.cauchyRiemann("sin(z)", [0.2, 0.9]);
  ok(r.ok && r.satisfiesAtPoint && r.verdict === "analytic", "sin(z): analytic everywhere");
}
{
  const r = ComplexSymbolic.cauchyRiemann("conj(z)", [1, 1]);
  ok(r.ok, "conj(z) computes");
  ok(!r.satisfiesAtPoint, "conj(z): CR fails at (1,1) — analytic nowhere");
  ok(r.verdict === "not-analytic-at-point", "conj(z): verdict reflects the failure", r.verdict);
}
{
  const r = ComplexSymbolic.cauchyRiemann("conj(z)", [0, 0]);
  ok(r.ok && !r.satisfiesAtPoint, "conj(z): CR fails even at the origin");
}
{
  // |z|^2 = x^2+y^2 + 0i: CR holds ONLY at the origin (classic "differentiable at one point,
  // analytic nowhere" textbook example) — the neighbourhood sampling must catch this.
  const atOrigin = ComplexSymbolic.cauchyRiemann("abs(z)^2", [0, 0]);
  ok(atOrigin.ok && atOrigin.satisfiesAtPoint, "|z|^2: CR satisfied at the origin");
  ok(atOrigin.verdict === "cr-holds-only-here", "|z|^2: verdict distinguishes 'holds only here' from true analyticity", atOrigin.verdict);
  const elsewhere = ComplexSymbolic.cauchyRiemann("abs(z)^2", [1, 1]);
  ok(elsewhere.ok && !elsewhere.satisfiesAtPoint, "|z|^2: CR fails away from the origin, e.g. (1,1)");
}
{
  const r = ComplexSymbolic.cauchyRiemann("1/z", [2, 3]);
  ok(r.ok && r.satisfiesAtPoint && r.verdict === "analytic", "1/z: analytic away from its pole");
}
{
  const r = ComplexSymbolic.cauchyRiemann("z^2", ["a", "b"]);
  ok(!r.ok, "cauchyRiemann refuses a non-numeric point", r.reason);
}

// ==================== harmonicConjugate() ====================
console.log("\nharmonicConjugate(u, basepoint)");
{
  const r = ComplexSymbolic.harmonicConjugate("x^2-y^2", [0, 0]);
  ok(r.ok, "x^2-y^2 has a conjugate");
  sameFn2(r.v, "2*x*y", "x^2-y^2: conjugate is 2xy (matches z^2's imaginary part)");
  ok(r.verified, "x^2-y^2: verify gate passes");
}
{
  const r = ComplexSymbolic.harmonicConjugate("e^x*cos(y)", [0, 0]);
  ok(r.ok, "e^x*cos(y) has a conjugate");
  sameFn2(r.v, "e^x*sin(y)", "e^x*cos(y): conjugate is e^x*sin(y) (matches exp(z)'s imaginary part)");
}
{
  const r = ComplexSymbolic.harmonicConjugate("x^3-3*x*y^2", [0, 0]);
  ok(r.ok, "x^3-3xy^2 has a conjugate (Churchill & Brown's own example)");
  sameFn2(r.v, "3*x^2*y-y^3", "x^3-3xy^2: conjugate is 3x^2y - y^3");
}
{
  const r = ComplexSymbolic.harmonicConjugate("x*y", [0, 0]);
  ok(r.ok, "xy has a conjugate");
  sameFn2(r.v, "(y^2-x^2)/2", "xy: conjugate is (y^2-x^2)/2");
}
{
  const r = ComplexSymbolic.harmonicConjugate("x^2+y^2", [0, 0]);
  ok(!r.ok, "x^2+y^2 refuses — not harmonic (Laplacian = 4)", r.reason);
}
{
  // Non-zero basepoint shift: v(x0,y0) must land exactly on the requested value.
  const r = ComplexSymbolic.harmonicConjugate("x^2-y^2", [1, 1, 5]);
  ok(r.ok, "x^2-y^2 with basepoint (1,1,5) computes");
  const atBase = CalcCore.compileFn(r.v).evaluate({ x: 1, y: 1 });
  approx(atBase, 5, 1e-6, "v(1,1) lands exactly on the requested basepoint value 5");
}
{
  const r = ComplexSymbolic.harmonicConjugate("not a valid expr (((", [0, 0]);
  ok(!r.ok, "malformed u refuses cleanly", r.reason);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
