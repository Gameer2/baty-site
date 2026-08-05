"use strict";
/* Numerical Engine — verification suite.
   Runs the exact same code the pages ship (assets/js/algorithms.js) against known
   textbook answers. Run with: node tests/verify.js
   Every method added to the site should get a case here — this is what stops a later
   change to engine-core.js/algorithms.js from silently breaking a method nobody
   happened to be looking at. */

const path = require("path");
const math = require(path.join(__dirname, "..", "assets", "vendor", "math.min.js"));
const Algorithms = require(path.join(__dirname, "..", "assets", "js", "algorithms.js"));

let pass = 0;
let fail = 0;

function approx(actual, expected, tol, label) {
  const ok = Number.isFinite(actual) && Math.abs(actual - expected) < tol;
  if (ok) {
    pass++;
    console.log(`  ok    ${label}: ${actual} ≈ ${expected}`);
  } else {
    fail++;
    console.error(`  FAIL  ${label}: got ${actual}, expected ≈ ${expected} (tol ${tol})`);
  }
  return ok;
}

function compile(exprStr) {
  const node = math.parse(exprStr);
  const code = node.compile();
  return { node, fn: (x) => code.evaluate({ x }) };
}

function derivativeOf(node) {
  const dnode = math.derivative(node, "x");
  const code = dnode.compile();
  return (x) => code.evaluate({ x });
}

console.log("Numerical Engine — verification suite\n");

// Bisection: x^3 - x - 2 = 0 on [1, 2] -> root ≈ 1.5213797068045676
{
  const { fn } = compile("x^3 - x - 2");
  const iters = Algorithms.runBisection(fn, 1, 2, 1e-9, 100);
  approx(iters[iters.length - 1].c, 1.5213797068045676, 1e-6, "Bisection root of x^3 - x - 2");
}

// Fixed-Point Iteration: g(x) = cos(x), x0 = 0.5 -> Dottie number ≈ 0.7390851332151607
{
  const { fn } = compile("cos(x)");
  const iters = Algorithms.runFixedPoint(fn, 0.5, 1e-9, 200);
  approx(iters[iters.length - 1].gx, 0.7390851332151607, 1e-6, "Fixed-point cos(x) → Dottie number");
}

// Newton-Raphson: x^2 - 2 = 0, x0 = 1 -> sqrt(2)
{
  const { node, fn } = compile("x^2 - 2");
  const fp = derivativeOf(node);
  const iters = Algorithms.runNewton(fn, fp, 1, 1e-12, 50);
  approx(iters[iters.length - 1].xNext, Math.sqrt(2), 1e-9, "Newton root of x^2 - 2 (√2)");
}

// Newton-Raphson: x^3 - x - 2 = 0, x0 = 1.5 -> same root as the Bisection case above,
// so this also cross-checks the two independent methods against each other.
{
  const { node, fn } = compile("x^3 - x - 2");
  const fp = derivativeOf(node);
  const iters = Algorithms.runNewton(fn, fp, 1.5, 1e-12, 50);
  approx(iters[iters.length - 1].xNext, 1.5213797068045676, 1e-9, "Newton root of x^3 - x - 2 (cross-check vs Bisection)");
}

// Secant Method: x^3 - x - 2 = 0, x0 = 1, x1 = 2 -> same root as Bisection/Newton above,
// cross-checking a third, derivative-free method against the other two.
{
  const { fn } = compile("x^3 - x - 2");
  const iters = Algorithms.runSecant(fn, 1, 2, 1e-12, 50);
  approx(iters[iters.length - 1].xNext, 1.5213797068045676, 1e-9, "Secant root of x^3 - x - 2 (cross-check)");
}

// Secant Method: x^2 - 2 = 0, x0 = 1, x1 = 1.5 -> sqrt(2)
{
  const { fn } = compile("x^2 - 2");
  const iters = Algorithms.runSecant(fn, 1, 1.5, 1e-12, 50);
  approx(iters[iters.length - 1].xNext, Math.sqrt(2), 1e-9, "Secant root of x^2 - 2 (√2)");
}

