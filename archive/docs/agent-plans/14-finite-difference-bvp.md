# Build Plan — Finite-Difference Method for BVPs

Roadmap ref: §1I.30. Track: **GLM-5.2**. Read `00-SHARED-CONVENTIONS.md` (all of it,
including §10) before starting. Cross-reference: `13-shooting-method.md` solves the same
class of problem a different way — if built together, the two pages' example (`y''=-y`)
make a nice cross-check of each other and the page copy can say so.

## 1. What this method is

Solves the same linear BVP as the Shooting Method (`y'' = p(x)y' + q(x)y + r(x)`,
`y(a)=α`, `y(b)=β`) by discretizing directly instead of integrating an IVP: replace the
derivatives with central differences at `n-1` interior grid points
(`x_i = a + i·h`, `h = (b-a)/n`, `i = 1..n-1`) and solve the resulting **tridiagonal**
linear system (Burden & Faires Alg. 11.3). Central-difference substitution gives, for
each interior `i`:

```
-(1 + h/2·p_i)·w_{i-1} + (2 + h²·q_i)·w_i - (1 - h/2·p_i)·w_{i+1} = -h²·r_i
```

i.e. tridiagonal coefficients (this exact sign convention matters — it's what makes the
pre-verified test value below reproducible; don't rederive a different but equivalent
form):

```
A_i (sub-diag,  coeff of w_{i-1}) = -1 - (h/2)·p_i
B_i (diag,      coeff of w_i)     =  2 + h²·q_i
C_i (super-diag,coeff of w_{i+1}) = -1 + (h/2)·p_i
D_i (rhs)                          = -h²·r_i
```

with the known boundary values folded into the first/last RHS entries:
`D_1 -= A_1·α`, `D_{n-1} -= C_{n-1}·β`. Solve with the Thomas algorithm (tridiagonal
Gaussian elimination). This is fully self-contained — write the Thomas solve inline in
this method's own `algorithms.js` function; don't wait on or depend on whatever the
linear-algebra track (files `03`-`07`) may or may not add as a general solver.

## 2. `algorithms.js` — function to add

```js
// Tridiagonal (Thomas algorithm) solve. a: sub-diagonal (a[0] unused), b: diagonal,
// c: super-diagonal (c[last] unused), d: right-hand side. All same length n.
function thomasSolve(a, b, c, d) {
  const n = b.length;
  const cp = new Array(n), dp = new Array(n);
  cp[0] = c[0] / b[0];
  dp[0] = d[0] / b[0];
  for (let i = 1; i < n; i++) {
    const m = b[i] - a[i] * cp[i - 1];
    if (Math.abs(m) < 1e-14) throw new Error("Tridiagonal system is singular (or nearly so) — check p(x)/q(x)/r(x) and the grid size.");
    cp[i] = c[i] / m;
    dp[i] = (d[i] - a[i] * dp[i - 1]) / m;
  }
  const x = new Array(n);
  x[n - 1] = dp[n - 1];
  for (let i = n - 2; i >= 0; i--) x[i] = dp[i] - cp[i] * x[i + 1];
  return x;
}

// p, q, r: number -> number. Solves the linear BVP y'' = p(x)y' + q(x)y + r(x),
// y(a)=alpha, y(b)=beta by central-difference discretization on n subintervals,
// solved as a tridiagonal system. Returns the grid (including both boundary points).
Algorithms.runFiniteDifferenceBVP = function (p, q, r, a, b, alpha, beta, n) {
  if (!Number.isInteger(n) || n < 2) throw new Error("n (number of subintervals) must be an integer >= 2.");
  const h = (b - a) / n;
  const N = n - 1;
  const A = new Array(N), B = new Array(N), C = new Array(N), D = new Array(N);
  for (let i = 1; i <= N; i++) {
    const xi = a + i * h;
    let pv, qv, rv;
    try { pv = p(xi); qv = q(xi); rv = r(xi); } catch { throw new Error(`p(x), q(x), or r(x) could not be evaluated at x = ${xi}.`); }
    if (![pv, qv, rv].every(Number.isFinite)) throw new Error(`p(x), q(x), or r(x) produced a non-finite value at x = ${xi}.`);
    const idx = i - 1;
    A[idx] = -1 - (h / 2) * pv;
    B[idx] = 2 + h * h * qv;
    C[idx] = -1 + (h / 2) * pv;
    D[idx] = -h * h * rv;
  }
  D[0] -= A[0] * alpha;
  D[N - 1] -= C[N - 1] * beta;
  const w = thomasSolve(A, B, C, D);
  const grid = [{ i: 0, x: a, w: alpha }];
  for (let i = 1; i <= N; i++) grid.push({ i, x: a + i * h, w: w[i - 1] });
  grid.push({ i: n, x: b, w: beta });
  return { h, grid };
};
```

