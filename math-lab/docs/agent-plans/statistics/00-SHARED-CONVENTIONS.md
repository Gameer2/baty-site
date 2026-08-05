# Shared Conventions — Statistics Engine

Read this completely before opening any other plan in this directory. This file only
states what's *different* from (or an addition to) the numerical engine's
`docs/agent-plans/00-SHARED-CONVENTIONS.md` — read that one too, all of its rules apply
here except where this file overrides them (§0). If anything here conflicts with what you
actually see in the referenced source files, **the source files win** — open and confirm
before writing code.

Repo root for all paths below: `math-lab/`.

## 0. What's different from the numerical engine's conventions

- Math lives in **`assets/js/stats-algorithms.js`** (`StatsAlgorithms` object), not
  `algorithms.js` (`Algorithms` — that file belongs to the numerical engine only).
- Tests live in **`tests/verify-statistics.js`**, a separate suite/process, not appended to
  `tests/verify.js`.
- The per-engine accent color is already set (`engines/statistics/index.html`'s
  `<style>:root{ --electric-teal:#c99a3c; }</style>`) — reuse it, don't re-declare.
- No new CSS is needed for histograms, box plots, PDF/CDF shaded-area plots, or bar charts
  of a PMF — Plotly's native `histogram`, `box`, and `bar` trace types draw directly onto
  the existing `.plot-wrap` canvas. Don't invent HTML/CSS chart scaffolding.

## 1. The one hard rule (unchanged)

> One implementation, two callers.

All statistics math lives in **`assets/js/stats-algorithms.js`** as pure, DOM-free
functions. The per-method file (`assets/js/<method>.js`) only does DOM wiring. Build order,
every time:

1. Add the pure function to `stats-algorithms.js`.
2. Add its test case(s) to `tests/verify-statistics.js`. Run
   `node tests/verify-statistics.js` — it must pass, every pre-existing case must still
   pass, and the passed count must increase by exactly the number of new cases.
3. Only after tests pass, write the method's `.html` page and `.js` wiring file.
4. Add the new method's card to `engines/statistics/methods.html` (only once the
   restructuring pass, `00-RESTRUCTURE-hub-migration.md`, has created that file — until
   then there is no hub page to add a card to).

## 2. `stats-algorithms.js` — structure and style

Same UMD-wrapper/style rules as `algorithms.js` (§2 of the numerical conventions): one-line
comment above each function stating its signature in words, `throw new Error("...")` with
a specific message for invalid input (never return `NaN` or fail silently), return a plain
object/array — never a class instance or DOM reference, no `console.log`, no
`window`/`document` reference anywhere in this file.

Statistics-specific additions:

- **Data parsing is not this file's job.** Parsing a pasted textarea of numbers into a
  `number[]` (splitting on `/[\s,]+/`, filtering `NaN`) is DOM-input handling and belongs in
  the per-method `.js` file, exactly where it already lives in the current
  `engines/statistics/index.html` prototype (`parseData`/`parsePairs`) — just move it
  verbatim into whichever new per-method `.js` file needs it, don't promote it into
  `stats-algorithms.js`.
- **Every function takes already-parsed numeric arrays**, e.g.
  `StatsAlgorithms.descriptiveStats(data)`, `StatsAlgorithms.runOneSampleTTest(data, mu0)`.
- **Shared low-level math, exposed for reuse, not hidden as a closure.** The current
  prototype's `lgamma`, `betacf`, `betai` (regularized incomplete beta — used for the
  t-distribution CDF) are presently private functions inside an inline `<script>`. The
  restructuring pass promotes them to `StatsAlgorithms.lgamma`, `StatsAlgorithms.betacf`,
  `StatsAlgorithms.betai`, plus `StatsAlgorithms.tCDF(t, df)` wrapping
  `betai(df/2, 0.5, df/(df+t*t))` the same way the existing `tTwoTailP` does. Confidence
  Intervals (`03-confidence-intervals.md`) needs these exact functions to invert the CDF
  via bisection — don't reimplement a second copy.
