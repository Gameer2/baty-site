# Shared Conventions — Numerical Engine

Read this file completely before opening any per-method plan (`01-*.md`, `02-*.md`, ...).
Every rule here is copied verbatim from real, working files in this repo — not invented.
If anything in a per-method plan conflicts with this file, this file wins. If this file
conflicts with what you actually see in the referenced source files, **the source files
win** — always open them and confirm before writing code.

Repo root for all paths below: `math-lab/`.

## 1. The one hard rule

> One implementation, two callers.

All algorithm math lives in **`assets/js/algorithms.js`** as a pure, DOM-free function.
The per-method file (`assets/js/<method>.js`) only does DOM wiring — reading inputs,
calling the `Algorithms.run*` function, rendering the result. It must not reimplement
or duplicate any math. This is what lets `tests/verify.js` test the exact code the
browser ships, by `require()`-ing `algorithms.js` directly in Node.

Do not skip straight to writing HTML/JS. Build in this order every time:

1. Add the pure function to `algorithms.js`.
2. Add its test case(s) to `tests/verify.js`. Run `node tests/verify.js` — it must pass,
   and every pre-existing case must still pass (currently 10/10; check the count is
   `10 + N` after you add `N` new cases, with 0 failures).
3. Only after tests pass, write the method's `.html` page and `.js` wiring file.
4. Add the new method's card to `engines/numerical/methods.html`.

Step 2 before step 3 is not optional — it's the project's own stated discipline
(`FOUNDATION_CHECKLIST.md`): *"Before starting the next method, add its known-answer
case to `tests/verify.js` as part of the same commit, not after."*

## 2. `algorithms.js` — exact style to match

Open `math-lab/assets/js/algorithms.js` and read it before writing anything. Key points:

- UMD wrapper at top/bottom is already there — just add your function to the `Algorithms`
  object inside the factory, between the existing ones and the `return Algorithms;` line.
- One-line comment above each function stating its math signature in words, e.g.:
  `// f: number -> number, composite trapezoidal rule on [a,b] with n subintervals.`
- Validate inputs and `throw new Error("...")` with a specific, human-readable message —
  never fail silently or return `NaN`. Look at `runNewton`/`runSecant` for the pattern:
  check `Number.isFinite` after every function evaluation, wrap risky calls in
  `try { ... } catch { throw new Error("...") }`.
