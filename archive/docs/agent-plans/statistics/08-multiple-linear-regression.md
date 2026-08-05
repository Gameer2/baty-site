# Build Plan — Multiple Linear Regression

Roadmap ref: `CURRICULUM_ROADMAP.md` §4C.12, priority **P1**, Tier-1 build-order
item 5 (see `BACKLOG.md`). Read `00-SHARED-CONVENTIONS.md` in full before
starting. This plan follows the eight-section layout established by
`04-discrete-distributions.md` through `07-chi-square-tests.md`, and reuses the
input/result-strip/plot structure already live in `linear-regression.html` /
`linear-regression.js` (the simple one-predictor page), extended to multiple
predictors in matrix form.

## 1. What this method is

A regression workspace that fits a **plane/hyperplane**
`β₀ + β₁x₁ + ... + βₚxₚ` to `(x₁, ..., xₚ, y)` data via ordinary least squares
in **matrix form**: `β̂ = (XᵀX)⁻¹Xᵀy`, where `X` is the `n × (p+1)` design
matrix with a leading column of 1s. Category/eyebrow: **"Regression"**.

For each coefficient it also reports the standard error
`SE(βⱼ) = s · sqrt((XᵀX)⁻¹ⱼⱼ)`, the t-statistic `tⱼ = βⱼ / SE(βⱼ)` with
`df = n − p − 1`, and the two-tailed p-value `pⱼ = tCDF(|tⱼ|, df)`, plus the
coefficient of determination `R² = 1 − SSE/SST`, the adjusted
`R²̄ = 1 − (SSE/df)/(SST/(n−1))`, and the residual standard error
`s = sqrt(SSE/(n − p − 1))`.

### Reuse — DO NOT DUPLICATE (already in `stats-algorithms.js`)

- `StatsAlgorithms.runLinearRegression(points)` — the SIMPLE (one-predictor)
  regression. The new `runMultipleRegression` is a separate function; the simple
  case is the `p = 1` special case and is cross-checked in tests against it.
- `StatsAlgorithms.tCDF(t, df)` — reused for coefficient two-tailed p-values.
  Do not re-implement.
- `StatsAlgorithms.tCritical(alpha, df)` — reused for the textbook
  critical-value cross-check (`t_{0.025, df=5} = 2.571`).
- `StatsAlgorithms.descriptiveStats` — available if useful (not required).

### Matrix-helper scout (per the build-queue instructions)

The Linear Algebra Engine currently ships only `engines/linear-algebra/index.html`
(no JS methods yet). A repo-wide grep
(`grep -riE "invert|inverse|matMul|transpose|gaussianElim|luDecomp|solveLinear|leastSquares" math-lab/assets/js/`)
found `Algorithms.matMul` and `Algorithms.solveLinear` inside
`assets/js/algorithms.js` — but that file is the **Numerical Engine's** module
(`Algorithms`, not `StatsAlgorithms`), and `00-SHARED-CONVENTIONS.md` §0 is
explicit that statistics math lives in `stats-algorithms.js` and the two
modules are not mixed. Importing `algorithms.js` into `stats-algorithms.js`
would create a cross-engine dependency the conventions forbid. So this plan
implements a **small local matrix helper inside `stats-algorithms.js`** —
`transpose`, `matMul`, `matInverse` (Gauss-Jordan with partial pivoting) —
matching the style of the existing `Algorithms.matMul`/`solveLinear` but
self-contained in the statistics module. The helpers are exported
(`StatsAlgorithms.transpose` / `matMul` / `matInverse`) so the test suite can
cross-check `matInverse(A) · A ≈ I` directly.

## 2. `stats-algorithms.js` — functions to add

Append before the `return StatsAlgorithms;` line. Each function follows the
existing `StatsAlgorithms.X = function (...) {...}` UMD pattern with a `//`
header comment stating the formula, and `throw new Error("...")` with a
specific message for invalid input (never returns `NaN` or fails silently).

### 2a. Matrix helpers — transpose, matMul, matInverse