// Natural Cubic Spline: hand-derived from Burden & Faires Alg. 3.4 on (1,2),(2,3),(3,5) —
// solving the tridiagonal system gives c0=0, c1=0.75, c2=0 (natural boundary), so
// S0(x)=2+0.75(x-1)+0.25(x-1)^3 on [1,2] and S1(x)=3+1.5(x-2)+0.75(x-2)^2-0.25(x-2)^3 on [2,3].
{
  const points = [{ x: 1, y: 2 }, { x: 2, y: 3 }, { x: 3, y: 5 }];
  const segments = Algorithms.runCubicSpline(points);
  approx(Algorithms.evalCubicSpline(segments, 1.5), 2.40625, 1e-9, "Cubic spline S(1.5) on (1,2),(2,3),(3,5)");
  approx(Algorithms.evalCubicSpline(segments, 2.5), 3.90625, 1e-9, "Cubic spline S(2.5) on (1,2),(2,3),(3,5)");
}

// Natural Cubic Spline: collinear points (any spacing) must reproduce the line exactly —
// alpha_i = 0 for all i when the data is linear, so the natural-boundary solve forces
// every c_i = 0, collapsing every segment back to the straight line.
{
  const points = [{ x: 0, y: 1 }, { x: 1, y: 3 }, { x: 3, y: 7 }, { x: 4, y: 9 }]; // y = 2x + 1
  const segments = Algorithms.runCubicSpline(points);
  approx(Algorithms.evalCubicSpline(segments, 2), 5, 1e-9, "Cubic spline on collinear points (cross-check vs y=2x+1)");
}

// Natural Cubic Spline: interpolation property — S(x_i) must equal y_i exactly at every
// knot, including interior ones straddling two segments (checks segment-lookup boundary).
{
  const points = [{ x: 0, y: 0 }, { x: 1, y: 0.8415 }, { x: 2, y: 0.9093 }, { x: 3, y: 0.1411 }];
  const segments = Algorithms.runCubicSpline(points);
  approx(Algorithms.evalCubicSpline(segments, 2), 0.9093, 1e-9, "Cubic spline interpolation property at interior knot x=2");
}

// Trapezoidal Rule: x^2 on [0,1], n=4 -> hand-computable exact value (h=0.25).
// h/2*[f0 + 2(f1+f2+f3) + f4] = 0.125*[0 + 2*(0.0625+0.25+0.5625) + 1] = 0.34375
{
  const { fn } = compile("x^2");
  const result = Algorithms.runTrapezoidal(fn, 0, 1, 4);
  approx(result.total, 0.34375, 1e-12, "Trapezoidal x^2 on [0,1], n=4 (exact)");
}

// Trapezoidal Rule: e^x on [0,1], n=1000 -> converges to e - 1 (true integral).
{
  const { fn } = compile("e^x");
  const result = Algorithms.runTrapezoidal(fn, 0, 1, 1000);
  approx(result.total, Math.E - 1, 1e-6, "Trapezoidal e^x on [0,1], n=1000 (converges to e-1)");
}

// Simpson's 1/3 Rule: x^2 on [0,1], n=4 -> exact (Simpson's is exact through cubics).
{
  const { fn } = compile("x^2");
  const result = Algorithms.runSimpson(fn, 0, 1, 4, "13");
  approx(result.total, 1 / 3, 1e-12, "Simpson's 1/3 rule, x^2 on [0,1], n=4 (exact)");
}

// Simpson's 3/8 Rule: x^3 on [0,1], n=3 -> exact.
{
  const { fn } = compile("x^3");
  const result = Algorithms.runSimpson(fn, 0, 1, 3, "38");
  approx(result.total, 0.25, 1e-12, "Simpson's 3/8 rule, x^3 on [0,1], n=3 (exact)");
}

