"use strict";
/* laplace-engine.js verification — Phase 3 of the ODE engine redesign.
   extractLinearCoeffs, verifyTransformPair, and verifyConvolution are pure JS (no Pyodide), so
   they're fully Node-testable. transformOf/inverseOf/solveIvp/convolutionOf themselves call
   SympyClient, which needs a real Worker + Pyodide — NOT unit tested here; verified manually in
   a browser (see the plan's Task 9). */

const path = require("path");
const math = require(path.join(__dirname, "..", "assets", "vendor", "math.min.js"));
global.math = math; // ode-solver.js and laplace-engine.js both expect a global `math`
const ODESolver = require(path.join(__dirname, "..", "assets", "js", "ode-solver.js"));
const Algorithms = require(path.join(__dirname, "..", "assets", "js", "algorithms.js"));
global.ODESolver = ODESolver;
global.Algorithms = Algorithms;
const LaplaceEngine = require(path.join(__dirname, "..", "assets", "js", "laplace-engine.js"));

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

console.log("extractLinearCoeffs — accepts constant-coefficient linear equations:");
{
  const r = LaplaceEngine.extractLinearCoeffs("y'' + 3*y' + 2*y = 0");
  ok(r.ok && r.order === 2, "detects order 2");
  ok(r.ok && JSON.stringify(r.coeffs) === JSON.stringify([1, 3, 2]), "extracts [a2,a1,a0] = [1,3,2]", JSON.stringify(r.coeffs));
  ok(r.ok && r.rhsText.trim() === "0", "rhs is 0");
}
{
  const r = LaplaceEngine.extractLinearCoeffs("y' = -2*y + DiracDelta(x-1)");
  ok(r.ok && r.order === 1, "handles y' = ... form (order 1)");
  ok(r.ok && JSON.stringify(r.coeffs) === JSON.stringify([1, 2]), "extracts [a1,a0] = [1,2] (rearranged to y'+2y=...)", JSON.stringify(r.coeffs));
}
{
  const r = LaplaceEngine.extractLinearCoeffs("y''' - y = 0");
  ok(r.ok && r.order === 3 && JSON.stringify(r.coeffs) === JSON.stringify([1, 0, 0, -1]), "order-3 equation extracts correctly", JSON.stringify(r && r.coeffs));
}

console.log("\nextractLinearCoeffs — refuses non-constant-coefficient / nonlinear input:");
ok(!LaplaceEngine.extractLinearCoeffs("x*y'' + y = 0").ok, "variable-coefficient equation refused");
ok(!LaplaceEngine.extractLinearCoeffs("y'' + y^2 = 0").ok, "nonlinear equation refused");
ok(!LaplaceEngine.extractLinearCoeffs("2*x + 3 = 0").ok, "no derivative term refused");

console.log("\nextractLinearCoeffs — isolates the forcing (rhsText) with no stray unknown y:");
{
  // y-terms typed on the RHS get moved to the LHS; only the true forcing survives in rhsText.
  const r = LaplaceEngine.extractLinearCoeffs("y' = -2*y + DiracDelta(x-1)");
  ok(r.ok && r.rhsText.includes("DiracDelta") && !/\by\b/.test(r.rhsText), "DiracDelta forcing survives, no stray y", r.rhsText);
}
{
  const r = LaplaceEngine.extractLinearCoeffs("y'' + 4*y = Heaviside(x-1)");
  ok(r.ok && r.rhsText.includes("Heaviside") && !/\by\b/.test(r.rhsText), "Heaviside forcing survives, no stray y", r.rhsText);
}

console.log("\nverifyTransformPair — accepts a genuinely correct pair:");
ok(LaplaceEngine.verifyTransformPair("exp(-2*x)", "1/(s+2)"), "L{e^-2x} = 1/(s+2)");
ok(LaplaceEngine.verifyTransformPair("x^2", "2/s^3"), "L{x^2} = 2/s^3");
ok(LaplaceEngine.verifyTransformPair("Heaviside(x-2)", "exp(-2*s)/s"), "L{Heaviside(x-2)} = e^-2s/s (jump discontinuity)");