## 3. `tests/verify.js` — case to add (pre-verified via `node -e`, fully deterministic
— this is a direct linear solve with no iteration, so any correct implementation of the
exact discretization above reproduces this to floating precision)

```js
// Finite-Difference BVP: y'' = -y, y(0)=0, y(pi/2)=1, n=10 -> deterministic FD solution;
// grid[5] is x=pi/4, compare loosely to the true sin(pi/4) too (O(h^2) discretization
// error is expected and part of the point).
{
  const p = () => 0, q = () => -1, r = () => 0;
  const result = Algorithms.runFiniteDifferenceBVP(p, q, r, 0, Math.PI / 2, 0, 1, 10);
  approx(result.grid[5].x, Math.PI / 4, 1e-9, "FD-BVP: grid point 5 of 10 lands exactly at pi/4");
  approx(result.grid[5].w, 0.7076800249807215, 1e-9, "FD-BVP y''=-y, n=10, w at x=pi/4 (exact algorithm value)");
  approx(result.grid[5].w, Math.sin(Math.PI / 4), 1e-2, "FD-BVP y''=-y, n=10, w at x=pi/4 (loosely -> sin(pi/4), O(h^2) error)");
}
```

## 4. Files to create

- `math-lab/assets/js/finite-difference-bvp.js`
- `math-lab/engines/numerical/methods/finite-difference-bvp.html`

## 5. Inputs

Same shape as the Shooting Method plan (`13-shooting-method.md`) for consistency between
the two BVP pages: `p(x)`, `q(x)`, `r(x)` fields, `a`, `b`, `alpha`, `beta`, and `n`
(subintervals — note this is a step *count*, semantically the same slot as Shooting's `n`
but here it directly sets grid resolution, no RK4 involved). "Try Example": same values
as Shooting's example (`p="0"`, `q="-1"`, `r="0"`, `a=0`, `b="1.5707963267948966"`,
`alpha=0`, `beta=1`, `n=10`).

## 6. Outputs

Result strip: **y at midpoint grid** (or nearest to the interval's midpoint), **Grid
points (n+1)**, **h**, and a 4th tile reserved for **Max |residual|** if easy to compute
(optional — skip if it adds meaningful complexity; the three required stats are enough).

Formula block: the tridiagonal coefficient formulas from §1 (render as a small 3-line
KaTeX block: `A_i = ...`, `B_i = ...`, `C_i = ...`).

Plot — the FD solution as a `lines+markers` trace over the grid (`x_i, w_i`), orange,
plus (if `p(x)="0"` was the last-computed example or generally whenever helpful) no
overlay is required, but the page copy should mention that this can be cross-checked
against the Shooting Method page's result for the same BVP.

Data table: columns `i`, `x_i`, `w_i`.

## 7. `methods.html` card (→ `PENDING-CARDS.md`, don't edit `methods.html` directly)

Category: **"Boundary Value Problems"**.
```html
<a href="methods/finite-difference-bvp.html" class="card engine-card reveal crosshair-host" style="display:block; transition-delay:TODO">
  <span class="engine-dot"></span>
  <div class="engine-card-head">
    <span class="eyebrow">Boundary Value Problems</span>
    <span class="engine-index">TODO</span>
  </div>
  <h3 class="h3">Finite-Difference BVP</h3>
  <p>Discretizes the whole interval at once into a tridiagonal linear system, instead of shooting an IVP across it — solve once, no iteration.</p>
  <div class="method-tags" style="margin-top:16px;">
    <span class="tag">p(x), q(x), r(x) + BCs</span>
    <span class="tag">Tridiagonal solve</span>
    <span class="tag">Grid-solution plot</span>
  </div>
</a>
```

## 8. Acceptance criteria

Per §9 of shared conventions, plus: on the shared example (`y''=-y`, boundaries 0 and 1
at `0` and `π/2`), increasing `n` from 10 to 50 should visibly bring the mid-grid value
closer to `sin(π/4) ≈ 0.70711` — a quick manual check that convergence order looks right
(error should shrink roughly by 4× when `h` halves, i.e. `n` doubles from 10→20, since
this is an `O(h²)` method).