// Simpson's auto mode: x^3 on [0,1], n=5 (odd) -> hybrid of one 1/3 group + one 3/8
// tail group, still exact since both rules are exact for cubics regardless of grouping.
{
  const { fn } = compile("x^3");
  const result = Algorithms.runSimpson(fn, 0, 1, 5, "auto");
  approx(result.total, 0.25, 1e-9, "Simpson's auto mode (hybrid), x^3 on [0,1], n=5 (exact)");
  approx(result.panels.length, 2, 0.5, "Simpson's auto mode, n=5 produces 2 groups (one 1/3 + one 3/8)");
}

// Midpoint Riemann Sum: x^2 on [0,1] converges to 1/3 as n grows (this is the *definition*
// of the integral, so unlike Simpson's it is not exact at any finite n for a non-linear f).
{
  const { fn } = compile("x^2");
  const coarse = Algorithms.runRiemannSum(fn, 0, 1, 4);
  const fine = Algorithms.runRiemannSum(fn, 0, 1, 2000);
  approx(fine.total, 1 / 3, 1e-6, "Midpoint Riemann sum x^2 on [0,1], n=2000 (converges to 1/3)");
  approx(coarse.rectangles.length, 4, 0.5, "Midpoint Riemann sum reports one entry per rectangle");
  approx(coarse.width, 0.25, 1e-12, "Midpoint Riemann sum rectangle width, n=4 on [0,1]");
}

// Midpoint Riemann Sum: sin(x) on [0, pi] -> exact integral is 2. Midpoint rule with a
// moderate n should already be within a tight tolerance since sin is smooth.
{
  const { fn } = compile("sin(x)");
  const result = Algorithms.runRiemannSum(fn, 0, Math.PI, 500);
  approx(result.total, 2, 1e-4, "Midpoint Riemann sum sin(x) on [0,pi], n=500 (converges to 2)");
}

// Inverse Power Method: A = [[3.5,1.5],[1.5,3.5]] has eigenvalues 2 and 5 (trace=7,
// det=10=2*5). Starting from x0=[1,0], converges to the smallest eigenvalue, 2.
{
  const A = [[3.5, 1.5], [1.5, 3.5]];
  const iters = Algorithms.runInversePowerMethod(A, [1, 0], 1e-10, 100);
  const last = iters[iters.length - 1];
  approx(last.lambdaMin, 2, 1e-6, "Inverse power method smallest eigenvalue of [[3.5,1.5],[1.5,3.5]]");
}

// QR Algorithm: A = [[2,1],[1,2]] has eigenvalues 3 and 1. Unshifted QR algorithm
// converges (18 iterations to offNorm < 1e-8 for this matrix) with the larger eigenvalue
// settling in the top-left diagonal position.
{
  const A = [[2, 1], [1, 2]];
  const iters = Algorithms.runQRAlgorithm(A, 1e-8, 100);
  const last = iters[iters.length - 1];
  approx(last.diag[0], 3, 1e-6, "QR algorithm eigenvalue estimate (diagonal position 1) of [[2,1],[1,2]]");
  approx(last.diag[1], 1, 1e-6, "QR algorithm eigenvalue estimate (diagonal position 2) of [[2,1],[1,2]]");
}

// Shooting Method: y'' = -y, y(0)=0, y(pi/2)=1 -> exact solution y=sin(x).
// n=200 makes x=pi/4 land exactly on a step (step 100 of 200), so no interpolation
// is needed to check the midpoint value against sin(pi/4).
{
  const p = () => 0, q = () => -1, r = () => 0;
  const result = Algorithms.runShooting(p, q, r, 0, Math.PI / 2, 0, 1, 200);
  const atQuarterPi = result.path[100];
  approx(atQuarterPi.x, Math.PI / 4, 1e-9, "Shooting: step 100 of 200 lands exactly at pi/4");
  approx(atQuarterPi.y, Math.sin(Math.PI / 4), 1e-6, "Shooting y''=-y, y(0)=0,y(pi/2)=1 at x=pi/4 (-> sin(pi/4))");
}

