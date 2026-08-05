# Build Plan — Richardson Extrapolation

Roadmap ref: `CURRICULUM_ROADMAP.md` §1C.16, Tier 1 (P1). Assigned track: **Qwen3.5**.
Read `docs/agent-plans/00-SHARED-CONVENTIONS.md` in full, and read
`docs/agent-plans/21-numerical-differentiation.md` — this page reuses that method's
central-difference formula as its concrete worked demo. If `21-numerical-differentiation.md`
hasn't been built yet, this page still works standalone by inlining a minimal
central-difference calculation directly (see §2 below) — don't block on build order.

## 1. What this method is

A general acceleration technique: given an approximation `N(h)` to an unknown true value
`M`, where the error is known to be `O(h^k)` for some order `k` (i.e.
`M = N(h) + C·h^k + O(h^{k+1})` for some constant `C`), combining two estimates at step
sizes `h` and `h/2` cancels the leading `C·h^k` error term:

```
M ≈ [ 2^k · N(h/2) - N(h) ] / (2^k - 1)
```

This page has two parts: (1) a **generic** extrapolation function that takes two
already-computed numeric estimates and the order `k`, and (2) a **concrete worked demo**
applying it to the central-difference derivative formula (§21, order `k=2`, since central
difference has `O(h²)` error) so the improvement is visible on a real example, not just
an abstract formula.

Category/eyebrow: **"Differentiation"** (same category as Numerical Differentiation,
since this page's demo directly extends it).

## 2. `algorithms.js` — functions to add (two functions)

```js
// Nh: estimate at step size h, Nh2: estimate at step size h/2, k: known order of the
// leading error term (M = N(h) + C*h^k + ...). Combines the two estimates to cancel that
// leading error term. Generic — works for any O(h^k) approximation scheme, not just
// numerical differentiation.
Algorithms.richardsonExtrapolate = function (Nh, Nh2, k) {
  if (!Number.isFinite(Nh) || !Number.isFinite(Nh2)) throw new Error("N(h) and N(h/2) must be finite numbers.");
  if (!(k > 0)) throw new Error("k (the leading error order) must be a positive number.");
  const factor = Math.pow(2, k);
  return (factor * Nh2 - Nh) / (factor - 1);
};

// f: number -> number, x: point, h: step size. Central-difference derivative estimate,
// O(h^2) — duplicated here (not imported from a numerical-differentiation module) so this
// page has no build-order dependency on another method's file; if
// Algorithms.runNumericalDiff already exists, this is intentionally the same formula,
// just inlined for independence.
Algorithms.centralDiff = function (f, x, h) {
  if (!(h > 0)) throw new Error("h must be a positive number.");
  let fph, fmh;
  try { fph = f(x + h); fmh = f(x - h); } catch { throw new Error("f(x) could not be evaluated at x±h."); }
  if (!Number.isFinite(fph) || !Number.isFinite(fmh)) throw new Error("f(x) produced a non-finite value at x±h.");
  return (fph - fmh) / (2 * h);
};
```

## 3. `tests/verify.js` — cases to add (pre-verified, use exactly)

```js
// Richardson Extrapolation: central-difference derivative of sin(x) at x=1, using
// h=0.1 and h=0.05 (k=2, since central difference is O(h^2)). The extrapolated estimate
// should be dramatically closer to the true derivative cos(1) than either raw estimate.
{
  const { fn } = compile("sin(x)");
  const trueDeriv = Math.cos(1);
  const Nh = Algorithms.centralDiff(fn, 1, 0.1);
  const Nh2 = Algorithms.centralDiff(fn, 1, 0.05);
  const R = Algorithms.richardsonExtrapolate(Nh, Nh2, 2);
  approx(R, trueDeriv, 1e-6, "Richardson extrapolation of central-diff sin(x) at x=1 (h=0.1, h/2=0.05)");
  const errNh = Math.abs(Nh - trueDeriv);
  const errR = Math.abs(R - trueDeriv);
  approx(errR < errNh / 100 ? 1 : 0, 1, 0.5, "Richardson error is more than 100x smaller than the raw h=0.1 estimate's error");
}
```

Both figures verified with `node -e` before writing this plan: `Nh ≈ 0.53940225`,
`Nh2 ≈ 0.54007721`, `R ≈ 0.54030219` vs true `cos(1) ≈ 0.54030231` — Richardson's error is
about `1.13e-7`, versus the raw `h=0.1` estimate's error of about `9.0e-4` (roughly
8000x smaller, comfortably clears the ">100x smaller" check above). Do not alter these
tolerances. After adding this case, run `node tests/verify.js` and confirm the passed
count increased by exactly 2, 0 failures.

