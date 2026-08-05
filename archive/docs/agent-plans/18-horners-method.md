# Build Plan — Horner's Method with Deflation

Roadmap ref: `CURRICULUM_ROADMAP.md` §1A.9, priority P1. Earmarked for **Qwen3.5**. Read
`docs/agent-plans/00-SHARED-CONVENTIONS.md` in full first (including §10 — append your
card to `PENDING-CARDS.md`, don't edit `methods.html`).

**This method is structurally different from every other method on the site so far** — its
input is a **list of polynomial coefficients**, not an `f(x)` expression string. Do not
use `Engine.compileFx`/the math keypad/KaTeX live-preview-of-arbitrary-expressions
pattern for the input — there is nothing to symbolically parse here, it's just numbers.
Read this whole plan before starting; the "find all roots" outer loop in §1 is the one
piece of this task that isn't copy-adjacent to an existing file, so follow it exactly.

## 1. What this method is

**Horner's method** evaluates a degree-`n` polynomial `p(x) = c_0 x^n + c_1 x^{n-1} + ... +
c_n` (coefficients given highest-degree-first) at a point `x` using nested multiplication
— O(n) multiplications instead of the O(n²) a naive power-by-power evaluation would use.
As a side effect of one synthetic-division pass, it also produces the **deflated**
polynomial (one degree lower, with the evaluation point's root factored out) and, via a
second synthetic-division pass on the deflated coefficients, the polynomial's derivative
value at that point — which is exactly what's needed to run **Newton's method using
Horner-evaluated `f(x)` and `f'(x)`** to actually find a root, then **deflate** the
polynomial and repeat on the lower-degree remainder to find the next root.

Single evaluation + derivative + deflation, given coefficients `c[0..n]` (length `n+1`,
`c[0]` is the leading/highest-degree coefficient) and a point `x`:

```
b[0] = c[0]
b[i] = c[i] + b[i-1]*x     for i = 1..n        // b[n] = p(x); b[0..n-1] are the deflated coefficients

d[0] = b[0]
d[i] = b[i] + d[i-1]*x     for i = 1..n-1       // d[n-1] = p'(x)
```

`b[n]` is `p(x)`. `d[n-1]` is `p'(x)`. `b[0..n-1]` (length `n`) is the deflated polynomial
— the original divided by `(x - r)` where `r` is the point evaluated at (exact if `r` is
an actual root; otherwise `b[0..n-1]` is just the synthetic-division quotient, which is
what the Newton step below needs regardless of whether `x` is already a root).

**Finding all real roots** (the full method as a page feature, not just a single
evaluation): starting from the original coefficients and a user-given starting guess `x0`,
repeat degree times:
1. Run Newton's method using Horner-evaluated `p(x)`/`p'(x)` at each Newton step (not
   `math.js` — there is no expression to differentiate, `p'(x)` comes from the `d[]` array
   above) until convergence to a root `r`.
2. Deflate: replace the current working coefficient list with `b[0..n-1]` from the final
   Horner call at `x = r`.
3. Record `r`. If the deflated polynomial's degree is now 0, stop (all roots found). Else
   repeat step 1 on the deflated polynomial, reusing the same `x0` as the next starting
   guess (or `r + 0.5` if `x0` itself was just found as a root — avoids immediately
   re-converging to the same root; use this exact fallback, it was verified numerically).

## 2. `algorithms.js` — functions to add

Add after `Algorithms.evalCubicSpline` (or after the most recently added function, if
others have been added by other build agents by the time you get to this):