// Muller's Method: x^3 - x - 2 = 0, x0=1, x1=1.5, x2=2 -> same root as Bisection/
// Newton/Secant above (1.5213797068045676), cross-checking a fourth independent method.
{
  const { fn } = compile("x^3 - x - 2");
  const iters = Algorithms.runMuller(fn, 1, 1.5, 2, 1e-12, 50);
  approx(iters[iters.length - 1].x3, 1.5213797068045676, 1e-9, "Muller root of x^3 - x - 2 (cross-check)");
}

// Power Method: A = [[2,1],[1,2]] has eigenvalues 3 and 1 (eigenvectors (1,1) and (1,-1)).
// Starting from x0=[1,0], the power method converges to the dominant eigenvalue 3.
{
  const A = [[2, 1], [1, 2]];
  const iters = Algorithms.runPowerMethod(A, [1, 0], 1e-10, 100);
  const last = iters[iters.length - 1];
  approx(last.mu, 3, 1e-6, "Power method dominant eigenvalue of [[2,1],[1,2]]");
  approx(last.xNext[0], 1, 1e-6, "Power method eigenvector x-component (normalized to 1)");
  approx(last.xNext[1], 1, 1e-6, "Power method eigenvector y-component ≈ x-component (eigenvector direction (1,1))");
}

// Finite-Difference BVP: y'' = -y, y(0)=0, y(pi/2)=1, n=10 -> deterministic FD solution;
// grid[5] is x=pi/4, compare loosely to the true sin(pi/4) too (O(h^2) discretization
// error is expected and part of the point).
{
  const p = () => 0, q = () => -1, r = () => 0;
  const result = Algorithms.runFiniteDifference(p, q, r, 0, Math.PI / 2, 0, 1, 10);
  approx(result.grid[5].x, Math.PI / 4, 1e-9, "FD-BVP: grid point 5 of 10 lands exactly at pi/4");
  approx(result.grid[5].w, 0.7076800249807215, 1e-9, "FD-BVP y''=-y, n=10, w at x=pi/4 (exact algorithm value)");
  approx(result.grid[5].w, Math.sin(Math.PI / 4), 1e-2, "FD-BVP y''=-y, n=10, w at x=pi/4 (loosely -> sin(pi/4), O(h^2) error)");
}

// Romberg Integration: e^x on [0,1], m=4 -> converges to e-1 far tighter than plain
// Trapezoidal at the same base n, thanks to Richardson extrapolation.
{
  const { fn } = compile("e^x");
  const result = Algorithms.runRomberg(fn, 0, 1, 4);
  approx(result.total, Math.E - 1, 1e-9, "Romberg e^x on [0,1], m=4 (extrapolated)");
}

// Romberg Integration: sin(x) on [0,pi], m=4 -> converges to the true integral, 2.
{
  const { fn } = compile("sin(x)");
  const result = Algorithms.runRomberg(fn, 0, Math.PI, 4);
  approx(result.total, 2, 1e-7, "Romberg sin(x) on [0,pi], m=4 (extrapolated)");
}

// Adaptive Quadrature: 4/(1+x^2) on [0,1] -> pi (a classic quadrature identity).
{
  const { fn } = compile("4 / (1 + x^2)");
  const result = Algorithms.runAdaptiveQuadrature(fn, 0, 1, 1e-9);
  approx(result.total, Math.PI, 1e-6, "Adaptive quadrature of 4/(1+x^2) on [0,1] (-> pi)");
}

