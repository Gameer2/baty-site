"use strict";
/* ode-systems.js verification — Phase 2 of the ODE engine redesign.
   verifySystem, classifyEquilibrium2D, stabilityFromEigenvalues, and rk4System are pure JS (no
   Pyodide), so they're fully Node-testable. ODESystems.solve itself calls SympyClient, which
   needs a real Worker + Pyodide — it is NOT unit tested here; it's verified manually in a
   browser (see the plan's Task 9). */

const path = require("path");
const math = require(path.join(__dirname, "..", "assets", "vendor", "math.min.js"));
global.math = math; // ode-solver.js and ode-systems.js both expect a global `math`
const ODESolver = require(path.join(__dirname, "..", "assets", "js", "ode-solver.js"));
const LinAlg = require(path.join(__dirname, "..", "assets", "js", "linalg-algorithms.js"));
global.ODESolver = ODESolver;
global.LinAlg = LinAlg;
const ODESystems = require(path.join(__dirname, "..", "assets", "js", "ode-systems.js"));

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

console.log("verifySystem — accepts a genuinely correct candidate:");
// x' = [[0,1],[-1,0]] x, x(0)=[1,0] -> x1=cos t, x2=-sin t
ok(ODESystems.verifySystem(["C1*cos(t) - C2*sin(t)", "-C1*sin(t) - C2*cos(t)"], [[0, 1], [-1, 0]], ["0", "0"]),
  "x1=cos t (as C1 cos - C2 sin), x2=-sin t satisfies x'=[[0,1],[-1,0]]x");

console.log("\nverifySystem — rejects a wrong candidate:");
ok(!ODESystems.verifySystem(["C1*exp(t)", "C2*exp(t)"], [[0, 1], [-1, 0]], ["0", "0"]),
  "x1=x2=e^t does NOT satisfy x'=[[0,1],[-1,0]]x");

console.log("\nverifySystem — accounts for a nonzero forcing term g(t):");
// x' = [[0]] x + [t] i.e. dx/dt = t -> x = t^2/2 + C1
ok(ODESystems.verifySystem(["t^2/2 + C1"], [[0]], ["t"]), "x = t^2/2 + C1 satisfies x' = t");
ok(!ODESystems.verifySystem(["C1"], [[0]], ["t"]), "x = C1 does NOT satisfy x' = t");

console.log("\nclassifyEquilibrium2D — the five standard equilibrium types:");
ok(ODESystems.classifyEquilibrium2D([[-1, 0], [0, -2]]).type === "node", "distinct negative real eigenvalues -> node (stable)");
ok(ODESystems.classifyEquilibrium2D([[-1, 0], [0, -2]]).stability === "asymptotically stable", "stable node is asymptotically stable");
ok(ODESystems.classifyEquilibrium2D([[1, 0], [0, 2]]).stability === "unstable", "distinct positive real eigenvalues -> unstable node");
ok(ODESystems.classifyEquilibrium2D([[1, 0], [0, -1]]).type === "saddle", "opposite-sign real eigenvalues -> saddle");
ok(ODESystems.classifyEquilibrium2D([[0, 1], [-1, 0]]).type === "center", "purely imaginary eigenvalues -> center");
ok(ODESystems.classifyEquilibrium2D([[-0.5, 1], [-1, -0.5]]).type === "spiral", "complex eigenvalues with negative real part -> spiral");
ok(ODESystems.classifyEquilibrium2D([[-0.5, 1], [-1, -0.5]]).stability === "asymptotically stable", "stable spiral is asymptotically stable");
ok(ODESystems.classifyEquilibrium2D([[-1, 0], [0, -1]]).type === "star node", "repeated eigenvalue, diagonalizable (A = -I) -> star node");
ok(ODESystems.classifyEquilibrium2D([[-1, 1], [0, -1]]).type === "improper node", "repeated eigenvalue, defective -> improper node");

console.log("\nstabilityFromEigenvalues — the general n-dimensional read (n=2 and n=3):");
ok(ODESystems.stabilityFromEigenvalues([[-1, 0], [0, -2]]).stability === "asymptotically stable", "n=2 all-negative -> asymptotically stable");
ok(ODESystems.stabilityFromEigenvalues([[1, 0], [0, -1]]).stability === "saddle-type", "n=2 mixed sign -> saddle-type");
ok(ODESystems.stabilityFromEigenvalues([[-1, 0, 0], [0, -2, 0], [0, 0, -3]]).stability === "asymptotically stable", "n=3 all-negative -> asymptotically stable");
ok(ODESystems.stabilityFromEigenvalues([[1, 0, 0], [0, 2, 0], [0, 0, 3]]).stability === "unstable", "n=3 all-positive -> unstable");
ok(ODESystems.stabilityFromEigenvalues([[1, 0, 0], [0, -2, 0], [0, 0, -3]]).stability === "saddle-type", "n=3 mixed sign -> saddle-type");

console.log("\nrk4System:");
{
  // x' = [[0,1],[-1,0]] x, x(0)=[1,0] -> exact x1(t)=cos t, x2(t)=-sin t
  const traj = ODESystems.rk4System([[0, 1], [-1, 0]], null, [1, 0], 0.01, 200);
  ok(traj.length === 201, "returns steps+1 points");
  const end = traj[traj.length - 1];
  ok(Math.abs(end.t - 2) < 1e-9, "final t is steps*h");
  ok(Math.abs(end.x[0] - Math.cos(2)) < 1e-6, "x1 endpoint matches cos(t)", `got=${end.x[0]}, exact=${Math.cos(2)}`);
  ok(Math.abs(end.x[1] - (-Math.sin(2))) < 1e-6, "x2 endpoint matches -sin(t)", `got=${end.x[1]}, exact=${-Math.sin(2)}`);
}
{
  // x' = [0]x + [1] (i.e. dx/dt = 1), x(0)=[0] -> exact x(t) = t
  const traj = ODESystems.rk4System([[0]], () => [1], [0], 0.1, 10);
  const end = traj[traj.length - 1];
  ok(Math.abs(end.x[0] - 1) < 1e-9, "forced scalar case x'=1, x(0)=0 gives x(1)=1");
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
