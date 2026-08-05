"use strict";
/* Complex Analysis Engine — contour-theorems module verification suite.
   Runs the exact code the Cauchy Integral Formula and Argument Principle / Rouché pages ship
   (assets/js/complex-contour-theorems.js) against known textbook values. Run with:
   node tests/verify-contour-theorems.js

   Every function tested here is pure numeric JS (no SymPy), so the whole module is
   unit-testable in Node — same "behaviour, not strings" discipline as the other suites. The
   two independent checks the module uses internally (two-radius contour independence for CIF;
   winding-number vs logarithmic-derivative for the argument principle) are themselves exercised
   by the cases below agreeing with hand-computed values. */

const path = require("path");
const math = require(path.join(__dirname, "..", "assets", "vendor", "math.min.js"));
const loadNerdamer = require(path.join(__dirname, "lib", "load-cas.js"));
require(path.join(__dirname, "..", "assets", "js", "complex.js"));
require(path.join(__dirname, "..", "assets", "js", "calc-core.js"));
require(path.join(__dirname, "..", "assets", "js", "complex-symbolic.js"));
require(path.join(__dirname, "..", "assets", "js", "complex-residues.js"));
const CalcCore = require(path.join(__dirname, "..", "assets", "js", "calc-core.js"));
const ComplexSymbolic = require(path.join(__dirname, "..", "assets", "js", "complex-symbolic.js"));
const Theorems = require(path.join(__dirname, "..", "assets", "js", "complex-contour-theorems.js"));

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
function eqC(actual, expected, label, tol = 1e-6) {
  if (!actual) return ok(false, label, "got null, expected a value");
  const reOk = Math.abs(actual.re - expected.re) <= tol * Math.max(1, Math.abs(expected.re));
  const imOk = Math.abs(actual.im - expected.im) <= tol * Math.max(1, Math.abs(expected.im));
  return ok(reOk && imOk, label, `got (${actual.re}, ${actual.im}), expected (${expected.re}, ${expected.im})`);
}
function isNull(actual, label) {
  return ok(actual === null, label, actual === null ? "correctly refused (null)" : `expected null, got ${JSON.stringify(actual)}`);
}
function notOk(actual, label) {
  return ok(actual && !actual.ok, label, actual && !actual.ok ? `correctly refused: ${actual.reason}` : "expected a refusal");
}

const unit = { type: "circle", center: { re: 0, im: 0 }, radius: 1 };
const big = { type: "circle", center: { re: 0, im: 0 }, radius: 2 };

console.log("Complex Analysis — complex-contour-theorems.js (CIF · argument principle · Rouché)\n");