// Newton's Method for Nonlinear Systems: F1 = x1^2 + x2^2 - 2, F2 = x1 - x2.
// Exact solution (1,1): 1^2+1^2-2=0, 1-1=0. From guess (1.5,1.5), converges to (1,1).
{
  const f1 = (v) => v[0] * v[0] + v[1] * v[1] - 2;
  const f2 = (v) => v[0] - v[1];
  const iters = Algorithms.runNewtonSystem([f1, f2], [1.5, 1.5], 1e-10, 50);
  const last = iters[iters.length - 1];
  approx(last.xNext[0], 1, 1e-6, "Newton system x1 -> 1 (root of x1^2+x2^2-2=0, x1-x2=0)");
  approx(last.xNext[1], 1, 1e-6, "Newton system x2 -> 1 (cross-check: x1 == x2 at the root)");
}

// Gauss-Legendre (2-point): x^3 on [0,1] -> exact (2-point rule is exact through degree 3).
{
  const { fn } = compile("x^3");
  const result = Algorithms.runGaussLegendre(fn, 0, 1, 2);
  approx(result.total, 0.25, 1e-12, "Gauss-Legendre 2-point, x^3 on [0,1] (exact)");
}

// Gauss-Legendre (3-point): x^4 on [-1,1] -> exact (3-point rule is exact through degree 5).
{
  const { fn } = compile("x^4");
  const result = Algorithms.runGaussLegendre(fn, -1, 1, 3);
  approx(result.total, 0.4, 1e-12, "Gauss-Legendre 3-point, x^4 on [-1,1] (exact)");
}

// Hermite Interpolation: f(x)=x^3 (f'=3x^2) at x=0,1 -> degree-3 Hermite polynomial
// must reproduce x^3 exactly everywhere (Hermite through 2 points is exact up to degree 3).
{
  const points = [{ x: 0, f: 0, fp: 0 }, { x: 1, f: 1, fp: 3 }];
  const { z, Q } = Algorithms.runHermite(points);
  approx(Algorithms.evalHermite(z, Q, 0.5), 0.125, 1e-9, "Hermite x^3 reproduction at x=0.5");
  approx(Algorithms.evalHermite(z, Q, 0.7), 0.343, 1e-9, "Hermite x^3 reproduction at x=0.7");
}

// Broyden's Method: same system as Newton's Method for Nonlinear Systems above —
// F1 = x1^2 + x2^2 - 2, F2 = x1 - x2, exact solution (1,1). Cross-checks Broyden's
// against Newton's system solver converging to the same root from the same guess.
{
  const f1 = (v) => v[0] * v[0] + v[1] * v[1] - 2;
  const f2 = (v) => v[0] - v[1];
  const iters = Algorithms.runBroyden([f1, f2], [1.5, 1.5], 1e-10, 100);
  const last = iters[iters.length - 1];
  approx(last.xNext[0], 1, 1e-6, "Broyden's method x1 -> 1 (cross-check vs Newton system)");
  approx(last.xNext[1], 1, 1e-6, "Broyden's method x2 -> 1 (cross-check vs Newton system)");
}

// False Position: x^3 - x - 2 = 0 on [1, 2] -> same known root as Bisection/Newton/Secant
// above, cross-checking a fourth independent method against the others. Converges to
// |f(c)| < 1e-9, which lands within ~1.5e-7 of the true root.
{
  const { fn } = compile("x^3 - x - 2");
  const iters = Algorithms.runFalsePosition(fn, 1, 2, 1e-9, 100);
  approx(iters[iters.length - 1].c, 1.5213797068045676, 1e-6, "False Position root of x^3 - x - 2 (cross-check)");
}

// Newton's Method for Multiple Roots: f(x) = (x-2)^2 = x^2 - 4x + 4 has a double root at x=2.
// Modified Newton: x_{n+1} = x_n - f(x_n)*f'(x_n) / (f'(x_n)^2 - f(x_n)*f''(x_n))
// converges quadratically to the double root (standard Newton would be linear).
// Test: start at x0=0, converge toward x=2 (stop before denominator collapses at the exact root).
{
  const { fn } = compile("(x - 2)^2");
  const { fn: fp } = compile("2*x - 4");
  const { fn: fpp } = compile("2");
  const iters = Algorithms.runNewtonMultiple(fn, fp, fpp, 0, 1e-6, 20);
  const last = iters[iters.length - 1];
  approx(last.xNext, 2, 1e-5, "Newton multiple roots -> 2 (double root of (x-2)^2)");
}

