# Build Plan — QR Algorithm (unshifted)

Roadmap ref: `CURRICULUM_ROADMAP.md` §1G.26, priority P2. Read `00-SHARED-CONVENTIONS.md`
and `03a-linear-algebra-helpers.md` first — this plan assumes both, and assumes
`Algorithms.qrDecompose` and `Algorithms.matMul` already exist. Build after
`03-power-method.md`/`04-inverse-power-method.md` — this is the most involved of the three
eigenvalue methods, presenting all eigenvalues at once instead of one at a time.

Category/eyebrow: **"Linear Algebra"**.

## 1. What this method is

Where Power/Inverse-Power methods find one eigenvalue at a time, the QR Algorithm finds
**all** of them simultaneously by repeatedly factoring the matrix into `Q·R` and
recombining in the opposite order:

```
A_1 = A
for k = 1, 2, ...:
  A_k = Q_k · R_k                  (QR decomposition)
  A_{k+1} = R_k · Q_k              (recombine in reverse order — same eigenvalues as A_k)
  stop when the off-diagonal entries of A_{k+1} are ~0
```

`A_k` converges toward a (quasi-)upper-triangular matrix whose diagonal entries are the
eigenvalues of the original `A`. This plan scopes the **unshifted** version only (no
Wilkinson shift, no deflation) — correct and effective for the kind of small,
well-separated-eigenvalue example matrices this page will demo, at the cost of slower
convergence on matrices with close eigenvalues. That limitation is fine to state plainly
in the page copy rather than silently hidden — don't claim faster convergence than the
unshifted algorithm actually has.

## 2. `algorithms.js` — function to add (after `runInversePowerMethod`)

```js
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
```

Returned shape: array of `{n, A, diag, offNorm}` per iteration — `A` is the full
current matrix, `diag` the current diagonal (eigenvalue estimates), `offNorm` the
off-diagonal Frobenius norm used as the convergence/stopping measure (displayed the same
way an error-decay plot works elsewhere).

## 3. `tests/verify.js` — case to add (pre-verified via `node -e`, use exactly)

```js
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
```

## 4. Files to create

- `math-lab/assets/js/qr-algorithm.js`
- `math-lab/engines/numerical/methods/qr-algorithm.html`

## 5. Inputs

Matrix size + grid (same pattern as Power Method), no starting vector needed (this method
doesn't take one). `tol`/`maxIter` field-row — default example `tol=1e-8`, `maxIter=100`.
Default example matrix: `[[2,1],[1,2]]`. Status line: matrix must be square (guaranteed by
the size-driven grid).

## 6. Outputs

Result strip: **Eigenvalues ≈** (`accent` — join `last.diag` values, e.g. `"3, 1"`, via
`Engine.formatNum` per entry), **Iterations**, **Final off-diagonal norm**.

Formula block: `A_{k+1} = R_k Q_k \quad\text{where } A_k = Q_k R_k`.

Plot — **"Off-diagonal norm vs. iteration"** (log y-axis): x-axis iteration `n`, y-axis
`offNorm` (clamp to `Math.max(offNorm, 1e-16)` before plotting, same pattern as every
existing error-decay plot), `type: "log"` — this is a direct structural match to the
root-finding pages' error-decay plot, reuse that exact styling.

Data table: columns `n`, `diagonal (eigenvalue estimates)` (joined string), `off-diagonal
norm`. Given the full matrix `A_k` is large to show per-row, don't add a column for it —
show it separately: below the table, a small read-only "current matrix" display (a
`<pre class="mono">` or a mini non-input version of the matrix grid) that updates via the
step slider to show `iterations[idx].A` formatted as rows — reuse `Engine.formatNum` per
cell, this is presentation-only, not a new algorithms.js concern.

## 7. `methods.html` card

Per §10 of shared conventions, append to `PENDING-CARDS.md`:

```html
<a href="methods/qr-algorithm.html" class="card engine-card reveal crosshair-host" style="display:block; transition-delay:TODO">
  <span class="engine-dot"></span>
  <div class="engine-card-head">
    <span class="eyebrow">Linear Algebra</span>
    <span class="engine-index">TODO</span>
  </div>
  <h3 class="h3">QR Algorithm</h3>
  <p>Repeatedly factors A = QR and recombines as RQ — the matrix converges toward triangular form with every eigenvalue on the diagonal at once, unshifted.</p>
  <div class="method-tags" style="margin-top:16px;">
    <span class="tag">Matrix input</span>
    <span class="tag">All eigenvalues at once</span>
    <span class="tag">Off-diagonal decay plot</span>
  </div>
</a>
```

## 8. Acceptance criteria

All of §9 in shared conventions, plus: `node tests/verify.js` passes with the new case;
example inputs converge within `~20` iterations (well under `maxIter=100`) to
diagonal `≈ [3, 1]`.
