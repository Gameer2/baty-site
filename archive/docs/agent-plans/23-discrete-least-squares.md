# Build Plan — Discrete Least Squares

Roadmap ref: `CURRICULUM_ROADMAP.md` §1F.22, Tier 2 (P2). Assigned track: **Qwen3.5**.
Read `docs/agent-plans/00-SHARED-CONVENTIONS.md` in full, and read
`math-lab/assets/js/lagrange.js` for the points-table input UI pattern (copy it, same as
Neville's/Divided-Difference plans).

## 1. What this method is

Fits a low-degree polynomial to a set of `(x_i, y_i)` data points by minimizing the sum
of squared residuals — unlike interpolation (Lagrange, Neville's, Divided-Difference),
the fitted curve does **not** need to pass through every point; it's the best compromise
when the data has noise/scatter. This page supports two fit degrees, toggled by the user:

**Linear fit** `y = mx + b`:
```
m = [ n·Σ(x_i y_i) − Σx_i · Σy_i ] / [ n·Σ(x_i²) − (Σx_i)² ]
b = [ Σy_i − m·Σx_i ] / n
```

**Quadratic fit** `y = a0 + a1·x + a2·x²`, solving the 3×3 normal-equations system:
```
[ n     Σx    Σx²  ] [a0]   [ Σy   ]
[ Σx    Σx²   Σx³  ] [a1] = [ Σxy  ]
[ Σx²   Σx³   Σx⁴  ] [a2]   [ Σx²y ]
```
via Cramer's rule (3×3 determinants) — **do not** use a generic linear-system solver;
this plan deliberately writes the 3×3 solve out explicitly so this method has no
dependency on the linear-algebra track's helpers (a different model's track, may not be
built yet).

Category/eyebrow: **"Curve Fitting"**.

## 2. `algorithms.js` — functions to add (two functions)

```js
// points: [{x,y}, ...], n >= 2. Least-squares best-fit line y = m*x + b.
Algorithms.runLeastSquaresLinear = function (points) {
  const n = points.length;
  if (n < 2) throw new Error("Need at least two points.");
  let sx = 0, sy = 0, sxx = 0, sxy = 0;
  for (const p of points) { sx += p.x; sy += p.y; sxx += p.x * p.x; sxy += p.x * p.y; }
  const denom = n * sxx - sx * sx;
  if (Math.abs(denom) < 1e-12) throw new Error("x values are (numerically) all identical — cannot fit a line.");
  const m = (n * sxy - sx * sy) / denom;
  const b = (sy - m * sx) / n;
  return { m, b, n };
};

// points: [{x,y}, ...], n >= 3. Least-squares best-fit parabola y = a0 + a1*x + a2*x^2,
// solved via the 3x3 normal-equations system by Cramer's rule (no generic linear solver).
Algorithms.runLeastSquaresQuadratic = function (points) {
  const n = points.length;
  if (n < 3) throw new Error("Need at least three points for a quadratic fit.");
  let s1 = 0, s2 = 0, s3 = 0, s4 = 0, t0 = 0, t1 = 0, t2 = 0;
  for (const p of points) {
    const x = p.x, y = p.y, x2 = x * x;
    s1 += x; s2 += x2; s3 += x2 * x; s4 += x2 * x2;
    t0 += y; t1 += x * y; t2 += x2 * y;
  }
  const det3 = (m) =>
    m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) -
    m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) +
    m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
  const A = [[n, s1, s2], [s1, s2, s3], [s2, s3, s4]];
  const D = det3(A);
  if (Math.abs(D) < 1e-9) throw new Error("Points are too collinear/degenerate for a stable quadratic fit.");
  const Da0 = det3([[t0, s1, s2], [t1, s2, s3], [t2, s3, s4]]);
  const Da1 = det3([[n, t0, s2], [s1, t1, s3], [s2, t2, s4]]);
  const Da2 = det3([[n, s1, t0], [s1, s2, t1], [s2, s3, t2]]);
  return { a0: Da0 / D, a1: Da1 / D, a2: Da2 / D, n };
};
```

## 3. `tests/verify.js` — cases to add (pre-verified, use exactly)

```js
// Discrete Least Squares (linear): points exactly on y = 2x -> exact fit, m=2, b=0.
{
  const points = [{ x: 1, y: 2 }, { x: 2, y: 4 }, { x: 3, y: 6 }, { x: 4, y: 8 }];
  const result = Algorithms.runLeastSquaresLinear(points);
  approx(result.m, 2, 1e-12, "Least squares linear fit on y=2x (exact, m=2)");
  approx(result.b, 0, 1e-12, "Least squares linear fit on y=2x (exact, b=0)");
}

// Discrete Least Squares (quadratic): points exactly on y = x^2 -> exact fit, a0=0, a1=0, a2=1.
{
  const points = [{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 4 }, { x: 3, y: 9 }];
  const result = Algorithms.runLeastSquaresQuadratic(points);
  approx(result.a0, 0, 1e-9, "Least squares quadratic fit on y=x^2 (exact, a0=0)");
  approx(result.a1, 0, 1e-9, "Least squares quadratic fit on y=x^2 (exact, a1=0)");
  approx(result.a2, 1, 1e-9, "Least squares quadratic fit on y=x^2 (exact, a2=1)");
}
```

All five values verified with `node -e` before writing this plan. After adding these, run
`node tests/verify.js` and confirm the passed count increased by exactly 5, 0 failures.

## 4. Files to create

- `math-lab/assets/js/least-squares.js`
- `math-lab/engines/numerical/methods/discrete-least-squares.html`

## 5. Inputs (the form panel)

- Points table — same UI pattern as `lagrange.js` (copy it).
- A **degree toggle**: "Linear" / "Quadratic" (copy the chip-toggle markup/behavior from
  `lagrange-interpolation.html`'s Lagrange/Spline mode toggle, same interaction pattern —
  clicking re-submits if results are already showing, per `lagrange.js`'s `modeRow`
  click handler).
- `.status-line`: numeric points, at least 2 points (Linear) / at least 3 points
  (Quadratic — validate against whichever is currently selected).
- "Try Example": points with visible scatter around a rough line, e.g.
  `(1,2.1),(2,3.9),(3,6.2),(4,7.8),(5,10.1)` (not exactly on a line — this is the point of
  least squares, a page whose example data all sit exactly on a line undersells why the
  method exists) — pick whatever concrete scattered values you like in that spirit; they
  don't need a pre-verified exact fit value since the whole point is these are approximate.

## 6. Outputs (results panel)

Result strip (3 tiles, first `accent`, contents depend on active degree):
- Linear mode: **Slope (m)** (`accent`), **Intercept (b)**, **Points used**.
- Quadratic mode: **a₂** (`accent`), **a₁**, **a₀** (three coefficients; drop the
  "Points used" tile in this mode, or use a 4th `.result-stat` tile — either is fine).

Formula block — show whichever fit is active:
- Linear: `y = mx + b`
- Quadratic: `y = a_0 + a_1 x + a_2 x^2`
with the fitted numeric coefficients substituted into a second line underneath (plain
KaTeX with numbers plugged in, same pattern as other pages' "computed" formula line).

Plot — **"Data points and best fit"** (single plot, height 320px): scatter of the input
points (teal markers), plus the fitted curve/line sampled across the data's x-range (240
points, orange line, same padding approach as other curve plots). No "current step"
overlay needed — least squares isn't iterative here (it's a single closed-form solve), so
there's no natural intermediate state to highlight.

