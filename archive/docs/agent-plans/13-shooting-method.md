# Build Plan — Shooting Method (linear BVP)

Roadmap ref: §1I.29. Track: **GLM-5.2**. Read `00-SHARED-CONVENTIONS.md` (all of it,
including §10) before starting. Note: `math-lab/assets/proto/ode-solver.js` (used by the
separate ODE engine) already has an RK4 stepper (`Solver.rk4SecondOrder`) — it's a close
structural match to what this method needs, and was used as a cross-check reference while
verifying this plan's numbers, but do **not** import or depend on it: it lives in
`assets/proto/` (a different engine's module, pulls in the heavy `nerdamer` dependency)
and this site's Numerical Engine keeps all its math self-contained in `algorithms.js`
(§1 of shared conventions — "one implementation, two callers"). Write your own compact
RK4 system stepper local to this method's function.

## 1. What this method is

Solves the **linear** 2nd-order BVP `y'' = p(x)y' + q(x)y + r(x)`, `y(a) = α`, `y(b) = β`
by combining two initial-value problems (Burden & Faires §11.1, linear shooting — no
secant iteration needed since the problem is linear, unlike the nonlinear shooting
method):

```
IVP 1 (particular): y1'' = p·y1' + q·y1 + r,   y1(a) = α,  y1'(a) = 0
IVP 2 (homogeneous): y2'' = p·y2' + q·y2,       y2(a) = 0,  y2'(a) = 1
```

Integrate both simultaneously (as a 4-variable first-order system `[y1, y1', y2, y2']`)
with RK4 from `a` to `b`, then combine linearly to satisfy the right boundary condition
exactly:

```
c = (β - y1(b)) / y2(b)
y(x) = y1(x) + c·y2(x)      for every x in the integration path
```

## 2. `algorithms.js` — function to add

```js
// p, q, r: number -> number (coefficient functions of x). Solves the linear BVP
// y'' = p(x)y' + q(x)y + r(x), y(a)=alpha, y(b)=beta via linear shooting: integrate the
// particular (y1) and homogeneous (y2) IVPs together with RK4, then combine linearly.
// Returns the full step-by-step path plus the combined solution at each step.
Algorithms.runShooting = function (p, q, r, a, b, alpha, beta, n) {
  if (!Number.isInteger(n) || n < 1) throw new Error("n (number of RK4 steps) must be a positive integer.");
  const h = (b - a) / n;

  function deriv(x, Y) {
    const [y1, y1p, y2, y2p] = Y;
    let pv, qv, rv;
    try { pv = p(x); qv = q(x); rv = r(x); } catch { throw new Error(`p(x), q(x), or r(x) could not be evaluated at x = ${x}.`); }
    if (![pv, qv, rv].every(Number.isFinite)) throw new Error(`p(x), q(x), or r(x) produced a non-finite value at x = ${x}.`);
    return [y1p, pv * y1p + qv * y1 + rv, y2p, pv * y2p + qv * y2];
  }
  function addScaled(Y, K, s) { return Y.map((v, i) => v + s * K[i]); }

  let x = a, Y = [alpha, 0, 0, 1];
  const path = [{ x, y1: Y[0], y1p: Y[1], y2: Y[2], y2p: Y[3] }];
  for (let i = 0; i < n; i++) {
    const k1 = deriv(x, Y);
    const k2 = deriv(x + h / 2, addScaled(Y, k1, h / 2));
    const k3 = deriv(x + h / 2, addScaled(Y, k2, h / 2));
    const k4 = deriv(x + h, addScaled(Y, k3, h));
    Y = Y.map((v, i2) => v + (h / 6) * (k1[i2] + 2 * k2[i2] + 2 * k3[i2] + k4[i2]));
    x += h;
    path.push({ x, y1: Y[0], y1p: Y[1], y2: Y[2], y2p: Y[3] });
  }

  const last = path[path.length - 1];
  if (Math.abs(last.y2) < 1e-12) throw new Error("y2(b) ≈ 0 — the homogeneous solution vanished at b, shooting fails for this problem.");
  const c = (beta - last.y1) / last.y2;
  const combined = path.map((p2) => ({ x: p2.x, y1: p2.y1, y2: p2.y2, y: p2.y1 + c * p2.y2 }));
  return { h, c, path: combined };
};
```

## 3. `tests/verify.js` — case to add (pre-verified via `node -e`)

```js
// Shooting Method: y'' = -y, y(0)=0, y(pi/2)=1 -> exact solution y=sin(x).
// n=200 makes x=pi/4 land exactly on a step (step 100 of 200), so no interpolation
// is needed to check the midpoint value against sin(pi/4).
{
  const p = () => 0, q = () => -1, r = () => 0;
  const result = Algorithms.runShooting(p, q, r, 0, Math.PI / 2, 0, 1, 200);
  const atQuarterPi = result.path[100];
  approx(atQuarterPi.x, Math.PI / 4, 1e-9, "Shooting: step 100 of 200 lands exactly at pi/4");
  approx(atQuarterPi.y, Math.sin(Math.PI / 4), 1e-6, "Shooting y''=-y, y(0)=0,y(pi/2)=1 at x=pi/4 (-> sin(pi/4))");
}
```

## 4. Files to create

- `math-lab/assets/js/shooting-method.js`
- `math-lab/engines/numerical/methods/shooting-method.html`

## 5. Inputs

Three `f(x)`-style fields (each its own `Engine.compileFx` call): `p(x)`, `q(x)`, `r(x)`,
each with its own small KaTeX preview (reuse the `fxPreview` pattern three times with
distinct ids — `pxPreview`, `qxPreview`, `rxPreview`; a single shared math keypad wired to
whichever field currently has focus is fine, or three separate keypads if simpler — follow
whichever is less code, both are acceptable). `a`, `b`, `alpha` (`y(a)`), `beta` (`y(b)`)
in two `.field-row`s. `n` (RK4 steps) numeric field. "Try Example": `p(x)="0"`, `q(x)="-1"`,
`r(x)="0"`, `a=0`, `b="1.5707963267948966"` (π/2 as a decimal, since these are plain
number inputs), `alpha=0`, `beta=1`, `n=200`.

## 6. Outputs

Result strip: **y(b) check** (should equal `beta` to numerical precision — a built-in
correctness display), **Shooting constant c**, **Steps (n)**, **h**.

Formula block: the `c = (β - y1(b))/y2(b)` and `y = y1 + c·y2` lines.

Plot — **"y1, y2, and combined solution"**: three line traces across the path —
`y1(x)` (particular solution alone, dashed, teal), `y2(x)` scaled by `c` (dashed, grey),
and the combined `y(x)` (solid, orange, the actual answer) — visually showing how the
two pieces sum to satisfy both boundary conditions. Mark `(a, alpha)` and `(b, beta)` as
distinct markers on the combined curve to make the boundary-matching visible.

Data table: columns `step`, `x`, `y1`, `y2`, `y (combined)`. Step slider steps through
the RK4 path, highlighting the current row and a marker on the combined-solution trace at
that `x` (via `Plotly.restyle`, same pattern as every other stepped page).

## 7. `methods.html` card (→ `PENDING-CARDS.md`, don't edit `methods.html` directly)

Category: **"Boundary Value Problems"**.
```html
<a href="methods/shooting-method.html" class="card engine-card reveal crosshair-host" style="display:block; transition-delay:TODO">
  <span class="engine-dot"></span>
  <div class="engine-card-head">
    <span class="eyebrow">Boundary Value Problems</span>
    <span class="engine-index">TODO</span>
  </div>
  <h3 class="h3">Shooting Method</h3>
  <p>Turns a boundary value problem into two initial value problems, integrated with RK4 and combined linearly to hit the far boundary exactly.</p>
  <div class="method-tags" style="margin-top:16px;">
    <span class="tag">p(x), q(x), r(x) + BCs</span>
    <span class="tag">Dual-IVP plot</span>
    <span class="tag">RK4 step table</span>
  </div>
</a>
```

## 8. Acceptance criteria

Per §9 of shared conventions, plus: the **"y(b) check"** stat should match the entered
`beta` value to at least 6 decimal places for any well-posed input — that's the built-in
proof the combination step worked, make sure it's genuinely computed from `combined`
path's last point, not just echoing the input.