```js
// coeffs: [c0, c1, ..., cn] highest-degree-first, length n+1 for a degree-n polynomial.
// Evaluates p(x) via nested multiplication (Horner's rule) and, via a second synthetic
// division pass, p'(x) too. Returns { value: p(x), deriv: p'(x), deflated: [b0..b(n-1)] }
// where `deflated` is the synthetic-division quotient of p(x) by (x - point) — the
// deflated polynomial once `point` is confirmed to be an actual root.
Algorithms.hornerEval = function (coeffs, x) {
  const n = coeffs.length - 1;
  if (n < 1) throw new Error("Need at least a degree-1 polynomial (2 coefficients).");
  const b = new Array(n + 1);
  b[0] = coeffs[0];
  for (let i = 1; i <= n; i++) b[i] = coeffs[i] + b[i - 1] * x;
  const d = new Array(n);
  d[0] = b[0];
  for (let i = 1; i <= n - 1; i++) d[i] = b[i] + d[i - 1] * x;
  return { value: b[n], deriv: d[n - 1], deflated: b.slice(0, n) };
};

// coeffs: [c0..cn] highest-degree-first. Finds all n roots of a degree-n polynomial by
// repeatedly running Newton's method (using hornerEval for p(x)/p'(x) at each step) then
// deflating. x0 is the starting guess for the first root; subsequent roots restart from
// x0 too, nudged by +0.5 if x0 itself was just found (avoids immediately reconverging to
// the same root). Returns { roots: [...], steps: [{root, newtonIterations}, ...] } where
// each element of `steps` also carries the full per-root Newton iteration trace.
Algorithms.runHornerDeflation = function (coeffs, x0, tol, maxIter) {
  let working = coeffs.slice();
  let guess = x0;
  const roots = [];
  const steps = [];
  while (working.length - 1 >= 1) {
    let x = guess;
    const newtonIterations = [];
    let converged = false;
    for (let n = 1; n <= maxIter; n++) {
      const { value, deriv } = Algorithms.hornerEval(working, x);
      if (!Number.isFinite(value) || !Number.isFinite(deriv)) throw new Error("Horner evaluation produced a non-finite value.");
      if (Math.abs(deriv) < 1e-12) throw new Error(`p′(x) ≈ 0 at x = ${x} — Horner-Newton step is undefined here.`);
      const xNext = x - value / deriv;
      const err = Math.abs(xNext - x);
      newtonIterations.push({ n, x, value, deriv, xNext, err });
      x = xNext;
      if (err < tol) { converged = true; break; }
      if (Math.abs(x) > 1e8) throw new Error("Root search diverged (|x| grew without bound).");
    }
    if (!converged) throw new Error(`Did not converge to a root of the current deflated polynomial within ${maxIter} iterations.`);
    const root = x;
    const { deflated } = Algorithms.hornerEval(working, root);
    roots.push(root);
    steps.push({ root, newtonIterations });
    working = deflated;
    guess = x0;
  }
  return { roots, steps };
};
```

Note `hornerEval` is exposed as its own function (not folded into `runHornerDeflation`)
because the plan's UI (§6) shows a single-evaluation demo table (the `b[]`/`d[]` synthetic
division rows) separately from the multi-root search — both need direct access to it.

## 3. `tests/verify.js` — cases to add (pre-verified, use exactly)

```js
// Horner's Method: p(x) = x^3 - 6x^2 + 11x - 6 = (x-1)(x-2)(x-3), coefficients
// [1, -6, 11, -6] highest-degree-first. Single evaluation at x=2 should give p(2)=0
// exactly (2 is a root) and the deflated quadratic should be [1, -4, 3] = x^2-4x+3
// (verified with node -e).
{
  const result = Algorithms.hornerEval([1, -6, 11, -6], 2);
  approx(result.value, 0, 1e-9, "Horner evaluation p(2) on x^3-6x^2+11x-6 (exact root)");
  approx(result.deflated[0], 1, 1e-9, "Horner deflation leading coefficient");
  approx(result.deflated[1], -4, 1e-9, "Horner deflation, coefficient of x");
  approx(result.deflated[2], 3, 1e-9, "Horner deflation, constant term");
}

// Horner + deflation, full root search: same cubic, all three roots are 1, 2, 3
// (verified with node -e: starting from x0=0.5, finds exactly [1, 2, 3] in order).
{
  const result = Algorithms.runHornerDeflation([1, -6, 11, -6], 0.5, 1e-10, 100);
  approx(result.roots[0], 1, 1e-6, "Horner deflation root 1 of 3");
  approx(result.roots[1], 2, 1e-6, "Horner deflation root 2 of 3");
  approx(result.roots[2], 3, 1e-6, "Horner deflation root 3 of 3");
}
```

Append after whatever cases already exist in the file.

## 4. Files to create

