"use strict";
/* Complex Analysis Engine — residue-theorem shared module verification suite.
   Runs the exact code the Contour Integration page ships (assets/js/complex-residues.js)
   against known textbook contour integrals. Run with: node tests/verify-complex-residues.js

   This module's SymPy-touching functions (findSingularitiesWithResidues, contourIntegral,
   laurentSeries) go through SympyClient and are browser-only, so they are not exercised here.
   The geometry and numeric verification below are plain JS and directly unit-testable — and
   they are the part that *independently* checks SymPy's residues, which makes them the
   load-bearing piece for correctness. Same "behaviour, not strings" discipline as the other
   suites: the numeric contour integral is checked against known values, never against itself. */

const path = require("path");
const math = require(path.join(__dirname, "..", "assets", "vendor", "math.min.js"));
const loadNerdamer = require(path.join(__dirname, "lib", "load-cas.js"));
const Complex = require(path.join(__dirname, "..", "assets", "js", "complex.js"));
const CalcCore = require(path.join(__dirname, "..", "assets", "js", "calc-core.js"));
const ComplexSymbolic = require(path.join(__dirname, "..", "assets", "js", "complex-symbolic.js"));
const ComplexResidues = require(path.join(__dirname, "..", "assets", "js", "complex-residues.js"));

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
function eq(actual, expected, label) {
  return ok(String(actual) === String(expected), label, `got ${actual}, expected ${expected}`);
}
function throws(fn, label) {
  try { fn(); fail++; console.error(`  FAIL  ${label}: expected throw, got none`); }
  catch (e) { pass++; console.log(`  ok    ${label}: threw "${e.message}"`); }
}
// A complex contour-integral result {re,im} matches a known {re,im} within tol.
function eqC(actual, expected, label, tol = 1e-6) {
  if (!actual) return ok(false, label, "got null, expected a value");
  const reOk = Math.abs(actual.re - expected.re) <= tol * Math.max(1, Math.abs(expected.re));
  const imOk = Math.abs(actual.im - expected.im) <= tol * Math.max(1, Math.abs(expected.im));
  return ok(reOk && imOk, label, `got (${actual.re}, ${actual.im}), expected (${expected.re}, ${expected.im})`);
}
function isNull(actual, label) {
  return ok(actual === null, label, actual === null ? "correctly refused (null)" : `expected null, got ${JSON.stringify(actual)}`);
}

const TWO_PI_I = { re: 0, im: 2 * Math.PI };

console.log("Complex Analysis — complex-residues.js (residue-theorem shared module)\n");

// ==================== classify() — contour geometry ====================
console.log("classify(point, contour) — circle containment");
{
  const unit = { type: "circle", center: { re: 0, im: 0 }, radius: 1 };
  eq(ComplexResidues.classify({ re: 0, im: 0 }, unit), "inside", "origin inside unit circle");
  eq(ComplexResidues.classify({ re: 0.5, im: 0 }, unit), "inside", "0.5 inside unit circle");
  eq(ComplexResidues.classify({ re: 2, im: 0 }, unit), "outside", "2 outside unit circle");
  eq(ComplexResidues.classify({ re: 1, im: 0 }, unit), "on", "1 is on the unit circle");
  eq(ComplexResidues.classify({ re: -1, im: 0 }, unit), "on", "-1 is on the unit circle");
  eq(ComplexResidues.classify({ re: 0, im: 1 }, unit), "on", "i is on the unit circle");
}
{
  const off = { type: "circle", center: { re: 1, im: 1 }, radius: 2 };
  eq(ComplexResidues.classify({ re: 1, im: 1 }, off), "inside", "center inside its own circle");
  eq(ComplexResidues.classify({ re: 3, im: 1 }, off), "on", "(3,1) is on circle center (1,1) r2");
  eq(ComplexResidues.classify({ re: 4, im: 4 }, off), "outside", "(4,4) outside (dist √18 > 2)");
  eq(ComplexResidues.classify({ re: 2, im: 1 }, off), "inside", "(2,1) inside (dist 1 < 2)");
}
throws(() => ComplexResidues.classify({ re: 0, im: 0 }, { type: "square", center: { re: 0, im: 0 }, side: 2 }), "unsupported contour type throws");

