# Build Plan — Numerical Differentiation

Roadmap ref: `CURRICULUM_ROADMAP.md` §1C.15, Tier 1 (P1). Assigned track: **Qwen3.5**.
Read `docs/agent-plans/00-SHARED-CONVENTIONS.md` in full before starting. This is the
simplest method in the whole backlog — no iteration, no table of steps, just direct
formula evaluation at a few nearby sample points. Don't over-build it; a smaller, more
direct page than the root-finding/quadrature pages is correct here, not a shortcoming.

## 1. What this method is

Approximates `f'(x)` at a point `x`, using only values of `f` itself (no symbolic
derivative), via finite-difference formulas. This page shows several formulas side by
side against a shrinking step size `h`, teaching the accuracy/step-size tradeoff (and, for
very small `h`, the floating-point cancellation error that eventually makes results worse
again — a genuinely important thing to show, not just theoretical).

Formulas (Burden & Faires §4.1 style; all first-derivative estimates of `f` at a point
`x`, step size `h > 0`):

```
Forward difference:              f'(x) ≈ [f(x+h) - f(x)] / h                    (O(h))
Backward difference:             f'(x) ≈ [f(x) - f(x-h)] / h                    (O(h))
Central (midpoint) difference:   f'(x) ≈ [f(x+h) - f(x-h)] / (2h)               (O(h²))
Three-point endpoint formula:    f'(x) ≈ [-3f(x) + 4f(x+h) - f(x+2h)] / (2h)    (O(h²))
```

The three-point endpoint formula matters because the central-difference formula needs
`f` evaluated on *both* sides of `x` — near a domain boundary (e.g. differentiating at the
left edge of `[a,b]`) only the endpoint formula works. Mention this in the page copy.

Category/eyebrow: **"Differentiation"**.

## 2. `algorithms.js` — function to add

```js
// f: number -> number, x: point to differentiate at, h: step size (h > 0). Returns all
// four standard finite-difference derivative estimates at once, so the UI can compare
// them side by side without recomputing f(x) multiple times per formula.
Algorithms.runNumericalDiff = function (f, x, h) {
  if (!(h > 0)) throw new Error("h must be a positive number.");
  let fx, fph, fmh, fp2h;
  try {
    fx = f(x); fph = f(x + h); fmh = f(x - h); fp2h = f(x + 2 * h);
  } catch {
    throw new Error("f(x) could not be evaluated at one of the required sample points (x, x±h, x+2h).");
  }
  [fx, fph, fmh, fp2h].forEach((v) => {
    if (!Number.isFinite(v)) throw new Error("f(x) produced a non-finite value at one of the required sample points.");
  });
  return {
    h,
    samples: { fx, fph, fmh, fp2h },
    forward: (fph - fx) / h,
    backward: (fx - fmh) / h,
    central: (fph - fmh) / (2 * h),
    endpoint3: (-3 * fx + 4 * fph - fp2h) / (2 * h),
  };
};
```

Returned shape: `{ h, samples: {fx, fph, fmh, fp2h}, forward, backward, central,
endpoint3 }`.

## 3. `tests/verify.js` — cases to add (pre-verified, use exactly)

```js
// Numerical Differentiation: f(x) = sin(x) at x = 1, h = 0.001 -> all four formulas
// should be close to the true derivative cos(1) ≈ 0.5403023058681398, central and
// endpoint3 (both O(h^2)) much closer than forward/backward (both O(h)).
{
  const { fn } = compile("sin(x)");
  const result = Algorithms.runNumericalDiff(fn, 1, 0.001);
  const trueDeriv = Math.cos(1);
  approx(result.central, trueDeriv, 1e-6, "Numerical diff (central), sin(x) at x=1, h=0.001");
  approx(result.forward, trueDeriv, 1e-3, "Numerical diff (forward), sin(x) at x=1, h=0.001 (O(h), looser tol)");
}
```

Both figures were verified with `node -e` before writing this plan (`central` gave
`0.5403022158176896`, well within `1e-6` of `cos(1)`; `forward` gave
`0.5398814803603269`, within `1e-3` but not `1e-6`, correctly demonstrating the O(h) vs
O(h²) accuracy gap — the two different tolerances in the test are intentional, not a
mistake). After adding this, run `node tests/verify.js` and confirm the passed count
increased by exactly 2 (two `approx` calls in the one case block) with 0 failures.

## 4. Files to create

