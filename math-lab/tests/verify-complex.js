"use strict";
const path = require("path");
const Complex = require(path.join(__dirname, "..", "assets", "js", "complex.js"));

let pass = 0;
let fail = 0;

function approx(actual, expected, tol, label) {
  const ok = Number.isFinite(actual) && Math.abs(actual - expected) < tol;
  if (ok) { pass++; console.log(`  ok    ${label}: ${actual} ≈ ${expected}`); }
  else { fail++; console.error(`  FAIL  ${label}: got ${actual}, expected ≈ ${expected} (tol ${tol})`); }
  return ok;
}
function eqC(actual, expected, label, tol = 1e-9) {
  const ok = Complex.equals(actual, expected, tol);
  if (ok) { pass++; console.log(`  ok    ${label}: ${Complex.format(actual, 6)}`); }
  else { fail++; console.error(`  FAIL  ${label}: got (${actual.re}, ${actual.im}), expected (${expected.re}, ${expected.im})`); }
  return ok;
}
function eq(actual, expected, label) {
  const ok = String(actual) === String(expected);
  if (ok) { pass++; console.log(`  ok    ${label}: ${actual}`); }
  else { fail++; console.error(`  FAIL  ${label}: got ${actual}, expected ${expected}`); }
  return ok;
}
function throws(fn, label) {
  try { fn(); fail++; console.error(`  FAIL  ${label}: expected throw, got none`); }
  catch (e) { pass++; console.log(`  ok    ${label}: threw "${e.message}"`); }
}

console.log("Complex Analysis — foundation (complex.js)\n");

const I = { re: 0, im: 1 };

// --- arithmetic ---
console.log("arithmetic");
eqC(Complex.mul(I, I), { re: -1, im: 0 }, "i·i = -1");
eqC(Complex.mul({ re: 1, im: 1 }, { re: 1, im: 1 }), { re: 0, im: 2 }, "(1+i)² = 2i");
eqC(Complex.div({ re: 1, im: 0 }, I), { re: 0, im: -1 }, "1/i = -i");
eqC(Complex.div({ re: 3, im: 4 }, { re: 1, im: 2 }), { re: 2.2, im: -0.4 }, "(3+4i)/(1+2i) = 2.2 - 0.4i");
eqC(Complex.conj({ re: 3, im: 4 }), { re: 3, im: -4 }, "conj(3+4i) = 3-4i");
throws(() => Complex.div({ re: 1, im: 1 }, { re: 0, im: 0 }), "division by zero throws");

// --- modulus & argument ---
console.log("\nmodulus & argument");
approx(Complex.abs({ re: 3, im: 4 }), 5, 1e-12, "|3+4i| = 5");
approx(Complex.arg({ re: 1, im: 1 }), Math.PI / 4, 1e-12, "arg(1+i) = π/4");
approx(Complex.arg({ re: -1, im: 0 }), Math.PI, 1e-12, "arg(-1) = π (principal branch)");
approx(Complex.arg({ re: 0, im: -1 }), -Math.PI / 2, 1e-12, "arg(-i) = -π/2");

// --- polar round-trip ---
console.log("\npolar");
{
  const z = { re: -2, im: 3 };
  const { r, theta } = Complex.toPolar(z);
  eqC(Complex.fromPolar(r, theta), z, "fromPolar(toPolar(z)) round-trips");
}

// --- exp / log ---
console.log("\nexp & log");
eqC(Complex.exp({ re: 0, im: Math.PI }), { re: -1, im: 0 }, "e^{iπ} = -1 (Euler's identity)", 1e-12);
eqC(Complex.exp({ re: 0, im: Math.PI / 2 }), { re: 0, im: 1 }, "e^{iπ/2} = i", 1e-12);
{
  // log and exp are inverse on the principal branch for args in (-π, π]
  const z = { re: 2, im: -1 };
  eqC(Complex.exp(Complex.log(z)), z, "exp(log(z)) = z on principal branch");
}
throws(() => Complex.log({ re: 0, im: 0 }), "log(0) throws");

// --- powInt / De Moivre ---
console.log("\npowInt (De Moivre)");
eqC(Complex.powInt(I, 2), { re: -1, im: 0 }, "i² = -1");
eqC(Complex.powInt(I, 4), { re: 1, im: 0 }, "i⁴ = 1");
eqC(Complex.powInt({ re: 1, im: 1 }, 8), { re: 16, im: 0 }, "(1+i)⁸ = 16");
eqC(Complex.powInt(I, -1), { re: 0, im: -1 }, "i⁻¹ = -i");
throws(() => Complex.powInt(I, 0.5), "powInt with fractional exponent throws");

