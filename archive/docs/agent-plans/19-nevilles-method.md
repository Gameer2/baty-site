# Build Plan — Neville's Method

Roadmap ref: `CURRICULUM_ROADMAP.md` §1B.11, Tier 1 (P1). Assigned track: **Qwen3.5**.
Read `docs/agent-plans/00-SHARED-CONVENTIONS.md` in full before starting. Read
`math-lab/assets/js/lagrange.js` and `math-lab/engines/numerical/methods/lagrange-interpolation.html`
in full — they are your structural precedent for the points-table input UI (add/remove
row buttons, `.pt-x`/`.pt-y` input classes, `getPoints()` pattern, sorting by x, distinct-x
validation). Copy that points-table markup/logic pattern; copy the overall page skeleton
(header/hero/panels/scripts) from `secant.html` per §4 of shared conventions, same as
every other method.

## 1. What this method is

Neville's Method evaluates the same unique interpolating polynomial that Lagrange
Interpolation builds — but instead of ever forming the polynomial's coefficients, it
computes the polynomial's *value at one specific target point `x0`* directly, via a
triangular table of recursively refined estimates. This is the method's whole pedagogical
point versus the already-built Lagrange page: same underlying math, different (often more
numerically stable, and here more table-driven) computational path.

Given points `(x_0,y_0), ..., (x_n,y_n)` (distinct x-values) and a target `x0`, define
`Q_{i,0} = y_i` for each `i`, and recursively:

```
Q_{i,j} = [ (x0 - x_{i-j}) · Q_{i,j-1} - (x0 - x_i) · Q_{i-1,j-1} ] / (x_i - x_{i-j})
```

for `j = 1..n`, `i = j..n` (0-indexed points, `n = points.length - 1`). The final answer
is `Q_{n,n}`. Table entries where `j > i` are undefined/unused (lower-triangular table).

Category/eyebrow: **"Interpolation"**.

## 2. `algorithms.js` — function to add

```js
// points: [{x,y}, ...] (distinct x, any order), x0: target value to interpolate at.
// Neville's algorithm (Burden & Faires Alg. 3.1): builds the interpolating polynomial's
// value at x0 via a triangular table of recursively refined estimates, without ever
// forming explicit polynomial coefficients.
Algorithms.runNeville = function (points, x0) {
  const pts = points.slice().sort((a, b) => a.x - b.x);
  const n = pts.length;
  if (n < 2) throw new Error("Need at least two points.");
  const xs = pts.map((p) => p.x);
  if (new Set(xs).size !== n) throw new Error("x values must be distinct.");

  const Q = Array.from({ length: n }, () => new Array(n).fill(null));
  for (let i = 0; i < n; i++) Q[i][0] = pts[i].y;

  const steps = [];
  for (let j = 1; j < n; j++) {
    for (let i = j; i < n; i++) {
      const denom = xs[i] - xs[i - j];
      if (Math.abs(denom) < 1e-14) throw new Error(`x values x_${i - j} and x_${i} are (numerically) equal.`);
      const value = ((x0 - xs[i - j]) * Q[i][j - 1] - (x0 - xs[i]) * Q[i - 1][j - 1]) / denom;
      Q[i][j] = value;
      steps.push({ i, j, value });
    }
  }
  return { table: Q, xs, ys: pts.map((p) => p.y), steps, value: Q[n - 1][n - 1] };
};
```

Returned shape: `{ table, xs, ys, steps: [{i,j,value}, ...], value }`. `steps` is in
build order (column by column, `j` ascending) — this is what the step slider walks
through; `value === table[n-1][n-1]` is the final answer, also equal to the last step's
`value`.

## 3. `tests/verify.js` — cases to add (pre-verified, use exactly)

```js
// Neville's Method: points from y = x^2 + 1 -> value at x0=1.5 should reproduce the
// underlying quadratic exactly (1.5^2 + 1 = 3.25), since 4 points over-determine but
// remain consistent with a degree-2 source.
{
  const points = [{ x: 0, y: 1 }, { x: 1, y: 2 }, { x: 2, y: 5 }, { x: 3, y: 10 }];
  const result = Algorithms.runNeville(points, 1.5);
  approx(result.value, 3.25, 1e-9, "Neville's method on y=x^2+1 data, x0=1.5 (exact)");
}
```

