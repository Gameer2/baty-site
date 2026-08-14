/* Linear Algebra Engine — pure, DOM-free matrix routines.
   Shared between the browser pages (assets/js/<method>.js wires this to the UI) and the
   Node verification suite (tests/verify-linalg.js) — one implementation, two callers.

   Reuses assets/js/algorithms.js for the primitives that already exist there (matMul,
   matVec, qrDecompose, runQRAlgorithm). Nothing from that file is copied here; a fix
   there is a fix here.

   Row reduction is the foundation of this module: solveSystem, nullSpaceBasis,
   columnSpaceBasis, rank, linear independence, inverse and eigenvectors are all built on
   LinAlg.rref rather than re-deriving elimination each time. */
(function (root, factory) {
  // Always attach to `root` (window/self/globalThis), not just in the non-CJS branch —
  // canvas's Vite/Vitest tooling runs source files through vite-node, which shims a `module`
  // global onto plain .js files even outside node_modules, so the CJS branch below would run
  // and set `module.exports` but leave `root.LinAlg` unset under `yarn test:app` — even though
  // the real browser (no `module` global) and Node's `require()` both worked fine. This mirrors
  // the fix already applied to algorithms.js (see its header comment).
  const Algorithms = typeof module === "object" && module.exports
    ? require("./algorithms.js")
    : root.Algorithms;
  const exported = factory(Algorithms);
  if (typeof module === "object" && module.exports) {
    module.exports = exported;
  }
  root.LinAlg = exported;
})(typeof self !== "undefined" ? self : this, function (Algorithms) {
  "use strict";

  const LinAlg = {};
  const TOL = 1e-10;

  // ---------------------------------------------------------------- helpers

  // Validates a rectangular numeric matrix and returns its dimensions.
  function dims(A, name) {
    name = name || "matrix";
    if (!Array.isArray(A) || A.length === 0) throw new Error(`The ${name} must be a non-empty array of rows.`);
    const rows = A.length;
    if (!Array.isArray(A[0]) || A[0].length === 0) throw new Error(`The ${name} must have at least one column.`);
    const cols = A[0].length;
    for (let i = 0; i < rows; i++) {
      if (!Array.isArray(A[i]) || A[i].length !== cols) throw new Error(`Every row of the ${name} must have the same length (row ${i + 1} does not).`);
      for (let j = 0; j < cols; j++) {
        if (!Number.isFinite(A[i][j])) throw new Error(`Entry (${i + 1}, ${j + 1}) of the ${name} is not a finite number.`);
      }
    }
    return { rows, cols };
  }

  // Deep copy of a matrix (rows are copied, so callers can mutate freely).
  LinAlg.clone = function (A) { return A.map((r) => [...r]); };

  // n x n identity matrix.
  LinAlg.identity = function (n) {
    if (!Number.isInteger(n) || n < 1) throw new Error("Identity size must be a positive integer.");
    return Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)));
  };

  // Transpose of an m x n matrix.
  LinAlg.transpose = function (A) {
    const { rows, cols } = dims(A);
    return Array.from({ length: cols }, (_, j) => Array.from({ length: rows }, (_, i) => A[i][j]));
  };

  // Snaps values within tol of zero to exactly 0, so pivot detection and display agree.
  function clean(x, tol) { return Math.abs(x) < (tol || TOL) ? 0 : x; }

  // ------------------------------------------------- 1. row reduction (RREF)

  // Above this many entries the step log is not kept. Each recorded step stores a full copy
  // of the matrix, so the log costs O(n^4) overall: measured at 6.4 MB for a 30x30 and
  // 316 MB for an 80x80, which would hang the page long before the arithmetic did (the
  // elimination itself takes well under a second at those sizes). A log that large could
  // not be displayed usefully anyway.
  const STEP_LOG_MAX_ENTRIES = 144; // 12 x 12

  // A: m x n matrix. Gauss-Jordan elimination with partial pivoting, all the way to
  // reduced row echelon form. Returns { R, pivots, freeCols, rank, swaps, steps,
  // stepsOmitted } where pivots[i] is the column index of the leading 1 in row i, and steps
  // is the ordered list of elementary row operations performed (for the step-through UI).
  // opts.recordSteps forces the log on or off; by default it is kept only for matrices
  // small enough to display, and `stepsOmitted` says whether it was skipped.
  LinAlg.rref = function (A, tol, opts) {
    tol = tol || TOL;
    opts = opts || {};
    const { rows, cols } = dims(A);
    const recordSteps = opts.recordSteps !== undefined ? opts.recordSteps : (rows * cols <= STEP_LOG_MAX_ENTRIES);
    const R = LinAlg.clone(A);
    const pivots = [];
    const steps = [];
    let swaps = 0;
    let row = 0;

    for (let col = 0; col < cols && row < rows; col++) {
      // Partial pivoting: pick the largest-magnitude candidate in this column.
      let best = row;
      for (let r = row + 1; r < rows; r++) if (Math.abs(R[r][col]) > Math.abs(R[best][col])) best = r;
      if (Math.abs(R[best][col]) < tol) continue; // no pivot in this column — it is free

      if (best !== row) {
        const t = R[best]; R[best] = R[row]; R[row] = t;
        swaps++;
        if (recordSteps) steps.push({ type: "swap", rows: [row, best], description: `R${row + 1} <-> R${best + 1}`, matrix: LinAlg.clone(R) });
      }

      const pivotValue = R[row][col];
      if (Math.abs(pivotValue - 1) > tol) {
        for (let c = 0; c < cols; c++) R[row][c] = clean(R[row][c] / pivotValue, tol);
        if (recordSteps) steps.push({ type: "scale", row, factor: 1 / pivotValue, description: `R${row + 1} -> (1/${fmt(pivotValue)}) R${row + 1}`, matrix: LinAlg.clone(R) });
      }

      for (let r = 0; r < rows; r++) {
        if (r === row) continue;
        const factor = R[r][col];
        if (Math.abs(factor) < tol) continue;
        for (let c = 0; c < cols; c++) R[r][c] = clean(R[r][c] - factor * R[row][c], tol);
        if (recordSteps) steps.push({ type: "eliminate", row: r, usingRow: row, factor, description: `R${r + 1} -> R${r + 1} - (${fmt(factor)}) R${row + 1}`, matrix: LinAlg.clone(R) });
      }

      pivots.push(col);
      row++;
    }

    const freeCols = [];
    for (let c = 0; c < cols; c++) if (!pivots.includes(c)) freeCols.push(c);
    return { R, pivots, freeCols, rank: pivots.length, swaps, steps, stepsOmitted: !recordSteps };
  };

  function fmt(x) { return Number.isInteger(x) ? String(x) : x.toFixed(4).replace(/\.?0+$/, ""); }

  // A: m x n matrix -> rank (number of pivots in its RREF).
  LinAlg.rank = function (A, tol) { return LinAlg.rref(A, tol, { recordSteps: false }).rank; };

  // ------------------------------------------- 2. Ax = b, all three cases

  // A: m x n, b: length-m right-hand side. Classifies the system by comparing rank(A) to
  // rank([A|b]) and returns the full solution set, not just the square-invertible case:
  //   type "none"     -> inconsistent (a pivot appears in the augmented column)
  //   type "unique"   -> rank == n, solution is the single vector in `solution`
  //   type "infinite" -> rank < n, solution set is `particular` + span(`nullBasis`)
  // Also returns the augmented RREF and which columns are free, so the UI can show the
  // parametric form the way a textbook writes it.
  LinAlg.solveSystem = function (A, b, tol) {
    tol = tol || TOL;
    const { rows, cols } = dims(A);
    if (!Array.isArray(b) || b.length !== rows) throw new Error(`The right-hand side must have ${rows} entries (one per equation).`);
    for (let i = 0; i < rows; i++) if (!Number.isFinite(b[i])) throw new Error(`Right-hand side entry ${i + 1} is not a finite number.`);

    const aug = A.map((r, i) => [...r, b[i]]);
    const { R, pivots, rank, steps, stepsOmitted } = LinAlg.rref(aug, tol);
    const coeffRank = LinAlg.rref(A, tol, { recordSteps: false }).rank;

    // A pivot in the last (augmented) column means a row reads 0 = nonzero.
    if (pivots.includes(cols)) {
      const badRow = pivots.indexOf(cols);
      return { type: "none", rank: coeffRank, augmentedRank: rank, rref: R, pivots, freeVars: [], steps, stepsOmitted,
        reason: `Row ${badRow + 1} of the reduced form reads 0 = ${fmt(R[badRow][cols])}, which is impossible.` };
    }

    const freeVars = [];
    for (let c = 0; c < cols; c++) if (!pivots.includes(c)) freeVars.push(c);

    // Particular solution: every free variable set to 0.
    const particular = new Array(cols).fill(0);
    for (let i = 0; i < pivots.length; i++) particular[pivots[i]] = R[i][cols];

    if (freeVars.length === 0) {
      return { type: "unique", solution: particular, rank: coeffRank, augmentedRank: rank, rref: R, pivots, freeVars, steps, stepsOmitted };
    }

    // One null-space basis vector per free variable: set it to 1, the others to 0.
    const nullBasis = freeVars.map((f) => {
      const v = new Array(cols).fill(0);
      v[f] = 1;
      for (let i = 0; i < pivots.length; i++) v[pivots[i]] = -R[i][f];
      return v;
    });

    return { type: "infinite", particular, nullBasis, rank: coeffRank, augmentedRank: rank, rref: R, pivots, freeVars, steps, stepsOmitted,
      dimensionOfSolutionSet: freeVars.length };
  };

  // ------------------------------------------------------ 3. the subspaces

  // A: m x n -> basis for the null space (kernel) of A, as an array of length-n vectors.
  // Empty array means the null space is {0} (A has full column rank).
  LinAlg.nullSpaceBasis = function (A, tol) {
    const { cols } = dims(A);
    const { R, pivots, freeCols } = LinAlg.rref(A, tol, { recordSteps: false });
    return freeCols.map((f) => {
      const v = new Array(cols).fill(0);
      v[f] = 1;
      for (let i = 0; i < pivots.length; i++) v[pivots[i]] = -R[i][f];
      return v;
    });
  };

  // A: m x n -> basis for the column space, taken as the ORIGINAL columns of A at the
  // pivot positions (not the RREF's columns — those span a different space in general).
  LinAlg.columnSpaceBasis = function (A, tol) {
    const { pivots } = LinAlg.rref(A, tol, { recordSteps: false });
    return pivots.map((c) => A.map((r) => r[c]));
  };

  // A: m x n -> basis for the row space: the nonzero rows of the RREF.
  LinAlg.rowSpaceBasis = function (A, tol) {
    const { R, rank } = LinAlg.rref(A, tol, { recordSteps: false });
    return R.slice(0, rank).map((r) => [...r]);
  };

  // A: m x n -> { rank, nullity, cols } verifying the rank-nullity theorem
  // rank + nullity = number of columns.
  LinAlg.rankNullity = function (A, tol) {
    const { cols } = dims(A);
    const rank = LinAlg.rref(A, tol, { recordSteps: false }).rank;
    return { rank, nullity: cols - rank, cols, identityHolds: rank + (cols - rank) === cols };
  };

  // ------------------------------- 4. independence, span, basis of a set

  // vectors: array of equal-length vectors. Independent exactly when the matrix with those
  // vectors as COLUMNS has rank equal to the number of vectors. Returns the rank and, when
  // dependent, a non-trivial combination summing to zero (a null-space vector).
  LinAlg.isLinearlyIndependent = function (vectors, tol) {
    if (!Array.isArray(vectors) || vectors.length === 0) throw new Error("Provide at least one vector.");
    const len = vectors[0].length;
    vectors.forEach((v, i) => {
      if (!Array.isArray(v) || v.length !== len) throw new Error(`Vector ${i + 1} has a different length than vector 1.`);
    });
    const M = Array.from({ length: len }, (_, i) => vectors.map((v) => v[i])); // vectors as columns
    const rank = LinAlg.rref(M, tol, { recordSteps: false }).rank;
    const independent = rank === vectors.length;
    const relations = independent ? [] : LinAlg.nullSpaceBasis(M, tol);
    return { independent, rank, count: vectors.length, relations };
  };

  // vectors: array of equal-length vectors -> a basis for their span, chosen as a subset
  // of the original vectors (the ones at pivot columns), plus the indices kept.
  LinAlg.basisFromSpanningSet = function (vectors, tol) {
    if (!Array.isArray(vectors) || vectors.length === 0) throw new Error("Provide at least one vector.");
    const len = vectors[0].length;
    const M = Array.from({ length: len }, (_, i) => vectors.map((v) => v[i]));
    const { pivots } = LinAlg.rref(M, tol, { recordSteps: false });
    return { basis: pivots.map((p) => [...vectors[p]]), indices: pivots, dimension: pivots.length };
  };

  // ------------------------------------------- 5. inverse via Gauss-Jordan

  // A: n x n -> its inverse, by row-reducing [A | I] to [I | A^-1]. Throws with a specific
  // message when A is singular (rank < n) rather than returning a garbage matrix.
  LinAlg.inverse = function (A, tol) {
    const { rows, cols } = dims(A);
    if (rows !== cols) throw new Error("Only square matrices have an inverse.");
    const n = rows;
    const aug = A.map((r, i) => [...r, ...LinAlg.identity(n)[i]]);
    const { R, pivots, steps, stepsOmitted } = LinAlg.rref(aug, tol);
    // Test the rank of A itself, not of [A | I]: the augmented matrix can reach full rank
    // by taking a pivot in the identity half even when A is singular, so `rank` here would
    // wrongly read n. A is invertible exactly when every pivot lands in the left n columns.
    const rankA = pivots.filter((p) => p < n).length;
    if (rankA < n) throw new Error(`Matrix is singular (rank ${rankA} < ${n}) — no inverse exists.`);
    const inv = R.map((r) => r.slice(n));
    return { inverse: inv, steps, stepsOmitted, rank: rankA };
  };

  // ------------------------------------------------------ 6. determinant

  // A: n x n -> determinant via elimination: the product of the pivots of the row-echelon
  // form, with a sign flip per row swap. O(n^3), unlike cofactor expansion's O(n!).
  LinAlg.determinant = function (A, tol) {
    tol = tol || TOL;
    const { rows, cols } = dims(A);
    if (rows !== cols) throw new Error("Only square matrices have a determinant.");
    const n = rows;
    const M = LinAlg.clone(A);
    let det = 1, swaps = 0;
    for (let col = 0; col < n; col++) {
      let best = col;
      for (let r = col + 1; r < n; r++) if (Math.abs(M[r][col]) > Math.abs(M[best][col])) best = r;
      if (Math.abs(M[best][col]) < tol) return 0; // a zero column below the pivot => singular
      if (best !== col) { const t = M[best]; M[best] = M[col]; M[col] = t; swaps++; }
      det *= M[col][col];
      for (let r = col + 1; r < n; r++) {
        const f = M[r][col] / M[col][col];
        for (let c = col; c < n; c++) M[r][c] -= f * M[col][c];
      }
    }
    return (swaps % 2 === 0 ? 1 : -1) * det;
  };

  // A: n x n -> determinant by cofactor expansion along the first row. Exponential cost,
  // included because it is the definition undergraduates meet first; capped at 8x8 so a
  // large matrix cannot hang the page. Use LinAlg.determinant for real work.
  LinAlg.determinantCofactor = function (A) {
    const { rows, cols } = dims(A);
    if (rows !== cols) throw new Error("Only square matrices have a determinant.");
    if (rows > 8) throw new Error("Cofactor expansion is capped at 8x8 — use the elimination-based determinant instead.");
    function det(M) {
      const n = M.length;
      if (n === 1) return M[0][0];
      if (n === 2) return M[0][0] * M[1][1] - M[0][1] * M[1][0];
      let sum = 0;
      for (let j = 0; j < n; j++) {
        if (M[0][j] === 0) continue;
        const minor = M.slice(1).map((r) => r.filter((_, c) => c !== j));
        sum += ((j % 2 === 0) ? 1 : -1) * M[0][j] * det(minor);
      }
      return sum;
    }
    return det(A);
  };

  // ------------------------------------------------------------- 7. LU

  // A: n x n -> { L, U, P, perm, swaps, det } with P*A = L*U (partial pivoting).
  // L is unit lower-triangular, U upper-triangular, P the permutation matrix and perm the
  // row order it encodes. Throws if A is singular.
  LinAlg.luDecompose = function (A, tol) {
    tol = tol || TOL;
    const { rows, cols } = dims(A);
    if (rows !== cols) throw new Error("LU decomposition requires a square matrix.");
    const n = rows;
    const U = LinAlg.clone(A);
    const L = LinAlg.identity(n);
    const perm = Array.from({ length: n }, (_, i) => i);
    let swaps = 0;

    for (let col = 0; col < n; col++) {
      let best = col;
      for (let r = col + 1; r < n; r++) if (Math.abs(U[r][col]) > Math.abs(U[best][col])) best = r;
      if (Math.abs(U[best][col]) < tol) throw new Error(`Matrix is singular at column ${col + 1} — no LU decomposition with this pivoting.`);
      if (best !== col) {
        const tU = U[best]; U[best] = U[col]; U[col] = tU;
        const tP = perm[best]; perm[best] = perm[col]; perm[col] = tP;
        // Swap the already-computed multipliers in L as well (columns left of `col`).
        for (let c = 0; c < col; c++) { const t = L[best][c]; L[best][c] = L[col][c]; L[col][c] = t; }
        swaps++;
      }
      for (let r = col + 1; r < n; r++) {
        const f = U[r][col] / U[col][col];
        L[r][col] = f;
        for (let c = col; c < n; c++) U[r][c] -= f * U[col][c];
      }
    }

    const P = perm.map((p) => LinAlg.identity(n)[p]);
    let det = (swaps % 2 === 0 ? 1 : -1);
    for (let i = 0; i < n; i++) det *= U[i][i];
    return { L, U, P, perm, swaps, det };
  };

  // ---------------------------------------- 8-9. eigenvalues & diagonalization

  // A: n x n -> coefficients of the characteristic polynomial det(A - xI), via the
  // Faddeev-LeVerrier recursion. Returned ASCENDING (coeffs[k] multiplies x^k), matching
  // Algorithms.runChebyshevEcon's convention. The leading coefficient is (-1)^n.
  LinAlg.charPoly = function (A) {
    const { rows, cols } = dims(A);
    if (rows !== cols) throw new Error("The characteristic polynomial is only defined for square matrices.");
    const n = rows;
    // Faddeev-LeVerrier computes c_k for det(xI - A) = x^n + c_1 x^(n-1) + ... + c_n
    let M = Array.from({ length: n }, () => new Array(n).fill(0));
    const c = new Array(n + 1).fill(0);
    c[0] = 1;
    for (let k = 1; k <= n; k++) {
      // M_k = A*M_{k-1} + c_{k-1} I
      if (k === 1) M = LinAlg.identity(n);
      else {
        const AM = Algorithms.matMul(A, M);
        M = AM.map((r, i) => r.map((v, j) => v + (i === j ? c[k - 1] : 0)));
      }
      const AM = Algorithms.matMul(A, M);
      let tr = 0;
      for (let i = 0; i < n; i++) tr += AM[i][i];
      c[k] = -tr / k;
    }
    // c holds det(xI - A) in DESCENDING powers: [1, c_1, ..., c_n].
    // det(A - xI) = (-1)^n det(xI - A); return ascending.
    const sign = n % 2 === 0 ? 1 : -1;
    const ascending = [];
    for (let k = 0; k <= n; k++) ascending.push(sign * c[n - k]);
    return ascending;
  };

  // Complex helpers, kept minimal and local — enough for polynomial roots. (Full complex
  // matrix support is deliberately out of scope for this module.)
  const cx = {
    add: (a, b) => ({ re: a.re + b.re, im: a.im + b.im }),
    sub: (a, b) => ({ re: a.re - b.re, im: a.im - b.im }),
    mul: (a, b) => ({ re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re }),
    div: (a, b) => {
      const d = b.re * b.re + b.im * b.im;
      return { re: (a.re * b.re + a.im * b.im) / d, im: (a.im * b.re - a.re * b.im) / d };
    },
    abs: (a) => Math.hypot(a.re, a.im),
  };

  // coeffs: ascending real polynomial coefficients -> all roots (real and complex), via
  // Durand-Kerner simultaneous iteration. Returns [{re, im}, ...] of length deg.
  LinAlg.polynomialRoots = function (coeffs, tol, maxIter) {
    tol = tol || 1e-12;
    maxIter = maxIter || 500;
    let c = [...coeffs];
    while (c.length > 1 && Math.abs(c[c.length - 1]) < 1e-14) c.pop(); // drop leading zeros
    const deg = c.length - 1;
    if (deg < 1) return [];
    const lead = c[deg];
    const monic = c.map((v) => v / lead);
    const evalAt = (z) => {
      let acc = { re: 0, im: 0 };
      for (let k = deg; k >= 0; k--) acc = cx.add(cx.mul(acc, z), { re: monic[k], im: 0 });
      return acc;
    };
    // Spread the initial guesses around a circle to avoid symmetric stalling.
    let z = Array.from({ length: deg }, (_, k) => ({
      re: 0.4 + 0.9 * Math.cos((2 * Math.PI * k) / deg + 0.5),
      im: 0.9 * Math.sin((2 * Math.PI * k) / deg + 0.5),
    }));
    for (let it = 0; it < maxIter; it++) {
      let maxShift = 0;
      for (let i = 0; i < deg; i++) {
        let denom = { re: 1, im: 0 };
        for (let j = 0; j < deg; j++) if (j !== i) denom = cx.mul(denom, cx.sub(z[i], z[j]));
        if (cx.abs(denom) < 1e-300) continue;
        const delta = cx.div(evalAt(z[i]), denom);
        z[i] = cx.sub(z[i], delta);
        maxShift = Math.max(maxShift, cx.abs(delta));
      }
      if (maxShift < tol) break;
    }

    // Decide real vs complex with a RELATIVE test. Durand-Kerner converges only to about
    // tol^(1/m) for a root of multiplicity m, so a genuine double real root arrives with an
    // imaginary residue around 1e-8 — a fixed 1e-10 cut would misreport it as complex (and
    // then, e.g., call a defective matrix "complex" instead of "repeated eigenvalue").
    // A true complex pair sits far outside this band, so nothing is merged by mistake.
    const isReal = (r) => Math.abs(r.im) <= Math.max(1e-8, 1e-7 * Math.abs(r.re));
    // Newton polish on the real polynomial, to recover full precision after snapping.
    const polish = (x) => {
      for (let k = 0; k < 60; k++) {
        let p = 0, dp = 0;
        for (let i = deg; i >= 0; i--) { dp = dp * x + p; p = p * x + monic[i]; }
        if (Math.abs(dp) < 1e-300) break;
        const step = p / dp;
        x -= step;
        if (Math.abs(step) < 1e-15 * Math.max(1, Math.abs(x))) break;
      }
      return x;
    };
    return z.map((r) => (isReal(r)
      ? { re: clean(polish(r.re), 1e-12), im: 0 }
      : { re: clean(r.re, 1e-12), im: r.im }));
  };

  // A: n x n -> upper Hessenberg form (zeros below the first subdiagonal) by Householder
  // similarity transforms. Same eigenvalues as A, but a QR step costs O(n^2) instead of
  // O(n^3) and converges far more reliably.
  LinAlg.hessenberg = function (A) {
    const { rows, cols } = dims(A);
    if (rows !== cols) throw new Error("Hessenberg reduction requires a square matrix.");
    const n = rows;
    const H = LinAlg.clone(A);
    for (let k = 0; k < n - 2; k++) {
      let normSq = 0;
      for (let i = k + 1; i < n; i++) normSq += H[i][k] * H[i][k];
      if (normSq < 1e-300) continue;
      let alpha = Math.sqrt(normSq);
      if (H[k + 1][k] > 0) alpha = -alpha;
      const v = new Array(n).fill(0);
      v[k + 1] = H[k + 1][k] - alpha;
      for (let i = k + 2; i < n; i++) v[i] = H[i][k];
      let vv = 0;
      for (let i = k + 1; i < n; i++) vv += v[i] * v[i];
      if (vv < 1e-300) continue;
      for (let j = 0; j < n; j++) { // left:  H <- (I - 2vv'/v'v) H
        let dot = 0;
        for (let i = k + 1; i < n; i++) dot += v[i] * H[i][j];
        const f = (2 * dot) / vv;
        for (let i = k + 1; i < n; i++) H[i][j] -= f * v[i];
      }
      for (let i = 0; i < n; i++) { // right: H <- H (I - 2vv'/v'v)
        let dot = 0;
        for (let j = k + 1; j < n; j++) dot += H[i][j] * v[j];
        const f = (2 * dot) / vv;
        for (let j = k + 1; j < n; j++) H[i][j] -= f * v[j];
      }
    }
    for (let i = 2; i < n; i++) for (let j = 0; j < i - 1; j++) H[i][j] = 0;
    return H;
  };

  // Eigenvalues of a general square matrix by shifted QR iteration on the Hessenberg form,
  // deflating a 1x1 block for each real eigenvalue and a 2x2 block for each complex pair.
  // Unlike the characteristic-polynomial route this stays accurate for large n, which is
  // why LinAlg.eigenvalues switches to it above a small size.
  LinAlg.eigenvaluesQR = function (A, tol, maxIter) {
    tol = tol || 1e-12;
    maxIter = maxIter || 200;
    const { rows, cols } = dims(A);
    if (rows !== cols) throw new Error("Eigenvalues are only defined for square matrices.");
    const n = rows;
    const H = LinAlg.hessenberg(A);
    const values = [];
    let m = n;         // size of the still-active leading block
    let iter = 0;

    // Eigenvalues of the trailing 2x2 block [[a,b],[c,d]] — real pair or complex conjugates.
    function eig2(a, b, c, d) {
      const trace = a + d, det = a * d - b * c;
      const disc = (trace * trace) / 4 - det;
      if (disc >= 0) {
        const s = Math.sqrt(disc);
        return [{ re: trace / 2 + s, im: 0 }, { re: trace / 2 - s, im: 0 }];
      }
      const s = Math.sqrt(-disc);
      return [{ re: trace / 2, im: s }, { re: trace / 2, im: -s }];
    }

    while (m > 0 && iter < maxIter * n) {
      if (m === 1) { values.push({ re: H[0][0], im: 0 }); m = 0; break; }

      // Deflate: a negligible subdiagonal entry splits the problem.
      const scale = Math.abs(H[m - 1][m - 1]) + Math.abs(H[m - 2][m - 2]);
      if (Math.abs(H[m - 1][m - 2]) <= tol * (scale || 1)) {
        values.push({ re: H[m - 1][m - 1], im: 0 });
        m -= 1;
        continue;
      }
      if (m === 2 || (m > 2 && Math.abs(H[m - 2][m - 3]) <= tol * ((Math.abs(H[m - 2][m - 2]) + Math.abs(H[m - 3][m - 3])) || 1))) {
        eig2(H[m - 2][m - 2], H[m - 2][m - 1], H[m - 1][m - 2], H[m - 1][m - 1]).forEach((z) => values.push(z));
        m -= 2;
        continue;
      }

      // Wilkinson shift: whichever trailing-2x2 eigenvalue is nearer H[m-1][m-1]. When that
      // pair is complex the shift would be too, so fall back to a real Rayleigh shift and
      // let the 2x2 deflation above resolve the pair.
      const pair = eig2(H[m - 2][m - 2], H[m - 2][m - 1], H[m - 1][m - 2], H[m - 1][m - 1]);
      let shift;
      if (pair[0].im === 0) {
        shift = Math.abs(pair[0].re - H[m - 1][m - 1]) < Math.abs(pair[1].re - H[m - 1][m - 1]) ? pair[0].re : pair[1].re;
      } else {
        shift = H[m - 1][m - 1];
      }
      if (iter > 0 && iter % 30 === 0) shift += Math.abs(H[m - 1][m - 2]); // exceptional shift, breaks cycling

      // One implicit QR step on the active block, via Givens rotations.
      for (let i = 0; i < m; i++) H[i][i] -= shift;
      const csArr = [], snArr = [];
      for (let k = 0; k < m - 1; k++) {
        const a = H[k][k], b = H[k + 1][k];
        const r = Math.hypot(a, b);
        const c = r === 0 ? 1 : a / r, s = r === 0 ? 0 : b / r;
        csArr.push(c); snArr.push(s);
        for (let j = k; j < m; j++) {
          const t1 = H[k][j], t2 = H[k + 1][j];
          H[k][j] = c * t1 + s * t2;
          H[k + 1][j] = -s * t1 + c * t2;
        }
      }
      for (let k = 0; k < m - 1; k++) {
        const c = csArr[k], s = snArr[k];
        const top = Math.min(k + 2, m - 1);
        for (let i = 0; i <= top; i++) {
          const t1 = H[i][k], t2 = H[i][k + 1];
          H[i][k] = c * t1 + s * t2;
          H[i][k + 1] = -s * t1 + c * t2;
        }
      }
      for (let i = 0; i < m; i++) H[i][i] += shift;
      iter++;
    }

    if (m > 0) { // did not fully converge — report what the diagonal still holds
      for (let i = 0; i < m; i++) values.push({ re: H[i][i], im: 0 });
    }
    return values.map((z) => ({ re: clean(z.re, 1e-12), im: Math.abs(z.im) < 1e-12 ? 0 : z.im }));
  };

  // Above this size the characteristic-polynomial route is abandoned. Measured, not
  // guessed: on symmetric test matrices it tracks the QR algorithm to ~1e-9 at n = 12 and
  // overflows to NaN by n = 15, because the polynomial's coefficients grow past what a
  // double can hold and its roots are ill-conditioned in the coefficients (Wilkinson).
  const CHARPOLY_MAX_N = 12;

  // A: n x n -> { values, real, hasComplex, charPoly, method }.
  // For small matrices the eigenvalues come from the roots of det(A - lambda I), which is
  // what a course actually teaches and which returns the polynomial for display. For larger
  // matrices that route is numerically hopeless, so shifted QR iteration is used instead and
  // `charPoly` is null. `method` says which ran, so the UI can be honest about it.
  LinAlg.eigenvalues = function (A, tol) {
    const { rows, cols } = dims(A);
    if (rows !== cols) throw new Error("Eigenvalues are only defined for square matrices.");
    let roots = null, poly = null, method = "qr";

    if (rows <= CHARPOLY_MAX_N) {
      poly = LinAlg.charPoly(A);
      if (poly.every(Number.isFinite)) {
        const candidate = LinAlg.polynomialRoots(poly, tol);
        // Guard the route rather than trusting it: the eigenvalues must reproduce the
        // trace. If they do not, the polynomial has lost too much precision — fall back.
        let trace = 0;
        for (let i = 0; i < rows; i++) trace += A[i][i];
        const sum = candidate.reduce((s, z) => s + z.re, 0);
        const scale = Math.max(1, Math.abs(trace));
        if (candidate.every((z) => Number.isFinite(z.re) && Number.isFinite(z.im)) &&
            Math.abs(sum - trace) <= 1e-6 * scale) {
          roots = candidate;
          method = "charpoly";
        }
      }
      if (!roots) poly = null; // do not show a polynomial whose roots were not used
    }

    if (!roots) roots = LinAlg.eigenvaluesQR(A, tol);

    roots.sort((p, q) => cx.abs(q) - cx.abs(p) || q.re - p.re);
    // Real roots carry im === 0 exactly (both routes snap them), so this is an exact test
    // rather than another tolerance to keep in sync.
    const hasComplex = roots.some((r) => r.im !== 0);
    return { values: roots, real: roots.filter((r) => r.im === 0).map((r) => r.re), hasComplex, charPoly: poly, method };
  };

  // A: n x n, lambda: a REAL eigenvalue -> basis for its eigenspace, computed as the null
  // space of (A - lambda*I) using the same row reduction as everything else. Returns an
  // empty array if lambda is not (numerically) an eigenvalue.
  LinAlg.eigenvectorsFor = function (A, lambda, tol) {
    const { rows, cols } = dims(A);
    if (rows !== cols) throw new Error("Eigenvectors are only defined for square matrices.");
    if (!Number.isFinite(lambda)) throw new Error("The eigenvalue must be a finite real number.");
    // Loosen the tolerance: (A - lambda I) is singular only up to the accuracy of lambda.
    const shifted = A.map((r, i) => r.map((v, j) => v - (i === j ? lambda : 0)));
    return LinAlg.nullSpaceBasis(shifted, tol || 1e-7);
  };

  // A: n x n -> { diagonalizable, P, D, eigenpairs, reason }. Diagonalizable exactly when
  // the eigenvectors span R^n, i.e. the geometric multiplicities sum to n. When they do,
  // A = P*D*P^-1 with the eigenvectors as the columns of P.
  LinAlg.diagonalize = function (A, tol) {
    const { rows, cols } = dims(A);
    if (rows !== cols) throw new Error("Only square matrices can be diagonalized.");
    const n = rows;
    const eig = LinAlg.eigenvalues(A, tol);
    if (eig.hasComplex) {
      return { diagonalizable: false, eigenpairs: [], reason: "This matrix has complex eigenvalues — it is not diagonalizable over the real numbers.", eigenvalues: eig.values };
    }
    // Group numerically equal eigenvalues so a repeated root is handled once.
    const distinct = [];
    eig.real.forEach((l) => { if (!distinct.some((d) => Math.abs(d - l) < 1e-7)) distinct.push(l); });

    const eigenpairs = [];
    const columns = [];
    for (const lambda of distinct) {
      const basis = LinAlg.eigenvectorsFor(A, lambda, tol);
      const algebraic = eig.real.filter((l) => Math.abs(l - lambda) < 1e-7).length;
      eigenpairs.push({ eigenvalue: lambda, eigenvectors: basis, algebraicMultiplicity: algebraic, geometricMultiplicity: basis.length });
      basis.forEach((v) => columns.push(v));
    }
    if (columns.length < n) {
      const short = eigenpairs.find((p) => p.geometricMultiplicity < p.algebraicMultiplicity);
      return { diagonalizable: false, eigenpairs, eigenvalues: eig.values,
        reason: short
          ? `Eigenvalue ${fmt(short.eigenvalue)} has algebraic multiplicity ${short.algebraicMultiplicity} but only ${short.geometricMultiplicity} independent eigenvector(s) — defective.`
          : "The eigenvectors do not span the whole space." };
    }
    // One diagonal entry per eigenvector, in the same order the columns of P were built.
    const diag = eigenpairs.flatMap((p) => p.eigenvectors.map(() => p.eigenvalue));
    const P = Array.from({ length: n }, (_, i) => columns.map((v) => v[i]));
    const D = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? diag[i] : 0)));
    return { diagonalizable: true, P, D, diag, eigenpairs, eigenvalues: eig.values };
  };

  // ------------------------------------- 11. iterative solvers (Jacobi / Gauss-Seidel)

  // A: n x n, b: length n. Splits A = D + L + U and iterates. `variant` is "jacobi"
  // (each new component uses only the PREVIOUS sweep's values) or "gauss-seidel" (uses
  // components already updated in the current sweep, so it usually converges in about
  // half the iterations). Returns every sweep so the page can plot the error decay.
  //
  // Convergence is guaranteed when A is strictly diagonally dominant; when it is not, the
  // iteration may diverge, so that condition is reported rather than assumed.
  function iterativeSolve(variant, A, b, tol, maxIter, x0, omega) {
    const { rows, cols } = dims(A);
    if (rows !== cols) throw new Error("Iterative solvers require a square matrix.");
    if (!Array.isArray(b) || b.length !== rows) throw new Error(`The right-hand side must have ${rows} entries.`);
    const n = rows;
    tol = tol || 1e-10;
    maxIter = maxIter || 200;
    for (let i = 0; i < n; i++) {
      if (Math.abs(A[i][i]) < 1e-14) throw new Error(`Zero on the diagonal at row ${i + 1} — reorder the equations so no pivot is zero before iterating.`);
    }

    // Strict diagonal dominance: |a_ii| > sum of |a_ij| over j != i, for every row.
    let dominant = true;
    const rowChecks = [];
    for (let i = 0; i < n; i++) {
      let off = 0;
      for (let j = 0; j < n; j++) if (j !== i) off += Math.abs(A[i][j]);
      const okRow = Math.abs(A[i][i]) > off;
      rowChecks.push({ row: i, diagonal: Math.abs(A[i][i]), offDiagonalSum: off, dominant: okRow });
      if (!okRow) dominant = false;
    }

    // SOR is relaxation applied to a Gauss-Seidel sweep, so it must read the values already
    // updated in this sweep. Treating it like Jacobi here silently made SOR(omega=1) take
    // Jacobi's iteration count instead of Gauss-Seidel's, and made omega > 1 diverge.
    const usesUpdatedValues = variant === "gauss-seidel" || variant === "sor";

    let x = x0 && x0.length === n ? [...x0] : new Array(n).fill(0);
    const iterations = [];
    let converged = false;
    for (let k = 1; k <= maxIter; k++) {
      const xNext = usesUpdatedValues ? [...x] : new Array(n).fill(0);
      for (let i = 0; i < n; i++) {
        let sum = 0;
        for (let j = 0; j < n; j++) {
          if (j === i) continue;
          // Jacobi reads the previous sweep throughout; Gauss-Seidel reads xNext, which
          // already holds this sweep's updates for j < i.
          sum += A[i][j] * (usesUpdatedValues ? xNext[j] : x[j]);
        }
        const gs = (b[i] - sum) / A[i][i];
        // Relaxation: omega = 1 is plain Jacobi/Gauss-Seidel; omega > 1 over-relaxes
        // (steps further in the same direction), omega < 1 under-relaxes.
        xNext[i] = omega === undefined || omega === 1 ? gs : x[i] + omega * (gs - x[i]);
      }
      if (!xNext.every(Number.isFinite)) throw new Error(`The iteration diverged at sweep ${k} — the values grew without bound.`);
      let change = 0, residual = 0;
      for (let i = 0; i < n; i++) change = Math.max(change, Math.abs(xNext[i] - x[i]));
      const Ax = Algorithms.matVec(A, xNext);
      for (let i = 0; i < n; i++) residual = Math.max(residual, Math.abs(Ax[i] - b[i]));
      iterations.push({ n: k, x: [...xNext], change, residual });
      x = xNext;
      if (change < tol) { converged = true; break; }
      if (change > 1e12) throw new Error(`The iteration diverged at sweep ${k} — try a diagonally dominant arrangement of the equations.`);
    }
    return { variant, omega: omega === undefined ? 1 : omega, solution: x, iterations, converged,
      diagonallyDominant: dominant, rowChecks, sweeps: iterations.length };
  }

  // A: n x n, b: length n -> Jacobi iteration. Every component of the new sweep is computed
  // from the previous sweep only, so the sweep can be done in any order (or in parallel).
  LinAlg.jacobi = function (A, b, tol, maxIter, x0) { return iterativeSolve("jacobi", A, b, tol, maxIter, x0); };

  // A: n x n, b: length n -> Gauss-Seidel iteration. Uses each component as soon as it is
  // updated, which typically halves the number of sweeps Jacobi needs on the same system.
  LinAlg.gaussSeidel = function (A, b, tol, maxIter, x0) { return iterativeSolve("gauss-seidel", A, b, tol, maxIter, x0); };

  // ------------------------------------------------- 10. Gram-Schmidt / QR

  // vectors: array of linearly independent vectors (as arrays) -> orthonormal set, with the
  // per-projection trace the page steps through. The process itself lives in
  // Algorithms.gramSchmidt (modified Gram-Schmidt); this only asks it to record steps, so
  // there is one implementation of the mathematics, not two.
  LinAlg.gramSchmidt = function (vectors, tol) {
    return Algorithms.gramSchmidt(vectors, { recordSteps: true, tol: tol || TOL });
  };

  // A: m x n with independent columns -> { Q, R } with A = Q*R, built from the modified
  // Gram-Schmidt above (Q has orthonormal columns, R is upper triangular).
  LinAlg.qrDecompose = function (A, tol) {
    const { rows, cols } = dims(A);
    const columns = Array.from({ length: cols }, (_, j) => A.map((r) => r[j]));
    const { Q: qCols, R } = LinAlg.gramSchmidt(columns, tol);
    const Q = Array.from({ length: rows }, (_, i) => qCols.map((c) => c[i]));
    return { Q, R };
  };

  // A: n x n, b: length n, omega in (0, 2) -> Successive Over-Relaxation. Each sweep takes
  // the Gauss-Seidel update and then goes omega times as far. omega = 1 is exactly
  // Gauss-Seidel; a well-chosen omega > 1 can cut the sweep count substantially, and the
  // iteration provably diverges outside (0, 2).
  LinAlg.sor = function (A, b, omega, tol, maxIter, x0) {
    if (!(omega > 0 && omega < 2)) throw new Error("The relaxation factor omega must lie strictly between 0 and 2 — outside that range SOR always diverges.");
    return iterativeSolve("sor", A, b, tol, maxIter, x0, omega);
  };

  // Searches a grid of relaxation factors and reports which converged fastest — the honest
  // way to pick omega without the spectral-radius theory a first course does not cover.
  LinAlg.bestOmega = function (A, b, tol, maxIter) {
    const trials = [];
    for (let w = 0.1; w < 2; w += 0.05) {
      const omega = Math.round(w * 100) / 100;
      try {
        const r = LinAlg.sor(A, b, omega, tol || 1e-10, maxIter || 300);
        trials.push({ omega, sweeps: r.sweeps, converged: r.converged });
      } catch (e) { trials.push({ omega, sweeps: Infinity, converged: false }); }
    }
    const ok = trials.filter((t) => t.converged);
    const best = ok.length ? ok.reduce((a, c) => (c.sweeps < a.sweeps ? c : a)) : null;
    return { trials, best };
  };

  // A: n x n symmetric positive definite, b: length n -> conjugate gradient. Unlike Jacobi
  // and Gauss-Seidel this is not a fixed-point sweep: each step moves along a direction
  // A-orthogonal to all previous ones, so in exact arithmetic it lands on the answer in at
  // most n steps. Requires SPD; anything else is rejected rather than silently wandering.
  LinAlg.conjugateGradient = function (A, b, tol, maxIter, x0) {
    const { rows, cols } = dims(A);
    if (rows !== cols) throw new Error("Conjugate gradient requires a square matrix.");
    if (!Array.isArray(b) || b.length !== rows) throw new Error(`The right-hand side must have ${rows} entries.`);
    const n = rows;
    if (!LinAlg.isPositiveDefinite(A)) throw new Error("Conjugate gradient requires a symmetric positive-definite matrix — this one is not.");
    tol = tol || 1e-12;
    maxIter = maxIter || n * 10;

    let x = x0 && x0.length === n ? [...x0] : new Array(n).fill(0);
    let r = b.map((v, i) => v - Algorithms.matVec(A, x)[i]);
    let p = [...r];
    let rsold = r.reduce((s2, v) => s2 + v * v, 0);
    const iterations = [];

    for (let k = 1; k <= maxIter; k++) {
      const Ap = Algorithms.matVec(A, p);
      const pAp = p.reduce((s2, v, i) => s2 + v * Ap[i], 0);
      if (Math.abs(pAp) < 1e-300) break;
      const alpha = rsold / pAp;
      x = x.map((v, i) => v + alpha * p[i]);
      r = r.map((v, i) => v - alpha * Ap[i]);
      const rsnew = r.reduce((s2, v) => s2 + v * v, 0);
      const residual = Math.sqrt(rsnew);
      iterations.push({ n: k, x: [...x], alpha, residual });
      if (residual < tol) return { solution: x, iterations, converged: true, steps: iterations.length, size: n };
      p = r.map((v, i) => v + (rsnew / rsold) * p[i]);
      rsold = rsnew;
    }
    return { solution: x, iterations, converged: false, steps: iterations.length, size: n };
  };

  // ------------------------------------------------- Markov chains

  // P: n x n column-stochastic OR row-stochastic transition matrix -> the steady-state
  // distribution, the eigenvector for eigenvalue 1 normalised to sum to 1. Found as the
  // null space of (P - I) using the same row reduction as everything else, so the answer
  // is exact rather than the limit of a simulation.
  LinAlg.markovSteadyState = function (P, tol) {
    const { rows, cols } = dims(P);
    if (rows !== cols) throw new Error("A transition matrix must be square.");
    const n = rows;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      if (P[i][j] < -1e-12) throw new Error(`Entry (${i + 1}, ${j + 1}) is negative — transition probabilities cannot be below zero.`);
    }
    // Accept either convention by checking which way the entries sum to 1.
    let colSums = [], rowSums = [];
    for (let j = 0; j < n; j++) { let s2 = 0; for (let i = 0; i < n; i++) s2 += P[i][j]; colSums.push(s2); }
    for (let i = 0; i < n; i++) rowSums.push(P[i].reduce((s2, v) => s2 + v, 0));
    const colStochastic = colSums.every((v) => Math.abs(v - 1) < 1e-8);
    const rowStochastic = rowSums.every((v) => Math.abs(v - 1) < 1e-8);
    if (!colStochastic && !rowStochastic) {
      throw new Error("Neither the rows nor the columns sum to 1 — this is not a transition matrix.");
    }
    // Work column-stochastically: steady state solves M v = v.
    const M = colStochastic ? P : LinAlg.transpose(P);
    const shifted = M.map((row, i) => row.map((v, j) => v - (i === j ? 1 : 0)));
    const basis = LinAlg.nullSpaceBasis(shifted, tol || 1e-9);
    if (!basis.length) throw new Error("No steady state found — (P - I) has no null space at this tolerance.");
    const v = basis[0];
    const total = v.reduce((s2, x) => s2 + x, 0);
    if (Math.abs(total) < 1e-12) throw new Error("The steady-state vector sums to zero and cannot be normalised into a distribution.");
    const steadyState = v.map((x) => x / total);
    return { steadyState, convention: colStochastic ? "column-stochastic" : "row-stochastic",
      uniqueUpToScale: basis.length === 1, nullSpaceDimension: basis.length };
  };

  // P: transition matrix, v0: starting distribution -> the distribution after each step,
  // so a page can show it settling toward the steady state found above.
  LinAlg.markovEvolve = function (P, v0, steps) {
    const { rows, cols } = dims(P);
    if (rows !== cols) throw new Error("A transition matrix must be square.");
    if (!Array.isArray(v0) || v0.length !== rows) throw new Error(`The starting distribution must have ${rows} entries.`);
    if (!Number.isInteger(steps) || steps < 1) throw new Error("The number of steps must be a positive integer.");
    let colSums = [];
    for (let j = 0; j < rows; j++) { let s2 = 0; for (let i = 0; i < rows; i++) s2 += P[i][j]; colSums.push(s2); }
    const M = colSums.every((v) => Math.abs(v - 1) < 1e-8) ? P : LinAlg.transpose(P);
    let v = [...v0];
    const total0 = v.reduce((s2, x) => s2 + x, 0);
    if (Math.abs(total0) > 1e-12) v = v.map((x) => x / total0);
    const history = [{ step: 0, distribution: [...v] }];
    for (let k = 1; k <= steps; k++) {
      v = Algorithms.matVec(M, v);
      history.push({ step: k, distribution: [...v] });
    }
    return { history, final: v };
  };

  // ------------------------------------------------------------- 12. SVD

  // A: m x n -> { U, S, V, singularValues, rank } with A = U * diag(S) * V^T.
  // Computed by ONE-SIDED JACOBI: rotations are applied to pairs of columns of A until the
  // columns are mutually orthogonal, at which point their norms are the singular values.
  // The textbook derivation instead eigen-decomposes A^T A, which is fine on paper but
  // squares the condition number — a matrix with singular values 1 and 1e-8 loses every
  // digit of the small one that way. This route never forms A^T A.
  LinAlg.svd = function (A, tol, maxSweeps) {
    const { rows: m, cols: n } = dims(A);
    tol = tol || 1e-14;
    maxSweeps = maxSweeps || 60;

    const B = LinAlg.clone(A);          // becomes U * diag(S)
    let V = LinAlg.identity(n);
    const colDot = (p, q) => { let s2 = 0; for (let i = 0; i < m; i++) s2 += B[i][p] * B[i][q]; return s2; };

    let sweeps = 0;
    for (let sweep = 0; sweep < maxSweeps; sweep++) {
      let offDiag = 0;
      for (let p = 0; p < n - 1; p++) {
        for (let q = p + 1; q < n; q++) {
          const alpha = colDot(p, p), beta = colDot(q, q), gamma = colDot(p, q);
          if (Math.abs(gamma) <= tol * Math.sqrt(alpha * beta) || gamma === 0) continue;
          offDiag = Math.max(offDiag, Math.abs(gamma) / Math.sqrt(alpha * beta || 1));
          // Rotation that makes columns p and q orthogonal.
          const zeta = (beta - alpha) / (2 * gamma);
          const t = Math.sign(zeta || 1) / (Math.abs(zeta) + Math.sqrt(1 + zeta * zeta));
          const c = 1 / Math.sqrt(1 + t * t), sn = c * t;
          for (let i = 0; i < m; i++) {
            const bp = B[i][p], bq = B[i][q];
            B[i][p] = c * bp - sn * bq;
            B[i][q] = sn * bp + c * bq;
          }
          for (let i = 0; i < n; i++) {
            const vp = V[i][p], vq = V[i][q];
            V[i][p] = c * vp - sn * vq;
            V[i][q] = sn * vp + c * vq;
          }
        }
      }
      sweeps = sweep + 1;
      if (offDiag === 0) break; // every pair already orthogonal
    }

    // Column norms are the singular values; normalising gives U.
    const order = [];
    for (let j = 0; j < n; j++) {
      let s2 = 0;
      for (let i = 0; i < m; i++) s2 += B[i][j] * B[i][j];
      order.push({ j, sigma: Math.sqrt(s2) });
    }
    order.sort((a, b) => b.sigma - a.sigma);

    const scale = order.length ? order[0].sigma : 0;
    const zeroCut = Math.max(m, n) * (scale || 1) * 2.220446049250313e-16 * 10;
    const singularValues = order.map((o) => (o.sigma < zeroCut ? 0 : o.sigma));
    const rank = singularValues.filter((v) => v > 0).length;

    const U = Array.from({ length: m }, () => new Array(order.length).fill(0));
    const Vs = Array.from({ length: n }, () => new Array(order.length).fill(0));
    for (let k = 0; k < order.length; k++) {
      const src = order[k].j, sigma = singularValues[k];
      for (let i = 0; i < n; i++) Vs[i][k] = V[i][src];
      if (sigma > 0) for (let i = 0; i < m; i++) U[i][k] = B[i][src] / sigma;
    }

    // For a zero singular value the corresponding U column is not determined by A; fill it
    // with any unit vector orthogonal to the ones already fixed, so U stays orthonormal.
    for (let k = 0; k < order.length; k++) {
      if (singularValues[k] > 0) continue;
      for (let cand = 0; cand < m; cand++) {
        const e = new Array(m).fill(0); e[cand] = 1;
        for (let prev = 0; prev < order.length; prev++) {
          if (prev === k) continue;
          let d = 0;
          for (let i = 0; i < m; i++) d += U[i][prev] * e[i];
          for (let i = 0; i < m; i++) e[i] -= d * U[i][prev];
        }
        let nrm = 0;
        for (let i = 0; i < m; i++) nrm += e[i] * e[i];
        nrm = Math.sqrt(nrm);
        if (nrm > 1e-8) { for (let i = 0; i < m; i++) U[i][k] = e[i] / nrm; break; }
      }
    }

    return { U, S: singularValues, V: Vs, singularValues, rank, sweeps,
      conditionNumber: rank === singularValues.length && singularValues[singularValues.length - 1] > 0
        ? singularValues[0] / singularValues[singularValues.length - 1] : Infinity };
  };

  // A: m x n, k: how many singular values to keep -> the best rank-k approximation of A in
  // both the Frobenius and spectral norms (Eckart-Young). This is what image compression
  // and PCA actually compute.
  LinAlg.lowRankApproximation = function (A, k, tol) {
    const { rows: m, cols: n } = dims(A);
    const { U, S, V } = LinAlg.svd(A, tol);
    if (!Number.isInteger(k) || k < 0) throw new Error("k must be a non-negative integer.");
    const keep = Math.min(k, S.length);
    const out = Array.from({ length: m }, () => new Array(n).fill(0));
    for (let t = 0; t < keep; t++) {
      if (S[t] === 0) continue;
      for (let i = 0; i < m; i++) for (let j = 0; j < n; j++) out[i][j] += S[t] * U[i][t] * V[j][t];
    }
    let dropped = 0;
    for (let t = keep; t < S.length; t++) dropped += S[t] * S[t];
    return { approximation: out, keptSingularValues: S.slice(0, keep), frobeniusError: Math.sqrt(dropped) };
  };

  // ------------------------------------------------ 13. least squares

  // A: m x n (m >= n, independent columns), b: length m -> the x minimising ||Ax - b||.
  // Returns both routes so a page can compare them: `viaQR` solves R x = Q^T b, which is
  // the numerically sound way; `viaNormalEquations` solves A^T A x = A^T b, which is what
  // textbooks derive but squares the condition number.
  LinAlg.leastSquares = function (A, b, tol) {
    const { rows: m, cols: n } = dims(A);
    if (!Array.isArray(b) || b.length !== m) throw new Error(`The right-hand side must have ${m} entries (one per row of A).`);
    if (m < n) throw new Error(`Least squares needs at least as many rows as columns (got ${m} x ${n}).`);

    let viaQR = null, qrError = null;
    try {
      const { Q, R } = LinAlg.qrDecompose(A, tol);
      const Qtb = [];
      for (let j = 0; j < n; j++) { let s2 = 0; for (let i = 0; i < m; i++) s2 += Q[i][j] * b[i]; Qtb.push(s2); }
      const x = new Array(n).fill(0);
      for (let i = n - 1; i >= 0; i--) { // back substitution on the triangular R
        let s2 = Qtb[i];
        for (let j = i + 1; j < n; j++) s2 -= R[i][j] * x[j];
        x[i] = s2 / R[i][i];
      }
      viaQR = x;
    } catch (e) { qrError = e.message; }

    let viaNormalEquations = null, neError = null;
    try {
      const At = LinAlg.transpose(A);
      const AtA = Algorithms.matMul(At, A);
      const Atb = Algorithms.matVec(At, b);
      viaNormalEquations = Algorithms.solveLinear(AtA, Atb);
    } catch (e) { neError = e.message; }

    const solution = viaQR || viaNormalEquations;
    if (!solution) throw new Error(`Least squares failed — the columns of A are linearly dependent (${qrError || neError}).`);

    const fitted = Algorithms.matVec(A, solution);
    const residualVector = fitted.map((v, i) => v - b[i]);
    const residualNorm = Math.sqrt(residualVector.reduce((s2, v) => s2 + v * v, 0));
    const bMean = b.reduce((s2, v) => s2 + v, 0) / m;
    const ssTot = b.reduce((s2, v) => s2 + (v - bMean) ** 2, 0);
    const r2 = ssTot === 0 ? 1 : 1 - residualVector.reduce((s2, v) => s2 + v * v, 0) / ssTot;

    return { solution, viaQR, viaNormalEquations, qrError, neError, fitted, residualVector, residualNorm, r2 };
  };

  // ------------------------------------- 14. spectral theorem (symmetric A)

  // A: n x n symmetric -> { values, vectors, sweeps } by the CYCLIC JACOBI eigenvalue
  // algorithm: repeatedly apply plane rotations that zero the largest off-diagonal entry,
  // accumulating them into the eigenvector matrix. For symmetric input this is far more
  // accurate than going through the characteristic polynomial, and — the reason it is here
  // — it handles repeated eigenvalues exactly, where root-finding only reaches about
  // sqrt(tolerance) at a double root and leaves that error in Q and D.
  LinAlg.symmetricEigen = function (A, tol, maxSweeps) {
    const { rows, cols } = dims(A);
    if (rows !== cols) throw new Error("Symmetric eigendecomposition requires a square matrix.");
    const n = rows;
    tol = tol || 1e-14;
    maxSweeps = maxSweeps || 100;
    let asym = 0;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) asym = Math.max(asym, Math.abs(A[i][j] - A[j][i]));
    if (asym > 1e-9) throw new Error("This matrix is not symmetric.");

    const M = LinAlg.clone(A);
    let V = LinAlg.identity(n);
    let sweeps = 0;

    for (let sweep = 0; sweep < maxSweeps; sweep++) {
      let off = 0;
      for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) off += M[i][j] * M[i][j];
      sweeps = sweep;
      if (Math.sqrt(2 * off) < tol) break;
      for (let p = 0; p < n - 1; p++) {
        for (let q = p + 1; q < n; q++) {
          if (Math.abs(M[p][q]) < 1e-300) continue;
          const theta = (M[q][q] - M[p][p]) / (2 * M[p][q]);
          const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
          const c = 1 / Math.sqrt(t * t + 1), sn = t * c;
          for (let k = 0; k < n; k++) {
            const mkp = M[k][p], mkq = M[k][q];
            M[k][p] = c * mkp - sn * mkq;
            M[k][q] = sn * mkp + c * mkq;
          }
          for (let k = 0; k < n; k++) {
            const mpk = M[p][k], mqk = M[q][k];
            M[p][k] = c * mpk - sn * mqk;
            M[q][k] = sn * mpk + c * mqk;
          }
          for (let k = 0; k < n; k++) {
            const vkp = V[k][p], vkq = V[k][q];
            V[k][p] = c * vkp - sn * vkq;
            V[k][q] = sn * vkp + c * vkq;
          }
        }
      }
    }

    const idx = Array.from({ length: n }, (_, i) => i).sort((a, b) => M[b][b] - M[a][a]);
    return {
      values: idx.map((i) => clean(M[i][i], 1e-12)),
      vectors: idx.map((i) => V.map((row) => row[i])), // one eigenvector per entry
      sweeps,
    };
  };

  // A: n x n symmetric -> { Q, D } with A = Q D Q^T, Q orthogonal and D real diagonal.
  // Guaranteed to exist for symmetric matrices; eigenvectors of distinct eigenvalues are
  // already orthogonal, and Gram-Schmidt orthonormalises within a repeated eigenspace.
  LinAlg.spectralDecomposition = function (A, tol) {
    const { rows, cols } = dims(A);
    if (rows !== cols) throw new Error("The spectral theorem applies to square matrices.");
    const n = rows;
    let asym = 0;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) asym = Math.max(asym, Math.abs(A[i][j] - A[j][i]));
    if (asym > 1e-9) throw new Error("This matrix is not symmetric — the spectral theorem does not apply to it.");

    // Jacobi rotations give the orthonormal eigenvectors directly, so there is no need to
    // find eigenvalues first and then solve for each null space — which is both slower and
    // markedly less accurate when an eigenvalue repeats.
    const { values, vectors, sweeps } = LinAlg.symmetricEigen(A, tol);

    // Group numerically equal eigenvalues for display.
    const eigenspaces = [];
    values.forEach((lambda, k) => {
      const existing = eigenspaces.find((e) => Math.abs(e.eigenvalue - lambda) < 1e-8);
      if (existing) { existing.multiplicity += 1; existing.vectors.push(vectors[k]); }
      else eigenspaces.push({ eigenvalue: lambda, multiplicity: 1, vectors: [vectors[k]] });
    });

    const Q = Array.from({ length: n }, (_, i) => vectors.map((v) => v[i]));
    const D = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? values[i] : 0)));
    return { Q, D, eigenvalues: values, eigenspaces, sweeps };
  };

  // ------------------------------------------------------- 15. Cholesky

  // A: n x n symmetric positive definite -> lower-triangular L with A = L L^T.
  // Half the work of LU and the standard test for positive definiteness: the factorisation
  // exists exactly when A is positive definite, so a negative value under the square root
  // is the answer ("not positive definite"), not a failure.
  LinAlg.cholesky = function (A, tol) {
    const { rows, cols } = dims(A);
    if (rows !== cols) throw new Error("Cholesky decomposition requires a square matrix.");
    const n = rows;
    let asym = 0;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) asym = Math.max(asym, Math.abs(A[i][j] - A[j][i]));
    if (asym > 1e-9) throw new Error("Cholesky decomposition requires a symmetric matrix.");

    const L = Array.from({ length: n }, () => new Array(n).fill(0));
    for (let i = 0; i < n; i++) {
      for (let j = 0; j <= i; j++) {
        let sum = A[i][j];
        for (let k = 0; k < j; k++) sum -= L[i][k] * L[j][k];
        if (i === j) {
          if (sum <= (tol || 1e-14)) throw new Error(`Matrix is not positive definite — the pivot at row ${i + 1} is ${sum <= 0 ? "not positive" : "numerically zero"}.`);
          L[i][j] = Math.sqrt(sum);
        } else {
          L[i][j] = sum / L[j][j];
        }
      }
    }
    let det = 1;
    for (let i = 0; i < n; i++) det *= L[i][i] * L[i][i];
    return { L, det };
  };

  // A: n x n -> whether A is symmetric positive definite, decided by attempting Cholesky.
  LinAlg.isPositiveDefinite = function (A) {
    try { LinAlg.cholesky(A); return true; } catch (e) { return false; }
  };

  return LinAlg;
});