- **Distributions get a consistent three-function shape**: for any distribution added
  (binomial, normal, etc.), expose `pmf`/`pdf`, `cdf`, and where a plan calls for it,
  a bisection-based `quantile` (inverse CDF) — see `03-confidence-intervals.md` §2 for the
  exact bisection pattern (`tCritical`, `zCritical`, `chiCritical`) to copy for any later
  distribution's quantile function.
- **Simulations (CLT, bootstrap, etc.) take an injected RNG, never call `Math.random()`
  directly.** This is what makes them testable — see `02-sampling-distributions-clt.md`'s
  `mulberry32` seeded generator. A function signature like
  `StatsAlgorithms.sampleMeans(draw, n, numSamples)` takes a `draw()` function (a closure
  over a seeded RNG, built in the per-method `.js` file for real usage or in the test file
  with a fixed seed) — `stats-algorithms.js` itself never seeds or owns randomness state.

## 3. Per-method JS file (`assets/js/<method>.js`) — same shape as the numerical engine

Same 9-point structure as §3 of the numerical conventions (grab DOM elements once, a
`render()` shown on submit, `Engine.debounce` on input listeners, an "example" button,
`Engine.formatNum` for every displayed number, never `.toFixed()` directly). Differences:

- Most statistics inputs are a pasted data textarea, not a single `f(x)` expression — there
  is usually no `Engine.compileFx`/KaTeX-live-preview/math-keypad step for the *data* input
  (keep those only for pages that do take a function, e.g. a continuous-distribution PDF
  parameter isn't a free-form expression — it's a labeled numeric field like "mean" or
  "rate", a plain `<input type="number">`, no keypad).
