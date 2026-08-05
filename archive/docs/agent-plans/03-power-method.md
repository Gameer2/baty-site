# Build Plan — Power Method

Roadmap ref: `CURRICULUM_ROADMAP.md` §1G.24, priority P1. Read
`00-SHARED-CONVENTIONS.md` and `03a-linear-algebra-helpers.md` first — this plan assumes
both, and assumes `Algorithms.matVec` already exists in `algorithms.js`.

Category/eyebrow: **"Linear Algebra"** (or "Eigenvalues" if you'd rather split the
eyebrow taxonomy more finely — check what eyebrow values `methods.html`'s other cards use
once more of this batch exists, and stay consistent; "Linear Algebra" is safe as a default).

## 1. What this method is

Finds the dominant eigenvalue (largest in absolute value) and a corresponding eigenvector
of a matrix `A`, by repeatedly multiplying a starting vector by `A` and rescaling:

```
x_0 scaled so its largest-magnitude component is 1
for n = 1, 2, ...:
  y = A · x_{n-1}
  p = index of the largest-magnitude component of y
  μ_n = y[p]                      (eigenvalue estimate)
  x_n = y / μ_n                    (rescaled — largest component now exactly 1)
  stop when ||x_n - x_{n-1}||_∞ < tol
```

`μ_n → λ_max` (dominant eigenvalue) and `x_n →` its eigenvector, provided `A` has a single
dominant eigenvalue (strictly larger in magnitude than all others) and `x_0` isn't
orthogonal to that eigenvector's direction.

## 2. `algorithms.js` — function to add (after the linear-algebra helpers)

```js
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
```

Returned shape matches the existing root-finding pattern: an array of per-iteration
objects `{n, x, y, mu, xNext, err}` — `x`/`y`/`xNext` are vectors (arrays), `mu`/`err` are
scalars. `iterations[iterations.length-1].mu` is the final eigenvalue estimate,
`...xNext` the eigenvector.

## 3. `tests/verify.js` — case to add (pre-verified via `node -e`, use exactly)

```js
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
```

## 4. Files to create

- `math-lab/assets/js/power-method.js`
- `math-lab/engines/numerical/methods/power-method.html`

## 5. Inputs

- Matrix size `n` + generated `n×n` grid, per `03a-linear-algebra-helpers.md`'s matrix
  input pattern. Default example: `n=2`, matrix `[[2,1],[1,2]]`.
- Starting vector `x0`, one number input per component, regenerated when `n` changes.
  Default example: `[1, 0]`.
- Standard `tol`/`maxIter` field-row, same as every root-finding page.
- Status line validating: matrix is square (guaranteed by the UI, but still check `n>=2`),
  `x0` isn't all zero.
- "Try Example": the matrix/vector/tol/maxIter above.

## 6. Outputs

Result strip: **Dominant eigenvalue ≈** (`accent`, `Engine.formatNum(last.mu, 8)`),
**Iterations**, **Eigenvector** (format as `(x₁, x₂, ...)` joined with `Engine.formatNum`
per component, small enough font to fit — use `.mono` styling).

Formula block: `A\mathbf{x}_{n} = \mu_n \mathbf{x}_{n+1}` with a one-line plain-text note
underneath ("μₙ is the largest-magnitude component of Axₙ₋₁; the eigenvector estimate is
rescaled so its own largest component is 1").

Plot — **"Eigenvalue estimate vs. iteration"**: x-axis iteration `n`, y-axis `mu`, same
`lines+markers` orange style as the error-decay plots elsewhere — this is the natural
analogue here (μₙ converging to the true eigenvalue, rather than error shrinking to zero,
but visually and mechanically the same kind of convergence plot). No f(x) curve plot makes
sense for this method (there's no scalar function of x) — one plot is enough, don't force
a second one.

Data table: columns `n`, `x` (vector, joined string), `Ax` (vector), `μ`, `x_{n+1}`
(vector, normalized), `error`. One row per iteration, `data-n="${it.n}"`, same
current-row-highlight + step-slider pattern as every other method.

## 7. `methods.html` card

Per §10 of shared conventions — append to `PENDING-CARDS.md` instead of editing
`methods.html` directly:

```html
<a href="methods/power-method.html" class="card engine-card reveal crosshair-host" style="display:block; transition-delay:TODOs">
  <span class="engine-dot"></span>
  <div class="engine-card-head">
    <span class="eyebrow">Linear Algebra</span>
    <span class="engine-index">TODO</span>
  </div>
  <h3 class="h3">Power Method</h3>
  <p>Finds a matrix's dominant eigenvalue and eigenvector by repeated multiplication and rescaling — the seed idea behind Google's original PageRank.</p>
  <div class="method-tags" style="margin-top:16px;">
    <span class="tag">Matrix + x₀</span>
    <span class="tag">Eigenvalue convergence plot</span>
    <span class="tag">Iteration table</span>
  </div>
</a>
```

## 8. Acceptance criteria

All of §9 in shared conventions, plus: `node tests/verify.js` passes with the new case;
example inputs converge to `μ ≈ 3` within a handful of iterations (the matrix's
eigenvalue ratio 3:1 gives fast linear convergence, should be well within `maxIter=100`,
typically well under 40 iterations for `tol=1e-10`).
