# Design: Mathematica Canvas (Universities vertical)

Date: 2026-08-01
Status: Direction validated by user, **not yet planned or built** — parking here to resume later.

## Purpose

The first real content for the "Universities" vertical (currently a disabled "coming soon"
card on the root `index.html` hub — see `2026-08-01-general-hub-design.md`). Built from
course material in `reference/mathematica/` — four `.txt` files distilling a ~20-lecture
University of Jordan "MathLab" (Mathematica programming) course into a categorized syntax
reference, plus lecture PDFs and worksheet PDFs.

**Positioning, confirmed explicitly by the user:** this teaches the *real* Mathematica /
Wolfram Language syntax. It is not a Mathematica replacement, not a general-purpose CAS, and
— after iteration — **not primarily a live-execution sandbox either**. The user was explicit:
*"I don't care about running Mathematica codes more than teach it."* Correctness of any
computed value still matters where a computation is shown, but the design does not chase
"real backend compute for every command" as a goal in itself. Teaching clarity leads.

## Roadmap (all 12 phases, for later — unchanged from original brainstorm)

Ordered by backend-reuse leverage, not lecture order. Display order in the eventual course
can differ from build order.

| Phase | Group | Commands (examples) | Backend reuse |
|---|---|---|---|
| **1** | **Calculus** *(first, in progress conceptually — see below)* | D, Integrate, Limit, Series, Plot, Maximize/FindMinimum | High — symbolic kernel + Plotly already exist |
| 2 | Number Theory | FactorInteger, Divisors, PrimeQ, EulerPhi, PowerMod, ChineseRemainder | Very high — `number-theory.js` already covers ~all of it |
| 3 | Statistics & Probability | Distributions, PDF, Mean, Variance, Histogram | High — `stats-algorithms.js` |
| 4 | Advanced Plotting | Plot3D, ParametricPlot, ContourPlot, PolarPlot, RegionPlot | High — Plotly trace types |
| 5 | Equation Solving & Roots | Solve, NSolve, FindRoot, Reduce, Roots | Medium-high |
| 6 | Matrix/List-as-matrix commands | MatrixForm, Transpose, matrix indexing | Medium — `linalg-algorithms.js` |
| 7 | Differential Equations & Transforms | NDSolve (Laplace deferred — flagged fragile in `AUDIT_REPORT.md`/reshape audit) | Medium |
| 8 | Foundations | Arithmetic, variables, logic, substitution, Head/Position | Low reuse, cheap — true lecture-1 on-ramp |
| 9 | Lists & Data Generation | Range, Table, Sort, Map, Select, Union/Join | Low reuse, cheap |
| 10 | Functions & Composition | Pure functions, Piecewise, Nest, Fold | Low reuse |
| 11 | Graphics Primitives | Point, Line, Circle, Polygon, Sphere | Low reuse — custom rendering |
| 12 | Loops, Modules & Control Flow | Do, For, While, Module, Block | Lowest priority — different interaction style entirely (step-through, not "compute a result") |

Note: the "backend reuse" column was the *original* framing (see iteration history below) and
is now secondary to the visual/pedagogical design per command — kept here only to help order
future build phases, not as the primary design driver anymore.

## Validated interaction design (after 4 mockup iterations — see history below)

Reference mockup, fully interactive, saved at
[`assets/2026-08-01-mathematica-canvas-v4-mockup.html`](assets/2026-08-01-mathematica-canvas-v4-mockup.html)
— open it in a browser directly, it's self-contained and links the real `math-lab/assets/`
CSS so it renders in the actual site identity.

**Two-layer component model:**