No step slider on this page (same reasoning as Numerical Differentiation/Richardson
Extrapolation) — omit the step-through panel.

Optional: a small residuals table (`x_i`, `y_i`, `fitted ŷ_i`, `residual y_i-ŷ_i`) is a
nice touch that reinforces what "least squares" is minimizing, but is not required for
this page to be complete — include it if straightforward, skip it if it complicates the
build.

## 7. `methods.html` card (append to `PENDING-CARDS.md` per §10, do not edit `methods.html`)

```html
<a href="methods/discrete-least-squares.html" class="card engine-card reveal crosshair-host" style="display:block; transition-delay:TODO">
  <span class="engine-dot"></span>
  <div class="engine-card-head">
    <span class="eyebrow">Curve Fitting</span>
    <span class="engine-index">TODO</span>
  </div>
  <h3 class="h3">Discrete Least Squares</h3>
  <p>Fits the best line or parabola through scattered data by minimizing squared residuals — the curve doesn't need to pass through every point, unlike interpolation.</p>
  <div class="method-tags" style="margin-top:16px;">
    <span class="tag">Data-point table</span>
    <span class="tag">Linear / Quadratic toggle</span>
    <span class="tag">Best-fit plot</span>
  </div>
</a>
```

## 8. Acceptance criteria

All of §9 in the shared conventions doc **except** item 5 (no step slider), plus:
- `node tests/verify.js` → all five new assertions pass, count increases by 5, 0 failures.
- Example (scattered) data produces a fitted line/parabola that visibly tracks the general
  trend of the scattered points without passing through all of them exactly.
- Toggling between Linear and Quadratic re-fits and updates the plot/stats correctly.