// Steffensen's Method: g(x) = cos(x), x0 = 0.5 -> Dottie number ≈ 0.7390851332151607
// Aitken acceleration: x̂ = x0 - (g(x0)-x0)^2 / (g(g(x0)) - 2g(x0) + x0)
{
  const { fn } = compile("cos(x)");
  const iters = Algorithms.runSteffensen(fn, 0.5, 1e-10, 50);
  approx(iters[iters.length - 1].x, 0.7390851332151607, 1e-6, "Steffensen's method cos(x) -> Dottie number");
}

// Horner's Method: p(x) = 2x^3 - 3x^2 + 4x - 5 at x=2 -> 2(8) - 3(4) + 4(2) - 5 = 16-12+8-5 = 7
// Also returns deflated coefficients for finding remaining roots.
{
  const coeffs = [2, -3, 4, -5]; // 2x^3 - 3x^2 + 4x - 5
  const result = Algorithms.runHorner(coeffs, 2);
  approx(result.value, 7, 1e-12, "Horner's method: p(2) = 7 for 2x^3 - 3x^2 + 4x - 5");
  // Deflated polynomial should be 2x^2 + x + 6 (check: (2x^3 - 3x^2 + 4x - 5) / (x-2) = 2x^2 + x + 6)
  approx(result.deflated[0], 2, 1e-12, "Horner deflated coeff [0]");
  approx(result.deflated[1], 1, 1e-12, "Horner deflated coeff [1]");
  approx(result.deflated[2], 6, 1e-12, "Horner deflated coeff [2]");
}

// Neville's Method: interpolate f(x) at given points using Neville's algorithm.
// For points (1,2), (2,3), (3,5), evaluate at x=2.5 -> should match Lagrange on same data.
{
  const points = [{ x: 1, y: 2 }, { x: 2, y: 3 }, { x: 3, y: 5 }];
  const result = Algorithms.runNeville(points, 2.5);
  // Hand-check: Lagrange gives L(2.5) = 2*(2.5-2)*(2.5-3)/((1-2)*(1-3)) + 3*(2.5-1)*(2.5-3)/((2-1)*(2-3)) + 5*(2.5-1)*(2.5-2)/((3-1)*(3-2))
  // = 2*(0.5)*(-0.5)/((-1)*(-2)) + 3*(1.5)*(-0.5)/(1*(-1)) + 5*(1.5)*(0.5)/(2*1)
  // = 2*(-0.25)/2 + 3*(-0.75)/(-1) + 5*(0.75)/2 = -0.25 + 2.25 + 1.875 = 3.875
  approx(result.value, 3.875, 1e-12, "Neville's method at x=2.5 for (1,2),(2,3),(3,5)");
}

// Newton's Divided-Difference: same points as Neville above, check consistency.
// The divided-difference table should give the same interpolating polynomial value.
{
  const points = [{ x: 1, y: 2 }, { x: 2, y: 3 }, { x: 3, y: 5 }];
  const result = Algorithms.runNewtonDD(points, 2.5);
  approx(result.value, 3.875, 1e-12, "Newton divided-difference at x=2.5 (cross-check vs Neville)");
}

// Numerical Differentiation: f(x) = sin(x) at x = π/4, true derivative = cos(π/4) = √2/2
// Forward difference: f'(x) ≈ (f(x+h) - f(x)) / h
// Central difference: f'(x) ≈ (f(x+h) - f(x-h)) / (2h) — O(h²) accurate
{
  const { fn } = compile("sin(x)");
  const result = Algorithms.runNumericalDiff(fn, Math.PI / 4, 0.001);
  approx(result.forward, Math.cos(Math.PI / 4), 1e-3, "Forward difference f'(π/4) for sin(x)");
  approx(result.central, Math.cos(Math.PI / 4), 1e-6, "Central difference f'(π/4) for sin(x)");
}

