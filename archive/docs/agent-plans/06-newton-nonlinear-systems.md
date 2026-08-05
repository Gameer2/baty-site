# Build Plan — Newton's Method for Nonlinear Systems

Roadmap ref: `CURRICULUM_ROADMAP.md` §1H.27, priority P2. Read `00-SHARED-CONVENTIONS.md`
and `03a-linear-algebra-helpers.md` first — this plan assumes both, and assumes
`Algorithms.solveLinear` already exists. Build before `07-broydens-method.md`, which
extends this one.

Category/eyebrow: **"Nonlinear Systems"**.

## 1. What this method is

Generalizes 1-D Newton's Method (already built, `newton-raphson.html`) to a system of `n`
equations in `n` unknowns, `F(x) = 0` where `F: ℝⁿ → ℝⁿ`. Instead of dividing by a scalar
derivative, each step **solves a linear system** built from the Jacobian matrix:

```
x_0 = initial guess
for k = 1, 2, ...:
  solve  J(x_{k-1}) · δ = -F(x_{k-1})    for δ    (J = Jacobian, n x n)
  x_k = x_{k-1} + δ
  stop when ||δ||_∞ < tol
```

**Design choice — numeric Jacobian, not symbolic.** The rest of this site uses symbolic
differentiation (`Engine.derivativeFx`, single-variable) for 1-D Newton's Method. Doing
that for an arbitrary `n×n` system would require the user to type every partial
derivative by hand, which is a much worse UI than just typing the `n` equations. Instead,
approximate the Jacobian by forward finite differences:

```
J[i][j] ≈ ( F_i(x + h·e_j) - F_i(x) ) / h        (e_j = j-th unit vector, h small, e.g. 1e-6)
```

This is a standard, well-established engineering simplification (used in practice by many
real Newton-system solvers) — state it plainly in the page copy as "numerically
approximated Jacobian," don't imply it's symbolic.

**Variable naming**: for generality across any `n`, use `x1, x2, ..., xn` as the variable
names in every equation the user types (not `x, y, z`) — consistent regardless of system
size, and matches how the input UI will label the initial-guess vector components.

## 2. `algorithms.js` — functions to add (after `runQRAlgorithm`)

```js
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
```

Returned shape: array of `{n, x, fx, J, delta, xNext, err}` per iteration.

## 3. `tests/verify.js` — case to add (pre-verified via `node -e`, use exactly)

```js
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
```

## 4. Files to create

- `math-lab/assets/js/newton-system.js`
- `math-lab/engines/numerical/methods/newton-nonlinear-systems.html`

## 5. Inputs

- **Number of equations `n`** field, `type="number" step="1" min="2" max="4"` (cap at 4 —
  beyond that the UI and finite-difference Jacobian get unwieldy for a demo page).
- **`n` equation text fields**, one per row, labeled `F₁(x1,...,xn) = 0`, `F₂(...) = 0`,
  etc., each with a live KaTeX preview like the existing `f(x)` fields (use
  `Engine.toLatex`/`Engine.renderKatex` the same way, just relabeled). **Do not** use
  `Engine.compileFx` for these (it's single-variable only) — instead compile directly:
  `const node = math.parse(exprStr); const code = node.compile(); const fn = (xVec) => {
  const scope = {}; xVec.forEach((v, i) => scope["x" + (i+1)] = v); const r =
  code.evaluate(scope); if (typeof r !== "number" || Number.isNaN(r)) throw new Error(...);
  return r; };` — mirror `Engine.compileFx`'s validation behavior (smoke-test evaluate,
  catch/report errors) but generalized to `n` variables.
- **Initial guess `x0`** — `n` number inputs, regenerated when `n` changes (same pattern
  as the linear-algebra pages' vector inputs).
- `tol`/`maxIter` field-row, same as every root-finding page.
- "Try Example": `n=2`, `F₁ = "x1^2 + x2^2 - 2"`, `F₂ = "x1 - x2"`, `x0 = [1.5, 1.5]`,
  `tol=1e-10`, `maxIter=50`.

## 6. Outputs

Result strip: **Solution ≈** (`accent`, joined `x` vector), **Iterations**, **‖F(x)‖ at
solution** (compute `Math.sqrt(fx.reduce((s,v)=>s+v*v,0))` in the per-method JS from the
last iteration's `fx` — this is display glue, not new algorithm math), **Final step size**
(`last.err`).

Formula block: `J(\mathbf{x}_{k-1})\,\boldsymbol{\delta} = -F(\mathbf{x}_{k-1}), \quad
\mathbf{x}_k = \mathbf{x}_{k-1} + \boldsymbol{\delta}`.

Plot — **"Step size (‖δ‖∞) vs. iteration"** (log y-axis), identical style/purpose to the
existing error-decay plots — `err` is already exactly this quantity, no extra computation
needed.

Data table: columns `k`, `x` (vector), `F(x)` (vector), `‖δ‖∞ (error)`. Full Jacobian `J`
is too wide for a table column — same treatment as the QR Algorithm plan (§6 there): show
the current iteration's `J` as a small read-only formatted block below the table, updated
by the step slider, not as a table column.

## 7. `methods.html` card

Per §10 of shared conventions, append to `PENDING-CARDS.md`:

```html
<a href="methods/newton-nonlinear-systems.html" class="card engine-card reveal crosshair-host" style="display:block; transition-delay:TODO">
  <span class="engine-dot"></span>
  <div class="engine-card-head">
    <span class="eyebrow">Nonlinear Systems</span>
    <span class="engine-index">TODO</span>
  </div>
  <h3 class="h3">Newton's Method for Nonlinear Systems</h3>
  <p>Generalizes Newton-Raphson to n equations in n unknowns — each step solves a linear system built from a numerically approximated Jacobian.</p>
  <div class="method-tags" style="margin-top:16px;">
    <span class="tag">n equations + x₀</span>
    <span class="tag">Finite-difference Jacobian</span>
    <span class="tag">Step-size decay plot</span>
  </div>
</a>
```

## 8. Acceptance criteria

All of §9 in shared conventions, plus: `node tests/verify.js` passes with the new case;
example inputs converge to `x ≈ (1, 1)` in well under `maxIter=50` iterations (quadratic
convergence from a reasonably close starting guess).
