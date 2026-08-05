# Build Plan — Simpson's Rule (1/3 and 3/8, composite)

Roadmap ref: `CURRICULUM_ROADMAP.md` §1C.18, priority **P0** (next up, immediately after
Trapezoidal Rule, per `FOUNDATION_CHECKLIST.md`'s explicit build order). Read
`docs/agent-plans/00-SHARED-CONVENTIONS.md` in full before starting — this plan assumes
it. If `01-trapezoidal-rule.md` has already been built, skim it too — this page reuses
its "panel"/step-through concept and its plot-shading idea, adapted to parabolic (not
straight) segments.

## 1. What this method is

Simpson's Rule fits a quadratic (1/3 rule) or cubic (3/8 rule) through consecutive nodes
and integrates that polynomial exactly, instead of the straight line the Trapezoidal Rule
uses. Both variants are exact for cubic polynomials (a well-known, load-bearing fact —
use it directly in the test cases below).

**Simpson's 1/3 rule** groups nodes in pairs of subintervals (3 nodes per group), requires
an even number of subintervals `n`:

```
∫[x0,x2] f(x) dx ≈ (h/3)·[f(x0) + 4f(x1) + f(x2)]
```

**Simpson's 3/8 rule** groups nodes in triples of subintervals (4 nodes per group),
requires `n` divisible by 3:

```
∫[x0,x3] f(x) dx ≈ (3h/8)·[f(x0) + 3f(x1) + 3f(x2) + f(x3)]
```

**Composite / auto mode**: for a general `n`, chain 1/3-rule groups across pairs of
subintervals. If `n` is odd (can't be split into pairs cleanly), use one 3/8-rule group
for the *last three* subintervals and 1/3-rule groups for the rest (always possible since
`n` odd ⟹ `n - 3` even, given `n >= 3`).

Category/eyebrow for the hero and card: **"Integration"**.

## 2. `algorithms.js` — function to add

Add after `Algorithms.runTrapezoidal` (see `01-trapezoidal-rule.md`; if that hasn't been
built yet, add after `Algorithms.evalCubicSpline` instead — either way, just before the
final `return Algorithms;`):

```js
// f: number -> number, composite Simpson's rule on [a, b] with n subintervals.
// mode: "13" (pure 1/3 rule, n must be even), "38" (pure 3/8 rule, n must be a multiple
// of 3), or "auto" (chains 1/3-rule groups, absorbing the last 3 subintervals into one
// 3/8-rule group when n is odd). Returns one entry per rule-application group.
Algorithms.runSimpson = function (f, a, b, n, mode) {
  mode = mode || "auto";
  if (!Number.isInteger(n) || n < 2) throw new Error("n must be an integer >= 2.");
  if (mode === "13" && n % 2 !== 0) throw new Error("Simpson's 1/3 rule requires an even number of subintervals.");
  if (mode === "38" && n % 3 !== 0) throw new Error("Simpson's 3/8 rule requires n to be a multiple of 3.");
  if (mode === "auto" && n % 2 !== 0 && n < 3) throw new Error("n must be >= 3 when odd (a 3/8 group needs 3 subintervals).");

  const h = (b - a) / n;
  const X = new Array(n + 1), F = new Array(n + 1);
  for (let i = 0; i <= n; i++) {
    X[i] = a + i * h;
    let fx;
    try { fx = f(X[i]); } catch { throw new Error(`f(x) could not be evaluated at x = ${X[i]}.`); }
    if (!Number.isFinite(fx)) throw new Error(`f(x) produced a non-finite value at x = ${X[i]}.`);
    F[i] = fx;
  }

  const groups = [];
  let i = 0;
  if (mode === "38") {
    while (i < n) { groups.push({ type: "3/8", idx: [i, i + 1, i + 2, i + 3] }); i += 3; }
  } else if (mode === "13") {
    while (i < n) { groups.push({ type: "1/3", idx: [i, i + 1, i + 2] }); i += 2; }
  } else {
    const use38Tail = n % 2 !== 0;
    const limit = use38Tail ? n - 3 : n;
    while (i < limit) { groups.push({ type: "1/3", idx: [i, i + 1, i + 2] }); i += 2; }
    if (use38Tail) groups.push({ type: "3/8", idx: [n - 3, n - 2, n - 1, n] });
  }

  let running = 0;
  const panels = groups.map((g, gi) => {
    let area;
    if (g.type === "1/3") {
      const [i0, i1, i2] = g.idx;
      area = (h / 3) * (F[i0] + 4 * F[i1] + F[i2]);
    } else {
      const [i0, i1, i2, i3] = g.idx;
      area = ((3 * h) / 8) * (F[i0] + 3 * F[i1] + 3 * F[i2] + F[i3]);
    }
    running += area;
    return {
      g: gi + 1,
      type: g.type,
      x0: X[g.idx[0]],
      x1: X[g.idx[g.idx.length - 1]],
      nodesX: g.idx.map((k) => X[k]),
      nodesF: g.idx.map((k) => F[k]),
      panelArea: area,
      running,
    };
  });

  return { h, mode, panels, total: running };
};
```

Returned shape: `{ h, mode, panels: [{g, type, x0, x1, nodesX, nodesF, panelArea,
running}, ...], total }`. Don't change field names — the test cases and JS wiring below
assume this exact shape.

## 3. `tests/verify.js` — cases to add (pre-verified, use exactly)

All three values were verified with `node -e` before writing this plan — Simpson's rule
is exact for cubic (and lower-degree) polynomials, which is why these are exact rather
than approximate. Do not alter the numbers.

```js
// Simpson's 1/3 Rule: x^2 on [0,1], n=4 -> exact (Simpson's is exact through cubics).
{
  const { fn } = compile("x^2");
  const result = Algorithms.runSimpson(fn, 0, 1, 4, "13");
  approx(result.total, 1 / 3, 1e-12, "Simpson's 1/3 rule, x^2 on [0,1], n=4 (exact)");
}

// Simpson's 3/8 Rule: x^3 on [0,1], n=3 -> exact.
{
  const { fn } = compile("x^3");
  const result = Algorithms.runSimpson(fn, 0, 1, 3, "38");
  approx(result.total, 0.25, 1e-12, "Simpson's 3/8 rule, x^3 on [0,1], n=3 (exact)");
}

// Simpson's auto mode: x^3 on [0,1], n=5 (odd) -> hybrid of one 1/3 group + one 3/8
// tail group, still exact since both rules are exact for cubics regardless of grouping.
{
  const { fn } = compile("x^3");
  const result = Algorithms.runSimpson(fn, 0, 1, 5, "auto");
  approx(result.total, 0.25, 1e-9, "Simpson's auto mode (hybrid), x^3 on [0,1], n=5 (exact)");
  approx(result.panels.length, 2, 0.5, "Simpson's auto mode, n=5 produces 2 groups (one 1/3 + one 3/8)");
}
```

After adding these (on top of the two Trapezoidal cases from `01-trapezoidal-rule.md`, if
already built), `node tests/verify.js` must report **15 passed, 0 failed**. If Trapezoidal
hasn't been built yet, it'll be **13 passed, 0 failed**.

## 4. Files to create

- `math-lab/assets/js/simpson.js` — per-method DOM wiring, matching `secant.js`'s
  structure (see §3 of the shared conventions doc).
- `math-lab/engines/numerical/methods/simpsons-rule.html` — copy the skeleton of
  `secant.html` exactly (see §4 of the shared conventions doc).

## 5. Inputs (the form panel)

- `f(x)` field + preview + keypad (standard pattern).
- `a`, `b` numeric fields in a `.field-row`. Default example: `a = 0`, `b = 1`.
- `n` (number of subintervals) numeric field, `type="number" step="1" min="2" max="2000"`.
  Default example: `n = 6`.
- A **rule-mode toggle**, matching the pattern the Lagrange page already uses for its
  Lagrange/Spline toggle (open `lagrange-interpolation.html`/`lagrange.js` briefly to copy
  that exact toggle markup/behavior instead of inventing new toggle UI). Three options:
  **Auto** (default — hybrid, works for any `n >= 2`), **1/3 only** (disabled/flagged
  invalid if `n` is odd), **3/8 only** (disabled/flagged invalid if `n % 3 !== 0`).
- `.status-line` validating: `f(x)` compiles, `a`/`b`/`n` numeric, `n` satisfies the
  chosen mode's divisibility requirement (surface the specific reason, e.g. "1/3 rule
  needs an even n — try n=6" rather than a generic error).
- "Try Example": `f(x) = "sin(x)"`, `a = 0`, `b = "pi"` (or the decimal `3.14159265358979`
  if the `a`/`b` inputs are plain `type="number"` fields that can't parse `pi` — check
  how `x0`/`x1`/`a`/`b` fields are typed on other pages; if they're `type="number"`, use
  the decimal literal), `n = 6`, mode = Auto.

## 6. Outputs (results panel)

Result strip (4 tiles, first `accent`):
- **Estimate** (`accent`) — `Engine.formatNum(result.total, 8)`.
- **Groups** — `result.panels.length`.
- **h (subinterval width)** — `Engine.formatNum(result.h, 6)`.
- **Est. error** — same step-doubling idea as the Trapezoidal plan: call
  `Algorithms.runSimpson(fn, a, b, n even-adjusted*2, mode)` at double resolution and show
  `|total(2n) - total(n)|`. Since doubling `n` must still satisfy the active mode's
  divisibility rule, doubling always preserves evenness/multiple-of-3-ness automatically
  (2n is even if n is anything; 2n is a multiple of 3 iff n is) — for `"38"` mode, if `n`
  isn't a multiple of 3 this can't be reached anyway since the form already rejects that
  input, so no extra guard is needed here beyond what's already validated.

Formula block — show whichever formula matches the *active mode* (update it on
toggle/compute, don't show both at once):
- 1/3: `\int_{x_0}^{x_2} f(x)\,dx \approx \frac{h}{3}\left[f(x_0) + 4f(x_1) + f(x_2)\right]`
- 3/8: `\int_{x_0}^{x_3} f(x)\,dx \approx \frac{3h}{8}\left[f(x_0) + 3f(x_1) + 3f(x_2) + f(x_3)\right]`
- auto: show the 1/3 formula with a small note (plain text under the formula block, not
  KaTeX) — "last group uses the 3/8 rule when n is odd."

Plot 1 — **"f(x) with parabolic-fit panels"** (`#fxPlot`, height 320px): base curve of
`f(x)` (240-sample line, same padding/sampling approach as other pages), plus a **shaded
region per group** showing the actual interpolating polynomial (not a straight line like
Trapezoidal) between that group's nodes. To draw this without a full symbolic polynomial
solve: for a 1/3 group, evaluate the unique quadratic through
`(x0,f0),(x1,f1),(x2,f2)` at ~20 sample points across `[x0,x2]` using direct Lagrange
evaluation (3-point Lagrange formula, computed inline — this is presentation code, not a
core algorithm, so it's fine to compute directly in the per-method JS rather than adding
it to `algorithms.js`); for a 3/8 group, same idea with the 4-point Lagrange formula
through its 4 nodes. Fill from that curve down to `y=0` (`fill: "tonexty"` or `"toself"`
with a matching zero-baseline trace), teal at low alpha for non-current groups, orange
(`--infrared`, `rgba(237,109,64,0.35)`) for the current step's group — same
current/base color pattern as the Trapezoidal plan.

Plot 2 — **"Running total vs. groups included"**: x-axis = group index `g`, y-axis =
`running`, `lines+markers`, orange line — identical pattern to the Trapezoidal plan's
second plot.

Data table: columns `group #`, `type` (1/3 or 3/8), `x range`, `nodes (x)`, `nodes f(x)`,
`group area`, `running total`. One row per `panels[i]`, `data-n="${p.g}"`.

Step slider: steps across `panels` by group index, highlighting the current row and the
current group's shaded region in Plot 1, matching the Trapezoidal plan's step behavior.

## 7. `methods.html` — card to add

Insert as the 7th card (after Trapezoidal Rule, if built in the same pass — otherwise 6th;
adjust the index numbers on **every** card to match the actual final total either way),
category `"Integration"`:

```html
<a href="methods/simpsons-rule.html" class="card engine-card reveal crosshair-host" style="display:block; transition-delay:.48s">
  <span class="engine-dot"></span>
  <div class="engine-card-head">
    <span class="eyebrow">Integration</span>
    <span class="engine-index">7 / 7</span>
  </div>
  <h3 class="h3">Simpson's Rule</h3>
  <p>Fits a parabola (1/3 rule) or cubic (3/8 rule) through each group of nodes instead of a straight line — exact for cubics, converges far faster than the Trapezoidal Rule.</p>
  <div class="method-tags" style="margin-top:16px;">
    <span class="tag">f(x) + [a,b] + n</span>
    <span class="tag">1/3 &amp; 3/8 toggle</span>
    <span class="tag">Parabolic-fit plot</span>
  </div>
</a>
```

## 8. Acceptance criteria

All of §9 in the shared conventions doc, plus:
- `node tests/verify.js` → all cases pass (15 total if Trapezoidal already built, 13 if not).
- With the example inputs (`sin(x)`, `a=0`, `b=π`, `n=6`, Auto mode) the estimate should
  be very close to the true value `2` (the true integral of `sin(x)` from `0` to `π` is
  exactly 2) — noticeably more accurate than Trapezoidal would be at the same `n`, which
  is the whole pedagogical point of this page; the results copy should say so.
- Switching the mode toggle to "1/3 only" with an odd `n` shows a validation error instead
  of silently computing something wrong.
- Switching to "3/8 only" with `n` not a multiple of 3 shows a validation error.
