# Build Plan — Broyden's Method

Roadmap ref: `CURRICULUM_ROADMAP.md` §1H.28, priority P3. Read `00-SHARED-CONVENTIONS.md`,
`03a-linear-algebra-helpers.md`, and `06-newton-nonlinear-systems.md` first — this method
is a direct extension of Newton's Method for Nonlinear Systems; build it after that one,
and reuse its input-handling code (multivariable expression compilation, matrix display)
rather than rewriting it.

Category/eyebrow: **"Nonlinear Systems"**.

## 1. What this method is

Newton's Method for Nonlinear Systems (`06-newton-nonlinear-systems.md`) recomputes the
full Jacobian (via finite differences) at **every** iteration — for `n` equations this
costs `n` extra function evaluations per step. Broyden's Method instead computes the
Jacobian **once**, at the start, and cheaply *updates* an approximation of it after each
step using only information already available (a rank-1 correction), avoiding repeated
Jacobian recomputation entirely:

```
x_0 = initial guess
J_0 ≈ finite-difference Jacobian at x_0        (computed once, via Algorithms.jacobianFD)
F_0 = F(x_0)
for k = 1, 2, ...:
  solve  J_{k-1} · δ = -F_{k-1}   for δ
  x_k = x_{k-1} + δ
  F_k = F(x_k)
  Δx = δ,  ΔF = F_k - F_{k-1}
  J_k = J_{k-1} + [ (ΔF - J_{k-1}·Δx) · Δxᵀ ] / (Δxᵀ·Δx)      (Broyden's rank-1 update)
  stop when ||δ||_∞ < tol
```

This is "good Broyden" (the update to `J` itself, not the Sherman-Morrison update to
`J⁻¹`) — matches the style of solving a fresh linear system each step via
`Algorithms.solveLinear`, consistent with `06-newton-nonlinear-systems.md`, rather than
introducing a second, inverse-update code path.

## 2. `algorithms.js` — function to add (after `runNewtonSystem`)

```js
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

    const dF = fxNext.map((v, i) => v - fx[i]);
    const Jdx = Algorithms.matVec(J, delta);
    const num = dF.map((v, i) => v - Jdx[i]);
    const denom = delta.reduce((s, v) => s + v * v, 0);
    if (denom < 1e-14) throw new Error(`Step size ≈ 0 at iteration ${k} before convergence was detected — cannot update the Jacobian approximation.`);
    const Jnext = J.map((row, i) => row.map((Jij, j) => Jij + (num[i] * delta[j]) / denom));

    const err = Math.max(...delta.map(Math.abs));
    iterations.push({ n: k, x, fx, J, delta, xNext, fxNext, err });
    x = xNext; fx = fxNext; J = Jnext;
    if (err < tol) break;
  }
  return iterations;
};
```

Returned shape: array of `{n, x, fx, J, delta, xNext, fxNext, err}` — same field
naming convention as `runNewtonSystem` (§2 of `06-newton-nonlinear-systems.md`) so the
per-method JS/table-rendering code can be near-identical between the two pages.

## 3. `tests/verify.js` — cases to add (pre-verified via `node -e`, use exactly)

```js
// Broyden's Method: same system as Newton's Method for Nonlinear Systems above —
// F1 = x1^2 + x2^2 - 2, F2 = x1 - x2, exact solution (1,1). Cross-checks Broyden's
// against Newton's system solver converging to the same root from the same guess.
{
  const f1 = (v) => v[0] * v[0] + v[1] * v[1] - 2;
  const f2 = (v) => v[0] - v[1];
  const iters = Algorithms.runBroyden([f1, f2], [1.5, 1.5], 1e-10, 100);
  const last = iters[iters.length - 1];
  approx(last.xNext[0], 1, 1e-6, "Broyden's method x1 -> 1 (cross-check vs Newton system)");
  approx(last.xNext[1], 1, 1e-6, "Broyden's method x2 -> 1 (cross-check vs Newton system)");
}
```

Note: Broyden's method needs more iterations than full Newton to reach the same
tolerance (superlinear, not quadratic, convergence) — `maxIter=100` here vs `50` in the
Newton-system test is intentional, not a mistake to "fix" down to match.

## 4. Files to create

- `math-lab/assets/js/broyden.js`
- `math-lab/engines/numerical/methods/broydens-method.html`

## 5. Inputs

Identical shape to `06-newton-nonlinear-systems.md` §5 — reuse that page's input-handling
code directly (equation count, `n` equation fields with multivariable compilation, initial
guess vector, tol/maxIter). Same example values: `n=2`, `F₁ = "x1^2 + x2^2 - 2"`,
`F₂ = "x1 - x2"`, `x0 = [1.5, 1.5]`, `tol=1e-10`, `maxIter=100` (note the higher default
maxIter than Newton's system page, per §3 above).

## 6. Outputs

Same shape as Newton's Method for Nonlinear Systems (§6 there): result strip (**Solution
≈**, **Iterations**, **‖F(x)‖ at solution**, **Final step size**), formula block
(`J_k = J_{k-1} + \dfrac{(\Delta F_k - J_{k-1}\Delta x_k)\,\Delta x_k^{\mathsf T}}{\Delta
x_k^{\mathsf T}\Delta x_k}`), step-size decay plot (log y-axis), and a data table +
read-only current-Jacobian display. Additionally add one line of copy near the top of the
results panel noting the iteration count next to Newton's method's for the same problem
(qualitatively — "Broyden's needs more steps but each one is cheaper: no Jacobian
recomputation"), since the whole pedagogical point of this page is that tradeoff.

## 7. `methods.html` card

Per §10 of shared conventions, append to `PENDING-CARDS.md`:

```html
<a href="methods/broydens-method.html" class="card engine-card reveal crosshair-host" style="display:block; transition-delay:TODO">
  <span class="engine-dot"></span>
  <div class="engine-card-head">
    <span class="eyebrow">Nonlinear Systems</span>
    <span class="engine-index">TODO</span>
  </div>
  <h3 class="h3">Broyden's Method</h3>
  <p>Quasi-Newton: computes the Jacobian once, then cheaply updates it with a rank-1 correction each step instead of recomputing it — more steps, less work per step.</p>
  <div class="method-tags" style="margin-top:16px;">
    <span class="tag">n equations + x₀</span>
    <span class="tag">Rank-1 Jacobian update</span>
    <span class="tag">Cross-check vs. Newton system</span>
  </div>
</a>
```

## 8. Acceptance criteria

All of §9 in shared conventions, plus: `node tests/verify.js` passes with the new case;
example inputs converge to `x ≈ (1, 1)`, taking visibly more iterations than the Newton
system page's example (both start from the same guess, same system) — that's expected and
correct, not a bug.