```js
// transpose(M): M is n×m -> returns m×n transpose. Rows must be equal length.
StatsAlgorithms.transpose = function (M) {
  if (!Array.isArray(M) || M.length === 0) throw new Error("Matrix must be a non-empty array of rows.");
  const n = M.length, m = M[0].length;
  for (let i = 0; i < n; i++) if (!Array.isArray(M[i]) || M[i].length !== m)
    throw new Error("Matrix rows must all have the same length.");
  const T = new Array(m);
  for (let j = 0; j < m; j++) {
    T[j] = new Array(n);
    for (let i = 0; i < n; i++) T[j][i] = M[i][j];
  }
  return T;
};

// matMul(A, B): A is n×k, B is k×m -> returns n×m product. Inner dimensions
// must match (A's column count === B's row count).
StatsAlgorithms.matMul = function (A, B) {
  if (!Array.isArray(A) || !Array.isArray(B) || A.length === 0 || B.length === 0)
    throw new Error("matMul needs two non-empty matrices.");
  const n = A.length, k = B.length, m = B[0].length;
  for (let i = 0; i < n; i++) if (!Array.isArray(A[i]) || A[i].length !== k)
    throw new Error("Inner dimensions disagree: A's columns must equal B's rows.");
  for (let i = 0; i < k; i++) if (!Array.isArray(B[i]) || B[i].length !== m)
    throw new Error("B's rows must all have the same length.");
  const C = new Array(n);
  for (let i = 0; i < n; i++) {
    C[i] = new Array(m).fill(0);
    for (let j = 0; j < m; j++) {
      let s = 0;
      for (let t = 0; t < k; t++) s += A[i][t] * B[t][j];
      C[i][j] = s;
    }
  }
  return C;
};

// matInverse(M): square n×n inverse via Gauss-Jordan elimination with partial
// pivoting on the augmented [M | I]. Throws if M is singular (or nearly so,
// pivot < 1e-12). Returns the n×n inverse.
StatsAlgorithms.matInverse = function (M) {
  if (!Array.isArray(M) || M.length === 0)
    throw new Error("Matrix must be a non-empty array of rows.");
  const n = M.length;
  for (let i = 0; i < n; i++) if (!Array.isArray(M[i]) || M[i].length !== n)
    throw new Error("Matrix must be square (n×n).");
  const A = M.map((row, i) => {
    const r = row.slice();
    for (let j = 0; j < n; j++) r.push(i === j ? 1 : 0);
    return r;
  });
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(A[r][col]) > Math.abs(A[piv][col])) piv = r;
    if (Math.abs(A[piv][col]) < 1e-12)
      throw new Error("Matrix is singular (or nearly singular) — no unique solution.");
    if (piv !== col) { const tmp = A[col]; A[col] = A[piv]; A[piv] = tmp; }
    const pivVal = A[col][col];
    for (let c = 0; c < 2 * n; c++) A[col][c] /= pivVal;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const factor = A[r][col];
      if (factor === 0) continue;
      for (let c = 0; c < 2 * n; c++) A[r][c] -= factor * A[col][c];
    }
  }
  return A.map((row) => row.slice(n));
};
```

### 2b. `runMultipleRegression(data)`

