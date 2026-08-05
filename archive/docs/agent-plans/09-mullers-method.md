# Build Plan — Müller's Method

Roadmap ref: §1A.8. Track: **GLM-5.2**. Read `00-SHARED-CONVENTIONS.md` (all of it,
including §10) before starting. This method's page should closely mirror `secant.html`/
`secant.js` (also derivative-free, also needs multiple starting points) — use those as
your literal structural template, adapted for 3 starting points instead of 2.

## 1. What this method is

Fits a quadratic (parabola) through the last three iterates `(x0,f0), (x1,f1), (x2,f2)`
and takes the parabola's root nearest `x2` as the next iterate — converges faster than
Secant (order ≈1.84) and, unlike Newton/Secant, can find complex roots of a real
function (out of scope here — see error handling below).

```
δ0 = (f1 - f0)/(x1 - x0),  δ1 = (f2 - f1)/(x2 - x1)
a = (δ1 - δ0)/(x2 - x0)
b = a·(x2 - x1) + δ1
c = f2
x3 = x2 - 2c / (b + sign(b)·√(b² - 4ac))
```

(the `+ sign(b)·√(...)` choice — i.e. add the square root term with the same sign as
`b` — maximizes the denominator's magnitude and avoids catastrophic cancellation; this
is the standard, load-bearing detail, don't pick the naive `±` arbitrarily).

**Complex roots**: this site's `Engine.compileFx` only supports real-valued `f(x)`, so if
`b² - 4ac < 0` (the quadratic's roots are complex), throw a clear error rather than
attempting complex arithmetic: `"Müller's method converged toward a complex root — not
supported here since f(x) is real-valued. Try different starting points closer to a real
root."`

## 2. `algorithms.js` — function to add

```js
// f: number -> number, from three starting points x0, x1, x2 (distinct). Fits a
// quadratic through the last three iterates each step; throws if it ever heads toward
// a complex root (unsupported for this site's real-valued f(x) model).
Algorithms.runMuller = function (f, x0, x1, x2, tol, maxIter) {
  const iterations = [];
  let f0, f1, f2;
  try { f0 = f(x0); f1 = f(x1); f2 = f(x2); }
  catch { throw new Error("f(x) could not be evaluated at x0, x1, or x2."); }
  if (![f0, f1, f2].every(Number.isFinite)) throw new Error("f(x) produced a non-finite value at a starting point.");

  for (let n = 1; n <= maxIter; n++) {
    if (x1 === x0 || x2 === x1 || x2 === x0) throw new Error("Two iterates coincided — Müller's method stalled.");
    const d0 = (f1 - f0) / (x1 - x0);
    const d1 = (f2 - f1) / (x2 - x1);
    const a = (d1 - d0) / (x2 - x0);
    const b = a * (x2 - x1) + d1;
    const c = f2;
    const disc = b * b - 4 * a * c;
    if (disc < 0) throw new Error(`Discriminant went negative at n = ${n} — converging toward a complex root, which isn't supported for real-valued f(x).`);
    const sq = Math.sqrt(disc);
    const denom = Math.abs(b + sq) >= Math.abs(b - sq) ? (b + sq) : (b - sq);
    if (Math.abs(denom) < 1e-14) throw new Error(`Denominator ≈ 0 at n = ${n} — Müller's method fails here.`);
    const x3 = x2 - (2 * c) / denom;
    let f3;
    try { f3 = f(x3); } catch { throw new Error("f(x) could not be evaluated at the new iterate."); }
    if (!Number.isFinite(f3)) throw new Error("Iteration produced a non-finite value.");
    const err = Math.abs(x3 - x2);
    iterations.push({ n, x0, x1, x2, f0, f1, f2, a, b, c, x3, f3, err });
    if (err < tol) break;
    if (Math.abs(x3) > 1e8) throw new Error("Iteration diverged (|xₙ| grew without bound).");
    x0 = x1; f0 = f1;
    x1 = x2; f1 = f2;
    x2 = x3; f2 = f3;
  }
  return iterations;
};
```

## 3. `tests/verify.js` — case to add (pre-verified, cross-check against 3 existing methods)

```js
// Muller's Method: x^3 - x - 2 = 0, x0=1, x1=1.5, x2=2 -> same root as Bisection/
// Newton/Secant above (1.5213797068045676), cross-checking a fourth independent method.
{
  const { fn } = compile("x^3 - x - 2");
  const iters = Algorithms.runMuller(fn, 1, 1.5, 2, 1e-12, 50);
  approx(iters[iters.length - 1].x3, 1.5213797068045676, 1e-9, "Muller root of x^3 - x - 2 (cross-check)");
}
```

## 4. Files to create

- `math-lab/assets/js/muller.js`
- `math-lab/engines/numerical/methods/mullers-method.html`

## 5. Inputs

`f(x)` field + preview + keypad. Three numeric fields `x0Input`, `x1Input`, `x2Input` in
one `.field-row` (or two rows of appropriate width — follow whatever `engine.css` supports
for a 3-wide row; if only 2-wide rows exist in the CSS, use two stacked `.field-row`s: one
with x0/x1, one with x2 alone). `.status-line` validates all three distinct and `f(x)`
evaluable at each. Tolerance + max-iterations fields, same as every root-finder.
"Try Example": `f(x) = "x^3 - x - 2"`, `x0=1, x1=1.5, x2=2`.

## 6. Outputs

Result strip: **Root ≈**, **Iterations**, **f(root)**, **Final error** — identical stat
set to `secant.html`.

Formula block: the `x3 = x2 - 2c/(b ± √(b²-4ac))` formula from §1.

Plot 1 — **"f(x) & quadratic fit per step"**: base curve + zero line (as in `secant.js`),
plus the fitted parabola through the current step's three points (compute it directly:
the unique quadratic through 3 points via the same `a,b,c` already returned per iteration,
expressed in shifted coordinates `t = x - x2`: `parab(x) = a·t² + b·t + c`), drawn over a
local window around the three points. Markers for the three current points, diamond
marker for the next iterate — same visual language as `secant.js`'s current/next traces.

Plot 2 — error decay (log scale), identical pattern to every other root-finder page.

Data table columns: `n`, `x0`, `x1`, `x2`, `x3` (next), `error`.

## 7. `methods.html` card (→ `PENDING-CARDS.md`, don't edit `methods.html` directly)

Category: **"Root Finding"**.
```html
<a href="methods/mullers-method.html" class="card engine-card reveal crosshair-host" style="display:block; transition-delay:TODO">
  <span class="engine-dot"></span>
  <div class="engine-card-head">
    <span class="eyebrow">Root Finding</span>
    <span class="engine-index">TODO</span>
  </div>
  <h3 class="h3">Müller's Method</h3>
  <p>Fits a parabola through the last three iterates instead of a line — faster than Secant, and (in principle) able to find complex roots.</p>
  <div class="method-tags" style="margin-top:16px;">
    <span class="tag">f(x) + x₀, x₁, x₂</span>
    <span class="tag">Quadratic-fit trace</span>
    <span class="tag">Error decay plot</span>
  </div>
</a>
```

## 8. Acceptance criteria

Per §9 of shared conventions, plus: `node tests/verify.js` gains 1 more passing case
that agrees with the existing Bisection/Newton/Secant root to 9 decimal places; entering
three starting points that genuinely converge toward a complex root (e.g. `f(x) = x^2+1`
with any real starting triple) shows the specific complex-root error message, not a
generic failure or a `NaN` in the UI.
