"use strict";
/* ode-solver.js verification — Phase 1 of the ODE engine redesign.
   detectOrder and verifyNthOrder are pure JS (no Pyodide), so they're fully Node-testable.
   ODESolver.solve itself calls SympyClient, which needs a real Worker + Pyodide — it is NOT
   unit tested here; it's verified manually in a browser (see the plan's Task 9). */

const path = require("path");
const math = require(path.join(__dirname, "..", "assets", "vendor", "math.min.js"));
global.math = math; // ode-solver.js expects a global `math`, matching every other page module
const ODESolver = require(path.join(__dirname, "..", "assets", "js", "ode-solver.js"));

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

console.log("detectOrder:");
ok(ODESolver.detectOrder("y' = x*y") === 1, "first-order detected");
ok(ODESolver.detectOrder("y'' + 3*y' + 2*y = 0") === 2, "second-order detected (max prime run)");
ok(ODESolver.detectOrder("y''' - y = x") === 3, "third-order detected");
ok(ODESolver.detectOrder("2*x + 3 = 0") === 0, "no derivative -> order 0");

console.log("\ncompileRealFx — exported for reuse by ode-systems.js:");
ok(typeof ODESolver.compileRealFx === "function", "compileRealFx is exported");
const compiled = ODESolver.compileRealFx("t^2 + 1");
ok(compiled.ok && compiled.fn({ t: 3 }) === 10, "compiled expression evaluates correctly");

console.log("\ntoPlaceholdersGeneral — exported for reuse by laplace-engine.js:");
ok(typeof ODESolver.toPlaceholdersGeneral === "function", "toPlaceholdersGeneral is exported");
ok(ODESolver.toPlaceholdersGeneral("y'' + 3*y' + 2*y") === "Y2 + 3*Y1 + 2*Y0", "converts y, y', y'' to Y0, Y1, Y2");

console.log("\nverifyNthOrder — accepts genuinely correct candidates:");
ok(ODESolver.verifyNthOrder("C1*exp(x)", "y' = y", 1), "y=C1*e^x satisfies y'=y");
ok(ODESolver.verifyNthOrder("C1*sin(x) + C2*cos(x)", "y'' + y = 0", 2), "y=C1 sin x + C2 cos x satisfies y''+y=0");
ok(ODESolver.verifyNthOrder("C1*exp(x) + C2*exp(2*x)", "y'' - 3*y' + 2*y = 0", 2), "known 2nd-order homogeneous solution verifies");

console.log("\nverifyNthOrder — rejects wrong candidates:");
ok(!ODESolver.verifyNthOrder("C1*exp(2*x)", "y' = y", 1), "y=C1*e^(2x) does NOT satisfy y'=y");
ok(!ODESolver.verifyNthOrder("C1*exp(x)", "y'' + y = 0", 2), "y=C1*e^x does NOT satisfy y''+y=0");

console.log("\nverifyNthOrderAt / DEFAULT_SAMPLE_X — custom sample points, regression-tested against the actual bug found in Phase 3:");
ok(typeof ODESolver.verifyNthOrderAt === "function", "verifyNthOrderAt is exported");
ok(Array.isArray(ODESolver.DEFAULT_SAMPLE_X) && ODESolver.DEFAULT_SAMPLE_X.length >= 5, "DEFAULT_SAMPLE_X is exported");
ok(ODESolver.verifyNthOrder("C1*exp(x)", "y' = y", 1) === ODESolver.verifyNthOrderAt("C1*exp(x)", "y' = y", 1, ODESolver.DEFAULT_SAMPLE_X),
  "verifyNthOrder(...) === verifyNthOrderAt(..., DEFAULT_SAMPLE_X) — no behavior change for the default case");
{
  // The default sample points never exceed ~2.13, so for y''+y=Heaviside(x-3) every one of them
  // sits before the jump — a candidate that's identically 0 trivially satisfies y''+y=0 there
  // (matching the homogeneous pre-jump behavior) and "verifies" with the default points, even
  // though it does NOT satisfy y''+y=1 anywhere past x=3. Note this is a genuinely ODE-violating
  // candidate (unlike "(1-cos(x))*Heaviside(x-3)", which — despite being the WRONG particular
  // solution for these initial conditions — still legitimately satisfies the differential
  // equation everywhere via a different combination of the homogeneous basis; pointwise
  // ODE-substitution can never catch that specific kind of error, which is exactly why
  // laplace-engine.js's verifyIvpTrajectory exists — see its own tests).
  const eq = "y'' + y = Heaviside(x-3)";
  const correct = "(1 - cos(x-3)) * Heaviside(x-3)";
  const wrong = "0";
  ok(ODESolver.verifyNthOrder(correct, eq, 2), "sanity: the correct answer verifies with the default points");
  ok(ODESolver.verifyNthOrder(wrong, eq, 2), "confirms the gap: y=0 ALSO verifies with the default points (false positive — never tests past the jump)");
  const jumpAwarePoints = [2.3, 2.7, 3.3, 3.8, 4.5, 5.2];
  ok(ODESolver.verifyNthOrderAt(correct, eq, 2, jumpAwarePoints), "correct answer still verifies with points straddling the jump");
  ok(!ODESolver.verifyNthOrderAt(wrong, eq, 2, jumpAwarePoints), "y=0 is REJECTED once sample points actually cover past the jump, where it doesn't satisfy the ODE");
}

console.log("\nwithArbitraryConstants — regression: every constant gets a genuinely distinct value:");
// The original bug: C1 and C2 had distinct values, but every C3, C4, C5, ... collapsed to the
// SAME value (0.5417). This can't be proven indirectly through ODE-verification behavior — for
// a linear homogeneous ODE, any linear combination of the solution basis satisfies the ODE
// regardless of whether two coefficients happen to be numerically equal, so an ODE-based
// "wrong candidate" test can never actually fail on this. Testing the substitution function's
// own output directly is the correct, precise regression test for this specific bug.
const substituted = [1, 2, 3, 4, 5, 6].map((n) => ODESolver.withArbitraryConstants(`C${n}`));
const distinctCount = new Set(substituted).size;
ok(distinctCount === 6, "C1 through C6 all substitute to distinct values", substituted.join(", "));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