// Richardson Extrapolation: f(x) = sin(x) at x = π/4, estimate f'(π/4) = cos(π/4)
// Starting with central difference D(h), Richardson: D*(h) = (4*D(h/2) - D(h)) / 3
{
  const { fn } = compile("sin(x)");
  const result = Algorithms.runRichardsonDiff(fn, Math.PI / 4, 0.1);
  approx(result.richardson, Math.cos(Math.PI / 4), 1e-6, "Richardson extrapolation f'(π/4) for sin(x)");
}

// Discrete Least Squares: fit y = a + bx to points (0,1), (1,3), (2,5), (3,7) — exact line y=2x+1
// Normal equations: [n, Σx; Σx, Σx²][a; b] = [Σy; Σxy]
{
  const points = [{ x: 0, y: 1 }, { x: 1, y: 3 }, { x: 2, y: 5 }, { x: 3, y: 7 }];
  const result = Algorithms.runDiscreteLeastSquares(points, 1); // degree 1
  approx(result.coeffs[0], 1, 1e-10, "Least squares intercept a = 1");
  approx(result.coeffs[1], 2, 1e-10, "Least squares slope b = 2");
}

// Chebyshev Economization: reduce p(x) = x^4 on [-1,1] to degree 2.
// x^4 = (1/8)*T_4(x) + (1/2)*T_2(x) + (3/8)*T_0(x), so truncating T_4 gives:
// p_econ(x) = (1/2)*T_2(x) + (3/8)*T_0(x) = (1/2)*(2x^2-1) + (3/8) = x^2 - 1/8
{
  const coeffs = [0, 0, 0, 0, 1]; // x^4
  const result = Algorithms.runChebyshevEcon(coeffs, 2);
  // Check that economized polynomial is close to x^2 - 1/8
  approx(result.econCoeffs[0], -0.125, 1e-10, "Chebyshev economization constant term");
  approx(result.econCoeffs[2], 1, 1e-10, "Chebyshev economization x^2 coefficient");
}

// Chebyshev economization above degree 6 — regression test. The basis conversions were
// once hardcoded lookup tables capped at x^6/T_6, with the loop silently skipping any
// higher term, so this case returned all zeros instead of throwing. Both conversions are
// now generated from the Chebyshev recurrence, so there is no degree ceiling.
// x^8 = (35*T_0 + 56*T_2 + 28*T_4 + 8*T_6 + T_8)/128; dropping T_8 and expanding
// T_0=1, T_2=2x^2-1, T_4=8x^4-8x^2+1, T_6=32x^6-48x^4+18x^2-1 gives
// p_econ(x) = -1/128 + (1/4)x^2 - (5/4)x^4 + 2x^6.
{
  const coeffs = [0, 0, 0, 0, 0, 0, 0, 0, 1]; // x^8
  const result = Algorithms.runChebyshevEcon(coeffs, 6);
  approx(result.econCoeffs[0], -0.0078125, 1e-12, "Chebyshev deg-8 econ: constant term (-1/128)");
  approx(result.econCoeffs[2], 0.25, 1e-12, "Chebyshev deg-8 econ: x^2 coefficient");
  approx(result.econCoeffs[4], -1.25, 1e-12, "Chebyshev deg-8 econ: x^4 coefficient");
  approx(result.econCoeffs[6], 2, 1e-12, "Chebyshev deg-8 econ: x^6 coefficient");
}

// Chebyshev economization: truncating to degree >= the input degree must return the
// input unchanged (identity case), at a degree the old lookup tables could not reach.
{
  const coeffs = [1, -2, 3, 0, 0, 5, 0, 1]; // degree 7
  const result = Algorithms.runChebyshevEcon(coeffs, 7);
  approx(result.econCoeffs[5], 5, 1e-12, "Chebyshev deg-7 identity: x^5 coefficient unchanged");
  approx(result.econCoeffs[7], 1, 1e-12, "Chebyshev deg-7 identity: x^7 coefficient unchanged");
}

