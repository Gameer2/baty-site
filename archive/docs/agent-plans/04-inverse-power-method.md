# Build Plan — Inverse Power Method

Roadmap ref: `CURRICULUM_ROADMAP.md` §1G.25, priority P2. Read `00-SHARED-CONVENTIONS.md`
and `03a-linear-algebra-helpers.md` first — this plan assumes both, and assumes
`Algorithms.solveLinear` already exists. Build after `03-power-method.md` — this method
reuses its iteration/table/UI shape almost exactly, just with a linear solve instead of a
matrix-vector multiply.

Category/eyebrow: **"Linear Algebra"**.

## 1. What this method is

The Power Method (see `03-power-method.md`) finds the *largest*-magnitude eigenvalue. The
Inverse Power Method finds the *smallest*-magnitude eigenvalue, by running the power
method on `A⁻¹` instead of `A` — since if `λ` is an eigenvalue of `A`, `1/λ` is an
eigenvalue of `A⁻¹`, so the *largest* eigenvalue of `A⁻¹` corresponds to the *smallest*
eigenvalue of `A`. Rather than explicitly inverting `A` (numerically wasteful and
unnecessary), each iteration **solves** `A·y = x` for `y` via `Algorithms.solveLinear`
instead of computing `y = A⁻¹·x` directly:

```
x_0 scaled so its largest-magnitude component is 1
for n = 1, 2, ...:
  solve A·y = x_{n-1}  for y            (instead of y = A·x_{n-1} as in Power Method)
  p = index of the largest-magnitude component of y
  μ_n = y[p]
  x_n = y / μ_n
  stop when ||x_n - x_{n-1}||_∞ < tol
λ_min = 1 / μ_n   (the actual smallest-magnitude eigenvalue of A)
```

## 2. `algorithms.js` — function to add (after `runPowerMethod`)

```js
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
```

Returned shape: array of `{n, x, y, mu, lambdaMin, xNext, err}` — same as Power Method
plus the extra `lambdaMin = 1/mu` field, which is the number to actually display as the
headline result (not `mu` itself, which is the eigenvalue of `A⁻¹`, not of `A`).

## 3. `tests/verify.js` — case to add (pre-verified via `node -e`, use exactly)

```js
// Inverse Power Method: A = [[3.5,1.5],[1.5,3.5]] has eigenvalues 2 and 5 (trace=7,
// det=10=2*5). Starting from x0=[1,0], converges to the smallest eigenvalue, 2.
{
  const A = [[3.5, 1.5], [1.5, 3.5]];
  const iters = Algorithms.runInversePowerMethod(A, [1, 0], 1e-10, 100);
  const last = iters[iters.length - 1];
  approx(last.lambdaMin, 2, 1e-6, "Inverse power method smallest eigenvalue of [[3.5,1.5],[1.5,3.5]]");
}
```

## 4. Files to create

- `math-lab/assets/js/inverse-power-method.js`
- `math-lab/engines/numerical/methods/inverse-power-method.html`

## 5. Inputs

Identical shape to Power Method's page (§5 of `03-power-method.md`): matrix-size + grid,
starting vector, tol/maxIter. Default example: `n=2`, matrix `[[3.5,1.5],[1.5,3.5]]`,
`x0=[1,0]`. Status line should additionally warn (not block — `solveLinear` will throw and
`showError` will surface it either way) that a singular matrix has no inverse.

## 6. Outputs

Result strip: **Smallest eigenvalue ≈** (`accent`, `Engine.formatNum(last.lambdaMin, 8)`),
**Iterations**, **Eigenvector**. Formula block:
`A^{-1}\mathbf{x}_n \text{ via solving } A\mathbf{y}=\mathbf{x}_n,\quad \lambda_{\min} = 1/\mu_n`.

Plot — **"1/λ estimate (μ) vs. iteration"**, same style as Power Method's convergence
plot, plotting `mu` (not `lambdaMin`) per iteration — note in the page copy that `μ`
converges to `1/λ_min`, and the headline stat converts it.

Data table: columns `n`, `x`, `y (solve of Ay=x)`, `μ`, `λ_min = 1/μ`, `error`.

## 7. `methods.html` card

Per §10 of shared conventions, append to `PENDING-CARDS.md`:

```html
<a href="methods/inverse-power-method.html" class="card engine-card reveal crosshair-host" style="display:block; transition-delay:TODO">
  <span class="engine-dot"></span>
  <div class="engine-card-head">
    <span class="eyebrow">Linear Algebra</span>
    <span class="engine-index">TODO</span>
  </div>
  <h3 class="h3">Inverse Power Method</h3>
  <p>Runs the power method on A⁻¹ — via solving a linear system each step, never inverting A directly — to find the smallest-magnitude eigenvalue instead of the largest.</p>
  <div class="method-tags" style="margin-top:16px;">
    <span class="tag">Matrix + x₀</span>
    <span class="tag">Linear solve per step</span>
    <span class="tag">Smallest eigenvalue</span>
  </div>
</a>
```

## 8. Acceptance criteria

All of §9 in shared conventions, plus: `node tests/verify.js` passes with the new case;
example inputs converge to `λ_min ≈ 2` (eigenvalue ratio here is 5:2, still fast linear
convergence, well under `maxIter=100`).