// ==================== numericContourIntegral() — the independent verifier ====================
console.log("\nnumericContourIntegral(f, contour, N) — direct Simpson, complex-valued");
const N = 200;
{
  // ∮ 1/z dz around the origin = 2πi (the canonical residue-theorem example; residue of 1/z is 1).
  const unit = { type: "circle", center: { re: 0, im: 0 }, radius: 1 };
  eqC(ComplexResidues.numericContourIntegral("1/z", unit, N), TWO_PI_I, "∮ 1/z dz = 2πi (pole inside)");
}
{
  // Same integrand, contour that does NOT enclose the pole → 0 by Cauchy's theorem.
  const away = { type: "circle", center: { re: 3, im: 0 }, radius: 1 };
  eqC(ComplexResidues.numericContourIntegral("1/z", away, N), { re: 0, im: 0 }, "∮ 1/z dz = 0 (pole outside the contour)");
}
{
  // ∮ z² dz = 0 (entire function, no singularities anywhere).
  const unit = { type: "circle", center: { re: 0, im: 0 }, radius: 1 };
  eqC(ComplexResidues.numericContourIntegral("z^2", unit, N), { re: 0, im: 0 }, "∮ z² dz = 0 (entire)");
}
{
  // ∮ 1/z² dz = 0 — the residue of 1/z² at 0 is 0 (derivative term vanishes), so the integral is
  // zero even though the integrand is singular inside. Distinguishes "has a pole" from "nonzero
  // integral" — exactly the kind of case a naive "any singularity ⇒ 2πi" bug would get wrong.
  const unit = { type: "circle", center: { re: 0, im: 0 }, radius: 1 };
  eqC(ComplexResidues.numericContourIntegral("1/z^2", unit, N), { re: 0, im: 0 }, "∮ 1/z² dz = 0 (residue is 0, not the pole count)");
}
{
  // ∮ e^z/z dz = 2πi — residue of e^z/z at 0 is e^0 = 1. Also exercises the eCaretToExp rewrite
  // (the page-level "e^z" notation → internal "exp(z)") on a quotient with a genuine pole.
  const unit = { type: "circle", center: { re: 0, im: 0 }, radius: 1 };
  eqC(ComplexResidues.numericContourIntegral("e^z/z", unit, N), TWO_PI_I, "∮ e^z/z dz = 2πi (residue e^0 = 1; e^z notation handled)");
}
{
  // ∮ e^z dz = 0 (entire) — exercises eCaretToExp on a standalone exponential.
  const unit = { type: "circle", center: { re: 0, im: 0 }, radius: 1 };
  eqC(ComplexResidues.numericContourIntegral("e^z", unit, N), { re: 0, im: 0 }, "∮ e^z dz = 0 (entire; e^z notation handled)");
}
{
  // ∮ sin(z) dz = 0 (entire).
  const unit = { type: "circle", center: { re: 0, im: 0 }, radius: 1 };
  eqC(ComplexResidues.numericContourIntegral("sin(z)", unit, N), { re: 0, im: 0 }, "∮ sin(z) dz = 0 (entire)");
}
{
  // Refusal path: sqrt(z) is multivalued and explicitly refused by decompose (by name), so the
  // numeric verifier must return null rather than guessing — "inconclusive" is the honest result.
  const unit = { type: "circle", center: { re: 0, im: 0 }, radius: 1 };
  isNull(ComplexResidues.numericContourIntegral("sqrt(z)", unit, N), "∮ sqrt(z) dz refused (multivalued) → null");
}
{
  // Refusal path: a non-isolated/unknown symbol also refuses cleanly.
  const unit = { type: "circle", center: { re: 0, im: 0 }, radius: 1 };
  isNull(ComplexResidues.numericContourIntegral("w+1", unit, N), "∮ (w+1) dz refused (unknown symbol) → null");
}

// ==================== numericRealIntegral() — the real-integral-by-residues verifier ====================
console.log("\nnumericRealIntegral(f, var, mode) — tangent-substitution Simpson over an infinite domain");
function approx(actual, expected, label, tol = 1e-4) {
  if (actual === null) return ok(false, label, "got null, expected a value");
  const rel = Math.abs(actual - expected) / Math.max(1, Math.abs(expected));
  return ok(rel <= tol, label, `got ${actual.toPrecision(8)}, expected ${expected.toPrecision(8)} (rel ${rel.toExponential(1)})`);
}
{
  // ∫_{-∞}^{∞} 1/(x²+1) dx = π  (the canonical real-integral-by-residues example).
  approx(ComplexResidues.numericRealIntegral("1/(x^2+1)", "x", "whole"), Math.PI, "∫ 1/(x²+1) over ℝ = π");
  // ∫_0^∞ 1/(x²+1) dx = π/2  (even integrand, half-line).
  approx(ComplexResidues.numericRealIntegral("1/(x^2+1)", "x", "half"), Math.PI / 2, "∫_0^∞ 1/(x²+1) = π/2");
  // ∫_{-∞}^{∞} 1/(x⁴+1) dx = π/√2  (two upper-half-plane poles).
  approx(ComplexResidues.numericRealIntegral("1/(x^4+1)", "x", "whole"), Math.PI / Math.sqrt(2), "∫ 1/(x⁴+1) over ℝ = π/√2");
  // ∫_0^∞ 1/(x⁴+1) dx = π/(2√2)  (even, half-line).
  approx(ComplexResidues.numericRealIntegral("1/(x^4+1)", "x", "half"), Math.PI / (2 * Math.sqrt(2)), "∫_0^∞ 1/(x⁴+1) = π/(2√2)");
  // ∫_{-∞}^{∞} 1/((x²+1)(x²+4)) dx = π/6  (partial fractions: two upper poles).
  approx(ComplexResidues.numericRealIntegral("1/((x^2+1)*(x^2+4))", "x", "whole"), Math.PI / 6, "∫ 1/((x²+1)(x²+4)) over ℝ = π/6");
  // ∫_{-∞}^{∞} 1/(x²+4) dx = π/2.
  approx(ComplexResidues.numericRealIntegral("1/(x^2+4)", "x", "whole"), Math.PI / 2, "∫ 1/(x²+4) over ℝ = π/2");
  // Refusal: an unevaluatable integrand returns null rather than a wrong number.
  isNull(ComplexResidues.numericRealIntegral("1/(x-y)", "x", "whole"), "∫ 1/(x-y) refused (unknown symbol y) → null");
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);