Note: a natural cross-check against Lagrange Interpolation's result at the same points/x0
is **not currently wireable** — `lagrange.js` computes its polynomial evaluation
(`lagrangeAt`) as a function local to its page IIFE, not exposed via `algorithms.js` or
any global. Don't invent a fake cross-check; this single hand-verified exact case is
sufficient. (If `Algorithms.runLagrange` gets backfilled later per the note in
`BACKLOG.md`, a cross-check test could be added then — not your job now.)

After adding this case, run `node tests/verify.js` and confirm the total passed count
increased by exactly 1 with 0 failures.

## 4. Files to create

- `math-lab/assets/js/neville.js`
- `math-lab/engines/numerical/methods/nevilles-method.html`

## 5. Inputs (the form panel)

- Points table (copy `lagrange.js`'s `tbody`/`addRow`/`getPoints`/remove-row pattern
  exactly — 2-column x/y table, add/remove buttons, minimum 2 rows enforced).
- A **target `x0`** numeric field (id `queryInput` — same id/role as Lagrange's page),
  labeled "Evaluate at x₀".
- `.status-line` validating: all points numeric, distinct x values, at least 2 points, x0
  numeric.
- "Try Example": points `(0,1),(1,2),(2,5),(3,10)`, `x0 = 1.5`.

## 6. Outputs (results panel)

Result strip (3 tiles, first `accent`):
- **P(x₀) ≈** (`accent`) — `Engine.formatNum(result.value, 8)`.
- **Points used** — `result.xs.length`.
- **Table depth (degree)** — `result.xs.length - 1`.

Formula block:
```
Q_{i,j} = \frac{(x_0 - x_{i-j})\,Q_{i,j-1} - (x_0 - x_i)\,Q_{i-1,j-1}}{x_i - x_{i-j}}
```

Plot — **"Data points and P(x₀)"** (single plot, height 320px): scatter of the input data
points (teal markers, same style as Lagrange's `dataTrace`), plus a single highlighted
marker at `(x0, result.value)` (orange, open-circle, same style as Lagrange's
`pointTrace`). Do **not** attempt to draw the full interpolating curve — Neville's method
as specified here only ever evaluates at one target `x0`, it doesn't produce a
plottable closed-form curve without re-running the whole table at many x values (which
would be needlessly expensive and is explicitly Lagrange's job, not this page's). This is
a deliberately simpler visual than the interpolation-curve pages — that's fine.

Data table — the Neville tableau itself: a triangular table, columns `j = 0..n-1`, rows
`i = 0..n-1`, cell `(i,j)` shows `Q[i][j]` when `j <= i`, blank otherwise. Render the
`x_i`/`y_i` values as the first two columns, then one column per `j`. Highlight the
current step's cell via `.is-current` on that `<td>` (not a whole row, since this table's
"current" concept is a single cell, not a row — use a `data-i`/`data-j` attribute pair on
each populated `<td>` instead of `data-n`).

Step slider: `min=0`, `max=steps.length-1`, walks through `result.steps` in order,
highlighting the corresponding `(i,j)` cell each time.

## 7. `methods.html` card (append to `PENDING-CARDS.md` per §10, do not edit `methods.html`)

```html
<a href="methods/nevilles-method.html" class="card engine-card reveal crosshair-host" style="display:block; transition-delay:TODO">
  <span class="engine-dot"></span>
  <div class="engine-card-head">
    <span class="eyebrow">Interpolation</span>
    <span class="engine-index">TODO</span>
  </div>
  <h3 class="h3">Neville's Method</h3>
  <p>Evaluates the same interpolating polynomial as Lagrange at one target point, via a triangular table of refined estimates — no polynomial coefficients ever formed.</p>
  <div class="method-tags" style="margin-top:16px;">
    <span class="tag">Data-point table + x₀</span>
    <span class="tag">Neville tableau</span>
    <span class="tag">Step-through table</span>
  </div>
</a>
```

## 8. Acceptance criteria

All of §9 in the shared conventions doc, plus:
- `node tests/verify.js` → new case passes, count increases by 1, 0 failures.
- Example inputs produce `P(x₀) ≈ 3.25` exactly.
- Stepping the slider through the tableau highlights cells in the correct build order
  (column `j=1` first, top to bottom, then `j=2`, etc.).