- `math-lab/assets/js/numerical-diff.js`
- `math-lab/engines/numerical/methods/numerical-differentiation.html`

## 5. Inputs (the form panel)

- `f(x)` field + preview + keypad (standard pattern).
- `x` numeric field — the point to differentiate at.
- `h` numeric field, `type="number" step="any"` — default `0.1`, with a short field-note
  under it: "smaller h is more accurate, until floating-point error takes over — try
  shrinking it in the comparison table."
- `.status-line`: `f(x)` compiles, `x`/`h` numeric, `h > 0`.
- "Try Example": `f(x) = "sin(x)"`, `x = 1`, `h = 0.1`.

## 6. Outputs (results panel)

Result strip (4 tiles, first `accent`):
- **Central estimate** (`accent`) — `Engine.formatNum(result.central, 8)` (central is the
  best default single number to headline, since it's the most accurate of the four at a
  given `h`).
- **Forward** — `Engine.formatNum(result.forward, 8)`.
- **Backward** — `Engine.formatNum(result.backward, 8)`.
- **3-pt endpoint** — `Engine.formatNum(result.endpoint3, 8)`.

Formula block — show all four formulas stacked (four separate `Engine.renderKatex` calls
into four small blocks, or one block with four lines — either is fine, just show all four
since comparing them is the point):
```
f'(x) \approx \frac{f(x+h)-f(x)}{h} \quad\text{(forward)}
f'(x) \approx \frac{f(x)-f(x-h)}{h} \quad\text{(backward)}
f'(x) \approx \frac{f(x+h)-f(x-h)}{2h} \quad\text{(central)}
f'(x) \approx \frac{-3f(x)+4f(x+h)-f(x+2h)}{2h} \quad\text{(3-pt endpoint)}
```

No Plotly curve plot needed for `f(x)` itself (this isn't a root-finding/quadrature demo
with a natural x-range curve to show) — instead, build a **table comparing all four
formulas across several h values**: call `Algorithms.runNumericalDiff(fn, x, h)` in the
per-method JS at `h, h/2, h/4, h/8, h/16` (five rows; this is just calling the pure
function five times with different `h`, not duplicating math — consistent with §1 of
shared conventions) and render a table with columns `h`, `forward`, `backward`,
`central`, `3-pt endpoint`, one row per h value, each cell formatted via
`Engine.formatNum`. This *is* this page's main visual — the shrinking-h comparison table
replaces the plot, since it's the thing that actually teaches the concept.

Optionally (skip if it adds too much complexity), a small Plotly line plot with x-axis
`h` (log scale) and y-axis `|estimate - central-at-smallest-h|` for forward vs central,
showing error decreasing then (at very small h) potentially growing again due to
floating-point cancellation — powerful but not required; the comparison table alone
satisfies this page's teaching goal.

No step slider needed on this page — there's no sequential iteration to step through, so
omit the `.panel` step-through block from the results panel structure entirely (still
follow the rest of §4 in shared conventions for structure/panels).

## 7. `methods.html` card (append to `PENDING-CARDS.md` per §10, do not edit `methods.html`)

```html
<a href="methods/numerical-differentiation.html" class="card engine-card reveal crosshair-host" style="display:block; transition-delay:TODO">
  <span class="engine-dot"></span>
  <div class="engine-card-head">
    <span class="eyebrow">Differentiation</span>
    <span class="engine-index">TODO</span>
  </div>
  <h3 class="h3">Numerical Differentiation</h3>
  <p>Approximates f'(x) from nearby function values alone — forward, backward, and central-difference formulas compared across shrinking step sizes.</p>
  <div class="method-tags" style="margin-top:16px;">
    <span class="tag">f(x) + x + h</span>
    <span class="tag">4-formula comparison</span>
    <span class="tag">Shrinking-h table</span>
  </div>
</a>
```

## 8. Acceptance criteria

All of §9 in the shared conventions doc **except** item 5 (no step slider on this page —
skip that check), plus:
- `node tests/verify.js` → both new assertions pass, count increases by 2, 0 failures.
- Example inputs (`sin(x)`, `x=1`, `h=0.1`) show `central ≈ 0.5394...`, noticeably closer
  to the true `cos(1) ≈ 0.54030` than `forward ≈ 0.4974...` or `backward ≈ 0.5814...`.
- The h-comparison table shows accuracy improving as `h` shrinks across its rows.