## 4. Files to create

- `math-lab/assets/js/richardson.js`
- `math-lab/engines/numerical/methods/richardson-extrapolation.html`

## 5. Inputs (the form panel)

- `f(x)` field + preview + keypad.
- `x` numeric field — point to differentiate at.
- `h` numeric field — the larger of the two step sizes; the page always uses `h` and
  `h/2` as the pair (no separate second-h field — computing it as `h/2` is the whole point
  of the technique and avoids a user picking a non-power-of-2 pair, which would silently
  break the `k`-dependent cancellation).
- `.status-line`: `f(x)` compiles, `x`/`h` numeric, `h > 0`.
- "Try Example": `f(x) = "sin(x)"`, `x = 1`, `h = 0.1`.

## 6. Outputs (results panel)

Result strip (4 tiles, first `accent`):
- **Richardson estimate** (`accent`) — `Engine.formatNum(R, 8)`.
- **N(h)** — `Engine.formatNum(Nh, 8)`.
- **N(h/2)** — `Engine.formatNum(Nh2, 8)`.
- **Improvement** — show `|N(h) - Richardson| / |N(h/2) - Richardson|` or simply state the
  order-of-magnitude error reduction textually (e.g. compute both raw errors' ratio if a
  known true value is available for the example function — since `f(x)` is arbitrary user
  input in general there's no guaranteed true value, so this tile should show something
  always computable: use `|N(h/2) - N(h)|` again, same "step-doubling gap" idea as the
  Trapezoidal/Simpson's plans' "Est. error" tile, for consistency across the engine).

Formula block:
```
M \approx \frac{2^k \, N(h/2) - N(h)}{2^k - 1}
```
with a plain-text note underneath: "demoed here on the central-difference derivative
formula (k = 2); the technique itself works for any approximation with known O(h^k)
error."

Table: three rows, one each for `N(h)`, `N(h/2)`, and the Richardson estimate, columns
`label`, `h used`, `value`. This is a small, simple table — no step slider, no iteration;
skip the step-through panel entirely (same as Numerical Differentiation).

Optional plot (skip if it complicates the build unnecessarily): x-axis categorical
`["N(h)", "N(h/2)", "Richardson"]`, y-axis the three values as bars or markers, purely to
visualize how much closer the Richardson point sits versus the two raw estimates — not
required for this page to be complete.

## 7. `methods.html` card (append to `PENDING-CARDS.md` per §10, do not edit `methods.html`)

```html
<a href="methods/richardson-extrapolation.html" class="card engine-card reveal crosshair-host" style="display:block; transition-delay:TODO">
  <span class="engine-dot"></span>
  <div class="engine-card-head">
    <span class="eyebrow">Differentiation</span>
    <span class="engine-index">TODO</span>
  </div>
  <h3 class="h3">Richardson Extrapolation</h3>
  <p>Combines two approximations at step sizes h and h/2 to cancel the leading error term — demoed here on the central-difference derivative formula.</p>
  <div class="method-tags" style="margin-top:16px;">
    <span class="tag">f(x) + x + h</span>
    <span class="tag">Error cancellation</span>
    <span class="tag">N(h), N(h/2) comparison</span>
  </div>
</a>
```

## 8. Acceptance criteria

All of §9 in the shared conventions doc **except** item 5 (no step slider on this page),
plus:
- `node tests/verify.js` → both new assertions pass, count increases by 2, 0 failures.
- Example inputs produce a Richardson estimate visibly closer to `cos(1) ≈ 0.540302` than
  either `N(h)` or `N(h/2)` shown alongside it.