- Return a plain object or array of plain objects — never a class instance, never a
  DOM reference, never anything that isn't JSON-shaped. Root-finding methods return an
  array of per-iteration objects (`{n, ...}`); the cubic spline returns `{segments}`-shaped
  data via a plain array. Quadrature methods (trapezoidal, Simpson's) should return
  `{ h, panels: [...], total }` — see the per-method plans for exact shapes.
- No `console.log`, no global state, no reliance on `window`/`document` anywhere in this file.

## 3. Per-method JS file (`assets/js/<method>.js`) — exact style to match

Open `math-lab/assets/js/secant.js` in full and use it as your literal template — it is
the newest, most representative example. Structure (IIFE, `"use strict"`):

1. Grab all DOM elements by `getElementById`/`querySelector` at the top, once.
2. `updatePreview()` — renders the live KaTeX preview of the input expression via
   `Engine.renderKatex(previewEl, ..., false)` + `Engine.pulseFlash(previewEl)`.
3. A validity-check function (e.g. `updateStartCheck()`) that compiles the expression via
   `Engine.compileFx(...)`, validates the other numeric inputs, and writes a message into
   the `.status-line` element (`className = "status-line ok"` or `"status-line bad"`).
4. `Engine.debounce(...)` wraps preview+validity updates, attached to `input` listeners on
   the relevant fields.
5. An "example" button handler that fills in known-good sample values and re-validates.
6. `render(...)` — called on submit once computation succeeds. Shows `#resultsArea`, hides
   `#placeholderPanel`. Fills `.result-stat` values, the formula block (`Engine.renderKatex`
   with `displayMode=true`), the iteration/panel table body (template-literal `<tr>` rows,
   each with a `data-n="..."` attribute used later by the step slider), and builds the
   Plotly traces via `Plotly.newPlot(elementId, traces, Engine.plotlyBaseLayout({...}),
   Engine.plotlyConfig)`.
7. `updateStep(idx)` — called by the step-slider `input` handler and once at the end of
   `render()`. Updates the "current row" highlight (`.is-current` class toggle keyed by
   `data-n`) and uses `Plotly.restyle(...)` to move the per-step overlay traces (never
   `Plotly.newPlot` again here — restyle is cheap, newPlot is not).
8. `form.addEventListener("submit", ...)`: `e.preventDefault()`, re-validate everything,
   call the `Algorithms.run*` function inside a `try/catch`, call `showError(err.message)`
   on failure, else call `render(...)`.
9. At the bottom: `Engine.attachMathKeypad(...)`, `Engine.attachKeypadToggle(...)`, then
   an initial `updatePreview()` + validity check call so the page isn't blank on load.

Colors used across existing plots (keep consistent, don't invent new ones):
curve/base line `#5c939f` (teal), zero/reference dashed line `#7d858c` (grey), highlight/
current/accent `#ed6d40` (orange), light marker `#e7e7e7`. Reuse these unless a method
plan explicitly says otherwise.

## 4. HTML page — exact skeleton to copy

Open `math-lab/engines/numerical/methods/secant.html` in full and copy its structure
byte-for-byte, then adapt only: `<title>`, the `.eyebrow`/`<h1>`/`.method-summary` hero
copy, the input `.field`s (per the method's actual inputs), the results panel contents
(stat tiles, formula, plot(s), table columns), and the script tag for the per-method JS
file. Do **not** invent new class names, new panel structures, or new page sections —
every visual element must be built from classes that already exist in `assets/css/engine.css`
and already appear in one of the five built method pages.

Fixed structure, in order:
- `<head>`: `katex.min.css`, `engine.css` (relative paths `../../../assets/...` from
  `engines/numerical/methods/*.html`).
- `<header class="site-header">` — copy verbatim from `secant.html`, only the page's own
  logo link target changes if needed (it doesn't, for numerical-engine method pages).
- `<section class="method-hero">` — `.eyebrow` (category tag, e.g. "Quadrature" /
  "Integration" — pick something short and accurate), `<h1 class="h2">` title,
  `<p class="method-summary">` with the formula inline as `<span class="mono">...</span>`.
- `<section class="section--tight">` → `.container` → `.workspace` → two children:
  - **Input**: `<form class="panel crosshair-host" id="...Form">` with `.panel-title`,
    `.field` blocks, `.field-row` for paired numeric inputs, `.status-line`, a hidden
    `.field#formError`, `.hero-actions` with `btn--primary` "Compute" + `btn--ghost btn--sm`
    "Try Example".
  - **Output**: `#placeholderPanel` (visible by default) + `#resultsArea` (`display:none`
    until compute) containing `.result-strip` of `.result-stat` tiles (exactly one gets
    class `accent`), a `.formula-block.formula-block--reference`, one or more
    `.plot-wrap.crosshair-host` divs (each with a `.plot-wrap-head` label + a plain `<div>`
    with a fixed `height` for Plotly), a `.data-table-wrap > table.data-table`, and a
    step-through `.panel.crosshair-host` with `input[type=range]#stepSlider` +
    `.step-label#stepLabel`.
- `<footer class="site-footer">` — copy verbatim.
- Script tags, in this exact order, all `defer`: `gsap.min.js`, `math.min.js`,
  `katex.min.js`, `plotly-cartesian.min.js`, then `engine-core.js`, `algorithms.js`, then the
  method's own `<method>.js`, then an inline `<script defer>` calling
  `Engine.initChrome()` on `DOMContentLoaded`.
  - **Use `plotly-cartesian.min.js` (1,391 KB), never `plotly.min.js`.** The full 4,451 KB
    bundle was deleted on 2026-07-22 and no longer exists. The cartesian bundle carries every
    trace type this site uses in 2-D — `scatter`, `bar`, `histogram`, `box` — plus
    `heatmap`/`contour` for planned PDE and Number Theory work.
  - **For anything 3-D, do not reach for Plotly at all.** `scatter3d` and `surface` live only in
    the deleted full bundle. Load `three.min.js` + `assets/js/calculus-3d.js` and draw with
    `Scene3D`, as the Calculus, Linear Algebra, and Statistics engines all now do.
  - See `../../../archive/docs/engine-plans/ARCHITECTURE_AUDIT.md` §1.1 for the measurements
    behind both rules (archived 2026-08-02 as a superseded point-in-time snapshot, but §1.1's
    Plotly/three.js measurements are still the reasoning for this rule).

## 5. `engine-core.js` API you're allowed to call (don't reimplement any of this)

- `Engine.initChrome()` — call once, on DOMContentLoaded. Injects button glow/duplicate-
  text spans and crosshair corner marks; wires header scroll state and scroll-reveal.
- `Engine.compileFx(exprStr, variable = "x")` → `{ ok, fn, node, error }`. Use this for
  every user-entered expression. `fn` throws if evaluated outside its domain.
- `Engine.derivativeFx(node, variable = "x")` → `{ ok, fn, node, latex }`. Only needed if
  a method requires a symbolic derivative (most quadrature/interpolation methods don't).
- `Engine.toLatex(exprStr)` → string, for the raw live-typing preview.
- `Engine.renderKatex(el, latexString, displayMode)` — renders into `el`.
- `Engine.pulseFlash(el)` — brief highlight animation, call after updating a preview.
- `Engine.debounce(fn, waitMs = 250)`.
- `Engine.formatNum(x, decimals = 6)` — use for every displayed numeric value; handles
  `NaN`/exponential formatting consistently. Never call `.toFixed()` directly in a
  per-method file.
- `Engine.plotlyBaseLayout(overrides)` / `Engine.plotlyConfig` — always pass every Plotly
  layout through `plotlyBaseLayout`, never build a layout object from scratch.
- `Engine.attachMathKeypad(inputEl, containerEl)` / `Engine.attachKeypadToggle(toggleEl, panelEl)`
  — wire onto any `f(x)`-style text input, matching the markup pattern in §4.

## 6. `tests/verify.js` — exact pattern to match

Open `math-lab/tests/verify.js` in full. Each case is a `{ ... }` block:

```js
// <Method name>: <short description of the case> -> <expected result, in words>
{
  const { fn } = compile("<expression string, math.js syntax>");
  const result = Algorithms.run<Method>(fn, /* ...args... */);
  approx(<actual value extracted from result>, <expected number>, <tolerance>, "<label>");
}
```

- Prefer **hand-computable exact values** over "converges to roughly X" where possible —
  see the per-method plans for pre-verified exact test cases; use them as given, don't
  recompute by hand (they've already been checked with `node -e`).
  Where an exact hand-computed value isn't practical, use a tight tolerance against the
  true closed-form answer (e.g. `1e-6` or tighter) rather than a loose one.
- Add a **cross-check** case where one naturally exists — e.g. two different integration
  methods converging to the same known integral. The per-method plans call these out.
- `compile(exprStr)` and `derivativeOf(node)` helpers already exist at the top of the
  file — reuse them, don't redefine.
- Append new cases at the bottom, right before the final `console.log(pass/fail)` summary
  block — don't insert in the middle of existing cases.
- Run `node tests/verify.js` from the repo root (`math-lab/../` i.e. project root, or
  `cd math-lab && node tests/verify.js` — check which the existing test file assumes by
  looking at its `require(path.join(__dirname, ...))` calls, which are `__dirname`-relative
  so either invocation directory works).

## 7. `engines/numerical/methods.html` — adding a new card

Open the file and copy one `<a class="card engine-card reveal crosshair-host" ...>` block
verbatim as your template. You must:

- Update **every** card's `.engine-index` span (e.g. `4 / 5` → `4 / 7`) to the new total
  method count — not just add the new card with a fresh index.
- Give the new card an incrementing `transition-delay` in its inline `style`, following
  the existing `+.08s` per-card pattern (5th card is `.32s`, so a 6th is `.40s`, 7th `.48s`).
- Pick an accurate `.eyebrow` category (existing values: "Root Finding", "Interpolation" —
  quadrature/integration methods should use something like "Integration").
- Write a one-sentence `<p>` description in the same terse, technical voice as the
  existing four, and 2-3 `.tag` spans summarizing inputs/outputs (see existing cards for
  the pattern, e.g. `<span class="tag">f(x) + interval</span>`).
- `href` points to `methods/<kebab-case-filename>.html`.

## 8. Design system rules (from `DESIGN_SYSTEM.md`, project root)

- Dark background only (`--core-black`), never a light section — this is already
  guaranteed if you copy the existing page skeleton and don't add new backgrounds.
- Never hardcode a hex color for anything that should track the engine's accent — the
  numerical engine's single accent variable is already set once, sitewide, don't
  re-declare it per page.
- Typography is not a per-page choice: headings use the serif class (`.h1`/`.h2`/card
  `<h3>`) automatically, UI chrome/data/numbers use `.mono` or inherit monospace from
  `.data-table`/`.result-stat` — don't manually pick fonts.
- Never hand-write the decorative glow/duplicate-text/crosshair-corner markup —
  `Engine.initChrome()` injects all of it automatically into any `.btn` or
  `.crosshair-host` element. Just use those class names.
- Sliders, "current step" table-row highlighting, and primary CTAs always use the fixed
  `--infrared` accent (not the per-engine teal accent) — this happens automatically via
  existing CSS classes (`.is-current`, `input[type=range]`, `.btn--primary`); don't
  override it.

## 9. Definition of done (every method)

A method is finished when **all** of the following are true:

1. `algorithms.js` has the new pure function, following §2.
2. `tests/verify.js` has the new case(s) from the per-method plan (exact values, don't
   substitute your own), and `node tests/verify.js` reports **0 failed** with the passed
   count increased by exactly the number of new cases added.
3. The method's `.html` page exists at the path given in its plan, matches the skeleton
   in §4, and its per-method `.js` file matches the wiring pattern in §3.
4. Opening the page in a browser: the placeholder shows first, "Try Example" fills valid
   inputs, "Compute" produces the results panel with correct-looking plot(s), a filled
   table, and correct stat values (spot-check against the test-case numbers from the plan
   — they should match what the UI displays for the same inputs).
5. The step slider moves through every row/panel and the table highlight + plot overlay
   track it correctly.
6. `engines/numerical/methods.html` has the new card, with all `.engine-index` values
   updated.
7. No console errors in the browser dev tools when loading the page or computing.

Do not mark a method "done" if only some of these are true — a page that renders but
whose numbers don't match the verified test case is not done, it's a bug.

## 10. Addendum — multiple methods being built in parallel by different agents

Once more than one method is in flight at once (e.g. a GLM track and a Qwen track
building different methods concurrently), **do not edit `engines/numerical/methods.html`
as part of an individual method's build**. Every build agent editing that shared file at
the same time is a guaranteed merge conflict. Instead:

- Build and verify everything else for your method per §9 (algorithms.js, tests, HTML
  page, per-method JS) — just skip the `methods.html` card step even if your plan file's
  §7 describes it.
- Append your method's card block (the exact HTML snippet from your plan's §7, minus any
  `.engine-index`/`transition-delay` values — leave those as `TODO`) to
  `math-lab/docs/agent-plans/PENDING-CARDS.md` (create it if it doesn't exist yet — plain
  markdown, one fenced code block per method, in the order you completed them).
- A single consolidation pass — done once, after a batch of methods is verified — reads
  `PENDING-CARDS.md`, inserts every card into `methods.html` in one edit, and fixes every
  card's `.engine-index` and `transition-delay` to match the final total count. Don't do
  this yourself mid-batch; wait to be told the consolidation pass is happening.
