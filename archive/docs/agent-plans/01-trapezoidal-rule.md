# Build Plan — Trapezoidal Rule (Composite)

Roadmap ref: `CURRICULUM_ROADMAP.md` §1C.17, priority **P0** (next up, per
`FOUNDATION_CHECKLIST.md`'s explicit build order). Read
`docs/agent-plans/00-SHARED-CONVENTIONS.md` in full before starting — this plan assumes it.

## 1. What this method is

The composite Trapezoidal Rule approximates `∫[a,b] f(x) dx` by dividing `[a,b]` into
`n` equal subintervals of width `h = (b-a)/n` and summing the trapezoid area under each
`(f(x_{i-1}), f(x_i))` pair:

```
∫[a,b] f(x) dx ≈ (h/2) · Σ_{i=1}^{n} [ f(x_{i-1}) + f(x_i) ]
             = (h/2) · [ f(x_0) + 2·f(x_1) + 2·f(x_2) + ... + 2·f(x_{n-1}) + f(x_n) ]
```

where `x_i = a + i·h`. This is the first Tier-0 method that isn't root-finding or
interpolation — the "iterations" concept becomes "panels": each subinterval contributes
one trapezoid, and the step-through UI steps across panels left to right, showing the
running total accumulate.

Category/eyebrow for the hero and card: **"Integration"**.

## 2. `algorithms.js` — function to add

Add after `Algorithms.evalCubicSpline` (before the final `return Algorithms;`):

```js
// f: number -> number, composite trapezoidal rule on [a, b] with n equal subintervals
// (n >= 1). Returns one panel per subinterval plus the running cumulative total, so the
// UI can step through the sum being built one trapezoid at a time.
Algorithms.runTrapezoidal = function (f, a, b, n) {
  if (!Number.isInteger(n) || n < 1) throw new Error("n must be a positive integer.");
  const h = (b - a) / n;
  let xPrev = a, fPrev;
  try { fPrev = f(xPrev); } catch { throw new Error("f(x) could not be evaluated at x = a."); }
  if (!Number.isFinite(fPrev)) throw new Error("f(x) produced a non-finite value at x = a.");

  const panels = [];
  let running = 0;
  for (let i = 1; i <= n; i++) {
    const x = a + i * h;
    let fx;
    try { fx = f(x); } catch { throw new Error(`f(x) could not be evaluated at x = ${x}.`); }
    if (!Number.isFinite(fx)) throw new Error(`f(x) produced a non-finite value at x = ${x}.`);
    const panelArea = (h / 2) * (fPrev + fx);
    running += panelArea;
    panels.push({ i, x0: xPrev, x1: x, f0: fPrev, f1: fx, panelArea, running });
    xPrev = x;
    fPrev = fx;
  }
  return { h, panels, total: running };
};
```

Note the returned shape: `{ h, panels: [{i, x0, x1, f0, f1, panelArea, running}, ...], total }`.
`panels[panels.length - 1].running === total`. This exact shape is what the per-method JS
and the test cases below assume — don't change field names.

## 3. `tests/verify.js` — cases to add (pre-verified, use exactly)

Append both cases at the bottom of the file, before the final `console.log`/`process.exit`
lines:

```js
// Trapezoidal Rule: x^2 on [0,1], n=4 -> hand-computable exact value (h=0.25).
// h/2*[f0 + 2(f1+f2+f3) + f4] = 0.125*[0 + 2*(0.0625+0.25+0.5625) + 1] = 0.34375
{
  const { fn } = compile("x^2");
  const result = Algorithms.runTrapezoidal(fn, 0, 1, 4);
  approx(result.total, 0.34375, 1e-12, "Trapezoidal x^2 on [0,1], n=4 (exact)");
}

// Trapezoidal Rule: e^x on [0,1], n=1000 -> converges to e - 1 (true integral).
{
  const { fn } = compile("e^x");
  const result = Algorithms.runTrapezoidal(fn, 0, 1, 1000);
  approx(result.total, Math.E - 1, 1e-6, "Trapezoidal e^x on [0,1], n=1000 (converges to e-1)");
}
```

Both values were verified with `node -e` before writing this plan — do not alter them.
After adding these, `node tests/verify.js` must report **12 passed, 0 failed**.

## 4. Files to create

- `math-lab/assets/js/trapezoidal.js` — per-method DOM wiring, matching `secant.js`'s
  structure exactly (see §3 of the shared conventions doc).
- `math-lab/engines/numerical/methods/trapezoidal-rule.html` — copy the skeleton of
  `secant.html` exactly (see §4 of the shared conventions doc).

## 5. Inputs (the form panel)

- `f(x)` text field (id `fxInput`), live KaTeX preview (id `fxPreview`), math keypad —
  identical pattern to every existing method.
- `a` and `b` numeric fields, side by side in a `.field-row` (ids `aInput`, `bInput`).
  Default example: `a = 0`, `b = 1`.
- `n` (number of subintervals) numeric field, `type="number" step="1" min="1" max="2000"`
  (id `nInput`). Default example: `n = 10`. Note: unlike root-finding methods there is no
  tolerance — `n` is a direct, deterministic choice, not a convergence stop condition.
- A `.status-line` (id `startStatus`/`startStatusText`) that validates: `f(x)` compiles,
  `a`/`b`/`n` are numbers, `a !== b` (if `a > b`, that's fine mathematically — the rule
  still works with a negative-oriented interval — but surface a note in the status line
  that it will compute `∫[a,b]` with the sign that implies, don't silently swap them),
  and `n` is a positive integer within range.
- "Try Example" button: `f(x) = "e^x"`, `a = 0`, `b = 1`, `n = 10`.

## 6. Outputs (results panel)

Result strip stats (4 tiles, same `.result-stat` pattern; first one gets `accent`):
- **Estimate** (the `accent` tile) — `Engine.formatNum(result.total, 8)`.
- **Panels (n)** — the `n` used.
- **h (panel width)** — `Engine.formatNum(result.h, 6)`.
- **True value** — only computable when the example function has a known closed form;
  since `f(x)` is arbitrary user input in general, skip a "true value" stat and instead
  show **"Richardson estimate"**: compute `Algorithms.runTrapezoidal(fn, a, b, 2*n)` a
  second time in the per-method JS (this is just calling the pure function again with a
  different `n`, not duplicating math — see §1 of shared conventions) and show
  `|total(2n) - total(n)|` as **"Est. error"**, labelled with a tooltip-free note in the
  results copy that this is a practical step-doubling error estimate, not the analytic
  bound. (This foreshadows Romberg Integration, §1C.19, later in the backlog — no need to
  mention that to the user, just keep the field name generic: "Est. error".)

Formula block (`formula-block--reference`, `Engine.renderKatex(..., true)`):
```
\int_a^b f(x)\,dx \approx \frac{h}{2}\left[f(x_0) + 2\sum_{i=1}^{n-1} f(x_i) + f(x_n)\right]
```

Plot 1 — **"f(x) with trapezoid panels"** (`#fxPlot`, height 320px): the smooth curve of
`f(x)` over `[a,b]` (padded ~15% each side, same sampling approach as `secant.js`'s curve
trace, 240 points), plus **shaded trapezoid regions** for every panel. Plotly approach:
for each panel, add a `filled` scatter trace forming the trapezoid polygon — points
`(x0, 0) -> (x0, f0) -> (x1, f1) -> (x1, 0) -> (x0, 0)`, `fill: "toself"`,
`fillcolor: "rgba(92,147,159,0.18)"` (curve teal at low alpha), `line: {color:
"rgba(92,147,159,0.5)", width: 1}`, `hoverinfo: "skip"`, `showlegend: false` — add these
traces *before* the curve trace so the curve line draws on top. The step slider (see §8)
highlights the *current* panel's trapezoid at full opacity (`fillcolor:
"rgba(237,109,64,0.35)"`, `--infrared`/orange) via `Plotly.restyle` on that one trace
index, while the rest stay at the base teal alpha.

Plot 2 — **"Running total vs. panels included"** (`#errorPlot` — reuse the id/slot from
other pages' second plot for layout consistency, but this one is not an error-decay plot):
x-axis = panel index `i` (1..n), y-axis = `running` after each panel, `mode:
"lines+markers"`, same orange line style as the existing error-decay plots. This shows
the sum converging as panels accumulate — visually analogous to the error-decay plots on
root-finding pages, but showing convergence of the running sum instead of shrinking error.

Data table (`#iterTable` — reuse the id for consistency, or rename `#panelTable`, your
choice, just keep it consistent between the HTML and JS): columns `i`, `x_{i-1}`, `x_i`,
`f(x_{i-1})`, `f(x_i)`, `panel area`, `running total`. One `<tr data-n="${p.i}">` per
panel, same `Engine.formatNum` formatting as existing tables.

Step slider: `min=0`, `max=panels.length-1`, steps through panels; at each step,
highlight that row (`.is-current`) and that trapezoid in Plot 1 (see above).

## 7. `methods.html` — card to add

Insert as the 6th card (after Secant), category `"Integration"`, `transition-delay:.40s`:

```html
<a href="methods/trapezoidal-rule.html" class="card engine-card reveal crosshair-host" style="display:block; transition-delay:.40s">
  <span class="engine-dot"></span>
  <div class="engine-card-head">
    <span class="eyebrow">Integration</span>
    <span class="engine-index">6 / 7</span>
  </div>
  <h3 class="h3">Trapezoidal Rule</h3>
  <p>Approximates a definite integral by summing trapezoid areas across n subintervals — simple, always convergent, the base case for Romberg integration.</p>
  <div class="method-tags" style="margin-top:16px;">
    <span class="tag">f(x) + [a,b] + n</span>
    <span class="tag">Shaded panel plot</span>
    <span class="tag">Running-total table</span>
  </div>
</a>
```

Remember: update **all seven** cards' `.engine-index` to `X / 7` (this card and Simpson's
card together bring the total from 5 to 7 — coordinate with whichever agent/pass builds
`02-simpsons-rule.md` so the index numbers end up consistent and non-colliding; if built
in the same pass, Trapezoidal is 6/7 and Simpson's is 7/7).

## 8. Acceptance criteria

All of §9 in the shared conventions doc, plus:
- `node tests/verify.js` → 12 passed, 0 failed.
- Loading the page with the example inputs (`e^x`, `a=0`, `b=1`, `n=10`) and clicking
  Compute shows an estimate close to `e - 1 ≈ 1.71828` (within the panel count's expected
  accuracy, i.e. roughly matching `Algorithms.runTrapezoidal` computed at `n=10` — sanity
  check by comparing to a quick manual calculation, don't just eyeball it).
  Actual value should be `1.71971...` for n=10 — bigger n gets closer to `e-1`.
- Dragging the step slider to panel 1 highlights only the first (leftmost) trapezoid;
  dragging to the last panel highlights the rightmost.