- `math-lab/assets/js/horner.js` — new structure (no direct precedent to copy wholesale,
  since the input isn't an `f(x)` expression — but reuse every other convention: IIFE,
  `"use strict"`, `Engine.debounce`, `Engine.formatNum`, `Engine.plotlyBaseLayout`,
  `Engine.plotlyConfig`, the placeholder/resultsArea show-hide pattern, the
  `.status-line` validity pattern, the `.data-table`/step-slider pattern). Parse the
  coefficient input as: `input.value.trim().split(/[\s,]+/).map(Number)`, reject if any
  element is `NaN` or if fewer than 2 coefficients are given (`.status-line` message:
  "Enter at least 2 coefficients (a degree-1 polynomial or higher), space- or
  comma-separated, highest degree first."). No KaTeX live-preview of the polynomial is
  required (there's no expression to parse), but do render the coefficients as a
  human-readable polynomial string (plain text is fine, e.g. `1x^3 - 6x^2 + 11x - 6`) so
  the user can visually confirm what they typed — a small pure JS string-builder function
  in this file, not a new `Engine` API.
- `math-lab/engines/numerical/methods/horners-method.html` — closest overall page
  skeleton is still `secant.html` (copy its `<head>`/header/footer/script-tag structure
  verbatim per §4 of shared conventions) but the input form's fields are custom (see §5)
  and there is no math keypad section (delete that block entirely — no keypad-toggle
  button, no `.math-keypad` div, don't call `Engine.attachMathKeypad`/
  `attachKeypadToggle` in the JS since there's no expression field to attach them to).

## 5. Inputs

- `coeffsInput` — text field, placeholder `"1, -6, 11, 11, -6"` example format, label
  "Coefficients (highest degree first)".
- `x0Input` — numeric field, starting guess for the first root.
- `tolInput`, `maxIterInput` — same pattern as every other page.
- `.status-line` — parses+validates the coefficient list live (debounced, same pattern as
  every other page's live validity check) and shows the human-readable polynomial string
  from §4 as confirmation.
- "Try Example": coefficients `"1, -6, 11, -6"`, `x0 = "0.5"`, `tol = "0.0000000001"`,
  `maxIter = "100"` (matches the pre-verified test case exactly).

## 6. Outputs

Result strip: **Roots found** (accent tile, comma-joined list of all roots via
`Engine.formatNum`), **Degree**, **Total Newton steps** (sum of every root's
`newtonIterations.length`).

Show a **synthetic-division table** for the specific evaluation at the *first* Newton
step of *each* root's search (or just the final converged evaluation per root — pick
whichever is simpler to wire correctly; the final-per-root version is simpler and still
pedagogically clear) — columns: coefficient index, original/working coefficient, `b[i]`
running value. One small table block per root found, in sequence, each preceded by a
one-line label like "Root 1: x ≈ 1.000000 — deflating to a degree-2 polynomial".

Plot: `p(x)` curve over a range spanning all found roots (padded), with each found root
marked on the x-axis, same visual language (curve color `#5c939f`, zero line dashed grey,
root markers colored `#ed6d40`) as every other root-finding page's plot — build the curve
by calling `Algorithms.hornerEval(originalCoeffs, x).value` at ~240 sample points across
the plot range (using the **original**, undeflated coefficients, so the full polynomial
shape is shown even though roots were found on progressively deflated versions).

Step slider: steps across the flat sequence of *all* Newton iterations across *all* roots
combined (i.e. `steps.flatMap(s => s.newtonIterations)`), highlighting which root's search
is currently active — simplest correct approach: concatenate every root's
`newtonIterations` into one combined table with a `root #` column, and slide through that
combined list exactly like every other page's step-through table, no special multi-stage
slider logic needed.

## 7. `methods.html` card (append to `PENDING-CARDS.md`, do not edit `methods.html`)

```html
<a href="methods/horners-method.html" class="card engine-card reveal crosshair-host" style="display:block; transition-delay:TODO">
  <span class="engine-dot"></span>
  <div class="engine-card-head">
    <span class="eyebrow">Root Finding</span>
    <span class="engine-index">TODO</span>
  </div>
  <h3 class="h3">Horner's Method &amp; Deflation</h3>
  <p>Evaluates a polynomial by nested multiplication in O(n), then finds every real root one at a time — Newton's method on each, deflating the polynomial after every root found.</p>
  <div class="method-tags" style="margin-top:16px;">
    <span class="tag">Coefficient list input</span>
    <span class="tag">Synthetic division table</span>
    <span class="tag">All-roots search</span>
  </div>
</a>
```

## 8. Acceptance criteria

All of §9 in the shared conventions doc, plus:
- `node tests/verify.js` passes, including both new cases.
- With the example inputs (`1, -6, 11, -6`, `x0=0.5`), the page finds roots `1`, `2`, `3`
  in that order.
- Entering fewer than 2 coefficients, or non-numeric text, shows the specific validation
  message rather than a crash or a blank result.
- No math keypad UI appears anywhere on this page — its absence is correct, not a missing
  feature.
