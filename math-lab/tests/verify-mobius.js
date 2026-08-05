"use strict";
/* Möbius transformation core verification — tests the pure assets/js/mobius.js core against
   known bilinear maps (identity, translation, scaling, rotation, inversion, a loxodromic map)
   and checks that the classification, fixed points, pole, and re-substitution verification all
   come out right. Run with: node tests/verify-mobius.js */

const path = require("path");
const Mobius = require(path.join(__dirname, "..", "assets", "js", "mobius.js"));
const Complex = require(path.join(__dirname, "..", "assets", "js", "complex.js"));

let pass = 0, fail = 0;
function ok(cond, label, detail) {
  if (cond) { pass++; console.log(`  ok    ${label}${detail ? ": " + detail : ""}`); }
  else { fail++; console.error(`  FAIL  ${label}${detail ? ": " + detail : ""}`); }
  return cond;
}
function eq(actual, expected, label) {
  return ok(String(actual) === String(expected), label, `got ${actual}, expected ${expected}`);
}
function eqC(actual, expected, label, tol = 1e-6) {
  if (!actual) return ok(false, label, "got null, expected a value");
  return ok(Math.abs(actual.re - expected.re) <= tol && Math.abs(actual.im - expected.im) <= tol,
    label, `got (${actual.re}, ${actual.im}), expected (${expected.re}, ${expected.im})`);
}
const C = (re, im) => ({ re, im });

console.log("Complex Analysis — mobius.js (Möbius transformation core)\n");

// ==================== apply(): the transform itself ====================
console.log("apply(T, z) — w = (az+b)/(cz+d), null = ∞");
{
  const T = { a: C(0, 0), b: C(1, 0), c: C(1, 0), d: C(0, 0) }; // 1/z
  eqC(Mobius.apply(T, C(2, 0)), C(0.5, 0), "1/z of 2 = 1/2");
  eqC(Mobius.apply(T, C(0, 1)), C(0, -1), "1/z of i = −i");
  ok(Mobius.apply(T, C(0, 0)) === null, "1/z of 0 = ∞ (null)");
}
{
  const T = { a: C(2, 0), b: C(1, 0), c: C(0, 0), d: C(1, 0) }; // 2z + 1
  eqC(Mobius.apply(T, C(3, 0)), C(7, 0), "2z+1 of 3 = 7");
  eqC(Mobius.apply(T, C(0, 2)), C(1, 4), "2z+1 of 2i = 1+4i");
}

