/* Laplace's and Poisson's Equations — Phase 5b of the ODE/PDE redesign (see
   docs/superpowers/plans/2026-08-02-ode-engine-phase5b-laplace-poisson.md). Builds the dense
   5-point-stencil linear system for u_xx+u_yy=f(x,y) on a rectangle's interior grid and reuses
   LinAlg.jacobi/gaussSeidel for the relaxation solve directly -- the roadmap's own reuse
   suggestion, not a second iterative-solver implementation.

   Depends on LinAlg (jacobi, gaussSeidel) and Algorithms (LinAlg's own dependency). Both must
   be loaded first. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(require("./linalg-algorithms.js"));
  } else {
    root.PoissonEngine = factory(root.LinAlg);
  }
})(typeof self !== "undefined" ? self : this, function (LinAlg) {
  "use strict";

  const PoissonEngine = {};

  // Interior unknowns U[i][j], i,j in [1, M-1], mapped to a flat index for the dense linear
  // system. Boundary values (i or j = 0 or M) are known and folded into the right-hand side.
  function flatIndex(i, j, M) { return (i - 1) * (M - 1) + (j - 1); }
  PoissonEngine.flatIndex = flatIndex;

  // Standard 5-point stencil for u_xx + u_yy = f(x,y) on a (possibly non-square-cell) grid:
  // wx*(U[i+1,j]+U[i-1,j]) + wy*(U[i,j+1]+U[i,j-1]) - 2(wx+wy)*U[i,j] = f(x_i,y_j), with known
  // boundary values moved to the right-hand side. boundaryFn(x,y): the Dirichlet data (only
  // evaluated at boundary points). sourceFn(x,y): f(x,y) (zero for Laplace's equation).
  function buildGridSystem({ a, b, M, boundaryFn, sourceFn }) {
    const hx = a / M, hy = b / M;
    const wx = 1 / (hx * hx), wy = 1 / (hy * hy);
    const diag = -2 * (wx + wy);
    const n = (M - 1) * (M - 1);
    const A = Array.from({ length: n }, () => new Array(n).fill(0));
    const rhs = new Array(n).fill(0);

    for (let i = 1; i <= M - 1; i++) {
      for (let j = 1; j <= M - 1; j++) {
        const row = flatIndex(i, j, M);
        A[row][row] = diag;
        rhs[row] = sourceFn(i * hx, j * hy);

        if (i - 1 >= 1) A[row][flatIndex(i - 1, j, M)] += wx;
        else rhs[row] -= wx * boundaryFn((i - 1) * hx, j * hy);

        if (i + 1 <= M - 1) A[row][flatIndex(i + 1, j, M)] += wx;
        else rhs[row] -= wx * boundaryFn((i + 1) * hx, j * hy);

        if (j - 1 >= 1) A[row][flatIndex(i, j - 1, M)] += wy;
        else rhs[row] -= wy * boundaryFn(i * hx, (j - 1) * hy);

        if (j + 1 <= M - 1) A[row][flatIndex(i, j + 1, M)] += wy;
        else rhs[row] -= wy * boundaryFn(i * hx, (j + 1) * hy);
      }
    }
    return { A, b: rhs, M, hx, hy };
  }
  PoissonEngine.buildGridSystem = buildGridSystem;

  // Direct definitional check: does the discrete stencil actually hold at interior grid points,
  // given a FULLY POPULATED grid U (boundary values already filled in)? The most direct
  // verification available for a relaxation solve -- substituting back into the defining
  // equation, same discipline as every other numeric check on this site.
  function gridResidual(U, M, hx, hy, sourceFn) {
    const wx = 1 / (hx * hx), wy = 1 / (hy * hy);
    let usable = 0;
    for (let i = 1; i <= M - 1; i += Math.max(1, Math.floor((M - 1) / 6))) {
      for (let j = 1; j <= M - 1; j += Math.max(1, Math.floor((M - 1) / 6))) {
        const lap = wx * (U[i + 1][j] + U[i - 1][j]) + wy * (U[i][j + 1] + U[i][j - 1]) - 2 * (wx + wy) * U[i][j];
        const expected = sourceFn(i * hx, j * hy);
        if (![lap, expected].every(Number.isFinite)) continue;
        usable++;
        if (Math.abs(lap - expected) > 1e-2 * Math.max(1, Math.abs(expected))) return false;
      }
    }
    return usable >= 3;
  }
  PoissonEngine.gridResidual = gridResidual;

  function solveGrid(A, b, method) {
    const result = method === "gauss-seidel" ? LinAlg.gaussSeidel(A, b, 1e-6, 3000) : LinAlg.jacobi(A, b, 1e-6, 3000);
    return { U: result.solution, converged: result.converged };
  }
  PoissonEngine.solveGrid = solveGrid;

  // Coefficients for the classic single-edge Dirichlet case, u=0 on the other three edges:
  // u(x,y) = sum cn sin(n*pi*x/a) sinh(n*pi*y/a), cn = (2/(a*sinh(n*pi*b/a))) * integral of
  // fFn(x)*sin(n*pi*x/a) over [0,a] -- for the "top" edge (y=b). The other three edges use the
  // SAME formula with x/y (and a/b) swapped or reflected -- one technique, four placements.
  // edge: "bottom" | "top" | "left" | "right". fFn: the boundary data as a function of the
  // coordinate running along that edge (x for bottom/top, y for left/right).
  function laplaceEdgeCoeffs({ a, b, edge, fFn, N, simpsonIntegrate }) {
    const along = edge === "left" || edge === "right" ? b : a;
    const across = edge === "left" || edge === "right" ? a : b;
    const coeffs = [];
    for (let n = 1; n <= N; n++) {
      const integrand = (s) => fFn(s) * Math.sin((n * Math.PI * s) / along);
      const raw = (2 / along) * simpsonIntegrate(integrand, 0, along, 120);
      coeffs.push(raw / Math.sinh((n * Math.PI * across) / along));
    }
    return coeffs;
  }
  PoissonEngine.laplaceEdgeCoeffs = laplaceEdgeCoeffs;

  function laplaceSeriesValue(edges, a, b, x, y) {
    let s = 0;
    if (edges.top) {
      const { coeffs } = edges.top;
      for (let n = 1; n <= coeffs.length; n++) s += coeffs[n - 1] * Math.sin((n * Math.PI * x) / a) * Math.sinh((n * Math.PI * y) / a);
    }
    if (edges.bottom) {
      const { coeffs } = edges.bottom;
      for (let n = 1; n <= coeffs.length; n++) s += coeffs[n - 1] * Math.sin((n * Math.PI * x) / a) * Math.sinh((n * Math.PI * (b - y)) / a);
    }
    if (edges.right) {
      const { coeffs } = edges.right;
      for (let n = 1; n <= coeffs.length; n++) s += coeffs[n - 1] * Math.sin((n * Math.PI * y) / b) * Math.sinh((n * Math.PI * x) / b);
    }
    if (edges.left) {
      const { coeffs } = edges.left;
      for (let n = 1; n <= coeffs.length; n++) s += coeffs[n - 1] * Math.sin((n * Math.PI * y) / b) * Math.sinh((n * Math.PI * (a - x)) / b);
    }
    return s;
  }
  PoissonEngine.laplaceSeriesValue = laplaceSeriesValue;

  return PoissonEngine;
});