1. **Generic, reusable across every command** — the syntax line + the "Explain this" tour:
   - A large, mono, real-Mathematica-syntax line (e.g. `D[Sin[x]^2, x]`), tokenized into
     spans (`data-el="..."`).
   - An **"Explain this" button, on demand only — does not auto-play.** Clicking it starts a
     spotlight tour: dims every token except the current one, draws a pulsing highlight ring
     around it, and shows a tooltip callout (label + one short sentence) with Next/Skip
     controls and a step-dot progress indicator. Steps walk through what each token *is*
     (e.g. "brackets, not parentheses — true for almost every command," "a comma separates
     arguments," "# is a pure-function placeholder for the current element").
   - This part is a real generic engine (`buildTour(blockEl, steps)` in the mockup) — a
     spec-driven `steps` array of `{el, label, body}`, one shared renderer. This is the piece
     that scales cheaply to new commands the way the original brainstorm's "generic command
     block" idea was supposed to — just not the visual.

2. **Bespoke per command — the interactive visual.** This is the core lesson from iteration:
   **there is no default visual.** Each command's visual is chosen to match what that command
   actually *is*:
   - **Lists** (`Select`, etc.): a row of literal boxes (list elements). A single slider
     (e.g. threshold) re-filters them live; matching boxes lift out into a second "kept" row
     with a real CSS transition. No numbers-only readout — the filtering *is* the picture.
   - **Graphics primitives** (`Circle`, etc.): the literal shape, drawn on real axes. A
     radius/parameter slider changes the actual SVG shape directly — "what you see is what
     the command means," no abstraction layer.
   - **Calculus** (`D`, etc.): a curve + tangent line *is* appropriate here, because calculus
     is inherently about curves — kept from earlier iterations, but explicitly scoped as "used
     here because this command is about curves," not as the site-wide default. A slider
     changes a parameter (e.g. the power `n` in `sin(x)^n`); both the function curve and its
     derivative curve redraw, and a tangent line's slope literally *is* the answer.
   - Future phases (Logic, Number Theory, Loops/Modules, etc.) each need their *own* new
     bespoke visual concept at build time — a truth table, a factor tree, a scope diagram,
     etc. This is real per-phase design work, not a template fill-in.

3. **Interaction principle, confirmed:** exactly one control per block (typically a slider),
   reacting in real time with no submit button — "real-time reactive result" was explicitly
   chosen over a step-by-step build animation. Text and controls stay secondary in visual
   weight; the concept-native visual is the dominant element in the block.

## What this supersedes from the original brainstorm

Two earlier decisions from this same session are now downgraded/replaced by what actually
tested well:

- ~~"Reuse math-lab's compute cores under the hood wherever a category overlaps (Plot, D,
  Integrate, Solve, NDSolve, number theory, stats)"~~ — was the original architecture
  decision. Still *fine* to do where convenient once building for real, but no longer the
  design's organizing principle, since the user does not want the tool centered on live
  compute at all. Don't force wiring into `cas-client.js`/the CAS worker just because it's
  available — build whatever is simplest and pedagogically clearest per visual.
- ~~One generic spec-driven "command block" component (fields → syntax → compute →
  result), same renderer for every command~~ — replaced by the two-layer model above. The
  *tour* is genuinely generic; the *visual* is not, and should not be forced to be.

## Iteration history (why v1–v3 were rejected — don't redo these)

- **v1** (static HTML, palette + stacked form-style blocks, KaTeX-style text results): "boring
  static words, nothing interactive or animated." Rejected outright — no interactivity at all
  since it was a non-functional preview, which itself was a lesson (a static mockup could not
  communicate a "live" product — later iterations had to actually be live JS, not just
  described).
- **v2** (real JS, live-updating derivative graph + ambient always-drifting wave plot):
  interactivity landed, but this is where "plot" became the default visual for every block —
  not yet flagged as a problem at this point.
- **v3** (added the on-demand "Explain this" token-spotlight tour): tour mechanic confirmed
  good ("yes good"), but user also flagged: tokens/text too small, and the second interactive
  block (the wave) had been dropped in favor of narrowing to one example — read as "you
  deleted the interactive part."
- **User then explicitly reframed the goal**: doesn't care about live-executing real
  Mathematica computation as the point; "you can't use the plot each time as a way of
  visualizing"; wants something of higher teaching quality than the existing plain-text
  reference notes (`reference/mathematica/*.txt`).
- Researched, live in-browser, how established tools teach: Brilliant.org's course-map +
  interactive-lesson pattern, and — most relevant — Wolfram's own official *"An Elementary
  Introduction to the Wolfram Language"* (`wolfram.com/language/elementary-introduction/`),
  which uses `In[n]:=` / `Out[n]=` notebook-style input/output pairs and, in its "Interactive
  Manipulation" chapter, `Manipulate[...]` — a slider driving a live result. This directly
  informed the "one slider, real-time reactive result" interaction principle above.
- **v4** (three different command types — `Select`/lists as boxes, `Circle`/graphics as a real
  shape, `D`/calculus as a curve — each with its own bespoke visual, bigger text/tokens, tour
  kept): **confirmed — "yes, this feels right."** This is the validated direction.

## Explicitly not decided yet (pick up when resuming)

- Exact page/file location under a new `universities/` top-level folder (parallel to how
  `math-lab/` and the root `index.html` are structured) — not yet created.
- Whether/how much of math-lab's existing compute cores get reused per visual, decided
  per-phase at build time rather than as a blanket policy.
- The bespoke visual concept for every phase beyond the three shown in v4 (Logic, Number
  Theory, Statistics, Loops/Modules, etc.) — each needs its own short design pass.
- Whether the "Explain this" tour step content should be written once per command by hand, or
  whether there's a lighter-weight authoring format worth building once ~10+ commands exist.

## Next step when resumed

Not `writing-plans` yet — the user asked to save this and move to prototyping something else.
When picked back up: brainstorm the Phase 1 (Calculus) page structure specifically (how many
commands, where "Explain this" tours are authored, exact repo location), then move to
`writing-plans` for implementation.