- Validity checks are about the *data*, not an expression: at least N values entered
  (N depends on the method — 2 for a t-test, 1 for descriptive stats, etc.), values parse
  as finite numbers, and any method-specific constraint (e.g. a proportion's count of
  successes can't exceed its sample size).
- Colors: reuse the engine's own accent, `#c99a3c` (teal-gold), for the primary
  data/curve/bar trace — this is the statistics engine's already-set
  `--electric-teal`, distinct from the numerical engine's `#5c939f`. Keep `#ed6d40`
  (`--infrared`, orange) for the highlighted/current/reference element (a null-hypothesis
  line, the current step in a step-through, a shaded critical region) — same role it plays
  sitewide, per §8 of the numerical conventions' design-system rules.

## 4. HTML page — same skeleton as the numerical engine

Once the restructuring pass exists, copy `engines/numerical/methods/secant.html`'s
structure exactly, adapting only content — same header/hero/workspace/footer/script-tag
order as §4 of the numerical conventions. Two path differences: script tags load
`stats-algorithms.js` instead of `algorithms.js` (statistics method pages don't need
`math.min.js` unless a plan specifically asks for a free-form expression input — most
don't), and individual method pages under `engines/statistics/methods/*.html` use the
simplified two-link header nav (`Methods` / `All Engines`) exactly like
`engines/numerical/methods/bisection.html`'s header — not the full seven-engine nav list.
The hub page itself, `engines/statistics/methods.html`, keeps the full cross-engine nav
(copy it from `engines/numerical/methods.html`'s header verbatim, changing only the logo
label and active-engine styling).

New chart types this engine needs that the numerical engine's pages never used — all
native Plotly trace types, no new markup:

- **Histogram**: `{ x: data, type: "histogram", marker: { color: "rgba(201,154,60,0.5)",
  line: { color: "#c99a3c", width: 1 } } }` — already used exactly this way in the current
  t-test prototype; keep this styling.
- **Box plot**: `{ y: data, type: "box", marker: { color: "#c99a3c" }, boxpoints: "all" }`.
- **PMF/PDF bar or line**: discrete distributions use `type: "bar"`; continuous
  distributions use `mode: "lines"` with a `fill: "tozeroy"` trace for the shaded
  `P(a < X < b)` region (same "filled polygon under/between the curve" idea the trapezoidal
  rule's panel plot already established — reuse that technique, don't invent a new one).

## 5. `engine-core.js` API (unchanged)

Same functions available, same rules — see §5 of the numerical conventions. `Engine.compileFx`
is only needed on the rare statistics page that takes a free-form function (none of the P0
plans in this directory need it).

## 6. `tests/verify-statistics.js` — new file, same pattern as `tests/verify.js`

Create this file (the restructuring pass creates it) with the identical harness as
`tests/verify.js` (`approx()`, header comment, `pass`/`fail` counters, final
`console.log`/`process.exit`), except:

- `require(path.join(__dirname, "..", "assets", "js", "stats-algorithms.js"))` instead of
  `algorithms.js`.
- No `math.min.js` require or `compile()` helper needed unless a later plan specifically
  requires evaluating a free-form expression (none of the P0 plans do — drop `compile`/
  `derivativeOf` from the copy if unused, don't carry over dead code).
- Header comment: `"Statistics Engine — verification suite. ... Run with: node
  tests/verify-statistics.js"`.

Numeric-value discipline is identical to the numerical engine's: prefer hand-computable
exact values (mean/variance/quantiles of a small hand-picked dataset); where an exact value
isn't practical (a bisection-inverted critical value, a seeded random simulation), use a
pre-verified `node -e` result with a tight tolerance appropriate to how the value was
produced (deterministic bisection → `1e-6`–`1e-9`; deterministic-seed simulation compared
to its own exact re-run → very tight; simulation compared to the *theoretical* population
value → a loose sanity tolerance, since that comparison is inherently approximate — the
per-plan test sections spell out which is which, don't loosen a tolerance because a test
fails without understanding why first).

## 7. `engines/statistics/methods.html` — adding a new card (once it exists)

Same rules as §7 of the numerical conventions: copy an existing card block, update every
card's `.engine-index`, give the new card the next `transition-delay` (+.08s per card),
pick an accurate `.eyebrow` category (suggested categories for this engine: "Descriptive
Statistics", "Probability", "Sampling & Inference", "Regression"), one-sentence
description, 2-3 `.tag` spans, `href` to `methods/<kebab-case-name>.html`.

## 8. Design system rules (unchanged)

Same as §8 of the numerical conventions — dark background only, never hardcode a color that
should track the engine accent, headings use the serif classes automatically, never
hand-write the glow/crosshair decoration markup (`Engine.initChrome()` injects it), sliders
and primary CTAs always use `--infrared` regardless of engine.

## 9. Definition of done (every method) — same as numerical engine's §9, plus

1-7 unchanged (pure function in `stats-algorithms.js`; test cases added and
`node tests/verify-statistics.js` reports 0 failed with the exact expected new-case count;
HTML page matches the skeleton; browser check of placeholder → Try Example → Compute →
correct numbers; any step-through/slider tracks correctly; `methods.html` card added with
indices updated; no console errors). One statistics-specific addition:

8. If the method reports a p-value, confidence interval, or critical value, the plan's
   pre-verified number must match a standard textbook table value (not just an internally
   self-consistent computation) within the stated tolerance — cite which table value in
   the plan, and confirm the built page displays a number that agrees with it for the same
   inputs.

## 10. Parallel-build addendum (unchanged)

Same as §10 of the numerical conventions: once more than one statistics method is in
flight, don't let each build agent edit `engines/statistics/methods.html` directly — append
each finished card to `docs/agent-plans/PENDING-CARDS.md` (the existing file, shared across
engines — add a `## Statistics Engine` heading to separate its cards from the numerical
engine's if both are in flight at once) and do one consolidation pass afterward.