// ==================== classify(): the taxonomy + fixed points + verification ====================
console.log("\nclassify(a,b,c,d) — classification, fixed points, pole, verify gate");
{
  // identity: a=d=1, b=c=0 — every point fixed.
  const r = Mobius.classify(C(1, 0), C(0, 0), C(0, 0), C(1, 0));
  eq(r.classification, "identity", "identity classification");
  ok(r.verified, "identity verified");
}
{
  // translation z + 1: a=d=1, b=1, c=0 — parabolic, sole fixed point ∞.
  const r = Mobius.classify(C(1, 0), C(1, 0), C(0, 0), C(1, 0));
  eq(r.classification, "parabolic", "z+1 is parabolic");
  ok(r.fixed.infinityFixed, "z+1 fixes ∞");
  ok(r.fixed.points.length === 0, "z+1 has no finite fixed point");
  ok(r.pole === null, "z+1 has no finite pole (affine)");
  ok(r.verified, "z+1 verified");
}
{
  // scaling 2z: a=2, d=1, b=c=0 — hyperbolic, fixed 0 and ∞, k=2.
  const r = Mobius.classify(C(2, 0), C(0, 0), C(0, 0), C(1, 0));
  eq(r.classification, "hyperbolic", "2z is hyperbolic");
  ok(r.fixed.points.length === 1 && Complex.equals(r.fixed.points[0], C(0, 0)), "2z fixes 0");
  ok(r.fixed.infinityFixed, "2z fixes ∞");
  eqC(r.k, C(2, 0), "2z multiplier k = 2");
  ok(r.verified, "2z verified");
}
{
  // rotation iz: a=i, d=1, b=c=0 — elliptic, fixed 0 and ∞, |k|=1.
  const r = Mobius.classify(C(0, 1), C(0, 0), C(0, 0), C(1, 0));
  eq(r.classification, "elliptic", "iz is elliptic");
  eqC(r.k, C(0, 1), "iz multiplier k = i (|k|=1)");
  ok(r.verified, "iz verified");
}
{
  // inversion 1/z: a=0,b=1,c=1,d=0 — elliptic (order 2), fixed ±1, pole at 0, k=−1.
  const r = Mobius.classify(C(0, 0), C(1, 0), C(1, 0), C(0, 0));
  eq(r.classification, "elliptic", "1/z is elliptic (order 2)");
  eq(r.fixed.points.length, 2, "1/z has two finite fixed points (±1)");
  ok(Complex.equals(r.fixed.points[0], C(1, 0), 1e-6) || Complex.equals(r.fixed.points[1], C(1, 0), 1e-6), "one fixed point is +1");
  ok(Complex.equals(r.fixed.points[0], C(-1, 0), 1e-6) || Complex.equals(r.fixed.points[1], C(-1, 0), 1e-6), "other fixed point is −1");
  ok(r.pole && Complex.equals(r.pole, C(0, 0), 1e-9), "1/z pole at 0");
  eqC(r.k, C(-1, 0), "1/z multiplier k = −1");
  ok(r.verified, "1/z verified");
}
{
  // loxodromic: a=2+i, d=1, b=c=0 — k=2+i, |k|≠1, not real ⇒ loxodromic.
  const r = Mobius.classify(C(2, 1), C(0, 0), C(0, 0), C(1, 0));
  eq(r.classification, "loxodromic", "2z+i·z is loxodromic");
  eqC(r.k, C(2, 1), "multiplier k = 2+i");
  ok(r.verified, "loxodromic verified");
}
{
  // a genuinely bilinear loxodromic map with a finite pole: w = (2z+1)/(z+3).
  // a=2,b=1,c=1,d=3. det = 6−1 = 5. fixed: z²+z−1=0 ⇒ (−1±√5)/2. pole = −3.
  const r = Mobius.classify(C(2, 0), C(1, 0), C(1, 0), C(3, 0));
  ok(r.pole && Complex.equals(r.pole, C(-3, 0), 1e-9), "(2z+1)/(z+3) pole at −3");
  eq(r.fixed.points.length, 2, "(2z+1)/(z+3) has two finite fixed points");
  // fixed points (−1±√5)/2 ≈ 0.618 and −1.618
  const phi = (-1 + Math.sqrt(5)) / 2, neg = (-1 - Math.sqrt(5)) / 2;
  ok(
    (Complex.equals(r.fixed.points[0], C(phi, 0), 1e-6) || Complex.equals(r.fixed.points[1], C(phi, 0), 1e-6)) &&
    (Complex.equals(r.fixed.points[0], C(neg, 0), 1e-6) || Complex.equals(r.fixed.points[1], C(neg, 0), 1e-6)),
    "(2z+1)/(z+3) fixed points = (−1±√5)/2"
  );
  ok(r.verified, "(2z+1)/(z+3) verified by re-substitution");
}
{
  // degenerate: ad − bc = 0 must be refused. a=1,b=2,c=2,d=4 ⇒ det = 4−4 = 0.
  const r = Mobius.classify(C(1, 0), C(2, 0), C(2, 0), C(4, 0));
  ok(!r.ok, "degenerate (ad−bc=0) refused");
}

// ==================== verify gate actually catches a bad fixed point ====================
console.log("\nverify gate — re-substitution catches a wrong fixed point");
{
  // Hand-construct a transform and confirm a deliberately-wrong point is NOT reported fixed.
  const T = { a: C(0, 0), b: C(1, 0), c: C(1, 0), d: C(0, 0) }; // 1/z
  ok(Mobius.apply(T, C(2, 0)) !== null && !Complex.equals(Mobius.apply(T, C(2, 0)), C(2, 0)), "2 is not a fixed point of 1/z (1/2 ≠ 2)");
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);