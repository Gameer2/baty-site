# Build Plan — Gaussian Quadrature

Roadmap ref: §1C.21. Track: **GLM-5.2**. Read `00-SHARED-CONVENTIONS.md` (all of it,
including §10) before starting.

## 1. What this method is

Instead of evenly-spaced nodes, Gauss-Legendre quadrature picks specific nodes and
weights on `[-1,1]` that make the rule exact for polynomials up to degree `2k-1` using
only `k` evaluations — far more efficient than Newton-Cotes rules (Trapezoidal/Simpson's)
at the same evaluation count. Use the standard tabulated 2-point and 3-point rules
(these are well-known constants — verified below, don't re-derive):

```
k=2:  nodes = ±1/√3,                       weights = 1, 1            (exact up to degree 3)
k=3:  nodes = 0, ±√(3/5),                  weights = 8/9, 5/9, 5/9   (exact up to degree 5)
```

Map `[-1,1]` onto the actual `[a,b]` via `x = (b-a)/2·t + (a+b)/2`, and scale the sum by
the Jacobian `(b-a)/2`:

```
∫_a^b f(x) dx ≈ (b-a)/2 · Σ_i w_i · f( (b-a)/2·t_i + (a+b)/2 )
```

## 2. `algorithms.js` — function to add

```js
const GAUSS_LEGENDRE_TABLE = {
  2: { nodes: [-1 / Math.sqrt(3), 1 / Math.sqrt(3)], weights: [1, 1] },
  3: { nodes: [-Math.sqrt(3 / 5), 0, Math.sqrt(3 / 5)], weights: [5 / 9, 8 / 9, 5 / 9] },
};

// f: number -> number, Gauss-Legendre quadrature on [a, b] using a fixed-order rule
// (order 2 or 3 — exact for polynomials up to degree 2*order - 1).
Algorithms.runGaussLegendre = function (f, a, b, order) {
  const table = GAUSS_LEGENDRE_TABLE[order];
  if (!table) throw new Error("Only 2-point and 3-point Gauss-Legendre rules are supported.");
  const half = (b - a) / 2, mid = (a + b) / 2;
  const points = [];
  let total = 0;
  for (let i = 0; i < table.nodes.length; i++) {
    const x = half * table.nodes[i] + mid;
    let fx;
    try { fx = f(x); } catch { throw new Error(`f(x) could not be evaluated at x = ${x}.`); }
    if (!Number.isFinite(fx)) throw new Error(`f(x) produced a non-finite value at x = ${x}.`);
    const contribution = table.weights[i] * fx;
    total += contribution;
    points.push({ node: table.nodes[i], weight: table.weights[i], x, fx, contribution: contribution * half });
  }
  return { order, points, total: total * half };
};
```

## 3. `tests/verify.js` — cases to add (pre-verified via `node -e`)

```js
// Gauss-Legendre (2-point): x^3 on [0,1] -> exact (2-point rule is exact through degree 3).
{
  const { fn } = compile("x^3");
  const result = Algorithms.runGaussLegendre(fn, 0, 1, 2);
  approx(result.total, 0.25, 1e-12, "Gauss-Legendre 2-point, x^3 on [0,1] (exact)");
}

// Gauss-Legendre (3-point): x^4 on [-1,1] -> exact (3-point rule is exact through degree 5).
{
  const { fn } = compile("x^4");
  const result = Algorithms.runGaussLegendre(fn, -1, 1, 3);
  approx(result.total, 0.4, 1e-12, "Gauss-Legendre 3-point, x^4 on [-1,1] (exact)");
}
```

## 4. Files to create

- `math-lab/assets/js/gauss-legendre.js`
- `math-lab/engines/numerical/methods/gaussian-quadrature.html`

## 5. Inputs

`f(x)` + preview + keypad. `a`, `b` in a `.field-row`. An **order toggle**: 2-point /
3-point (reuse the Lagrange/Spline-style toggle markup, per `00-SHARED-CONVENTIONS.md`
§4's note about not inventing new UI patterns). "Try Example": `f(x) = "x^3"`, `a=0`,
`b=1`, order = 2-point (this exactly reproduces the verified test case, so the displayed
result should read exactly `0.25`).

## 6. Outputs

Result strip: **Estimate** (`accent`), **Order** (`2-point` / `3-point`), **Exact up to
degree** (`2·order - 1`), and a 4th tile can restate node count.

Formula block: the mapped-sum formula from §1.

Plot — base curve of `f(x)` over `[a,b]`, plus marker points at each Gauss node's mapped
`x` position, **marker size scaled by weight** (bigger marker = bigger weight) — this is
the one plot idea unique to this method and is worth getting visually clear: unlike every
other quadrature method on this site, the x-positions here are *not* evenly spaced, and
that asymmetry (node positions cluster differently than Trapezoidal/Simpson's evenly-
spaced panels) is exactly the point.

Data table: columns `node index`, `t_i (on [-1,1])`, `mapped x_i`, `w_i`, `f(x_i)`,
`contribution` (`w_i · f(x_i) · (b-a)/2`). No step slider (fixed small node count, nothing
to step through).

## 7. `methods.html` card (→ `PENDING-CARDS.md`, don't edit `methods.html` directly)

Category: **"Integration"**.
```html
<a href="methods/gaussian-quadrature.html" class="card engine-card reveal crosshair-host" style="display:block; transition-delay:TODO">
  <span class="engine-dot"></span>
  <div class="engine-card-head">
    <span class="eyebrow">Integration</span>
    <span class="engine-index">TODO</span>
  </div>
  <h3 class="h3">Gaussian Quadrature</h3>
  <p>Chooses node positions instead of spacing them evenly — a 2- or 3-point rule that's exact for surprisingly high-degree polynomials.</p>
  <div class="method-tags" style="margin-top:16px;">
    <span class="tag">f(x) + [a,b]</span>
    <span class="tag">2-pt / 3-pt toggle</span>
    <span class="tag">Weighted-node plot</span>
  </div>
</a>
```

## 8. Acceptance criteria

Per §9 of shared conventions, plus: with the example inputs, switching from 2-point to
3-point order on a cubic should give the *same* exact answer (`0.25`) since both orders
are exact for degree-3 polynomials — a good in-UI sanity check worth confirming manually.
