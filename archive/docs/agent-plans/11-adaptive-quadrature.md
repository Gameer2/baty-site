# Build Plan — Adaptive Quadrature

Roadmap ref: §1C.20. Track: **GLM-5.2**. Read `00-SHARED-CONVENTIONS.md` (all of it,
including §10) before starting.

## 1. What this method is

Recursively subdivides `[a,b]`, refining only where the local Simpson's-rule estimate
isn't yet accurate enough, instead of using a fixed panel count everywhere (Burden &
Faires Alg. 4.3). This needs a **single-interval** Simpson estimate helper (3-point
1/3-rule over one arbitrary `[p,q]`) — do not call the composite `Algorithms.runSimpson`
recursively for this; its "auto/13/38 grouping" machinery doesn't fit a recursive-tree
refinement structure. Write a small local helper instead:

```
simpsonEst(f, p, q) = (q-p)/6 · [f(p) + 4·f((p+q)/2) + f(q)]
```

Recursion (standard adaptive-Simpson error control, using the fact that the error in the
two-half estimate is ~1/15th the difference between the whole and split estimates):

```
adaptiveSimpson(f, a, b, tol, wholeEstimate):
  c = (a+b)/2
  Sleft  = simpsonEst(f, a, c)
  Sright = simpsonEst(f, c, b)
  if |Sleft + Sright - wholeEstimate| < 15·tol:
      accept this subdivision as a leaf; contribute Sleft + Sright + (Sleft+Sright-wholeEstimate)/15
  else:
      recurse on [a,c] with tol/2 and [c,b] with tol/2
```

## 2. `algorithms.js` — function to add

```js
// f: number -> number, adaptive Simpson's-rule quadrature on [a, b] to the given
// tolerance. Recursively refines only where needed; returns every accepted leaf
// subinterval (for visualizing where refinement happened) plus the total estimate.
Algorithms.runAdaptiveQuadrature = function (f, a, b, tol) {
  if (!(tol > 0)) throw new Error("Tolerance must be a positive number.");

  function evalAt(x) {
    let y;
    try { y = f(x); } catch { throw new Error(`f(x) could not be evaluated at x = ${x}.`); }
    if (!Number.isFinite(y)) throw new Error(`f(x) produced a non-finite value at x = ${x}.`);
    return y;
  }
  function simpsonEst(p, q) {
    const mid = (p + q) / 2;
    return ((q - p) / 6) * (evalAt(p) + 4 * evalAt(mid) + evalAt(q));
  }

  const leaves = [];
  const MAX_DEPTH = 40;

  function recurse(lo, hi, localTol, whole, depth) {
    const mid = (lo + hi) / 2;
    const left = simpsonEst(lo, mid);
    const right = simpsonEst(mid, hi);
    const refined = left + right;
    if (depth >= MAX_DEPTH || Math.abs(refined - whole) < 15 * localTol) {
      const estimate = refined + (refined - whole) / 15;
      leaves.push({ a: lo, b: hi, estimate, depth });
      return estimate;
    }
    return recurse(lo, mid, localTol / 2, left, depth + 1) + recurse(mid, hi, localTol / 2, right, depth + 1);
  }

  const wholeEstimate = simpsonEst(a, b);
  const total = recurse(a, b, tol, wholeEstimate, 0);
  leaves.sort((p, q) => p.a - q.a);
  return { leaves, total };
};
```

## 3. `tests/verify.js` — case to add (pre-verified via `node -e`)

```js
// Adaptive Quadrature: 4/(1+x^2) on [0,1] -> pi (a classic quadrature identity).
{
  const { fn } = compile("4 / (1 + x^2)");
  const result = Algorithms.runAdaptiveQuadrature(fn, 0, 1, 1e-9);
  approx(result.total, Math.PI, 1e-6, "Adaptive quadrature of 4/(1+x^2) on [0,1] (-> pi)");
}
```

## 4. Files to create

- `math-lab/assets/js/adaptive-quadrature.js`
- `math-lab/engines/numerical/methods/adaptive-quadrature.html`

## 5. Inputs

`f(x)` + preview + keypad. `a`, `b` in a `.field-row`. `tol` (tolerance) numeric field —
reuse the same field pattern/id convention (`tolInput`) as the root-finding pages, no
`maxIter` needed (recursion depth is internally capped). "Try Example":
`f(x) = "4 / (1 + x^2)"`, `a=0`, `b=1`, `tol=0.000001`.

## 6. Outputs

Result strip: **Estimate** (`accent`), **Leaf subintervals** (`leaves.length`),
**Tolerance used**, **Deepest refinement** (`Math.max(...leaves.map(l => l.depth))`).

Formula block: the `simpsonEst` formula plus a one-line plain-text (not KaTeX) note
explaining the 15×-tolerance error-control rule, since it's more of an algorithmic idea
than a single equation worth rendering.

Plot — **"f(x) with adaptive refinement"**: base curve, plus a light shaded band along
the x-axis (a thin rectangle strip below the curve, not a full fill-to-curve like the
Trapezoidal/Simpson pages) for each leaf subinterval, where **color saturation or height
increases with `depth`** — deeper (more-refined) leaves should visibly stand out from
shallow ones. This directly visualizes *where* the algorithm worked harder, which is the
whole pedagogical point of adaptive quadrature — get this right, it's the page's main
visual.

Data table: columns `#`, `[a, b]` (the leaf's range), `depth`, `estimate`. Sort by `a`
ascending (already done by the algorithm). No step slider (no natural single-step
narrative — same reasoning as Hermite/Romberg).

## 7. `methods.html` card (→ `PENDING-CARDS.md`, don't edit `methods.html` directly)

Category: **"Integration"**.
```html
<a href="methods/adaptive-quadrature.html" class="card engine-card reveal crosshair-host" style="display:block; transition-delay:TODO">
  <span class="engine-dot"></span>
  <div class="engine-card-head">
    <span class="eyebrow">Integration</span>
    <span class="engine-index">TODO</span>
  </div>
  <h3 class="h3">Adaptive Quadrature</h3>
  <p>Refines only where the function actually needs it — recursive Simpson's rule with automatic error control, instead of a fixed panel count everywhere.</p>
  <div class="method-tags" style="margin-top:16px;">
    <span class="tag">f(x) + [a,b] + tol</span>
    <span class="tag">Refinement-depth plot</span>
    <span class="tag">Leaf-interval table</span>
  </div>
</a>
```

## 8. Acceptance criteria

Per §9 of shared conventions, plus: try a function with a sharp local feature (e.g. a
narrow peak) alongside the flat example, and confirm visually that leaf subintervals
cluster (are narrower/more numerous) near the feature — that's the functional proof this
method actually works "adaptively," not just as a slower Simpson's rule.
