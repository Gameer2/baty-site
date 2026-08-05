# Build Plan — Steffensen's Method (Aitken's Δ² Acceleration)

Roadmap ref: `CURRICULUM_ROADMAP.md` §1A.7, priority P2. Earmarked for **Qwen3.5**. Read
`docs/agent-plans/00-SHARED-CONVENTIONS.md` in full first (including §10 — append your
card to `PENDING-CARDS.md`, don't edit `methods.html`).

**Closest precedent, read it in full before starting:** `math-lab/assets/js/fixed-point.js`
and `math-lab/engines/numerical/methods/fixed-point-iteration.html`, plus
`Algorithms.runFixedPoint` in `algorithms.js`. Same `g(x)` input, same cobweb-diagram plot
idea — only the per-step math changes.

## 1. What this method is

Plain fixed-point iteration (`x_{n+1} = g(x_n)`) can converge very slowly. **Aitken's Δ²
process** accelerates a sequence `x_n` after the fact using three consecutive terms:

```
x̂_n = x_n - (Δx_n)² / Δ²x_n,   where Δx_n = x_{n+1} - x_n,   Δ²x_n = x_{n+2} - 2x_{n+1} + x_n
```

**Steffensen's Method** applies this acceleration *live, at every step*, instead of as a
one-time post-process on a finished sequence. Each Steffensen iteration, starting from the
current estimate `x`:

```
p0 = x
p1 = g(p0)
p2 = g(p1)
Δp0 = p1 - p0
Δ²p0 = p2 - 2·p1 + p0
x_next = p0 - (Δp0)² / Δ²p0          (this is Aitken's formula applied to p0, p1, p2)
```

Build **Steffensen's** (the live, per-step version above) — it fits this site's
step-through UI far better than a static Aitken table, and it's the version that
naturally reuses the `g(x)` input field pattern already built for Fixed-Point Iteration.
Each "iteration" in the returned array corresponds to one full Steffensen step (which
internally evaluates `g` twice, at `p0` and `p1`) — do not report `p1`/`p2` as separate
iterations of their own; they're intermediate values used to compute one accelerated step.

Use the exact same example function as Fixed-Point Iteration's page for a direct,
honest comparison: `g(x) = cos(x)`, `x0 = 0.5`, converging to the Dottie number
`≈ 0.7390851332151607` — this is also already a known-answer case in `tests/verify.js`
for `runFixedPoint`, so this method's test case is a genuine cross-check against it.

## 2. `algorithms.js` — function to add

Add after `Algorithms.runFixedPoint`:

```js
// g: number -> number, Steffensen's method: applies Aitken's Δ² acceleration at every
// step of a fixed-point iteration x_{n+1} = g(x_n), converging quadratically instead of
// linearly. Each iteration evaluates g twice (at the current estimate and at g of that).
Algorithms.runSteffensen = function (g, x0, tol, maxIter) {
  const iterations = [];
  let x = x0;
  for (let n = 1; n <= maxIter; n++) {
    let p1, p2;
    try { p1 = g(x); p2 = g(p1); } catch { throw new Error("g(x) could not be evaluated at the current iterate."); }
    if (!Number.isFinite(p1) || !Number.isFinite(p2)) throw new Error("Iteration produced a non-finite value — the sequence diverged.");
    const d1 = p1 - x;
    const d2 = p2 - 2 * p1 + x;
    if (Math.abs(d2) < 1e-14) throw new Error(`Δ²x ≈ 0 at n = ${n} — Steffensen's acceleration is undefined here (the underlying sequence may already have converged, or g is behaving linearly).`);
    const xNext = x - (d1 * d1) / d2;
    const err = Math.abs(xNext - x);
    iterations.push({ n, x, p1, p2, xNext, err });
    if (err < tol) break;
    if (Math.abs(xNext) > 1e8) throw new Error("Iteration diverged (|xₙ| grew without bound).");
    x = xNext;
  }
  return iterations;
};
```

Return shape: array of `{n, x, p1, p2, xNext, err}`. `p1 = g(x)`, `p2 = g(p1)`.

## 3. `tests/verify.js` — case to add (pre-verified, use exactly)

```js
// Steffensen's Method: g(x) = cos(x), x0 = 0.5 -> Dottie number, same target as the
// Fixed-Point Iteration case above — cross-checks the accelerated method against the
// plain one. Steffensen converges in ~4 iterations at tol=1e-9 (verified with node -e);
// plain Fixed-Point Iteration needs dramatically more for the same tolerance — that
// speed difference is the whole point of this method and worth restating in the page copy.
{
  const { fn } = compile("cos(x)");
  const iters = Algorithms.runSteffensen(fn, 0.5, 1e-9, 50);
  approx(iters[iters.length - 1].xNext, 0.7390851332151607, 1e-9, "Steffensen's method, cos(x) → Dottie number (cross-check vs Fixed-Point)");
}
```

Append after whatever cases already exist in the file.

## 4. Files to create

- `math-lab/assets/js/steffensen.js` — copy `fixed-point.js`, then: rename form/ids
  accordingly, change the `Algorithms.runFixedPoint` call to
  `Algorithms.runSteffensen`, change the formula block LaTeX (see §6). The cobweb-diagram
  plotting logic in `fixed-point.js` draws `y = g(x)` and `y = x` and steps a
  staircase/cobweb path between them — check exactly how `fixed-point.js` builds that
  path (read the file's plot-construction section fully) and adapt it: instead of one
  `g(x)` hop per iteration, draw **two** hops per iteration (`x → p1`, `p1 → p2`) to show
  where the two `g` evaluations land, then a distinct-colored jump (dashed, orange) from
  `p0`/`p2`'s neighborhood directly to `xNext` to visually set the "accelerated jump"
  apart from the two ordinary cobweb hops. If this two-hop-plus-jump visualization proves
  awkward to fit into the existing cobweb-drawing code cleanly, a simpler acceptable
  fallback is: draw the same two ordinary cobweb hops (`x→p1→p2`) in the existing
  teal/base color, and just mark `xNext` as a distinct diamond point on the `y=x` line
  (reusing the "next" marker style from `newton-raphson.js`/`secant.js`) — prioritize
  correctness and clarity over a fancy multi-segment jump line.
- `math-lab/engines/numerical/methods/steffensen.html` — copy
  `fixed-point-iteration.html`, then: `<title>`/`<h1>` → "Steffensen's Method", update
  `.method-summary`, form id, script tag → `steffensen.js`. Iteration table columns:
  `n`, `x_n`, `p1 = g(xₙ)`, `p2 = g(p1)`, `xₙ₊₁`, `error` (five data columns instead of
  Fixed-Point's four — check `fixed-point-iteration.html`'s existing `<thead>` and add
  one `<th>`/matching `<td>` for the extra `p2` field).

## 5. Inputs

Identical to Fixed-Point Iteration: `g(x)` field (reuses `Engine.compileFx` the same way
— the site already treats `g(x)` inputs as ordinary single-variable expressions, same as
`f(x)` elsewhere, just semantically different), `x0`, tolerance, max iterations. Same
field ids as `fixed-point.js` uses (check the exact ids in that file and reuse them,
don't invent new names).

"Try Example": `g(x) = "cos(x)"`, `x0 = "0.5"`, `tol = "0.000001"`, `maxIter = "20"` —
note the much lower `maxIter` than Fixed-Point Iteration's example needs, since
Steffensen converges in a handful of steps; a results-panel note like "converged in N
steps — compare to Fixed-Point Iteration on the same g(x)" reinforces the point of the
page.

## 6. Outputs

Same result-strip pattern as Fixed-Point Iteration (Root/Fixed-point≈, Iterations, g(root),
Final error — match Fixed-Point's exact stat labels, check `fixed-point-iteration.html`
for their wording). Formula block:

```
x_{n+1} = x_n - \dfrac{[g(x_n) - x_n]^2}{g(g(x_n)) - 2g(x_n) + x_n}
```

Same cobweb-diagram plot as Fixed-Point Iteration (see §4 for the two-hops-per-step
adaptation), same error-decay plot, same step slider pattern.

## 7. `methods.html` card (append to `PENDING-CARDS.md`, do not edit `methods.html`)

```html
<a href="methods/steffensen.html" class="card engine-card reveal crosshair-host" style="display:block; transition-delay:TODO">
  <span class="engine-dot"></span>
  <div class="engine-card-head">
    <span class="eyebrow">Root Finding</span>
    <span class="engine-index">TODO</span>
  </div>
  <h3 class="h3">Steffensen's Method</h3>
  <p>Applies Aitken's Δ² acceleration at every step of a fixed-point iteration — quadratic convergence from the same g(x) that converges only linearly on its own.</p>
  <div class="method-tags" style="margin-top:16px;">
    <span class="tag">g(x) + x₀</span>
    <span class="tag">Accelerated cobweb diagram</span>
    <span class="tag">Convergence check</span>
  </div>
</a>
```

## 8. Acceptance criteria

All of §9 in the shared conventions doc, plus:
- `node tests/verify.js` passes, including the new case.
- With the example inputs, converges to `0.7390851...` in roughly 4 iterations —
  dramatically fewer than Fixed-Point Iteration's own example needs at the same
  tolerance (check the existing Fixed-Point page's behavior at `tol=1e-6` for
  comparison; if Steffensen isn't clearly faster, something in the update formula is
  wrong).
- Division-by-near-zero (`Δ²x ≈ 0`) produces the specific error message, not a silent
  `NaN`/`Infinity` in the UI.
