# Build Plan — Newton's Divided-Difference Formula

Roadmap ref: `CURRICULUM_ROADMAP.md` §1B.12, Tier 1 (P1). Assigned track: **Qwen3.5**.
Read `docs/agent-plans/00-SHARED-CONVENTIONS.md` in full, and read
`docs/agent-plans/19-nevilles-method.md` — this method shares its points-table input UI
and target-x0 concept, but builds and *displays* an actual divided-difference table and
polynomial (closer in spirit to the Lagrange page than to Neville's single-point-only
output). Read `math-lab/assets/js/lagrange.js` for the points-table UI pattern.

## 1. What this method is

Builds the same unique interpolating polynomial as Lagrange, but in **Newton form**,
via a divided-difference table. Given points `(x_0,y_0),...,(x_n,y_n)`, define the
divided differences recursively:

```
f[x_i] = y_i
f[x_i, ..., x_{i+j}] = ( f[x_{i+1}, ..., x_{i+j}] - f[x_i, ..., x_{i+j-1}] ) / (x_{i+j} - x_i)
```

The interpolating polynomial in Newton form is:

```
P(x) = f[x_0] + f[x_0,x_1](x-x_0) + f[x_0,x_1,x_2](x-x_0)(x-x_1) + ...
     = Σ_{k=0}^{n} f[x_0,...,x_k] · Π_{m=0}^{k-1} (x - x_m)
```

evaluated efficiently via nested multiplication (nested-form / nested-Horner evaluation),
analogous in spirit to Horner's method but with `(x - x_m)` offsets instead of a plain
`x` power ladder:

```
P(x) = ((...(c_n·(x-x_{n-1}) + c_{n-1})·(x-x_{n-2}) + c_{n-2})...)·(x-x_0) + c_0
```

where `c_k = f[x_0,...,x_k]` (the top row of the divided-difference table).

Category/eyebrow: **"Interpolation"**.

## 2. `algorithms.js` — functions to add (two functions)

```js
// points: [{x,y}, ...] (distinct x, any order). Builds the full divided-difference table
// (Burden & Faires §3.3) and returns the Newton-form coefficients (the table's top row).
Algorithms.runDividedDifference = function (points) {
  const pts = points.slice().sort((a, b) => a.x - b.x);
  const n = pts.length;
  if (n < 2) throw new Error("Need at least two points.");
  const xs = pts.map((p) => p.x);
  if (new Set(xs).size !== n) throw new Error("x values must be distinct.");

  const F = Array.from({ length: n }, () => new Array(n).fill(null));
  for (let i = 0; i < n; i++) F[i][0] = pts[i].y;
  for (let j = 1; j < n; j++) {
    for (let i = 0; i < n - j; i++) {
      const denom = xs[i + j] - xs[i];
      if (Math.abs(denom) < 1e-14) throw new Error(`x values x_${i} and x_${i + j} are (numerically) equal.`);
      F[i][j] = (F[i + 1][j - 1] - F[i][j - 1]) / denom;
    }
  }
  const coeffs = [];
  for (let k = 0; k < n; k++) coeffs.push(F[0][k]);
  return { table: F, xs, ys: pts.map((p) => p.y), coeffs };
};

// xs: the same x-values used to build coeffs (ascending, distinct). coeffs: Newton-form
// coefficients from runDividedDifference. Evaluates P(x) via nested multiplication.
Algorithms.evalNewtonForm = function (xs, coeffs, x) {
  let result = coeffs[coeffs.length - 1];
  for (let k = coeffs.length - 2; k >= 0; k--) {
    result = result * (x - xs[k]) + coeffs[k];
  }
  return result;
};
```

Returned shape of `runDividedDifference`: `{ table, xs, ys, coeffs }`. `table[i][j]` is
`f[x_i,...,x_{i+j}]` (only defined for `i + j < n`). `coeffs[k] === table[0][k]`.

## 3. `tests/verify.js` — cases to add (pre-verified, use exactly)

```js
// Newton's Divided-Difference: points from y = x^2 + 1. The interpolation property
// guarantees P(x_i) = y_i exactly at every original node — a clean, self-contained test
// that doesn't depend on any other method.
{
  const points = [{ x: 0, y: 1 }, { x: 1, y: 2 }, { x: 2, y: 5 }, { x: 3, y: 10 }];
  const { coeffs, xs } = Algorithms.runDividedDifference(points);
  approx(Algorithms.evalNewtonForm(xs, coeffs, 2), 5, 1e-9, "Newton divided-difference: interpolation property at x=2");
}

// Newton's Divided-Difference: same data, evaluated at x=1.5 -> cross-checks against
// Neville's Method on identical data (docs/agent-plans/19-nevilles-method.md), both
// methods build the same unique polynomial.
{
  const points = [{ x: 0, y: 1 }, { x: 1, y: 2 }, { x: 2, y: 5 }, { x: 3, y: 10 }];
  const { coeffs, xs } = Algorithms.runDividedDifference(points);
  approx(Algorithms.evalNewtonForm(xs, coeffs, 1.5), 3.25, 1e-9, "Newton divided-difference at x=1.5 (cross-check vs Neville's method)");
}
```