/* --------------------------- input-guard regressions (audit fixes) --------- */

// These four all used to fail silently — returning NaN, or a confident answer computed
// from invalid input — rather than raising. Each is pinned here so it cannot regress.
{
  function throwsWith(fn, label) {
    let threw = false;
    try { fn(); } catch (e) { threw = true; }
    if (threw) { pass++; console.log(`  ok    ${label}`); }
    else { fail++; console.error(`  FAIL  ${label}: did not throw`); }
  }
  const { fn: sinFn } = compile("sin(x)");

  // Bisection used to bisect happily on an interval with no sign change (x^2 + 1 on
  // [-1, 1] has no real root) and return 20 plausible-looking iterations.
  throwsWith(() => Algorithms.runBisection(compile("x^2 + 1").fn, -1, 1, 1e-9, 20),
    "Bisection rejects an interval with no sign change");
  throwsWith(() => Algorithms.runBisection(sinFn, 1, 1, 1e-9, 20),
    "Bisection rejects a zero-width interval");
  // A valid bracket must still work, and still find the root.
  {
    const it = Algorithms.runBisection(compile("x^3 - x - 2").fn, 1, 2, 1e-10, 60);
    approx(it[it.length - 1].c, 1.5213797068045676, 1e-8, "Bisection still solves a valid bracket");
  }

  // h = 0 divided by zero and returned NaN.
  throwsWith(() => Algorithms.runNumericalDiff(sinFn, 1, 0), "Numerical differentiation rejects h = 0");
  // Richardson extrapolation had no guards at all: log(x) at x = 0.05 with h = 0.2 needs
  // f(-0.15), which is outside the domain, and the NaN propagated silently.
  throwsWith(() => Algorithms.runRichardsonDiff(compile("log(x)").fn, 0.05, 0.2),
    "Richardson extrapolation rejects a point outside the domain");
  throwsWith(() => Algorithms.runRichardsonDiff(sinFn, 1, 0), "Richardson extrapolation rejects h = 0");

  // Unsorted or repeated x made the spline's interval widths negative or zero, which
  // produced a wrong curve with no error.
  throwsWith(() => Algorithms.runCubicSpline([{ x: 0, y: 0 }, { x: 2, y: 4 }, { x: 1, y: 1 }]),
    "Cubic spline rejects unsorted points");
  throwsWith(() => Algorithms.runCubicSpline([{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 1, y: 2 }]),
    "Cubic spline rejects duplicate x values");
  throwsWith(() => Algorithms.runCubicSpline([{ x: 0, y: 0 }]), "Cubic spline rejects a single point");
}

// Gram-Schmidt is now shared: Algorithms.qrDecompose is built on Algorithms.gramSchmidt
// (modified process), which fixed the orthogonality loss the classical version had.
{
  const eps = 1e-7;
  const A = [[1, 1, 1], [eps, 0, 0], [0, eps, 0], [0, 0, eps]];
  const { Q, R } = Algorithms.qrDecompose(A);
  let loss = 0;
  for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) {
    let d = 0;
    for (let k = 0; k < A.length; k++) d += Q[k][i] * Q[k][j];
    loss = Math.max(loss, Math.abs(d));
  }
  approx(loss, 0, 1e-7, "QR on an ill-conditioned matrix keeps orthogonality (classical form lost 1.3e-2 here)");
  let recon = 0;
  for (let i = 0; i < A.length; i++) for (let j = 0; j < 3; j++) {
    let v = 0;
    for (let k = 0; k < 3; k++) v += Q[i][k] * R[k][j];
    recon = Math.max(recon, Math.abs(v - A[i][j]));
  }
  approx(recon, 0, 1e-12, "QR on an ill-conditioned matrix still reconstructs A = Q*R");
}

console.log(`\n${pass} passed, ${fail} failed.`);
process.exit(fail ? 1 : 0);