```js
// Multiple linear regression: data is an array of rows [x1, x2, ..., xp, y]
// (p predictors + response). Fits β̂ = (XᵀX)⁻¹Xᵀy where X is the n×(p+1) design
// matrix with a leading column of 1s. Returns {n, p, coefficients, coefSE,
// tStats, pValues, fitted, residuals, s, r2, adjR2, df}. coefficients is
// [β0, β1, ..., βp]. s = sqrt(SSE/(n-p-1)) is the residual standard error;
// SE(βj) = s*sqrt((XᵀX)⁻¹_jj); tj = βj/SE(βj); pj = tCDF(|tj|, n-p-1) (two-
// tailed). R² = 1 - SSE/SST; adjR² = 1 - (SSE/df)/(SST/(n-1)). Requires
// n >= p + 2 (df >= 1) and a non-singular XᵀX (predictors not collinear).
StatsAlgorithms.runMultipleRegression = function (data) {
  if (!Array.isArray(data) || data.length < 2)
    throw new Error("Enter at least two rows of data.");
  const n = data.length;
  const p = data[0].length - 1;
  if (p < 1) throw new Error("Each row must have at least one predictor and a response (x1, ..., xp, y).");
  for (let i = 0; i < n; i++) {
    if (!Array.isArray(data[i]) || data[i].length !== p + 1)
      throw new Error("Every row must have the same number of columns (x1, ..., xp, y).");
    for (const v of data[i]) if (!Number.isFinite(v)) throw new Error("All cells must be finite numbers.");
  }
  if (n < p + 2)
    throw new Error(`Need at least p + 2 = ${p + 2} rows for ${p} predictor(s) (df >= 1); got ${n}.`);
  const X = data.map((row) => [1, ...row.slice(0, p)]);
  const y = data.map((row) => row[p]);
  const Xt = StatsAlgorithms.transpose(X);
  const XtX = StatsAlgorithms.matMul(Xt, X);
  let XtXinv;
  try { XtXinv = StatsAlgorithms.matInverse(XtX); }
  catch (err) { throw new Error("Design matrix is collinear — predictors are linearly dependent."); }
  const Xty = StatsAlgorithms.matMul(Xt, y.map((v) => [v]));      // (p+1)×1
  const betaMat = StatsAlgorithms.matMul(XtXinv, Xty);            // (p+1)×1
  const coefficients = betaMat.map((r) => r[0]);
  const fitted = new Array(n);
  const residuals = new Array(n);
  let sse = 0;
  for (let i = 0; i < n; i++) {
    let pred = 0;
    for (let j = 0; j <= p; j++) pred += coefficients[j] * X[i][j];
    fitted[i] = pred;
    residuals[i] = y[i] - pred;
    sse += residuals[i] * residuals[i];
  }
  const ybar = y.reduce((s, v) => s + v, 0) / n;
  const sst = y.reduce((s, v) => s + (v - ybar) * (v - ybar), 0);
  const r2 = sst === 0 ? 1 : 1 - sse / sst;
  const df = n - p - 1;
  const s = Math.sqrt(sse / df);
  const adjR2 = sst === 0 ? 1 : 1 - (sse / df) / (sst / (n - 1));
  const coefSE = new Array(p + 1);
  const tStats = new Array(p + 1);
  const pValues = new Array(p + 1);
  for (let j = 0; j <= p; j++) {
    const se = s * Math.sqrt(XtXinv[j][j]);
    coefSE[j] = se;
    tStats[j] = coefficients[j] / se;
    pValues[j] = StatsAlgorithms.tCDF(Math.abs(tStats[j]), df);
  }
  return { n, p, coefficients, coefSE, tStats, pValues, fitted, residuals, s, r2, adjR2, df };
};
```

## 3. `tests/verify-statistics.js` — cases to add (pre-verified, use exactly)

All expected values below were produced by an **independent** Node
implementation (in `/tmp/verify-mreg.js`) that solves the `p = 2` normal
equations by **Cramer's rule** and the `p = 1` case by the explicit 2×2
inverse — a different solver than the Gauss-Jordan `matInverse` that ships in
`stats-algorithms.js` — so agreement cross-checks the implementation rather
than reusing it. The exact-plane case (`Test 1`) recovers the analytically known
coefficients `β = [2, 3, −1]`. Run `node /tmp/verify-mreg.js` to reproduce
every number below. Tolerances: `1e-10` for exact hand-computable values
(coefficients, R², adjR², s, SSE, SST, fitted, df, n, p), `1e-9` for
p-values routing through `tCDF` (series with EPS 3e-7), `1e-3` for the
textbook t-critical cross-check (tabulated 3-decimal precision), and `1e-12`
for the `matInverse · A ≈ I` identity check (Gauss-Jordan is exact to machine
precision on a well-conditioned 3×3).