After adding these, run `node tests/verify.js` and confirm the passed count increased by
exactly 2 with 0 failures. (If Neville's Method — `19-nevilles-method.md` — hasn't been
built yet, the second case still passes on its own merits; the "cross-check" framing in
its comment is just informative, not a runtime dependency on the other method's code.)

## 4. Files to create

- `math-lab/assets/js/divided-difference.js`
- `math-lab/engines/numerical/methods/newtons-divided-difference.html`

## 5. Inputs (the form panel)

- Points table — identical UI pattern to `lagrange.js` (copy it) and to Neville's plan.
- A **query `x`** numeric field (id `queryInput`), labeled "Evaluate at x". Default
  behaviour: evaluate and show `P(x)` at this point, same as the Lagrange page's `x0`
  field.
- `.status-line`: numeric points, distinct x values, at least 2 points, query x numeric.
- "Try Example": points `(0,1),(1,2),(2,5),(3,10)`, query `x = 1.5`.

## 6. Outputs (results panel)

Result strip (3 tiles, first `accent`):
- **P(x) ≈** (`accent`) — `Engine.formatNum(Algorithms.evalNewtonForm(xs, coeffs, x), 8)`.
- **Points used** — count.
- **Degree** — `points.length - 1`.

Formula block — show the general form, then the concrete Newton-form polynomial with the
computed `coeffs` substituted in (build the LaTeX string yourself from `coeffs`/`xs`,
following the same term-by-term string-building approach `lagrange.js`'s `polyToLatex`
uses, adapted to Newton form's `(x - x_k)` factors instead of plain powers of x):
```
P(x) = f[x_0] + f[x_0,x_1](x-x_0) + f[x_0,x_1,x_2](x-x_0)(x-x_1) + \cdots
```

Plot — **"Interpolating polynomial P(x)"** (single plot, height 320px): smooth curve of
`P(x)` sampled across the data range (240 points, `Algorithms.evalNewtonForm` at each
sample x, same padding approach as other pages), data points as teal markers, the queried
`(x, P(x))` as an orange open-circle marker — same visual pattern as the Lagrange page's
non-comparison mode.

Data table — the divided-difference table itself: rows `i = 0..n-1`, columns `x_i`, `y_i`,
then one column per order `j = 1..n-1` showing `F[i][j]` where defined (blank/dash where
`i+j >= n`). Highlight the diagonal `F[0][k]` cells (the coefficients actually used in
`coeffs`) distinctly (e.g. `.is-current` on the whole diagonal at once, no step slider
needed for this page — there's no natural sequential "step" the way root-finding
iterations or trapezoid panels have; showing the whole table at once, with the used
diagonal highlighted, is the right amount of interactivity here). If a step slider still
feels appropriate for consistency with every other page, step through nested-multiplication
evaluation instead: reveal one `(x - x_k)` multiplication of `evalNewtonForm` at a time,
showing the running partial result — this is optional, only do it if it doesn't add
excessive complexity relative to the mechanical nature of this method's build agent.

## 7. `methods.html` card (append to `PENDING-CARDS.md` per §10, do not edit `methods.html`)

```html
<a href="methods/newtons-divided-difference.html" class="card engine-card reveal crosshair-host" style="display:block; transition-delay:TODO">
  <span class="engine-dot"></span>
  <div class="engine-card-head">
    <span class="eyebrow">Interpolation</span>
    <span class="engine-index">TODO</span>
  </div>
  <h3 class="h3">Newton's Divided-Difference Formula</h3>
  <p>Builds the interpolating polynomial in Newton form via a divided-difference table, evaluated by nested multiplication instead of expanded coefficients.</p>
  <div class="method-tags" style="margin-top:16px;">
    <span class="tag">Data-point table + x</span>
    <span class="tag">Divided-difference table</span>
    <span class="tag">Nested-form evaluation</span>
  </div>
</a>
```

## 8. Acceptance criteria

All of §9 in the shared conventions doc, plus:
- `node tests/verify.js` → both new cases pass, count increases by 2, 0 failures.
- Example inputs: `P(1.5) ≈ 3.25`, and `P(2) = 5` exactly (spot-check both, not just one).
