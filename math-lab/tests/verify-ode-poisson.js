"use strict";
/* ode-poisson.js verification — Phase 5b of the ODE/PDE redesign.
   All of this module is pure JS (dense linear algebra + Simpson's rule) -- no Pyodide, no
   CAS-worker dependency -- fully Node-testable. */

const path = require("path");
const Algorithms = require(path.join(__dirname, "..", "assets", "js", "algorithms.js"));
const LinAlg = require(path.join(__dirname, "..", "assets", "js", "linalg-algorithms.js"));
global.Algorithms = Algorithms;
global.LinAlg = LinAlg;
const PoissonEngine = require(path.join(__dirname, "..", "assets", "js", "ode-poisson.js"));

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

console.log("buildGridSystem + LinAlg.jacobi — matches a known exact Poisson solution:");
{
  const a = 1, b = 1, M = 20;
  const uExact = (x, y) => Math.sin(Math.PI * x / a) * Math.sin(Math.PI * y / b);
  const source = (x, y) => -((Math.PI / a) ** 2 + (Math.PI / b) ** 2) * uExact(x, y);
  const { A, b: rhs, hx, hy } = PoissonEngine.buildGridSystem({ a, b, M, boundaryFn: () => 0, sourceFn: source });
  const result = LinAlg.jacobi(A, rhs, 1e-6, 3000);
  ok(result.converged, "Jacobi converges within the iteration budget");
  function U(i, j) { return result.solution[(i - 1) * (M - 1) + (j - 1)]; }
  const samples = [[0.3, 0.3], [0.5, 0.5], [0.7, 0.2]];
  let maxErr = 0;
  for (const [x, y] of samples) {
    const i = Math.round(x / hx), j = Math.round(y / hy);
    maxErr = Math.max(maxErr, Math.abs(U(i, j) - uExact(x, y)));
  }
  ok(maxErr < 5e-3, "numeric solution matches the known exact solution", `maxErr=${maxErr}`);
}

console.log("\ngridResidual:");
{
  // A trivially exact discrete solution: U[i][j] = 0 everywhere satisfies u_xx+u_yy=0 (Laplace).
  const M = 10, a = 1, b = 1, hx = a / M, hy = b / M;
  const U = Array.from({ length: M + 1 }, () => new Array(M + 1).fill(0));
  ok(PoissonEngine.gridResidual(U, M, hx, hy, () => 0), "all-zero grid satisfies Laplace's equation exactly");
  ok(!PoissonEngine.gridResidual(U, M, hx, hy, () => 5), "all-zero grid does NOT satisfy u_xx+u_yy=5");
}

console.log("\nlaplaceEdgeCoeffs + laplaceSeriesValue — matches Jacobi relaxation:");
{
  const a = 1, b = 1, N = 25, M = 20;
  function simpson(fn, lo, hi, n) {
    if (n % 2) n++;
    const h = (hi - lo) / n;
    let s = fn(lo) + fn(hi);
    for (let i = 1; i < n; i++) s += (i % 2 ? 4 : 2) * fn(lo + i * h);
    return (h / 3) * s;
  }
  const f = (x) => x * (a - x); // nonzero on the top edge (y=b)
  const coeffs = PoissonEngine.laplaceEdgeCoeffs({ a, b, edge: "top", fFn: f, N, simpsonIntegrate: simpson });
  const edges = { bottom: null, left: null, right: null, top: { coeffs } };

  const { A, b: rhs, hx, hy } = PoissonEngine.buildGridSystem({
    a, b, M,
    boundaryFn: (x, y) => (Math.abs(y - b) < 1e-9 ? f(x) : 0),
    sourceFn: () => 0,
  });
  const { U: flat, converged } = PoissonEngine.solveGrid(A, rhs, "jacobi");
  ok(converged, "Jacobi converges for the Laplace boundary-value problem");

  let maxErr = 0;
  for (const [x, y] of [[0.3, 0.3], [0.5, 0.5], [0.7, 0.2]]) {
    const i = Math.round(x / hx), j = Math.round(y / hy);
    const series = PoissonEngine.laplaceSeriesValue(edges, a, b, x, y);
    const relax = flat[(i - 1) * (M - 1) + (j - 1)];
    maxErr = Math.max(maxErr, Math.abs(series - relax));
  }
  ok(maxErr < 1e-3, "sinh-series matches relaxation", `maxErr=${maxErr}`);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);