console.log("\nverifyTransformPair — rejects a wrong pair:");
ok(!LaplaceEngine.verifyTransformPair("exp(-2*x)", "1/(s+3)"), "e^-2x does NOT transform to 1/(s+3)");
ok(!LaplaceEngine.verifyTransformPair("x^2", "1/s^3"), "x^2 does NOT transform to 1/s^3 (missing factor of 2)");

console.log("\nformatEqAsEquation — Python's str(sp.Eq(...)) rendered as a real LaTeX equation, not a literal Eq(...) call:");
{
  const out = LaplaceEngine.formatEqAsEquation("Eq(Y*s^2 + 3*Y*s + 2*Y - s - 3, 0)");
  ok(!out.includes("Eq(") && !out.includes("\\mathrm{Eq}"), "no literal Eq(...) wrapper survives", out);
  ok(out.includes("=") && out.includes("\\cdot") && out.includes("^{2}"), "renders as real LaTeX (cdot, superscript) joined by =", out);
}
{
  // Commas INSIDE nested calls on both sides must not confuse the top-level split.
  const out = LaplaceEngine.formatEqAsEquation("Eq(f(x, y), g(a, b, c))");
  ok(out.split(" = ").length === 2, "splits at the top-level comma, not one inside a nested call", out);
}
ok(LaplaceEngine.formatEqAsEquation("not an Eq at all").length > 0, "non-Eq text still returns something renderable, never throws");

console.log("\nextractDiracImpulses:");
{
  const r = LaplaceEngine.extractDiracImpulses("DiracDelta(x-2)");
  ok(r.length === 1 && r[0].location === 2 && r[0].magnitude === 1, "bare DiracDelta(x-2) -> location 2, magnitude 1", JSON.stringify(r));
}
{
  const r = LaplaceEngine.extractDiracImpulses("3*DiracDelta(x+1)");
  ok(r.length === 1 && r[0].location === -1 && r[0].magnitude === 3, "3*DiracDelta(x+1) -> location -1, magnitude 3", JSON.stringify(r));
}

console.log("\nverifyIvpTrajectory — regression-tested against the exact wrong answers found in Phase 3:");
ok(LaplaceEngine.verifyIvpTrajectory([1, 3, 2], "0", [1, 0], 2, "(2*exp(x) - 1)*exp(-2*x)"), "homogeneous correct answer accepted");
ok(!LaplaceEngine.verifyIvpTrajectory([1, 3, 2], "0", [1, 0], 2, "exp(-x)"), "homogeneous wrong answer rejected");
ok(LaplaceEngine.verifyIvpTrajectory([1, 0, 1], "Heaviside(x-3)", [0, 0], 2, "(1 - cos(x-3)) * Heaviside(x-3)"), "step-forcing correct answer accepted");
ok(!LaplaceEngine.verifyIvpTrajectory([1, 0, 1], "Heaviside(x-3)", [0, 0], 2, "(1 - cos(x)) * Heaviside(x-3)"),
  "step-forcing WRONG answer (the exact Phase 3 bug — missing the x-3 shift) is REJECTED");
ok(LaplaceEngine.verifyIvpTrajectory([1, 0, 4], "DiracDelta(x-2)", [0, 0], 2, "sin(2*x-4)*Heaviside(x-2)/2"), "impulse-forcing correct answer accepted");
ok(!LaplaceEngine.verifyIvpTrajectory([1, 0, 4], "DiracDelta(x-2)", [0, 0], 2, "sin(x)^2 * DiracDelta(x-2) / 2"),
  "impulse-forcing WRONG answer (the exact Phase 3 bug — unresolved DiracDelta) is REJECTED");
ok(LaplaceEngine.verifyIvpTrajectory([1, 0, 0, -1], "0", [1, 0, 0], 3, "exp(x)/3 + 2*exp(-x/2)*cos(sqrt(3)*x/2)/3"), "3rd-order correct answer accepted");

console.log("\nverifyConvolution:");
// f=e^-x, g=sin(x) -> (f*g)(x) = (e^-x - cos(x) + sin(x)) / 2 (textbook identity)
ok(LaplaceEngine.verifyConvolution("exp(-x)", "sin(x)", "(exp(-x) - cos(x) + sin(x)) / 2"), "correct convolution closed form accepted");
ok(!LaplaceEngine.verifyConvolution("exp(-x)", "sin(x)", "exp(-x)"), "wrong convolution closed form rejected");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);