```js
// Multiple linear regression — exact plane y = 2 + 3x1 - x2 through 6 points.
// n=6, p=2, df=3. β̂ = [2, 3, -1] exactly; R² = 1, SSE = 0, s = 0, SE = 0 for
// every coefficient (so t = ±Inf and p = tCDF(Inf, 3) = 0). SST = sum of
// squared deviations of y from its mean (45.333...). Fitted values equal y.
{
  const r = StatsAlgorithms.runMultipleRegression([
    [0, 0, 2], [1, 0, 5], [0, 1, 1], [1, 1, 4], [2, 1, 7], [3, 2, 9]]);
  approx(r.n, 6, 1e-12, "MLR plane: n = 6");
  approx(r.p, 2, 1e-12, "MLR plane: p = 2");
  approx(r.df, 3, 1e-12, "MLR plane: df = n - p - 1 = 3");
  approx(r.coefficients[0], 2, 1e-10, "MLR plane: β0 = 2 (intercept)");
  approx(r.coefficients[1], 3, 1e-10, "MLR plane: β1 = 3");
  approx(r.coefficients[2], -1, 1e-10, "MLR plane: β2 = -1");
  approx(r.r2, 1, 1e-12, "MLR plane: R² = 1 (exact fit)");
  approx(r.adjR2, 1, 1e-12, "MLR plane: adjusted R² = 1");
  approx(r.s, 0, 1e-12, "MLR plane: residual SE s = 0");
  approx(r.fitted[0], 2, 1e-10, "MLR plane: fitted[0] = 2");
  approx(r.fitted[3], 4, 1e-10, "MLR plane: fitted[3] = 4");
  approx(r.fitted[5], 9, 1e-10, "MLR plane: fitted[5] = 9");
  approx(r.residuals[0], 0, 1e-12, "MLR plane: residual[0] = 0");
  approx(r.residuals[3], 0, 1e-12, "MLR plane: residual[3] = 0");
  approx(r.coefSE[0], 0, 1e-12, "MLR plane: SE(β0) = 0");
  approx(r.coefSE[1], 0, 1e-12, "MLR plane: SE(β1) = 0");
  approx(r.coefSE[2], 0, 1e-12, "MLR plane: SE(β2) = 0");
  approx(r.pValues[0], 0, 1e-12, "MLR plane: p(β0) = 0 (t = +Inf)");
  approx(r.pValues[1], 0, 1e-12, "MLR plane: p(β1) = 0 (t = +Inf)");
  approx(r.pValues[2], 0, 1e-12, "MLR plane: p(β2) = 0 (t = -Inf)");
}

// Multiple linear regression, p = 1 cross-check against runLinearRegression
// (the simple OLS). Same noisy 5-point dataset [[1,2],[2,4],[3,5],[4,4],[5,5]].
// runLinearRegression reports intercept=2.2, slope=0.6, r2=0.6. The p=1 multiple
// regression must produce coefficients=[intercept, slope]=[2.2, 0.6] and the
// same R². n=5, p=1, df=3. SE, t, p are also asserted from the independent
// Cramer's-rule computation: SE=[0.93808, 0.28284], t=[2.34521, 2.12132],
// p=[0.10074, 0.12403].
{
  const data = [[1, 2], [2, 4], [3, 5], [4, 4], [5, 5]];
  const r = StatsAlgorithms.runMultipleRegression(data);
  const simple = StatsAlgorithms.runLinearRegression(data);
  approx(r.n, 5, 1e-12, "MLR p=1: n = 5");
  approx(r.p, 1, 1e-12, "MLR p=1: p = 1");
  approx(r.df, 3, 1e-12, "MLR p=1: df = 3");
  approx(r.coefficients[0], 2.2, 1e-10, "MLR p=1: β0 (intercept) = 2.2");
  approx(r.coefficients[1], 0.6, 1e-10, "MLR p=1: β1 (slope) = 0.6");
  approx(r.r2, 0.6, 1e-10, "MLR p=1: R² = 0.6");
  approx(r.adjR2, 0.4666666666666668, 1e-10, "MLR p=1: adjusted R²");
  approx(r.s, 0.8944271909999157, 1e-10, "MLR p=1: residual SE s");
  approx(r.coefSE[0], 0.9380831519646858, 1e-9, "MLR p=1: SE(β0)");
  approx(r.coefSE[1], 0.28284271247461895, 1e-9, "MLR p=1: SE(β1)");
  approx(r.tStats[0], 2.3452078799117153, 1e-9, "MLR p=1: t(β0)");
  approx(r.tStats[1], 2.121320343559643, 1e-9, "MLR p=1: t(β1)");
  approx(r.pValues[0], 0.10074345463514302, 1e-9, "MLR p=1: p(β0)");
  approx(r.pValues[1], 0.12402706255347672, 1e-9, "MLR p=1: p(β1)");
  approx(r.coefficients[0], simple.intercept, 1e-12, "MLR p=1: intercept matches runLinearRegression");
  approx(r.coefficients[1], simple.slope, 1e-12, "MLR p=1: slope matches runLinearRegression");
  approx(r.r2, simple.r2, 1e-12, "MLR p=1: R² matches runLinearRegression");
}

// Multiple linear regression, noisy p=2 textbook-style example. 8 observations
// of [x1, x2, y]. n=8, p=2, df=5. β̂ = [2.55195, 1.79221, 0.16883], R² = 0.99509,
// adjR² = 0.99313, s = 0.38814, SSE = 0.75325, SST = 153.5. Coefficient t-tests:
// β0 t=8.149 (p=0.000452), β1 t=19.100 (p=7.25e-6), β2 t=1.558 (p=0.17991).
// Cross-check vs the textbook t-table: t_{0.025, df=5} = 2.571, so β0 and β1
// (|t| > 2.571) are significant at α=0.05 while β2 (|t| = 1.558 < 2.571) is not
// — matching the p-values (0.00045, 7.25e-6 < 0.05; 0.17991 > 0.05).
{
  const r = StatsAlgorithms.runMultipleRegression([
    [1, 2, 5], [2, 1, 6], [3, 2, 8], [4, 5, 11],
    [5, 3, 12], [6, 7, 14], [7, 4, 16], [8, 6, 18]]);
  approx(r.n, 8, 1e-12, "MLR noisy p=2: n = 8");
  approx(r.p, 2, 1e-12, "MLR noisy p=2: p = 2");
  approx(r.df, 5, 1e-12, "MLR noisy p=2: df = 5");
  approx(r.coefficients[0], 2.551948051948052, 1e-9, "MLR noisy p=2: β0");
  approx(r.coefficients[1], 1.7922077922077921, 1e-9, "MLR noisy p=2: β1");
  approx(r.coefficients[2], 0.16883116883116883, 1e-9, "MLR noisy p=2: β2");
  approx(r.r2, 0.9950928550277085, 1e-10, "MLR noisy p=2: R²");
  approx(r.adjR2, 0.9931299970387918, 1e-10, "MLR noisy p=2: adjusted R²");
  approx(r.s, 0.388135737402974, 1e-10, "MLR noisy p=2: residual SE s");
  approx(r.coefSE[0], 0.3131594071756114, 1e-9, "MLR noisy p=2: SE(β0)");
  approx(r.coefSE[1], 0.09383060710747236, 1e-9, "MLR noisy p=2: SE(β1)");
  approx(r.coefSE[2], 0.10834625254345034, 1e-9, "MLR noisy p=2: SE(β2)");
  approx(r.tStats[0], 8.149038456050556, 1e-9, "MLR noisy p=2: t(β0)");
  approx(r.tStats[1], 19.100460366360206, 1e-9, "MLR noisy p=2: t(β1)");
  approx(r.tStats[2], 1.5582557298275, 1e-9, "MLR noisy p=2: t(β2)");
  approx(r.pValues[0], 0.00045199741333918606, 1e-9, "MLR noisy p=2: p(β0)");
  approx(r.pValues[1], 0.000007251271437600761, 1e-9, "MLR noisy p=2: p(β1)");
  approx(r.pValues[2], 0.17991051391091628, 1e-9, "MLR noisy p=2: p(β2)");
  approx(StatsAlgorithms.tCritical(0.05, r.df), 2.571, 1e-3, "MLR noisy p=2: t_{0.025, df=5} (textbook 2.571)");
}

// matInverse cross-check: A * A⁻¹ = I (to machine precision) on a 3×3.
{
  const A = [[4, 7, 2], [3, 6, 1], [2, 5, 3]];
  const Ainv = StatsAlgorithms.matInverse(A);
  const prod = StatsAlgorithms.matMul(A, Ainv);
  approx(prod[0][0], 1, 1e-12, "matInverse: (A·A⁻¹)[0][0] = 1");
  approx(prod[1][1], 1, 1e-12, "matInverse: (A·A⁻¹)[1][1] = 1");
  approx(prod[2][2], 1, 1e-12, "matInverse: (A·A⁻¹)[2][2] = 1");
  let maxOff = 0;
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) if (i !== j) maxOff = Math.max(maxOff, Math.abs(prod[i][j]));
  approx(maxOff, 0, 1e-12, "matInverse: max off-diagonal |A·A⁻¹| ≈ 0");
}

// Error handling: collinear predictors (x2 = 2·x1) make XᵀX singular — must
// throw, not return NaN. And n < p + 2 (here n = 3, p = 2, need 4) must throw.
{
  let threw = false;
  try { StatsAlgorithms.runMultipleRegression([[1, 2, 5], [2, 4, 6], [3, 6, 7], [4, 8, 8]]); }
  catch (e) { threw = true; }
  if (threw) { pass++; console.log("  ok    MLR: collinear predictors throw"); }
  else { fail++; console.error("  FAIL  MLR: collinear predictors throw"); }

  threw = false;
  try { StatsAlgorithms.runMultipleRegression([[1, 2, 3], [4, 5, 6], [7, 8, 9]]); }
  catch (e) { threw = true; }
  if (threw) { pass++; console.log("  ok    MLR: n < p + 2 throws"); }
  else { fail++; console.error("  FAIL  MLR: n < p + 2 throws"); }
}
```