// --- nth roots / roots of unity ---
console.log("\nnth roots");
{
  const cubeRootsOf1 = Complex.rootsOfUnity(3);
  eq(cubeRootsOf1.length, 3, "3 cube roots of unity");
  eqC(cubeRootsOf1[0], { re: 1, im: 0 }, "principal cube root of unity is 1");
  // each root^3 must equal 1
  for (let k = 0; k < 3; k++) {
    eqC(Complex.powInt(cubeRootsOf1[k], 3), { re: 1, im: 0 }, `(root ${k})³ = 1`);
  }
  // they sum to zero (roots of unity always do for n ≥ 2)
  const sum = cubeRootsOf1.reduce((s, z) => Complex.add(s, z), { re: 0, im: 0 });
  eqC(sum, { re: 0, im: 0 }, "cube roots of unity sum to 0", 1e-9);
}
{
  // nth roots of a non-unit: the two square roots of 2i are ±(1+i)
  const rts = Complex.nthRoots({ re: 0, im: 2 }, 2);
  eq(rts.length, 2, "2 square roots of 2i");
  for (const r of rts) eqC(Complex.powInt(r, 2), { re: 0, im: 2 }, "square root squared = 2i");
}
throws(() => Complex.nthRoots(I, 0), "nthRoots with n=0 throws");

// --- logBranch / powBranch / pow (Phase 2 — branches) ---
console.log("\nlogBranch, powBranch, pow — multivaluedness");
{
  const z = { re: -2, im: 3 };
  eqC(Complex.logBranch(z, 0), Complex.log(z), "logBranch k=0 is the principal log");
  const b1 = Complex.logBranch(z, 1);
  approx(b1.im - Complex.log(z).im, 2 * Math.PI, 1e-12, "logBranch k=1 differs from principal by exactly 2π");
  for (const k of [-2, -1, 0, 1, 2]) {
    eqC(Complex.exp(Complex.logBranch(z, k)), z, `e^(logBranch k=${k}) recovers z — every branch is a genuine logarithm`);
  }
}
{
  // powBranch at integer w: every branch collapses to the same value — this is exactly why
  // integer powers need no branch cut at all.
  const z = { re: 1, im: 1 };
  const principal = Complex.powBranch(z, { re: 3, im: 0 }, 0);
  eqC(principal, Complex.powInt(z, 3), "powBranch(z,3,0) matches powInt(z,3)");
  for (const k of [-2, -1, 1, 2]) {
    eqC(Complex.powBranch(z, { re: 3, im: 0 }, k), principal, `powBranch(z,3,k=${k}) collapses to the same value — integer exponents have no branch`);
  }
}
{
  // powBranch at w=1/n IS nthRoots — nth roots are branches of a fractional power, not a
  // separate concept (the point method #5 exists to make explicit).
  const z = { re: 0, im: 2 };
  const n = 5;
  const roots = Complex.nthRoots(z, n);
  for (let k = 0; k < n; k++) {
    eqC(Complex.powBranch(z, { re: 1 / n, im: 0 }, k), roots[k], `powBranch(z,1/${n},k=${k}) reproduces nthRoots(z,${n})[${k}] exactly`);
  }
}
{
  // The canonical "surprising" identity: i^i is real. exp(w*log(i)), log(i)=iπ/2 principal,
  // so i^i = exp(i·iπ/2) = exp(-π/2).
  const iPowI = Complex.pow({ re: 0, im: 1 }, { re: 0, im: 1 });
  eqC(iPowI, { re: Math.exp(-Math.PI / 2), im: 0 }, "i^i = e^(-π/2) (principal branch) — real despite i^i looking like it shouldn't be", 1e-9);
}
eqC(Complex.pow({ re: 4, im: 0 }, { re: 0.5, im: 0 }), { re: 2, im: 0 }, "4^0.5 = 2 (principal square root of a positive real)");

// --- formatting ---
console.log("\nformat");
eq(Complex.format({ re: 3, im: 4 }), "3 + 4i", "format 3+4i");
eq(Complex.format({ re: 3, im: -4 }), "3 - 4i", "format 3-4i");
eq(Complex.format({ re: 0, im: 1 }), "i", "format i (unit imaginary, no coefficient)");
eq(Complex.format({ re: 0, im: -1 }), "-i", "format -i");
eq(Complex.format({ re: 5, im: 0 }), "5", "format real 5");
eq(Complex.format({ re: 0, im: 0 }), "0", "format 0");
eq(Complex.format({ re: -0, im: 2 }), "2i", "format 2i (drops -0 real part)");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
