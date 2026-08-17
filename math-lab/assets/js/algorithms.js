/* Numerical Engine — pure, DOM-free numeric methods.
   Shared between the browser pages (assets/js/<method>.js wires this to the UI)
   and the Node verification suite (tests/verify.js) — one implementation, two callers,
   so a regression here is caught by tests instead of only by eyeballing a plot. */
(function (root, factory) {
  // Always attach to `root` (window/self/globalThis), not just when there's no CJS `module` —
  // canvas's Vite/Vitest tooling runs source files through vite-node, which shims a `module`
  // global onto plain .js files even outside node_modules, so relying on the CJS branch alone
  // left `root.Algorithms` unset under `yarn test:app` even though the real browser (which has no
  // `module` global) and Node's `require()` both worked fine.
  const exported = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = exported;
  }
  root.Algorithms = exported;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const Algorithms = {};

  // f: number -> number, brackets a root in [a, b] where f(a)*f(b) < 0. The sign change is
  // checked here rather than trusted: without it the loop happily bisects an interval that
  // contains no root and returns a confident-looking answer.
  Algorithms.runBisection = function (f, a, b, tol, maxIter) {
    if (!Number.isFinite(a) || !Number.isFinite(b)) throw new Error("The interval endpoints a and b must be finite numbers.");
    if (a === b) throw new Error("The interval [a, b] must have nonzero width.");
    let lo = Math.min(a, b), hi = Math.max(a, b);
    let flo, fhi;
    try { flo = f(lo); fhi = f(hi); } catch { throw new Error("f(x) could not be evaluated at a or b."); }
    if (!Number.isFinite(flo) || !Number.isFinite(fhi)) throw new Error("f(x) produced a non-finite value at a or b.");
    if (flo !== 0 && fhi !== 0 && Math.sign(flo) === Math.sign(fhi)) {
      throw new Error("f(a) and f(b) have the same sign — bisection needs a sign change to bracket a root.");
    }

    const iterations = [];
    for (let n = 1; n <= maxIter; n++) {
      const c = (lo + hi) / 2;
      let fc;
      try { fc = f(c); } catch { throw new Error(`f(x) could not be evaluated at x = ${c}.`); }
      if (!Number.isFinite(fc)) throw new Error(`f(x) produced a non-finite value at x = ${c}.`);
      const err = (hi - lo) / 2;
      iterations.push({ n, a: lo, b: hi, c, fc, err });
      if (fc === 0 || err < tol) break;
      // Reuse the endpoint value already in hand instead of re-evaluating f(lo) each pass.
      if (Math.sign(flo) === Math.sign(fc)) { lo = c; flo = fc; } else { hi = c; fhi = fc; }
    }
    return iterations;
  };

  // f: number -> number, brackets a root in [a, b] where f(a)*f(b) < 0. Like Bisection but
  // replaces the midpoint with the secant-line x-intercept through (a,f(a)),(b,f(b)).
  // Stops on |f(c)| < tol rather than interval width, since the bracket need not shrink to 0.
  Algorithms.runFalsePosition = function (f, a, b, tol, maxIter) {
    const iterations = [];
    let lo = a, hi = b;
    let flo, fhi;
    try { flo = f(lo); fhi = f(hi); } catch { throw new Error("f(x) could not be evaluated at a or b."); }
    if (!Number.isFinite(flo) || !Number.isFinite(fhi)) throw new Error("f(x) produced a non-finite value at a or b.");
    for (let n = 1; n <= maxIter; n++) {
      const c = hi - (fhi * (hi - lo)) / (fhi - flo);
      let fc;
      try { fc = f(c); } catch { throw new Error(`f(x) could not be evaluated at x = ${c}.`); }
      if (!Number.isFinite(fc)) throw new Error(`f(x) produced a non-finite value at x = ${c}.`);
      iterations.push({ n, a: lo, b: hi, c, fc, err: Math.abs(fc) });
      if (Math.abs(fc) < tol) break;
      if (Math.sign(flo) === Math.sign(fc)) { lo = c; flo = fc; } else { hi = c; fhi = fc; }
    }
    return iterations;
  };

  // g: number -> number, iterates x_{n+1} = g(x_n) from x0. Throws on divergence.
  Algorithms.runFixedPoint = function (g, x0, tol, maxIter) {
    const iterations = [];
    let x = x0;
    for (let n = 1; n <= maxIter; n++) {
      let gx;
      try { gx = g(x); } catch { throw new Error("g(x) could not be evaluated at the current iterate."); }
      if (!Number.isFinite(gx)) throw new Error("Iteration produced a non-finite value — the sequence diverged.");
      const err = Math.abs(gx - x);
      iterations.push({ n, x, gx, err });
      if (err < tol) break;
      if (Math.abs(gx) > 1e8) throw new Error("Iteration diverged (|xₙ| grew without bound).");
      x = gx;
    }
    return iterations;
  };

  // f, fp: number -> number (f and its derivative), from x0. Throws on divergence
  // or a near-zero derivative (horizontal tangent).
  Algorithms.runNewton = function (f, fp, x0, tol, maxIter) {
    const iterations = [];
    let x = x0;
    for (let n = 1; n <= maxIter; n++) {
      let fx, fpx;
      try { fx = f(x); fpx = fp(x); } catch { throw new Error("f(x) or f′(x) could not be evaluated at the current iterate."); }
      if (!Number.isFinite(fx) || !Number.isFinite(fpx)) throw new Error("Evaluation produced a non-finite value.");
      if (Math.abs(fpx) < 1e-12) throw new Error(`f′(x) ≈ 0 at x = ${x} — horizontal tangent, Newton's method fails.`);
      const xNext = x - fx / fpx;
      const err = Math.abs(xNext - x);
      iterations.push({ n, x, fx, fpx, xNext, err });
      if (err < tol) break;
      if (Math.abs(xNext) > 1e8) throw new Error("Iteration diverged (|xₙ| grew without bound).");
      x = xNext;
    }
    return iterations;
  };

  // f: number -> number, from two starting points x0, x1 (no derivative needed —
  // replaces f'(x_n) with the finite-difference slope through the last two iterates).
  Algorithms.runSecant = function (f, x0, x1, tol, maxIter) {
    const iterations = [];
    let xPrev = x0, xCurr = x1;
    let fPrev, fCurr;
    try { fPrev = f(xPrev); fCurr = f(xCurr); } catch { throw new Error("f(x) could not be evaluated at x₀ or x₁."); }
    if (!Number.isFinite(fPrev) || !Number.isFinite(fCurr)) throw new Error("f(x) produced a non-finite value at x₀ or x₁.");
    for (let n = 1; n <= maxIter; n++) {
      const denom = fCurr - fPrev;
      if (Math.abs(denom) < 1e-14) throw new Error(`f(xₙ) − f(x_{n-1}) ≈ 0 at n = ${n} — the secant line is (near-)horizontal, the method fails.`);
      const xNext = xCurr - (fCurr * (xCurr - xPrev)) / denom;
      const err = Math.abs(xNext - xCurr);
      let fNext;
      try { fNext = f(xNext); } catch { throw new Error("f(x) could not be evaluated at the new iterate."); }
      if (!Number.isFinite(fNext)) throw new Error("Iteration produced a non-finite value.");
      iterations.push({ n, xPrev, xCurr, fPrev, fCurr, xNext, fNext, err });
      if (err < tol) break;
      if (Math.abs(xNext) > 1e8) throw new Error("Iteration diverged (|xₙ| grew without bound).");
      xPrev = xCurr; fPrev = fCurr;
      xCurr = xNext; fCurr = fNext;
    }
    return iterations;
  };

  // points: [{x,y}, ...] sorted ascending by x, distinct x. Natural cubic spline
  // (Burden & Faires Alg. 3.4): boundary condition S''(x0) = S''(xn) = 0. Returns one
  // segment per interval, S_j(x) = a + b(x-x0) + c(x-x0)^2 + d(x-x0)^3 for x in [x0,x1].
  Algorithms.runCubicSpline = function (points) {
    if (!Array.isArray(points) || points.length < 2) throw new Error("A cubic spline needs at least two points.");
    points.forEach((p, i) => {
      if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) throw new Error(`Point ${i + 1} does not have finite x and y values.`);
    });
    // Ascending, distinct x is a precondition of the algorithm, not a convention: out of
    // order the interval widths h[i] go negative and the spline silently comes out wrong,
    // and a repeat divides by zero.
    for (let i = 1; i < points.length; i++) {
      if (points[i].x === points[i - 1].x) throw new Error(`Points ${i} and ${i + 1} share the same x value (${points[i].x}) — x values must be distinct.`);
      if (points[i].x < points[i - 1].x) throw new Error("Points must be sorted by ascending x before building a spline.");
    }
    const n = points.length - 1;
    const x = points.map((p) => p.x);
    const a = points.map((p) => p.y);
    const h = new Array(n);
    for (let i = 0; i < n; i++) h[i] = x[i + 1] - x[i];

    const alpha = new Array(n).fill(0);
    for (let i = 1; i < n; i++) {
      alpha[i] = (3 / h[i]) * (a[i + 1] - a[i]) - (3 / h[i - 1]) * (a[i] - a[i - 1]);
    }

    const l = new Array(n + 1), mu = new Array(n + 1), z = new Array(n + 1);
    l[0] = 1; mu[0] = 0; z[0] = 0;
    for (let i = 1; i < n; i++) {
      l[i] = 2 * (x[i + 1] - x[i - 1]) - h[i - 1] * mu[i - 1];
      mu[i] = h[i] / l[i];
      z[i] = (alpha[i] - h[i - 1] * z[i - 1]) / l[i];
    }
    l[n] = 1; z[n] = 0;

    const c = new Array(n + 1); c[n] = 0;
    const b = new Array(n), d = new Array(n);
    for (let j = n - 1; j >= 0; j--) {
      c[j] = z[j] - mu[j] * c[j + 1];
      b[j] = (a[j + 1] - a[j]) / h[j] - (h[j] * (c[j + 1] + 2 * c[j])) / 3;
      d[j] = (c[j + 1] - c[j]) / (3 * h[j]);
    }

    const segments = [];
    for (let j = 0; j < n; j++) {
      segments.push({ x0: x[j], x1: x[j + 1], a: a[j], b: b[j], c: c[j], d: d[j] });
    }
    return segments;
  };

  // Evaluates a spline built by runCubicSpline at any x (clamped to the end segments
  // for extrapolation beyond the data range).
  Algorithms.evalCubicSpline = function (segments, x) {
    let seg = segments[0];
    if (x >= segments[segments.length - 1].x1) seg = segments[segments.length - 1];
    else {
      for (let i = 0; i < segments.length; i++) {
        if (x >= segments[i].x0 && x <= segments[i].x1) { seg = segments[i]; break; }
      }
    }
    const dx = x - seg.x0;
    return seg.a + seg.b * dx + seg.c * dx * dx + seg.d * dx * dx * dx;
  };

  function multiplyPoly(a, b) {
    const out = new Array(a.length + b.length - 1).fill(0);
    for (let i = 0; i < a.length; i++)
      for (let j = 0; j < b.length; j++) out[i + j] += a[i] * b[j];
    return out;
  }

  // points: [{x, y}, ...] with distinct x values. Ascending-power coefficients
  // [c0, c1, ..., c_{n-1}] of the unique degree-(n-1) polynomial P(x) = c0 + c1*x + ...
  // interpolating every point, built directly from the Lagrange basis (Burden & Faires §3.1).
  // Moved here from lagrange.js (was page-local) so the Lagrange node host can call the same
  // pure function the page uses — per the one-algorithm-one-file rule.
  Algorithms.runLagrangeInterpolation = function (points) {
    const n = points.length;
    if (n < 1) throw new Error("At least one point is required.");
    for (let i = 1; i < n; i++) {
      for (let j = 0; j < i; j++) {
        if (points[i].x === points[j].x) throw new Error(`Points ${j + 1} and ${i + 1} share the same x value (${points[i].x}) — x values must be distinct.`);
      }
    }
    const total = new Array(n).fill(0);
    for (let i = 0; i < n; i++) {
      let poly = [1];
      let denom = 1;
      for (let j = 0; j < n; j++) {
        if (j === i) continue;
        poly = multiplyPoly(poly, [-points[j].x, 1]);
        denom *= points[i].x - points[j].x;
      }
      const scale = points[i].y / denom;
      for (let k = 0; k < poly.length; k++) total[k] += poly[k] * scale;
    }
    const maxAbs = Math.max(...total.map(Math.abs), 1);
    return total.map((c) => (Math.abs(c) < maxAbs * 1e-10 ? 0 : c));
  };

  // coeffsAsc: [c0, c1, ..., c_{n-1}] ascending-power coefficients (as returned by
  // runLagrangeInterpolation). Evaluates via Horner's method from the top power down.
  Algorithms.evalPolyAscending = function (coeffsAsc, x) {
    let result = 0;
    for (let k = coeffsAsc.length - 1; k >= 0; k--) result = result * x + coeffsAsc[k];
    return result;
  };

  // f: number -> number, composite trapezoidal rule on [a, b] with n equal subintervals
  // (n >= 1). Returns one panel per subinterval plus the running cumulative total, so the
  // UI can step through the sum being built one trapezoid at a time.
  Algorithms.runTrapezoidal = function (f, a, b, n) {
    if (!Number.isInteger(n) || n < 1) throw new Error("n must be a positive integer.");
    const h = (b - a) / n;
    let xPrev = a, fPrev;
    try { fPrev = f(xPrev); } catch { throw new Error("f(x) could not be evaluated at x = a."); }
    if (!Number.isFinite(fPrev)) throw new Error("f(x) produced a non-finite value at x = a.");

    const panels = [];
    let running = 0;
    for (let i = 1; i <= n; i++) {
      const x = a + i * h;
      let fx;
      try { fx = f(x); } catch { throw new Error(`f(x) could not be evaluated at x = ${x}.`); }
      if (!Number.isFinite(fx)) throw new Error(`f(x) produced a non-finite value at x = ${x}.`);
      const panelArea = (h / 2) * (fPrev + fx);
      running += panelArea;
      panels.push({ i, x0: xPrev, x1: x, f0: fPrev, f1: fx, panelArea, running });
      xPrev = x;
      fPrev = fx;
    }
    return { h, panels, total: running };
  };

  // f: number -> number, composite Simpson's rule on [a, b] with n subintervals.
  // mode: "13" (pure 1/3 rule, n must be even), "38" (pure 3/8 rule, n must be a multiple
  // of 3), or "auto" (chains 1/3-rule groups, absorbing the last 3 subintervals into one
  // 3/8-rule group when n is odd). Returns one entry per rule-application group.
  Algorithms.runSimpson = function (f, a, b, n, mode) {
    mode = mode || "auto";
    if (!Number.isInteger(n) || n < 2) throw new Error("n must be an integer >= 2.");
    if (mode === "13" && n % 2 !== 0) throw new Error("Simpson's 1/3 rule requires an even number of subintervals.");
    if (mode === "38" && n % 3 !== 0) throw new Error("Simpson's 3/8 rule requires n to be a multiple of 3.");
    if (mode === "auto" && n % 2 !== 0 && n < 3) throw new Error("n must be >= 3 when odd (a 3/8 group needs 3 subintervals).");

    const h = (b - a) / n;
    const X = new Array(n + 1), F = new Array(n + 1);
    for (let i = 0; i <= n; i++) {
      X[i] = a + i * h;
      let fx;
      try { fx = f(X[i]); } catch { throw new Error(`f(x) could not be evaluated at x = ${X[i]}.`); }
      if (!Number.isFinite(fx)) throw new Error(`f(x) produced a non-finite value at x = ${X[i]}.`);
      F[i] = fx;
    }

    const groups = [];
    let i = 0;
    if (mode === "38") {
      while (i < n) { groups.push({ type: "3/8", idx: [i, i + 1, i + 2, i + 3] }); i += 3; }
    } else if (mode === "13") {
      while (i < n) { groups.push({ type: "1/3", idx: [i, i + 1, i + 2] }); i += 2; }
    } else {
      const use38Tail = n % 2 !== 0;
      const limit = use38Tail ? n - 3 : n;
      while (i < limit) { groups.push({ type: "1/3", idx: [i, i + 1, i + 2] }); i += 2; }
      if (use38Tail) groups.push({ type: "3/8", idx: [n - 3, n - 2, n - 1, n] });
    }

    let running = 0;
    const panels = groups.map((g, gi) => {
      let area;
      if (g.type === "1/3") {
        const [i0, i1, i2] = g.idx;
        area = (h / 3) * (F[i0] + 4 * F[i1] + F[i2]);
      } else {
        const [i0, i1, i2, i3] = g.idx;
        area = ((3 * h) / 8) * (F[i0] + 3 * F[i1] + 3 * F[i2] + F[i3]);
      }
      running += area;
      return {
        g: gi + 1,
        type: g.type,
        x0: X[g.idx[0]],
        x1: X[g.idx[g.idx.length - 1]],
        nodesX: g.idx.map((k) => X[k]),
        nodesF: g.idx.map((k) => F[k]),
        panelArea: area,
        running,
      };
    });

    return { h, mode, panels, total: running };
  };

  // f: number -> number, midpoint-rule Riemann sum on [a, b] with n rectangles. This is the
  // *definition* of the integral (the limit of Riemann sums as n -> infinity), not an
  // approximation technique — which is why it lives here in the Calculus Engine's shared
  // module rather than alongside Trapezoidal/Simpson's/Romberg. Returns one entry per
  // rectangle so a page can draw them.
  Algorithms.runRiemannSum = function (f, a, b, n) {
    if (!Number.isFinite(a) || !Number.isFinite(b)) throw new Error("The interval endpoints a and b must be finite numbers.");
    if (!(b > a)) throw new Error("b must be greater than a.");
    if (!Number.isInteger(n) || n < 1) throw new Error("n must be a positive integer.");

    const width = (b - a) / n;
    const rectangles = [];
    let running = 0;
    for (let i = 0; i < n; i++) {
      const x0 = a + i * width;
      const x1 = x0 + width;
      const mid = x0 + width / 2;
      let height;
      try { height = f(mid); } catch { throw new Error(`f(x) could not be evaluated at x = ${mid}.`); }
      if (!Number.isFinite(height)) throw new Error(`f(x) produced a non-finite value at x = ${mid}.`);
      const area = height * width;
      running += area;
      rectangles.push({ i, x0, x1, mid, height, area, running });
    }
    return { width, rectangles, total: running };
  };

  // A: n x m matrix (array of row arrays), x: length-m vector. Returns A*x (length n).
  Algorithms.matVec = function (A, x) {
    return A.map((row) => row.reduce((s, a, j) => s + a * x[j], 0));
  };

  // A: n x k, B: k x m. Returns A*B (n x m).
  Algorithms.matMul = function (A, B) {
    const n = A.length, k = B.length, m = B[0].length;
    const C = [];
    for (let i = 0; i < n; i++) {
      C.push(new Array(m).fill(0));
      for (let j = 0; j < m; j++) {
        let s = 0;
        for (let t = 0; t < k; t++) s += A[i][t] * B[t][j];
        C[i][j] = s;
      }
    }
    return C;
  };

  // Solves A*x = b via Gaussian elimination with partial pivoting. A: n x n, b: length n.
  // Throws if A is singular (or numerically indistinguishable from singular).
  Algorithms.solveLinear = function (A, b) {
    const n = A.length;
    if (!A.every((row) => row.length === n)) throw new Error("Matrix must be square.");
    if (b.length !== n) throw new Error("Right-hand side vector length must match matrix size.");
    const M = A.map((row, i) => [...row, b[i]]);
    for (let col = 0; col < n; col++) {
      let piv = col;
      for (let r = col + 1; r < n; r++) if (Math.abs(M[r][col]) > Math.abs(M[piv][col])) piv = r;
      if (Math.abs(M[piv][col]) < 1e-12) throw new Error("Matrix is singular (or nearly singular) — no unique solution.");
      if (piv !== col) { const tmp = M[col]; M[col] = M[piv]; M[piv] = tmp; }
      for (let r = col + 1; r < n; r++) {
        const factor = M[r][col] / M[col][col];
        for (let c = col; c <= n; c++) M[r][c] -= factor * M[col][c];
      }
    }
    const x = new Array(n).fill(0);
    for (let i = n - 1; i >= 0; i--) {
      let s = M[i][n];
      for (let j = i + 1; j < n; j++) s -= M[i][j] * x[j];
      x[i] = s / M[i][i];
    }
    return x;
  };

  // vectors: array of equal-length vectors -> { Q, R, steps } by the MODIFIED Gram-Schmidt
  // process: each projection is subtracted from the running vector rather than from the
  // original one. Identical on paper to the classical form, but far better behaved in
  // floating point — on an ill-conditioned set the classical version loses orthogonality
  // at the 1e-2 level where this holds 1e-9. opts.recordSteps keeps the per-projection
  // trace the Linear Algebra pages step through.
  // This is the single implementation: Algorithms.qrDecompose and LinAlg.gramSchmidt both
  // call it rather than carrying their own copy.
  Algorithms.gramSchmidt = function (vectors, opts) {
    opts = opts || {};
    if (!Array.isArray(vectors) || vectors.length === 0) throw new Error("Provide at least one vector.");
    const len = vectors[0].length;
    vectors.forEach((v, i) => {
      if (!Array.isArray(v) || v.length !== len) throw new Error(`Vector ${i + 1} has a different length than vector 1.`);
      v.forEach((val, j) => { if (!Number.isFinite(val)) throw new Error(`Entry ${j + 1} of vector ${i + 1} is not a finite number.`); });
    });
    const tol = opts.tol || 1e-12;
    const m = vectors.length;
    const Q = [];
    const R = Array.from({ length: m }, () => new Array(m).fill(0));
    const steps = [];
    for (let j = 0; j < m; j++) {
      let v = [...vectors[j]];
      for (let i = 0; i < j; i++) {
        const r = Q[i].reduce((s, qi, k) => s + qi * v[k], 0); // against the RUNNING v
        R[i][j] = r;
        v = v.map((vk, k) => vk - r * Q[i][k]);
        if (opts.recordSteps) steps.push({ j, i, coefficient: r, description: `v${j + 1} -> v${j + 1} - <q${i + 1}, v${j + 1}> q${i + 1}`, vector: [...v] });
      }
      const norm = Math.sqrt(v.reduce((s, vk) => s + vk * vk, 0));
      if (norm < tol) throw new Error(`Vector ${j + 1} is a linear combination of the earlier ones — Gram-Schmidt needs an independent set.`);
      R[j][j] = norm;
      Q.push(v.map((vk) => vk / norm));
      if (opts.recordSteps) steps.push({ j, normalize: true, norm, description: `q${j + 1} = v${j + 1} / ||v${j + 1}||`, vector: Q[j].slice() });
    }
    return { Q, R, steps };
  };

  // QR decomposition. A: n x m (n >= m), full column rank. Returns { Q, R } with Q: n x m
  // (orthonormal columns), R: m x m (upper triangular), such that A = Q*R. Built on
  // Algorithms.gramSchmidt above, so it inherits the modified process's stability — this
  // used to be a separate classical implementation, which is what runQRAlgorithm's accuracy
  // was limited by.
  Algorithms.qrDecompose = function (A) {
    const n = A.length, m = A[0].length;
    const cols = [];
    for (let j = 0; j < m; j++) cols.push(A.map((row) => row[j]));
    let result;
    try { result = Algorithms.gramSchmidt(cols); }
    catch { throw new Error("Matrix columns are linearly dependent — QR decomposition failed."); }
    const Q = Array.from({ length: n }, (_, i) => result.Q.map((col) => col[i]));
    return { Q, R: result.R };
  };

  // A: n x n matrix (nonsingular), x0: length-n starting vector (not all zero). Power
  // method applied to A^-1 (via solving A*y=x each step, not explicit inversion) to find
  // the smallest-magnitude eigenvalue of A. Throws if A is singular (solveLinear does).
  Algorithms.runInversePowerMethod = function (A, x0, tol, maxIter) {
    const n = A.length;
    if (!A.every((row) => row.length === n)) throw new Error("Matrix must be square.");
    if (x0.length !== n) throw new Error("Starting vector length must match matrix size.");
    let p0 = 0;
    for (let i = 1; i < n; i++) if (Math.abs(x0[i]) > Math.abs(x0[p0])) p0 = i;
    if (Math.abs(x0[p0]) < 1e-14) throw new Error("Starting vector cannot be all zero.");
    let x = x0.map((v) => v / x0[p0]);

    const iterations = [];
    for (let k = 1; k <= maxIter; k++) {
      const y = Algorithms.solveLinear(A, x);
      let p = 0;
      for (let i = 1; i < n; i++) if (Math.abs(y[i]) > Math.abs(y[p])) p = i;
      const mu = y[p];
      if (Math.abs(mu) < 1e-14) throw new Error(`Eigenvalue estimate ≈ 0 at iteration ${k} — the inverse power method can't resolve this case.`);
      const xNext = y.map((v) => v / mu);
      const err = Math.max(...x.map((xi, i) => Math.abs(xi - xNext[i])));
      const lambdaMin = 1 / mu;
      iterations.push({ n: k, x, y, mu, lambdaMin, xNext, err });
      x = xNext;
      if (err < tol) break;
    }
    return iterations;
  };

  // A: n x n matrix. Unshifted QR algorithm: repeatedly factors A_k = Q_k R_k and
  // recombines as A_{k+1} = R_k Q_k. Converges toward upper-triangular form for matrices
  // with real, distinct-magnitude eigenvalues; the diagonal of the final matrix holds the
  // eigenvalue estimates. Stops when the off-diagonal Frobenius norm drops below tol.
  Algorithms.runQRAlgorithm = function (A, tol, maxIter) {
    const n = A.length;
    if (!A.every((row) => row.length === n)) throw new Error("Matrix must be square.");
    let Ak = A.map((row) => [...row]);
    const iterations = [];
    for (let k = 1; k <= maxIter; k++) {
      const { Q, R } = Algorithms.qrDecompose(Ak);
      Ak = Algorithms.matMul(R, Q);
      let offSq = 0;
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if (i !== j) offSq += Ak[i][j] * Ak[i][j];
      const offNorm = Math.sqrt(offSq);
      const diag = Ak.map((row, i) => row[i]);
      iterations.push({ n: k, A: Ak, diag, offNorm });
      if (offNorm < tol) break;
    }
    return iterations;
  };

  // p, q, r: number -> number (coefficient functions of x). Solves the linear BVP
  // y'' = p(x)y' + q(x)y + r(x), y(a)=alpha, y(b)=beta via linear shooting: integrate the
  // particular (y1) and homogeneous (y2) IVPs together with RK4, then combine linearly.
  // Returns the full step-by-step path plus the combined solution at each step.
  Algorithms.runShooting = function (p, q, r, a, b, alpha, beta, n) {
    if (!Number.isInteger(n) || n < 1) throw new Error("n (number of RK4 steps) must be a positive integer.");
    const h = (b - a) / n;

    function deriv(x, Y) {
      const [y1, y1p, y2, y2p] = Y;
      let pv, qv, rv;
      try { pv = p(x); qv = q(x); rv = r(x); } catch { throw new Error(`p(x), q(x), or r(x) could not be evaluated at x = ${x}.`); }
      if (![pv, qv, rv].every(Number.isFinite)) throw new Error(`p(x), q(x), or r(x) produced a non-finite value at x = ${x}.`);
      return [y1p, pv * y1p + qv * y1 + rv, y2p, pv * y2p + qv * y2];
    }
    function addScaled(Y, K, s) { return Y.map((v, i) => v + s * K[i]); }

    let x = a, Y = [alpha, 0, 0, 1];
    const path = [{ x, y1: Y[0], y1p: Y[1], y2: Y[2], y2p: Y[3] }];
    for (let i = 0; i < n; i++) {
      const k1 = deriv(x, Y);
      const k2 = deriv(x + h / 2, addScaled(Y, k1, h / 2));
      const k3 = deriv(x + h / 2, addScaled(Y, k2, h / 2));
      const k4 = deriv(x + h, addScaled(Y, k3, h));
      Y = Y.map((v, i2) => v + (h / 6) * (k1[i2] + 2 * k2[i2] + 2 * k3[i2] + k4[i2]));
      x += h;
      path.push({ x, y1: Y[0], y1p: Y[1], y2: Y[2], y2p: Y[3] });
    }

    const last = path[path.length - 1];
    if (Math.abs(last.y2) < 1e-12) throw new Error("y2(b) ≈ 0 — the homogeneous solution vanished at b, shooting fails for this problem.");
    const c = (beta - last.y1) / last.y2;
    const combined = path.map((p2) => ({ x: p2.x, y1: p2.y1, y2: p2.y2, y: p2.y1 + c * p2.y2 }));
    return { h, c, path: combined };
  };

  // f: number -> number, from three starting points x0, x1, x2 (distinct). Fits a
  // quadratic through the last three iterates each step; throws if it ever heads toward
  // a complex root (unsupported for this site's real-valued f(x) model).
  Algorithms.runMuller = function (f, x0, x1, x2, tol, maxIter) {
    const iterations = [];
    let f0, f1, f2;
    try { f0 = f(x0); f1 = f(x1); f2 = f(x2); }
    catch { throw new Error("f(x) could not be evaluated at x0, x1, or x2."); }
    if (![f0, f1, f2].every(Number.isFinite)) throw new Error("f(x) produced a non-finite value at a starting point.");

    for (let n = 1; n <= maxIter; n++) {
      if (x1 === x0 || x2 === x1 || x2 === x0) throw new Error("Two iterates coincided — Müller's method stalled.");
      const d0 = (f1 - f0) / (x1 - x0);
      const d1 = (f2 - f1) / (x2 - x1);
      const a = (d1 - d0) / (x2 - x0);
      const b = a * (x2 - x1) + d1;
      const c = f2;
      const disc = b * b - 4 * a * c;
      if (disc < 0) throw new Error(`Discriminant went negative at n = ${n} — converging toward a complex root, which isn't supported for real-valued f(x).`);
      const sq = Math.sqrt(disc);
      const denom = Math.abs(b + sq) >= Math.abs(b - sq) ? (b + sq) : (b - sq);
      if (Math.abs(denom) < 1e-14) throw new Error(`Denominator ≈ 0 at n = ${n} — Müller's method fails here.`);
      const x3 = x2 - (2 * c) / denom;
      let f3;
      try { f3 = f(x3); } catch { throw new Error("f(x) could not be evaluated at the new iterate."); }
      if (!Number.isFinite(f3)) throw new Error("Iteration produced a non-finite value.");
      const err = Math.abs(x3 - x2);
      iterations.push({ n, x0, x1, x2, f0, f1, f2, a, b, c, x3, f3, err });
      if (err < tol) break;
      if (Math.abs(x3) > 1e8) throw new Error("Iteration diverged (|xₙ| grew without bound).");
      x0 = x1; f0 = f1;
      x1 = x2; f1 = f2;
      x2 = x3; f2 = f3;
    }
    return iterations;
  };

  // A: n x n matrix, x0: length-n starting vector (not all zero). Power method for the
  // dominant eigenvalue/eigenvector. Throws if a zero eigenvalue is hit (indicates a
  // singular/degenerate case this simple iteration can't resolve).
  Algorithms.runPowerMethod = function (A, x0, tol, maxIter) {
    const n = A.length;
    if (!A.every((row) => row.length === n)) throw new Error("Matrix must be square.");
    if (x0.length !== n) throw new Error("Starting vector length must match matrix size.");
    let p0 = 0;
    for (let i = 1; i < n; i++) if (Math.abs(x0[i]) > Math.abs(x0[p0])) p0 = i;
    if (Math.abs(x0[p0]) < 1e-14) throw new Error("Starting vector cannot be all zero.");
    let x = x0.map((v) => v / x0[p0]);

    const iterations = [];
    for (let k = 1; k <= maxIter; k++) {
      const y = Algorithms.matVec(A, x);
      let p = 0;
      for (let i = 1; i < n; i++) if (Math.abs(y[i]) > Math.abs(y[p])) p = i;
      const mu = y[p];
      if (Math.abs(mu) < 1e-14) throw new Error(`Eigenvalue estimate ≈ 0 at iteration ${k} — the power method can't resolve this case.`);
      const xNext = y.map((v) => v / mu);
      const err = Math.max(...x.map((xi, i) => Math.abs(xi - xNext[i])));
      iterations.push({ n: k, x, y, mu, xNext, err });
      x = xNext;
      if (err < tol) break;
    }
    return iterations;
  };

  // p, q, r: number -> number. Solves the linear BVP y'' = p(x)y' + q(x)y + r(x),
  // y(a)=alpha, y(b)=beta by central-difference discretization on n subintervals,
  // building a tridiagonal system and solving it via Algorithms.solveLinear.
  Algorithms.runFiniteDifference = function (p, q, r, a, b, alpha, beta, n) {
    if (!Number.isInteger(n) || n < 2) throw new Error("n (number of subintervals) must be an integer >= 2.");
    if (!Number.isFinite(a) || !Number.isFinite(b)) throw new Error("Interval endpoints a and b must be finite numbers.");
    if (!Number.isFinite(alpha) || !Number.isFinite(beta)) throw new Error("Boundary values alpha and beta must be finite numbers.");
    if (b === a) throw new Error("Interval [a, b] must have nonzero length (a != b).");
    const h = (b - a) / n;
    const N = n - 1; // interior nodes
    const A = [];
    const D = new Array(N);
    for (let i = 0; i < N; i++) A.push(new Array(N).fill(0));
    const sub = new Array(N), sup = new Array(N);
    for (let i = 1; i <= N; i++) {
      const xi = a + i * h;
      let pv, qv, rv;
      try { pv = p(xi); qv = q(xi); rv = r(xi); } catch { throw new Error(`p(x), q(x), or r(x) could not be evaluated at x = ${xi}.`); }
      if (![pv, qv, rv].every(Number.isFinite)) throw new Error(`p(x), q(x), or r(x) produced a non-finite value at x = ${xi}.`);
      const idx = i - 1;
      sub[idx] = -1 - (h / 2) * pv;
      sup[idx] = -1 + (h / 2) * pv;
      A[idx][idx] = 2 + h * h * qv;
      if (idx - 1 >= 0) A[idx][idx - 1] = sub[idx];
      if (idx + 1 < N) A[idx][idx + 1] = sup[idx];
      D[idx] = -h * h * rv;
    }
    // Fold the known boundary values into the first/last RHS entries.
    D[0] -= sub[0] * alpha;
    D[N - 1] -= sup[N - 1] * beta;
    const w = Algorithms.solveLinear(A, D);
    const grid = [{ i: 0, x: a, w: alpha }];
    for (let i = 1; i <= N; i++) grid.push({ i, x: a + i * h, w: w[i - 1] });
    grid.push({ i: n, x: b, w: beta });
    return { h, grid };
  };

  // f: number -> number, Romberg integration on [a, b] via m+1 levels of Richardson
  // extrapolation applied to composite Trapezoidal-rule estimates at n = 1, 2, 4, ..., 2^m
  // subintervals. Returns the full triangular table; R[m][m] is the final estimate.
  Algorithms.runRomberg = function (f, a, b, m) {
    if (!Number.isInteger(m) || m < 1) throw new Error("m (number of extrapolation levels) must be a positive integer.");
    const R = Array.from({ length: m + 1 }, () => new Array(m + 1).fill(0));
    for (let i = 0; i <= m; i++) {
      R[i][0] = Algorithms.runTrapezoidal(f, a, b, Math.pow(2, i)).total;
    }
    for (let j = 1; j <= m; j++) {
      for (let i = j; i <= m; i++) {
        R[i][j] = R[i][j - 1] + (R[i][j - 1] - R[i - 1][j - 1]) / (Math.pow(4, j) - 1);
      }
    }
    return { R, total: R[m][m] };
  };

  // f: number -> number, adaptive Simpson's-rule quadrature on [a, b] to the given
  // tolerance. Recursively refines only where needed; returns every accepted leaf
  // subinterval (for visualizing where refinement happened) plus the total estimate.
  Algorithms.runAdaptiveQuadrature = function (f, a, b, tol) {
    if (!(tol > 0)) throw new Error("Tolerance must be a positive number.");

    function evalAt(x) {
      let y;
      try { y = f(x); } catch { throw new Error(`f(x) could not be evaluated at x = ${x}.`); }
      if (!Number.isFinite(y)) throw new Error(`f(x) produced a non-finite value at x = ${x}.`);
      return y;
    }
    function simpsonEst(p, q) {
      const mid = (p + q) / 2;
      return ((q - p) / 6) * (evalAt(p) + 4 * evalAt(mid) + evalAt(q));
    }

    const leaves = [];
    const MAX_DEPTH = 40;

    function recurse(lo, hi, localTol, whole, depth) {
      const mid = (lo + hi) / 2;
      const left = simpsonEst(lo, mid);
      const right = simpsonEst(mid, hi);
      const refined = left + right;
      if (depth >= MAX_DEPTH || Math.abs(refined - whole) < 15 * localTol) {
        const estimate = refined + (refined - whole) / 15;
        leaves.push({ a: lo, b: hi, estimate, depth });
        return estimate;
      }
      return recurse(lo, mid, localTol / 2, left, depth + 1) + recurse(mid, hi, localTol / 2, right, depth + 1);
    }

    const wholeEstimate = simpsonEst(a, b);
    const total = recurse(a, b, tol, wholeEstimate, 0);
    leaves.sort((p, q) => p.a - q.a);
    return { leaves, total };
  };

  // F: array of n functions, each (xVec: number[]) -> number. x: current point (length n).
  // h: finite-difference step. Returns the n x n Jacobian approximation.
  Algorithms.jacobianFD = function (F, x, h) {
    h = h || 1e-6;
    const n = x.length;
    const f0 = F.map((fi) => fi(x));
    const J = f0.map(() => new Array(n).fill(0));
    for (let j = 0; j < n; j++) {
      const xh = [...x];
      xh[j] += h;
      const f1 = F.map((fi) => fi(xh));
      for (let i = 0; i < f0.length; i++) J[i][j] = (f1[i] - f0[i]) / h;
    }
    return J;
  };

  // F: array of n functions (xVec: number[]) -> number, x0: length-n initial guess.
  // Newton's method for the system F(x) = 0, using a finite-difference Jacobian each step.
  Algorithms.runNewtonSystem = function (F, x0, tol, maxIter) {
    const n = x0.length;
    if (F.length !== n) throw new Error("Number of equations must match the number of unknowns.");
    let x = [...x0];
    const iterations = [];
    for (let k = 1; k <= maxIter; k++) {
      let fx;
      try { fx = F.map((fi) => fi(x)); } catch { throw new Error("Could not evaluate F(x) at the current iterate."); }
      if (!fx.every(Number.isFinite)) throw new Error("F(x) produced a non-finite value.");
      const J = Algorithms.jacobianFD(F, x);
      let delta;
      try { delta = Algorithms.solveLinear(J, fx.map((v) => -v)); }
      catch { throw new Error(`The Jacobian is singular at iteration ${k} — Newton's method fails here.`); }
      const xNext = x.map((xi, i) => xi + delta[i]);
      const err = Math.max(...delta.map(Math.abs));
      iterations.push({ n: k, x, fx, J, delta, xNext, err });
      x = xNext;
      if (err < tol) break;
    }
    return iterations;
  };

  // Gauss-Legendre node/weight table for the supported fixed orders (2 and 3 points).
  const GAUSS_LEGENDRE_TABLE = {
    2: { nodes: [-1 / Math.sqrt(3), 1 / Math.sqrt(3)], weights: [1, 1] },
    3: { nodes: [-Math.sqrt(3 / 5), 0, Math.sqrt(3 / 5)], weights: [5 / 9, 8 / 9, 5 / 9] },
  };

  // f: number -> number, Gauss-Legendre quadrature on [a, b] using a fixed-order rule
  // (order 2 or 3 — exact for polynomials up to degree 2*order - 1).
  Algorithms.runGaussLegendre = function (f, a, b, order) {
    const table = GAUSS_LEGENDRE_TABLE[order];
    if (!table) throw new Error("Only 2-point and 3-point Gauss-Legendre rules are supported.");
    const half = (b - a) / 2, mid = (a + b) / 2;
    const points = [];
    let total = 0;
    for (let i = 0; i < table.nodes.length; i++) {
      const x = half * table.nodes[i] + mid;
      let fx;
      try { fx = f(x); } catch { throw new Error(`f(x) could not be evaluated at x = ${x}.`); }
      if (!Number.isFinite(fx)) throw new Error(`f(x) produced a non-finite value at x = ${x}.`);
      const contribution = table.weights[i] * fx;
      total += contribution;
      points.push({ node: table.nodes[i], weight: table.weights[i], x, fx, contribution: contribution * half });
    }
    return { order, points, total: total * half };
  };

  // points: [{x, f, fp}, ...] sorted ascending, distinct x. Returns the divided-
  // difference table (z, Q) over the doubled node sequence z_{2i}=z_{2i+1}=x_i, for
  // evalHermite to consume (Burden & Faires Alg. 3.3, divided-difference form).
  Algorithms.runHermite = function (points) {
    const n = points.length - 1;
    const m = 2 * n + 1;
    const z = new Array(m + 1);
    const Q = Array.from({ length: m + 1 }, () => new Array(m + 1).fill(0));
    for (let i = 0; i <= n; i++) {
      if (!Number.isFinite(points[i].x) || !Number.isFinite(points[i].f) || !Number.isFinite(points[i].fp)) {
        throw new Error(`Point ${i} has a non-finite x, f, or f'.`);
      }
      z[2 * i] = points[i].x; z[2 * i + 1] = points[i].x;
      Q[2 * i][0] = points[i].f; Q[2 * i + 1][0] = points[i].f;
      Q[2 * i + 1][1] = points[i].fp;
      if (i !== 0) {
        if (z[2 * i] === z[2 * i - 1]) throw new Error("Duplicate x values are not allowed.");
        Q[2 * i][1] = (Q[2 * i][0] - Q[2 * i - 1][0]) / (z[2 * i] - z[2 * i - 1]);
      }
    }
    for (let j = 2; j <= m; j++) {
      for (let i = j; i <= m; i++) {
        Q[i][j] = (Q[i][j - 1] - Q[i - 1][j - 1]) / (z[i] - z[i - j]);
      }
    }
    return { z, Q };
  };

  // Evaluates the Hermite polynomial built by runHermite at any x (Newton form):
  // H(x) = Q[0][0] + sum_{k=1..2n+1} Q[k][k] * prod_{j<k}(x - z_j).
  Algorithms.evalHermite = function (z, Q, x) {
    const m = z.length - 1;
    let result = Q[0][0];
    let prod = 1;
    for (let k = 1; k <= m; k++) {
      prod *= (x - z[k - 1]);
      result += Q[k][k] * prod;
    }
    return result;
  };

  // F: array of n functions (xVec: number[]) -> number, x0: length-n initial guess.
  // Broyden's method: one finite-difference Jacobian at x0, then a rank-1 update per step
  // instead of recomputing the Jacobian.
  Algorithms.runBroyden = function (F, x0, tol, maxIter) {
    const n = x0.length;
    if (F.length !== n) throw new Error("Number of equations must match the number of unknowns.");
    let x = [...x0];
    let J = Algorithms.jacobianFD(F, x);
    let fx;
    try { fx = F.map((fi) => fi(x)); } catch { throw new Error("Could not evaluate F(x) at the initial guess."); }
    if (!fx.every(Number.isFinite)) throw new Error("F(x) produced a non-finite value at the initial guess.");

    const iterations = [];
    for (let k = 1; k <= maxIter; k++) {
      let delta;
      try { delta = Algorithms.solveLinear(J, fx.map((v) => -v)); }
      catch { throw new Error(`The Jacobian approximation is singular at iteration ${k} — Broyden's method fails here.`); }
      const xNext = x.map((xi, i) => xi + delta[i]);
      let fxNext;
      try { fxNext = F.map((fi) => fi(xNext)); } catch { throw new Error("Could not evaluate F(x) at the new iterate."); }
      if (!fxNext.every(Number.isFinite)) throw new Error("F(x) produced a non-finite value.");

      const err = Math.max(...delta.map(Math.abs));
      iterations.push({ n: k, x, fx, J, delta, xNext, fxNext, err });
      if (err < tol) break;

      // Broyden rank-1 Jacobian update (only when continuing to the next step).
      const dF = fxNext.map((v, i) => v - fx[i]);
      const Jdx = Algorithms.matVec(J, delta);
      const num = dF.map((v, i) => v - Jdx[i]);
      const denom = delta.reduce((s, v) => s + v * v, 0);
      if (denom < 1e-14) break; // step collapsed ≈ at the root; keep the last recorded iterate
      const Jnext = J.map((row, i) => row.map((Jij, j) => Jij + (num[i] * delta[j]) / denom));

      x = xNext; fx = fxNext; J = Jnext;
    }
    return iterations;
  };

  // f, fp, fpp: number -> number (f and its first two derivatives), from x0. Modified
  // Newton for multiple roots: x_{n+1} = x_n - f(x_n)*f'(x_n) / (f'(x_n)^2 - f(x_n)*f''(x_n))
  // converges quadratically even when the root has multiplicity > 1.
  Algorithms.runNewtonMultiple = function (f, fp, fpp, x0, tol, maxIter) {
    const iterations = [];
    let x = x0;
    for (let n = 1; n <= maxIter; n++) {
      let fx, fpx, fppx;
      try { fx = f(x); fpx = fp(x); fppx = fpp(x); } catch { throw new Error("f(x), f'(x), or f''(x) could not be evaluated at the current iterate."); }
      if (![fx, fpx, fppx].every(Number.isFinite)) throw new Error("Evaluation produced a non-finite value.");
      const denom = fpx * fpx - fx * fppx;
      if (Math.abs(denom) < 1e-14) {
        // Already at (or extremely close to) the root — denominator naturally vanishes there.
        iterations.push({ n, x, fx, fpx, fppx, xNext: x, err: 0 });
        break;
      }
      const xNext = x - (fx * fpx) / denom;
      const err = Math.abs(xNext - x);
      iterations.push({ n, x, fx, fpx, fppx, xNext, err });
      if (err < tol) break;
      x = xNext;
    }
    return iterations;
  };

  // g: number -> number, Steffensen's method (Aitken's Δ² acceleration applied to fixed-point
  // iteration). From x0, computes x̂ = x0 - (g(x0)-x0)² / (g(g(x0)) - 2g(x0) + x0) in one shot.
  Algorithms.runSteffensen = function (g, x0, tol, maxIter) {
    const iterations = [];
    let x = x0;
    for (let n = 1; n <= maxIter; n++) {
      let gx, ggx;
      try { gx = g(x); ggx = g(gx); } catch { throw new Error("g(x) could not be evaluated at the current iterate."); }
      if (![gx, ggx].every(Number.isFinite)) throw new Error("Iteration produced a non-finite value.");
      const denom = ggx - 2 * gx + x;
      if (Math.abs(denom) < 1e-14) throw new Error(`Denominator ≈ 0 at n = ${n} — Steffensen's method fails here.`);
      const xNext = x - (gx - x) * (gx - x) / denom;
      const err = Math.abs(xNext - x);
      iterations.push({ n, x, gx, ggx, xNext, err });
      if (err < tol) break;
      x = xNext;
    }
    return iterations;
  };

  // coeffs: array [a_n, a_{n-1}, ..., a_1, a_0] for p(x) = a_n*x^n + ... + a_1*x + a_0.
  // x: point to evaluate. Returns { value, deflated: [b_{n-1}, ..., b_1, b_0] } where
  // deflated are the coefficients of p(x) / (x - x0) (Horner's method + deflation).
  Algorithms.runHorner = function (coeffs, x) {
    if (!coeffs || coeffs.length === 0) throw new Error("Coefficient array cannot be empty.");
    if (!Number.isFinite(x)) throw new Error("Evaluation point x must be finite.");
    const n = coeffs.length - 1;
    let b = coeffs[0];
    const deflated = [b];
    for (let i = 1; i <= n; i++) {
      b = b * x + coeffs[i];
      if (i < n) deflated.push(b);
    }
    return { value: b, deflated };
  };

  // points: [{x, y}, ...] with distinct x values. Neville's algorithm for polynomial
  // interpolation: builds the table P[i][j] where P[i][0] = y_i and
  // P[i][j] = ((x - x_{i-j})*P[i][j-1] - (x - x_i)*P[i-1][j-1]) / (x_i - x_{i-j})
  // Returns the full table plus the interpolated value at x.
  Algorithms.runNeville = function (points, x) {
    const n = points.length - 1;
    if (n < 0) throw new Error("At least one point is required.");
    const P = [];
    for (let i = 0; i <= n; i++) P.push(new Array(n + 1).fill(0));
    for (let i = 0; i <= n; i++) P[i][0] = points[i].y;
    for (let j = 1; j <= n; j++) {
      for (let i = j; i <= n; i++) {
        const denom = points[i].x - points[i - j].x;
        if (Math.abs(denom) < 1e-14) throw new Error(`Duplicate x values at i=${i}, j=${j}.`);
        P[i][j] = ((x - points[i - j].x) * P[i][j - 1] - (x - points[i].x) * P[i - 1][j - 1]) / denom;
      }
    }
    return { table: P, value: P[n][n] };
  };

  // points: [{x, y}, ...] with distinct x values. Newton's divided-difference formula:
  // builds the divided-difference table and evaluates the interpolating polynomial at x.
  // P(x) = f[x_0] + f[x_0,x_1](x-x_0) + f[x_0,x_1,x_2](x-x_0)(x-x_1) + ...
  // The divided differences f[x_0,...,x_k] are in DD[k][k] (diagonal).
  Algorithms.runNewtonDD = function (points, x) {
    const n = points.length - 1;
    if (n < 0) throw new Error("At least one point is required.");
    const DD = [];
    for (let i = 0; i <= n; i++) DD.push(new Array(n + 1).fill(0));
    for (let i = 0; i <= n; i++) DD[i][0] = points[i].y;
    for (let j = 1; j <= n; j++) {
      for (let i = j; i <= n; i++) {
        const denom = points[i].x - points[i - j].x;
        if (Math.abs(denom) < 1e-14) throw new Error(`Duplicate x values at i=${i}, j=${j}.`);
        DD[i][j] = (DD[i][j - 1] - DD[i - 1][j - 1]) / denom;
      }
    }
    // Evaluate using nested (Horner-like) form:
    // P(x) = DD[0][0] + (x-x0)*(DD[1][1] + (x-x1)*(DD[2][2] + ...))
    let result = DD[n][n];
    for (let k = n - 1; k >= 0; k--) {
      result = result * (x - points[k].x) + DD[k][k];
    }
    return { table: DD, value: result, coeffs: DD.map((row, i) => row[i]) };
  };

  // f: number -> number. Numerical differentiation at x using forward and central
  // differences with step h. Returns { forward, central, h }. h = 0 is rejected up front:
  // dividing by it silently produced NaN instead of an error.
  Algorithms.runNumericalDiff = function (f, x, h) {
    if (!Number.isFinite(x)) throw new Error("The evaluation point x must be a finite number.");
    if (!Number.isFinite(h) || h === 0) throw new Error("The step size h must be a nonzero finite number.");
    let fx, fpx, fmx;
    try { fx = f(x); fpx = f(x + h); fmx = f(x - h); } catch { throw new Error("f(x) could not be evaluated at x, x + h or x - h."); }
    if (![fx, fpx, fmx].every(Number.isFinite)) throw new Error("f(x) produced a non-finite value at x, x + h or x - h — check that all three lie inside the domain.");
    const forward = (fpx - fx) / h;
    const central = (fpx - fmx) / (2 * h);
    return { forward, central, h };
  };

  // f: number -> number. Richardson extrapolation applied to central difference.
  // D(h) = (f(x+h) - f(x-h)) / (2h), D*(h) = (4*D(h/2) - D(h)) / 3 (O(h^4) accurate).
  // Guards match runNumericalDiff: this used to have none at all, so a point outside the
  // domain (log at x = 0.05 with h = 0.2, say) returned NaN with no indication why.
  Algorithms.runRichardsonDiff = function (f, x, h) {
    if (!Number.isFinite(x)) throw new Error("The evaluation point x must be a finite number.");
    if (!Number.isFinite(h) || h === 0) throw new Error("The step size h must be a nonzero finite number.");
    let a, b, c, d;
    try { a = f(x + h); b = f(x - h); c = f(x + h / 2); d = f(x - h / 2); }
    catch { throw new Error("f(x) could not be evaluated at one of x ± h, x ± h/2."); }
    if (![a, b, c, d].every(Number.isFinite)) throw new Error("f(x) produced a non-finite value at one of x ± h, x ± h/2 — check that all four lie inside the domain.");
    const D1 = (a - b) / (2 * h);
    const D2 = (c - d) / h;
    const richardson = (4 * D2 - D1) / 3;
    return { D1, D2, richardson, h };
  };

  // points: [{x, y}, ...]. Discrete least-squares fit of degree d polynomial.
  // Solves the normal equations V^T V c = V^T y where V is the Vandermonde matrix.
  Algorithms.runDiscreteLeastSquares = function (points, d) {
    const n = points.length;
    if (n <= d) throw new Error("Need more points than coefficients for least squares.");
    // Build Vandermonde matrix V (n x (d+1))
    const V = [];
    const y = [];
    for (let i = 0; i < n; i++) {
      const row = [];
      for (let j = 0; j <= d; j++) row.push(Math.pow(points[i].x, j));
      V.push(row);
      y.push(points[i].y);
    }
    // Normal equations: V^T V c = V^T y
    const VtV = Algorithms.matMul(
      V[0].map((_, j) => V.map((row) => row[j])), // V^T
      V
    );
    const Vty = V[0].map((_, j) => V.reduce((s, row, i) => s + row[j] * y[i], 0));
    const coeffs = Algorithms.solveLinear(VtV, Vty);
    return { coeffs, d };
  };

  // coeffs: ascending monomial coefficients [a_0, a_1, ..., a_n], i.e. coeffs[k] is the
  // coefficient of x^k, so p(x) = a_n*x^n + ... + a_1*x + a_0. (Note: this is the OPPOSITE
  // order from Algorithms.runHorner, which takes descending [a_n, ..., a_0].)
  // Chebyshev economization: convert to the Chebyshev basis, drop every term above degree
  // d, convert back. Both basis changes are generated from the Chebyshev recurrence, so
  // there is no upper limit on the input degree.
  Algorithms.runChebyshevEcon = function (coeffs, d) {
    if (!Array.isArray(coeffs) || coeffs.length === 0) throw new Error("Coefficient array cannot be empty.");
    if (!coeffs.every(Number.isFinite)) throw new Error("All coefficients must be finite numbers.");
    if (!Number.isInteger(d) || d < 0) throw new Error("Target degree d must be a non-negative integer.");
    const n = coeffs.length - 1;
    if (d >= n) return { econCoeffs: coeffs.slice(), originalDegree: n, economizedDegree: d };

    // Monomial -> Chebyshev. Builds x^k = sum_j c_j T_j one power at a time, using
    // x*T_0 = T_1 and x*T_j = (T_{j+1} + T_{j-1}) / 2 for j >= 1.
    const toCheb = (mono) => {
      const deg = mono.length - 1;
      const cheb = new Array(deg + 1).fill(0);
      let xPow = [1]; // x^0 = T_0
      for (let k = 0; k <= deg; k++) {
        for (let j = 0; j < xPow.length; j++) cheb[j] += mono[k] * xPow[j];
        if (k === deg) break;
        const next = new Array(xPow.length + 1).fill(0);
        for (let j = 0; j < xPow.length; j++) {
          const a = xPow[j];
          if (a === 0) continue;
          if (j === 0) next[1] += a;                       // x*T_0 = T_1
          else { next[j + 1] += a / 2; next[j - 1] += a / 2; } // x*T_j = (T_{j+1} + T_{j-1})/2
        }
        xPow = next;
      }
      return cheb;
    };

    // Chebyshev -> monomial, from T_0 = 1, T_1 = x, T_{k+1} = 2x*T_k - T_{k-1}
    // (multiplying by x is a shift of the coefficient array by one index).
    const chebToMono = (cheb) => {
      const deg = cheb.length - 1;
      const mono = new Array(deg + 1).fill(0);
      let prev = [1];                       // T_0
      let curr = deg >= 1 ? [0, 1] : null;  // T_1
      for (let j = 0; j < prev.length; j++) mono[j] += cheb[0] * prev[j];
      for (let k = 1; k <= deg; k++) {
        for (let j = 0; j < curr.length; j++) mono[j] += cheb[k] * curr[j];
        if (k === deg) break;
        const next = new Array(curr.length + 1).fill(0);
        for (let j = 0; j < curr.length; j++) next[j + 1] += 2 * curr[j]; // 2x*T_k
        for (let j = 0; j < prev.length; j++) next[j] -= prev[j];         // - T_{k-1}
        prev = curr;
        curr = next;
      }
      return mono;
    };

    const truncated = toCheb(coeffs).slice(0, d + 1);
    while (truncated.length < d + 1) truncated.push(0);
    const econCoeffs = chebToMono(truncated);
    while (econCoeffs.length <= d) econCoeffs.push(0);
    return { econCoeffs: econCoeffs.slice(0, d + 1), originalDegree: n, economizedDegree: d };
  };

  return Algorithms;
});