// ==================== Cauchy integral formula ====================
console.log("cauchyIntegralFormula — f^(n)(z₀) = n!/(2πi) ∮ f(z)/(z−z₀)^(n+1) dz");
{
  const z0 = { re: 0, im: 0 };
  let r = Theorems.cauchyIntegralFormula("exp(z)", "z", z0, 0, 1);
  ok(r.ok && r.verified, "e^z, n=0 verified", r.reason);
  eqC(r.value, { re: 1, im: 0 }, "e^z, n=0 → f(0) = 1");

  r = Theorems.cauchyIntegralFormula("exp(z)", "z", z0, 1, 1);
  ok(r.ok && r.verified, "e^z, n=1 verified");
  eqC(r.value, { re: 1, im: 0 }, "e^z, n=1 → f'(0) = 1", 1e-4);

  r = Theorems.cauchyIntegralFormula("exp(z)", "z", z0, 2, 1);
  ok(r.ok && r.verified, "e^z, n=2 verified");
  eqC(r.value, { re: 1, im: 0 }, "e^z, n=2 → f''(0) = 1", 1e-4);

  r = Theorems.cauchyIntegralFormula("sin(z)", "z", z0, 0, 1);
  eqC(r.value, { re: 0, im: 0 }, "sin z, n=0 → f(0) = 0");

  r = Theorems.cauchyIntegralFormula("sin(z)", "z", z0, 1, 1);
  ok(r.ok && r.verified, "sin z, n=1 verified");
  eqC(r.value, { re: 1, im: 0 }, "sin z, n=1 → f'(0) = cos 0 = 1", 1e-4);

  r = Theorems.cauchyIntegralFormula("cos(z)", "z", z0, 2, 1);
  ok(r.ok && r.verified, "cos z, n=2 verified");
  eqC(r.value, { re: -1, im: 0 }, "cos z, n=2 → f''(0) = −cos 0 = −1", 1e-4);

  // z₀ off the origin — the contour is a circle centred at z₀
  r = Theorems.cauchyIntegralFormula("z^2+1", "z", { re: 0, im: 1 }, 0, 0.5);
  ok(r.ok && r.verified, "z²+1 at z₀=i, n=0 verified");
  eqC(r.value, { re: 0, im: 0 }, "z²+1, n=0 → f(i) = 0");

  // z³ at z₀=1: derivatives 3z², 6z, 6 → 3, 6, 6
  r = Theorems.cauchyIntegralFormula("z^3", "z", { re: 1, im: 0 }, 0, 0.5);
  eqC(r.value, { re: 1, im: 0 }, "z³, n=0 → f(1) = 1");
  r = Theorems.cauchyIntegralFormula("z^3", "z", { re: 1, im: 0 }, 1, 0.5);
  ok(r.ok && r.verified, "z³, n=1 verified");
  eqC(r.value, { re: 3, im: 0 }, "z³, n=1 → f'(1) = 3", 1e-4);
  r = Theorems.cauchyIntegralFormula("z^3", "z", { re: 1, im: 0 }, 2, 0.5);
  ok(r.ok && r.verified, "z³, n=2 verified");
  eqC(r.value, { re: 6, im: 0 }, "z³, n=2 → f''(1) = 6", 1e-4);
  r = Theorems.cauchyIntegralFormula("z^3", "z", { re: 1, im: 0 }, 3, 0.5);
  ok(r.ok && r.verified, "z³, n=3 verified");
  eqC(r.value, { re: 6, im: 0 }, "z³, n=3 → f'''(1) = 6", 1e-3);

  // e^z notation normalizer — "e^z" must behave like "exp(z)"
  r = Theorems.cauchyIntegralFormula("e^z", "z", z0, 0, 1);
  ok(r.ok && r.verified, "e^z notation normalised to exp(z)");
  eqC(r.value, { re: 1, im: 0 }, "e^z, n=0 → 1");

  // Refusals — f not defined at z₀ (a pole of f sits at z₀): CIF doesn't apply
  notOk(Theorems.cauchyIntegralFormula("1/z", "z", z0, 0, 1), "1/z at z₀=0 refused (f undefined at z₀)");
  notOk(Theorems.cauchyIntegralFormula("1/(z-2)", "z", { re: 2, im: 0 }, 0, 1), "1/(z−2) at z₀=2 refused");
  notOk(Theorems.cauchyIntegralFormula("z^2", "z", z0, -1, 1), "negative order refused");
}

// ==================== winding number ====================
console.log("\nwindingNumber — N − P as the winding of f(γ) about 0");
{
  ok(Theorems.windingNumber("z^2-1", "z", big) === 2, "z²−1 on |z|=2 → 2 (two zeros, no poles)");
  ok(Theorems.windingNumber("z^2+1", "z", big) === 2, "z²+1 on |z|=2 → 2 (zeros ±i)");
  ok(Theorems.windingNumber("z^3", "z", unit) === 3, "z³ on |z|=1 → 3 (triple zero)");
  ok(Theorems.windingNumber("z^2", "z", unit) === 2, "z² on |z|=1 → 2");
  ok(Theorems.windingNumber("1/z", "z", unit) === -1, "1/z on |z|=1 → −1 (one pole, no zeros)");
  ok(Theorems.windingNumber("1/z^2", "z", unit) === -2, "1/z² on |z|=1 → −2 (double pole)");
  ok(Theorems.windingNumber("z/(z-2)", "z", unit) === 1, "z/(z−2) on |z|=1 → 1 (zero in, pole out)");
  ok(Theorems.windingNumber("exp(z)", "z", unit) === 0, "e^z on |z|=1 → 0 (entire, no zeros)");
  ok(Theorems.windingNumber("z^5", "z", big) === 5, "z⁵ on |z|=2 → 5");
  isNull(Theorems.windingNumber("z-1", "z", unit), "z−1 on |z|=1 refused (zero on the contour)");
}

