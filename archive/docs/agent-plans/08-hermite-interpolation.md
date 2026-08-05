# Build Plan — Hermite Interpolation

Roadmap ref: §1B.13. Track: **GLM-5.2**. Read `00-SHARED-CONVENTIONS.md` (all of it,
including §10) before starting. Skim `math-lab/assets/js/lagrange.js` for UI precedent —
this method's input is structurally the same points-table idea, plus one extra column.

## 1. What this method is

Given `n+1` nodes with both a function value **and** a derivative at each,
`(x_i, f_i, f'_i)`, Hermite interpolation builds the unique degree-`(2n+1)` polynomial
`H(x)` matching every `f_i` and `f'_i` exactly. Construction (Burden & Faires Alg. 3.3,
divided-difference form): build a `(2n+2)×(2n+2)` table over the doubled node sequence
`z_0=z_1=x_0, z_2=z_3=x_1, ...`:

```
Q[2i][0]   = f_i
Q[2i+1][0] = f_i
Q[2i+1][1] = f'_i
Q[2i][1]   = (Q[2i][0] - Q[2i-1][0]) / (z_{2i} - z_{2i-1})     (i >= 1)
Q[i][j]    = (Q[i][j-1] - Q[i-1][j-1]) / (z_i - z_{i-j})       (j >= 2)
```

Evaluate as a Newton-form polynomial: `H(x) = Q[0][0] + Σ_{k=1}^{2n+1} Q[k][k]·Π_{j<k}(x-z_j)`.

Key teaching point for the page copy: Hermite matches *both* value and slope at every
node, so it's smoother than plain Lagrange through the same points — good candidate for
an "overlay vs. Lagrange" comparison, mirroring the Lagrange/Spline toggle already on
`lagrange-interpolation.html`.

## 2. `algorithms.js` — functions to add

Two functions, same build/eval split as `runCubicSpline`/`evalCubicSpline`:

```js
// points: [{x, f, fp}, ...] sorted ascending, distinct x. f = value, fp = derivative.
// Returns the divided-difference table (z, Q) for evalHermite to consume.
Algorithms.runHermite = function (points) {
  const n = points.length - 1;
  const m = 2 * n + 1;
  const z = new Array(m + 1);
  const Q = Array.from({ length: m + 1 }, () => new Array(m + 1).fill(0));
  for (let i = 0; i <= n; i++) {
    if (!Number.isFinite(points[i].x) || !Number.isFinite(points[i].f) || !Number.isFinite(points[i].fp)) {
      throw new Error(`Point ${i} has a non-finite x, f, or f'.`);
    }
    z[2 * i] = points[i].x; z[2 * i + 1] = points[i].x;
    Q[2 * i][0] = points[i].f; Q[2 * i + 1][0] = points[i].f;
    Q[2 * i + 1][1] = points[i].fp;
    if (i !== 0) {
      if (z[2 * i] === z[2 * i - 1]) throw new Error("Duplicate x values are not allowed.");
      Q[2 * i][1] = (Q[2 * i][0] - Q[2 * i - 1][0]) / (z[2 * i] - z[2 * i - 1]);
    }
  }
  for (let j = 2; j <= m; j++) {
    for (let i = j; i <= m; i++) {
      Q[i][j] = (Q[i][j - 1] - Q[i - 1][j - 1]) / (z[i] - z[i - j]);
    }
  }
  return { z, Q };
};

// Evaluates the Hermite polynomial built by runHermite at any x.
Algorithms.evalHermite = function (z, Q, x) {
  const m = z.length - 1;
  let result = Q[0][0];
  let prod = 1;
  for (let k = 1; k <= m; k++) {
    prod *= (x - z[k - 1]);
    result += Q[k][k] * prod;
  }
  return result;
};
```

## 3. `tests/verify.js` — cases to add (pre-verified via `node -e`)

```js
// Hermite Interpolation: f(x)=x^3 (f'=3x^2) at x=0,1 -> degree-3 Hermite polynomial
// must reproduce x^3 exactly everywhere (Hermite through 2 points is exact up to degree 3).
{
  const points = [{ x: 0, f: 0, fp: 0 }, { x: 1, f: 1, fp: 3 }];
  const { z, Q } = Algorithms.runHermite(points);
  approx(Algorithms.evalHermite(z, Q, 0.5), 0.125, 1e-9, "Hermite x^3 reproduction at x=0.5");
  approx(Algorithms.evalHermite(z, Q, 0.7), 0.343, 1e-9, "Hermite x^3 reproduction at x=0.7");
}
```

## 4. Files to create

- `math-lab/assets/js/hermite.js`
- `math-lab/engines/numerical/methods/hermite-interpolation.html`

## 5. Inputs

Points table like `lagrange-interpolation.html`'s but with 3 editable columns per row:
`x`, `f(x)`, `f'(x)` — add/remove-row buttons following the same pattern as
`lagrange.js`'s `addRow`/`resetPoints`. "Try Example": the `[{x:0,f:0,fp:0},{x:1,f:1,fp:3}]`
case from §3 (label it "x³ through two points" in the example copy).

## 6. Outputs

Result strip: **Degree** (`2n+1`), **Nodes**, plus two stat tiles reserved for a sample
evaluation (e.g. value at the midpoint of the node range).

Formula/description block: show the Newton-form expansion symbolically isn't required
(coefficients are numeric, not symbolic) — instead show the divided-difference table
itself as a second small `data-table` (rows = `z_i`, columns = each difference order),
which doubles as a teaching aid.

Plot: sampled curve of `H(x)` across the node range (200+ samples via `evalHermite`),
markers at each `(x_i, f_i)` node, **and** a short tangent-line segment at each node with
slope `f'_i` (small fixed-length line centered on the node) to visually show the
derivative constraint being met — this is the one visual element unique to this page,
worth getting right. Optional overlay checkbox: plot the plain Lagrange interpolant
through just the `(x_i, f_i)` pairs (ignoring derivatives) for comparison — reuse the
`lagrangeCoeffs`/`evalPoly` pattern already in `lagrange.js` for that overlay curve only
(don't route it through `algorithms.js`, it's presentation-only, matching how `lagrange.js`
itself already keeps that logic local).

No step slider needed (no iteration/panel sequence here) — omit that panel, unlike the
root-finding/quadrature pages.

## 7. `methods.html` card (add to `PENDING-CARDS.md`, don't edit `methods.html` directly)

Category: **"Interpolation"**.
```html
<a href="methods/hermite-interpolation.html" class="card engine-card reveal crosshair-host" style="display:block; transition-delay:TODO">
  <span class="engine-dot"></span>
  <div class="engine-card-head">
    <span class="eyebrow">Interpolation</span>
    <span class="engine-index">TODO</span>
  </div>
  <h3 class="h3">Hermite Interpolation</h3>
  <p>Matches both value and slope at every node — a degree-(2n+1) polynomial that's exact for anything up to that degree, smoother than Lagrange through the same points.</p>
  <div class="method-tags" style="margin-top:16px;">
    <span class="tag">(x, f, f′) table</span>
    <span class="tag">Tangent markers</span>
    <span class="tag">Lagrange overlay</span>
  </div>
</a>
```

## 8. Acceptance criteria

Per §9 of shared conventions, plus: `node tests/verify.js` gains 2 more passing cases;
the tangent-line segments at each node visually align with the plotted curve's slope
there (a quick eyeball check — the curve should be tangent to each segment, not crossing
through at an angle).