This plan adds **20 + 17 + 19 + 4 + 2 = 62** new assertions. After adding
these, `node tests/verify-statistics.js` must report **216 + 62 = 278 passed,
0 failed**.

### Textbook cross-checks (per §9 of `00-SHARED-CONVENTIONS.md`)

- **Exact plane** (`Test 1`): recovers the analytically known `β = [2, 3, −1]`
  with `R² = 1`, `SSE = 0` — a deterministic correctness check on the matrix
  machinery (the `(XᵀX)⁻¹Xᵀy` fit of an exact linear model).
- **p = 1 cross-check** (`Test 2`): the `p = 1` case of `runMultipleRegression`
  reproduces `runLinearRegression`'s intercept, slope, and `R²` to `1e-12` —
  the simple-regression function is the `p = 1` special case of the multiple
  one, so they must agree.
- **Noisy p = 2** (`Test 3`): the coefficient t-tests are checked against the
  textbook t-table value `t_{0.025, df=5} = 2.571`. `β0` (`t = 8.15`) and
  `β1` (`t = 19.10`) have `|t| > 2.571` and are significant at `α = 0.05`
  (matching their p-values `0.00045` and `7.25e-6`, both `< 0.05`); `β2`
  (`t = 1.56`) has `|t| < 2.571` and is not significant (matching
  `p = 0.17991 > 0.05`).