// ==================== logarithmic-derivative integral ====================
console.log("\nlogDerivativeIntegral — (1/2πi) ∮ f'/f dz (re part = N − P)");
{
  let r = Theorems.logDerivativeIntegral("z^2-1", "z", big);
  eqC(r, { re: 2, im: 0 }, "z²−1 on |z|=2 → 2", 1e-3);
  r = Theorems.logDerivativeIntegral("1/z^2", "z", unit);
  eqC(r, { re: -2, im: 0 }, "1/z² on |z|=1 → −2", 1e-3);
  r = Theorems.logDerivativeIntegral("z/(z-2)", "z", unit);
  eqC(r, { re: 1, im: 0 }, "z/(z−2) on |z|=1 → 1", 1e-3);
  r = Theorems.logDerivativeIntegral("exp(z)", "z", unit);
  eqC(r, { re: 0, im: 0 }, "e^z on |z|=1 → 0", 1e-3);
  r = Theorems.logDerivativeIntegral("z^5", "z", big);
  eqC(r, { re: 5, im: 0 }, "z⁵ on |z|=2 → 5", 1e-3);
}

// ==================== argument principle (cross-check) ====================
console.log("\nargumentPrinciple — winding vs log-derivative agreement");
{
  let r = Theorems.argumentPrinciple("z^2-1", "z", big);
  ok(r.ok && r.verified && r.nMinusP === 2, "z²−1 on |z|=2 → N−P = 2, verified");
  r = Theorems.argumentPrinciple("1/z^2", "z", unit);
  ok(r.ok && r.verified && r.nMinusP === -2, "1/z² on |z|=1 → N−P = −2, verified");
  r = Theorems.argumentPrinciple("z/(z-2)", "z", unit);
  ok(r.ok && r.verified && r.nMinusP === 1, "z/(z−2) on |z|=1 → N−P = 1, verified");
  r = Theorems.argumentPrinciple("z^5", "z", big);
  ok(r.ok && r.verified && r.nMinusP === 5, "z⁵ on |z|=2 → N−P = 5, verified");
  notOk(Theorems.argumentPrinciple("z-1", "z", unit), "z−1 on |z|=1 refused (zero on contour)");
}

// ==================== Rouché's theorem ====================
console.log("\nrouche — |f−g| < |f| on γ ⟹ N_f = N_g");
{
  let r = Theorems.rouche("z^5", "z^5-1", "z", big);
  ok(r.ok && r.applies && r.equal && r.nF === 5 && r.nG === 5, "z⁵ vs z⁵−1 on |z|=2 → both 5 zeros", `maxRatio ${r.maxRatio && r.maxRatio.toFixed(3)}`);

  r = Theorems.rouche("z^2+1", "z^2", "z", big);
  ok(r.ok && r.applies && r.equal && r.nF === 2 && r.nG === 2, "z²+1 vs z² on |z|=2 → both 2 zeros");

  r = Theorems.rouche("z", "z-1", "z", big);
  ok(r.ok && r.applies && r.equal && r.nF === 1 && r.nG === 1, "z vs z−1 on |z|=2 → both 1 zero");

  // Condition fails: |f−g| reaches |f| on γ, so the theorem doesn't apply
  r = Theorems.rouche("z^2", "z^2-4", "z", big);
  ok(r.ok && !r.applies, "z² vs z²−4 on |z|=2 → condition fails (ratio ≥ 1)", `maxRatio ${r.maxRatio && r.maxRatio.toFixed(3)}`);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);