# Build Plan — Newton's Method for Multiple Roots

Roadmap ref: `CURRICULUM_ROADMAP.md` §1A.6, priority P1. Earmarked for **Qwen3.5**. Read
`docs/agent-plans/00-SHARED-CONVENTIONS.md` in full first (including §10 — append your
card to `PENDING-CARDS.md`, don't edit `methods.html`).

**Closest precedent, read it in full before starting:** `math-lab/assets/js/newton-raphson.js`
and `math-lab/engines/numerical/methods/newton-raphson.html`, plus `Algorithms.runNewton`
in `algorithms.js`. This method reuses ~90% of Newton-Raphson's structure — same loop
shape, same input fields, same plot idea — with one different update formula that needs
one extra derivative.

## 1. What this method is and why it exists

Plain Newton-Raphson converges quadratically near a **simple** root (multiplicity 1), but
only **linearly** (much slower) near a root of multiplicity `m > 1` — a root where
`f(x_root) = f'(x_root) = ... = f^{(m-1)}(x_root) = 0` but `f^{(m)}(x_root) ≠ 0`. The
modified iteration restores quadratic convergence at such roots:

```
x_{n+1} = x_n - f(x_n)·f'(x_n) / ( [f'(x_n)]^2 - f(x_n)·f''(x_n) )
```

This needs `f''(x)`, the **second** derivative — one derivative more than every other
method built so far on this site. Getting `f''` is a two-step call, not a new API:
`Engine.derivativeFx(node)` already gives you `f'` as `{ok, fn, node, latex}` (see
`engine-core.js`). To get `f''`, call `Engine.derivativeFx` **again**, passing the first
result's `.node` as the argument: `const second = Engine.derivativeFx(deriv.node);`. Do
this in the per-method JS wiring, exactly the same place `newton-raphson.js` calls
`Engine.derivativeFx(compiled.node)` once — just call it twice, chained. Do not add any
new function to `engine-core.js` for this — the existing API already supports it via this
double-call pattern.

Classic textbook example with a known double root (multiplicity 2), use this for the
example button and the test case: `f(x) = e^x - x - 1` has `f(0) = 0`, `f'(0) = 0`,
`f''(0) = 1 ≠ 0` — a double root at `x = 0`.

## 2. `algorithms.js` — function to add

Add after `Algorithms.runNewton`:

```js
// f, fp, fpp: number -> number (f, f', f''), from x0. Modified Newton iteration that
// restores quadratic convergence at a root of multiplicity > 1 (where f and f' both
// vanish, so plain Newton only converges linearly there).
Algorithms.runNewtonMultiple = function (f, fp, fpp, x0, tol, maxIter) {
  const iterations = [];
  let x = x0;
  for (let n = 1; n <= maxIter; n++) {
    let fx, fpx, fppx;
    try { fx = f(x); fpx = fp(x); fppx = fpp(x); } catch { throw new Error("f, f′ or f″ could not be evaluated at the current iterate."); }
    if (!Number.isFinite(fx) || !Number.isFinite(fpx) || !Number.isFinite(fppx)) throw new Error("Evaluation produced a non-finite value.");
    const denom = fpx * fpx - fx * fppx;
    if (Math.abs(denom) < 1e-12) throw new Error(`[f′(x)]² − f(x)f″(x) ≈ 0 at x = ${x} — the modified Newton step is undefined here.`);
    const xNext = x - (fx * fpx) / denom;
    const err = Math.abs(xNext - x);
    iterations.push({ n, x, fx, fpx, fppx, xNext, err });
    if (err < tol) break;
    if (Math.abs(xNext) > 1e8) throw new Error("Iteration diverged (|xₙ| grew without bound).");
    x = xNext;
  }
  return iterations;
};
```

Return shape: array of `{n, x, fx, fpx, fppx, xNext, err}` — same as `runNewton`'s shape
plus one extra field (`fppx`). This means the per-method JS can reuse almost all of
`newton-raphson.js`'s rendering code, just add one table column for `f″(xₙ)`.

## 3. `tests/verify.js` — case to add (pre-verified, use exactly)

```js
// Newton for Multiple Roots: e^x - x - 1 = 0 has a double root at x = 0
// (f(0)=f'(0)=0, f''(0)=1≠0). Modified Newton from x0=1 converges to ~0 in 5 iterations
// at tol=1e-12 (verified with node -e). Plain Newton on the same problem needs ~27
// iterations to reach only 1e-8 accuracy — worth noting in the page copy as the point
// of this method, but the test only needs to check the modified version converges fast
// and correctly.
{
  const { node, fn } = compile("e^x - x - 1");
  const fp = derivativeOf(node);
  const fppNode = math.derivative(math.derivative(node, "x"), "x");
  const fppCode = fppNode.compile();
  const fpp = (x) => fppCode.evaluate({ x });
  const iters = Algorithms.runNewtonMultiple(fn, fp, fpp, 1, 1e-12, 50);
  approx(iters[iters.length - 1].xNext, 0, 1e-6, "Newton multiple-roots, double root of e^x - x - 1 at 0");
  approx(iters.length <= 10 ? 1 : 0, 1, 0.5, "Newton multiple-roots converges in a small number of iterations (quadratic, not linear)");
}
```

Note the `fppNode`/`fppCode` lines build a second derivative directly with `math.js`,
mirroring the existing `derivativeOf()` helper already at the top of `tests/verify.js`
but nested once more — don't add a new top-level helper function for this, it's only
needed in this one test block. Append after whatever cases already exist in the file.

## 4. Files to create

- `math-lab/assets/js/newton-multiple.js` — copy `newton-raphson.js`, then: after the
  existing `const deriv = Engine.derivativeFx(compiled.node);` call (in both
  `updateDerivCheck()` and the form submit handler), add
  `const secondDeriv = Engine.derivativeFx(deriv.node);` right after it, validate
  `secondDeriv.ok` the same way `deriv.ok` is validated, and pass `secondDeriv.fn` as the
  third argument to `Algorithms.runNewtonMultiple(compiled.fn, deriv.fn, secondDeriv.fn, x0, tol, maxIter)`.
  Add one extra formula-block render for `f″(x)` (reuse the `derivFormulaBlock` pattern,
  add a second one, e.g. `secondDerivFormulaBlock`) and one extra `<td>` for `f″(xₙ)` in
  the iteration table row template, using `secondDeriv.latex`.
- `math-lab/engines/numerical/methods/newton-multiple-roots.html` — copy
  `newton-raphson.html`, then: `<title>`/`<h1>` → "Newton's Method for Multiple Roots",
  `.method-summary` explains the multiplicity idea in one sentence, add a third formula
  block element (id `secondDerivFormulaBlock`) right after the existing derivative
  formula block, add a `f″(xₙ)` `<th>`/`<td>` column to the iteration table, script tag →
  `newton-multiple.js`.

## 5. Inputs

Identical to Newton-Raphson: `f(x)` field, `x0` field, tolerance, max iterations. Same
field ids. Same derivative-status validity check pattern (`derivStatus`/`derivStatusText`)
— extend it to also confirm `f''(x)` differentiates successfully, with its own message
if not (e.g. "Could not compute f″(x) symbolically").

"Try Example": `f(x) = "e^x - x - 1"`, `x0 = "1"`, `tol = "0.000001"`, `maxIter = "30"`.

## 6. Outputs

Same result-strip layout as Newton-Raphson (Root≈/Iterations/f(root)/Final error). Two
formula blocks instead of one: the modified-Newton update formula —

```
x_{n+1} = x_n - \dfrac{f(x_n)f'(x_n)}{[f'(x_n)]^2 - f(x_n)f''(x_n)}
```

— plus the symbolic `f'(x) = ...` block (as Newton-Raphson already shows) plus a new
symbolic `f''(x) = ...` block. Iteration table: same columns as Newton-Raphson (`n`, `x`,
`f(x)`, `f'(x)`, `xₙ₊₁`, `error`) plus one more, `f''(x)`, inserted between `f'(x)` and
`xₙ₊₁`. Same tangent-line-per-step plot idea as Newton-Raphson (the tangent line still
uses `f'(x)` for its slope — `f''` isn't plotted, it's only used in the update formula,
so the plot code can be copied unchanged from `newton-raphson.js`). Same error-decay plot.
Same step slider.

Results copy should mention, in one sentence near the result strip or below it, that this
method converges quadratically even at a root where plain Newton-Raphson would stall to
linear convergence — that's the pedagogical point of the page.

## 7. `methods.html` card (append to `PENDING-CARDS.md`, do not edit `methods.html`)

```html
<a href="methods/newton-multiple-roots.html" class="card engine-card reveal crosshair-host" style="display:block; transition-delay:TODO">
  <span class="engine-dot"></span>
  <div class="engine-card-head">
    <span class="eyebrow">Root Finding</span>
    <span class="engine-index">TODO</span>
  </div>
  <h3 class="h3">Newton's Method for Multiple Roots</h3>
  <p>Modifies the Newton update using f'' to restore quadratic convergence at roots where f and f' vanish together — where plain Newton-Raphson slows to a crawl.</p>
  <div class="method-tags" style="margin-top:16px;">
    <span class="tag">f(x) + x₀</span>
    <span class="tag">f, f', f'' all symbolic</span>
    <span class="tag">Tangent-line trace</span>
  </div>
</a>
```

## 8. Acceptance criteria

All of §9 in the shared conventions doc, plus:
- `node tests/verify.js` passes, including the new case.
- With the example inputs (`e^x - x - 1`, `x0=1`), the page converges to a root of
  `0.000000...` in roughly 5 iterations — visibly few, not 20+.
- The `f''(x)` symbolic formula block actually renders (check it isn't blank/erroring for
  the example function — `math.js`'s `derivative()` called twice should work fine for
  `e^x - x - 1`, but confirm in the browser).