- **`matInverse`** (`Test 4`): `A · A⁻¹ = I` to machine precision (`1e-12`),
  the definition of a correct matrix inverse.

## 4. Files to create

- `math-lab/assets/js/multiple-regression.js` — per-method DOM wiring (IIFE).
- `math-lab/engines/statistics/methods/multiple-regression.html` — method page
  copying the structure of `linear-regression.html` (simplified two-link header
  nav, data textarea, `.status-line`, result strip, coefficient table, formula
  block, Plotly plot).

## 5. Inputs (the form panel)

- **Data textarea** (id `dataInput`, `class="mono"`, rows 8) — one observation
  per line, columns comma- or space-separated as `x1, x2, ..., xp, y`. Default
  the exact-plane example:
  `0, 0, 2\n1, 0, 5\n0, 1, 1\n1, 1, 4\n2, 1, 7\n3, 2, 9`.
- **Number of predictors** is **auto-detected from the row width** (`p = row
  length − 1`), so there is no separate predictor-count control — the first
  parseable row sets `p` and every subsequent row must match. A `.field-note`
  documents this ("the last column is the response y; all preceding columns
  are predictors x1…xp — detected automatically from the first row").
- `.status-line` (id `statusLine`) for the verdict ("Fit through N observations
  with P predictors — R² = …").
- `.field#formError` for validation errors.
- "Try Example" loads the exact-plane default; a second "Noisy Example" button
  loads the 8-row `Test 3` dataset.

## 6. Outputs (results panel)

Result strip (5 tiles):
- `R²` (accent), `adj R²`, `Residual SE` (s), `Predictors (p)`, `n`.

Coefficient table (plain HTML `<table>`, one row per coefficient `β0…βp`):
columns `Term` (`Intercept`, `x1`, `x2`, …), `β̂`, `SE`, `t`, `p`. Every value
via `Engine.formatNum` (p to 4 decimals, β/SE to 4, t to 3, p to 4 — or
scientific notation for very small p via `Engine.formatNum`'s existing
behavior). A `.field-note` above it states `df = n − p − 1`.

Formula block (`formula-block--result`, KaTeX): the fitted plane equation,
e.g. `\hat{y} = 2 + 3 x_1 - 1 x_2`, with the numeric coefficients substituted
and signs chosen by each coefficient's sign (generalizes to `p` predictors;
for `p = 1` it collapses to the line `\hat{y} = b_0 + b_1 x_1`).

Plot (`#regressionPlot`, height 380px):
- **For `p = 2`**: a 3-D Plotly scatter of the observations
  (`type: "scatter3d"`, mode markers, teal-gold `#c99a3c`) plus the fitted
  plane drawn as a `type: "surface"` mesh over the `(x1, x2)` grid spanning the
  data range (orange `#ed6d40`, opacity 0.5). This is the canonical
  multiple-regression visualization for two predictors.
- **For `p = 1`**: fall back to the simple-regression 2-D scatter + line plot
  (same traces as `linear-regression.js`), since a plane is degenerate here.
- **For `p ≥ 3`**: a fitted-vs-actual scatter (`fitted` on x, `y` on y, markers
  teal-gold) with a `y = x` reference line (orange) — a sensible
  dimension-agnostic diagnostic that works for any `p`.

Use `Engine.formatNum` for ALL displayed numbers (never `.toFixed()` directly).
`Engine.debounce` on every input listener (200 ms). `Engine.renderKatex` for
the formula block. `Engine.plotlyBaseLayout` / `Engine.plotlyConfig` for every
plot. `Proto.saveState` / `loadState` with store key
`engine-lab:statistics:multipleregression`.

## 7. `methods.html` — card to add

Category `"Regression"`. Insert as card 10/10 (consolidation pass will fix the
index — the `10 / 10` is a TODO marker per the parallel-build addendum, §10 of
`00-SHARED-CONVENTIONS.md`).

```html
<!-- TODO index: pending consolidation — Statistics Engine card 10/10 (Multiple Linear Regression) -->
<a href="methods/multiple-regression.html" class="card engine-card reveal crosshair-host" style="display:block; transition-delay:.72s">
  <span class="engine-dot"></span>
  <div class="engine-card-head">
    <span class="eyebrow">Regression</span>
    <span class="engine-index">10 / 10</span>
  </div>
  <h3 class="h3">Multiple Linear Regression</h3>
  <p>Fits a plane or hyperplane β₀ + β₁x₁ + … + βₚxₚ through (x₁,…,xₚ, y) data by ordinary least squares in matrix form (XᵀX)⁻¹Xᵀy — reports each coefficient's standard error, t-statistic, and p-value, plus R² and adjusted R².</p>
  <div class="method-tags" style="margin-top:16px;">
    <span class="tag">Matrix OLS</span>
    <span class="tag">Coefficient t-tests</span>
    <span class="tag">R² &amp; adjusted R²</span>
  </div>
</a>
```

**Note:** Card is NOT added to `methods.html` directly in this build (per the
parallel-build addendum, §10 of `00-SHARED-CONVENTIONS.md`); it is appended to
`docs/agent-plans/PENDING-CARDS.md` under the existing `## Statistics Engine`
heading instead.

## 8. Acceptance criteria

All of §9 in `00-SHARED-CONVENTIONS.md`, plus:
- `node tests/verify-statistics.js` → **278 passed, 0 failed** (62 new
  assertions added).
- On the exact plane `y = 2 + 3x₁ − x₂`, the fit recovers `β = [2, 3, −1]`
  with `R² = 1` (tol `1e-10`), `s = 0`, and all coefficient p-values `≈ 0`.
- The `p = 1` case of `runMultipleRegression` matches `runLinearRegression`'s
  slope, intercept, and `R²` to `1e-12` on the noisy 5-point dataset.
- The noisy `p = 2` textbook example matches the node-verified coefficients
  `[2.55195, 1.79221, 0.16883]`, `R² = 0.99509`, `adjR² = 0.99313`,
  `s = 0.38814`, and the coefficient t/p values within `1e-9`.
- Coefficient SE/t/p are spot-checked against the textbook t-table value
  `t_{0.025, df=5} = 2.571` (β0, β1 significant at α = 0.05; β2 not).
- `matInverse` is correct: `A · A⁻¹ ≈ I` to `1e-12` on a 3×3 test matrix.
- Collinear predictors throw (not return NaN); `n < p + 2` throws.
- The plan file is complete with node-verified numbers.