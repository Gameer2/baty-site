# Shared Helpers — Linear Algebra (for plans 03-07)

Read `00-SHARED-CONVENTIONS.md` first. This file is a prerequisite for
`03-power-method.md`, `04-inverse-power-method.md`, `05-qr-algorithm.md`,
`06-newton-nonlinear-systems.md`, `07-broydens-method.md` — build this first, once.

## Why this file exists

`math-lab/assets/js/algorithms.js` currently has zero matrix/vector helpers (confirmed by
reading the file — only scalar root-finding and the cubic spline exist). All five
linear-algebra-flavored methods need matrix-vector multiply, matrix-matrix multiply, and
solving a small linear system; QR Algorithm additionally needs a QR decomposition. Per the
project's "one implementation, two callers" rule (§1/§2 of shared conventions), these go
into `algorithms.js` **once**, as small pure helper functions, and every method below
calls them rather than reimplementing linear algebra five times.

## Functions to add to `algorithms.js`

Add these before the five `runPowerMethod`/`runInversePowerMethod`/`runQRAlgorithm`/
`runNewtonSystem`/`runBroyden` functions (which reference them), in this exact style —
plain arrays of arrays for matrices (`A[i][j]`), plain arrays for vectors, no classes:

```js
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

// Classical Gram-Schmidt QR decomposition. A: n x m (n >= m), full column rank.
// Returns { Q, R } with Q: n x m (orthonormal columns), R: m x m (upper triangular),
// such that A = Q*R.
Algorithms.qrDecompose = function (A) {
  const n = A.length, m = A[0].length;
  const cols = [];
  for (let j = 0; j < m; j++) cols.push(A.map((row) => row[j]));
  const Qcols = [];
  const R = Array.from({ length: m }, () => new Array(m).fill(0));
  for (let j = 0; j < m; j++) {
    let v = [...cols[j]];
    for (let i = 0; i < j; i++) {
      const r = Qcols[i].reduce((s, qi, k) => s + qi * cols[j][k], 0);
      R[i][j] = r;
      v = v.map((vk, k) => vk - r * Qcols[i][k]);
    }
    const norm = Math.sqrt(v.reduce((s, vk) => s + vk * vk, 0));
    if (norm < 1e-12) throw new Error("Matrix columns are linearly dependent — QR decomposition failed.");
    R[j][j] = norm;
    Qcols.push(v.map((vk) => vk / norm));
  }
  const Q = Array.from({ length: n }, (_, i) => Qcols.map((col) => col[i]));
  return { Q, R };
};
```

All four were verified together with `node -e` (a temp script covering matVec, matMul,
solveLinear, qrDecompose feeding into all five method implementations below) before this
plan and the five method plans were written — the numeric results quoted in each of
`03-power-method.md` through `07-broydens-method.md` came out of running this exact code,
not hand calculation.

## Matrix input UI pattern (shared by all 5 method pages)

This site has no existing matrix-input UI — the closest precedent is the points-table on
`lagrange-interpolation.html` (`assets/js/lagrange.js`, `#pointsTable`/`#pointsTableBody`,
dynamic `addRow()`/`.row-remove` pattern). Adapt that pattern rather than inventing new UI:

- A `<label>Matrix size (n)</label>` numeric field (`type="number" step="1" min="2" max="6"`
  — cap at 6 to keep the grid usable and computation instant; these methods don't need
  large matrices to demonstrate).
- A generated `n x n` grid of number inputs, rebuilt whenever `n` changes: a `<table
  class="points-table matrix-table" id="matrixTable">` where each `<tr>` is one matrix row
  and each cell is `<input type="number" class="mat-cell" data-row="i" data-col="j"
  value="0" step="any" />`. No add/remove row buttons needed (size is set by the `n`
  field, not incrementally) — simpler than the Lagrange points-table, not more complex.
- Read the matrix in the per-method JS with a small `getMatrix()` helper: loop `data-row`/
  `data-col` attributes into a 2D array. This helper is UI-only glue, not math — it stays
  in the per-method `.js` file, not in `algorithms.js`.
- For methods needing a starting vector (`x0` for Power/Inverse-Power methods) or initial
  guess (`x0` for Newton-system/Broyden), reuse a `.field-row` of plain number inputs sized
  to match `n` (regenerate alongside the matrix grid when `n` changes), one input per
  vector component.
