# Math-lab interactivity backlog — detailed investigation

Scope: item 4 from the canvas/math-lab backlog — the ~20-item candidate list in
`math-lab/docs/phase-2-plan/interactivity-ideas.html` ("Interactivity Ideas — Phase 2
Candidates", dated 2026-07-31). This document grounds every idea in the actual current
code (not just the source doc's own claims), so it can be picked up and built directly
rather than re-investigated first.

Not covered here: the canvas/Syntropy node system (`canvas/excalidraw-app/syntropy/`).
That is a separate, already-interactive layer (drag nodes onto an infinite canvas, wire
outputs to inputs, live/run compute) and is unrelated to this backlog. This document is
entirely about the **math-lab engine pages themselves** — the standalone
`math-lab/engines/<engine>/methods/<method>.html` pages you reach directly or via a
node's "Open ↗" link.

## Baseline: what "interactive" actually means here today

Checked directly against the JS behind every page named below (not assumed from the
source doc). The finding is blunt: **zero pages in any of the six engines have a
drag interaction.** Grepped every file listed in this document for
`pointermove|mousemove|drag`; every single one came back with 0 matches. What exists
instead, uniformly:

- A form with text/expression inputs, submitted via a button or a debounced `input`
  listener (~200ms).
- Where a slider exists (`taylor-series.js`, `riemann-sums.js`,
  `discrete-distributions.js`, etc.), it is a `<input type="range">` wired to the
  `"input"` event — genuinely continuous while dragging — but in most cases it only
  updates a **displayed number**, not the plot. Recompute still needs the Compute
  button or a separate debounced text-input listener. `taylor-series.js`'s own degree
  slider is the clearest example: `degreeSlider.addEventListener("input", () => {
  degreeVal.textContent = degreeSlider.value; })` — the label ticks up as you drag, the
  polynomial on screen does not move until you click Compute.
- The one exception to "no live recompute at all" is `stepSlider` on several pages
  (`taylor-series.js`, `euclidean-algorithm.js`, etc.) — dragging it *does* live-update
  which pre-computed step of a trace is shown. That's real continuous interactivity,
  just over an already-computed, fixed array of steps — not over the underlying math.

So "make it interactive" is not a small polish pass on any of these pages — it's adding
a first pointer-driven interaction loop where literally none exists yet, engine by
engine.

## Source doc's four cross-cutting principles, applied to this codebase

The source doc opens with four principles pulled from research into PhET, Bret
Victor's Explorable Explanations, Desmos, Seeing Theory, and a few others. Restated
against what's actually here:

1. **The demo is the explanation.** Every page here already separates "read the
   formula/steps" from "see the answer" — the derivation ladder, step tables, and
   proof blocks are static text/HTML rendered after compute, not annotated onto a live
   figure. Building any of the ideas below means moving the explanation onto the
   figure itself (e.g. the tangent-line slope value should sit ON the tangent line as
   you drag, not in a separate stat row).
2. **Sandbox next to guided.** None of these pages currently have a no-fixed-problem
   "just play" mode — every page's default is a set example (an "example" button
   fills in one canned input). A sandbox mode is a UI-state addition, not a math
   addition: same compute path, just no "correct answer" framing.
3. **Manipulate the invisible.** The pages that already show intermediate structure
   (Jacobians are absent in this codebase's Linear Algebra engine, but eigenpairs,
   residuals, and posteriors already exist as computed values) are the natural first
   candidates — the win is making an *existing* computed-but-static number move live
   under a drag, not computing something new.
4. **Your verify-gate, exposed.** This is the one principle genuinely novel to this
   codebase: `primality-testing.js` already builds real "guess vs. certificate" data
   (Miller-Rabin witness chains, Fermat/Carmichael verdicts) — see the Number Theory
   section below — but the page never asks the user to guess first. This is a UI-only
   addition on top of math that's already fully computed and rendered.

## Per-engine breakdown

Each entry: the idea (verbatim intent from the source doc), the file(s) involved, what
is actually there today (verified), what's missing, and a rough build shape.

### Calculus

Files checked: `math-lab/assets/js/{taylor-series,fourier-series}.js` and their
`engines/calculus/methods/*.html` pages. 18/18 topics shipped per the source doc — this
section is about feel, not coverage.

**Live tangent line.** Not yet checked against `limits.js`/`curve-sketching.js`
directly in this pass — flag as needing the same file-level check as the two below
before estimating effort. The ask: drag a point along f(x), tangent line and slope
value follow in real time, replacing "type an x-value, click compute."

**Taylor series by drag, not click.** `taylor-series.js`, confirmed above: the degree
slider already exists as a real `<input type="range">`, already fires on every drag
tick, and currently does nothing but repaint its own label
(`math-lab/assets/js/taylor-series.js:193`). The fix is almost entirely wiring, not new
math: the page's own `updatePreview()` (already called on `fx`/`center` changes,
`math-lab/assets/js/taylor-series.js:190-191`) needs to also run on the degree slider's
`"input"` event instead of the label-only handler, with the existing 220ms debounce
loosened or dropped for this one control since the polynomial recompute here is cheap
client-side math (no CAS round-trip — confirm this by checking whether
`updatePreview()` calls into `runCas`/`casCall` or is pure `CalcCore`/local
evaluation before committing to "cheap"). This is the single lowest-effort item in the
entire list.

**Fourier epicycles.** `fourier-series.js`: confirmed today (in the course of a
separate bug fix to the *canvas node's* Fourier Series visualization) that this page's
current output is a static partial-sum-vs-target curve plot, no epicycle rendering at
all, and no freehand-curve input. Building this is a new visualization from scratch: a
`<canvas>` where the user draws a closed curve freehand, decomposed into a Fourier
series (already have `CAS.fourierSeries` — the same op both the calculus and ODE
Fourier nodes call), then re-animated as N rotating circles (epicycles) whose tip
traces the reconstructed curve. This is the most novel, most work-intensive item in
Calculus — genuinely new code (freehand capture + epicycle animation loop), not a
wiring fix.

**Ladder of abstraction in the derivation.** Needs a small live figure embedded next
to *each* step of the derivation ladder (not just once at the top), with a
concrete-number ↔ abstract-symbol slider. No file-level check done yet for which
derivation-ladder pages exist; scope this after the tangent-line and degree-slider
items land, since it's explicitly meant to generalize a pattern those establish.

### Linear Algebra

Files checked: `math-lab/assets/js/linear-transformations.js`,
`math-lab/assets/proto/proto.js` (`Proto.initMatrixScene`, lines 176+).

**Eigenvector explorer.** `eigenvalues.js` confirmed to have zero interactivity (form
submit only, 60 lines total — one of the shortest files in the engine, all static
render). The source doc points at `setosa.io/ev/eigenvectors-and-eigenvalues` as a
working reference to study directly before building — that recommendation stands
unchanged after this pass; nothing in this codebase gets you partway there.

**Hit-the-target matrix game.** No matching file/page found for this concept at all —
this is a wholly new page or a new mode bolted onto an existing matrix-transform page.
The mechanic (tune matrix entries until mapped points land on targets) is closest in
spirit to `linear-transformations.js`'s existing 2×2 transform UI, so that's the
natural host if this is built as a mode rather than a standalone page.

**Live 3D grid under a dragged matrix.** This is the one idea in the whole backlog
that's *already partly built*, not just planned. `linear-transformations.js` +
`Proto.initMatrixScene` (`math-lab/assets/proto/proto.js:176-230`) already render a
real three.js scene: the standard grid deformed by the current 2×2 matrix, a faint
untransformed reference grid underneath, and basis-vector arrows (i-hat/j-hat in white,
their images in orange). Confirmed gaps against the source doc's ask:
- **No live drag.** The scene is torn down and rebuilt from scratch on every matrix
  input edit (per `Proto.initMatrixScene`'s own module comment: callers "recreate the
  scene on every input edit" and must dispose the old handle first) — so today it's
  "edit a number field, scene rebuilds," not "drag and watch it deform continuously."
  Making it truly live means driving the existing `apply()`/vertex-position math from a
  drag gesture on the matrix's own entries (or on the basis-vector arrowheads
  themselves) each animation frame, updating the existing `BufferGeometry` positions in
  place instead of rebuilding the whole THREE.Scene.
- **No camera orbit.** `camera.position` is set once and never moves; there's no
  `OrbitControls` or manual pointer-drag-to-rotate — you get one fixed viewing angle.
- **Locked to 2×2.** `linear-transformations.js` is the only caller of
  `initMatrixScene`; extending to 3×3 needs either a new call site or generalizing
  `initMatrixScene` itself to accept an N×N matrix and grid dimension.
This is genuinely "revive and extend," as the source doc says — the rendering
primitive already exists and works, it just isn't live or beyond 2×2 yet.

### Statistics

Files checked: `math-lab/assets/js/{discrete-distributions,continuous-distributions,
confidence-intervals}.js` — each has exactly one slider reference and zero drag
references, same shape as everywhere else (a range input that updates a label, not a
live recompute loop). None of the four Statistics ideas below have any drag
implementation started; effort estimates need a deeper per-file read than done in this
pass, but the *starting point* (zero interactivity, form/slider-to-label wiring only)
is now confirmed rather than assumed.

**Drag-a-point regression, drag-the-prior/posterior, flip-coins-build-a-tree,
Simpson's-Paradox-by-click.** All four: no current implementation. `Seeing Theory`
(Brown University) is cited by the source doc as the reference for the first three;
that recommendation stands. Simpson's Paradox is structurally the cheapest of the four
(click-to-regroup a static dataset, no dragging, no live recompute loop needed — just
a toggle that reruns an existing grouped-stats computation).

### ODE / PDE

Files checked: `math-lab/assets/js/ode-direction-fields.js`,
`math-lab/assets/js/shooting-method.js`.

Note the distinction from the *canvas node* version of Direction Field: this session
separately found and fixed a real rendering bug in the canvas node's own vector-field
plot (`canvas/excalidraw-app/syntropy/nodes/FieldNode.tsx` — unrelated file, unrelated
codebase layer). That fix does not touch `ode-direction-fields.js` at all — the
math-lab page confirmed here (175 lines, zero drag/pointer references) is exactly as
static as every other page in this backlog. The canvas node and the math-lab page are
two separate front-ends over the same underlying math; only the canvas node currently
has any live visual.

**Drag the starting point.** `ode-direction-fields.js`: form-only, no canvas
pointer handling. Building this means adding a pointer-down/move listener on
whatever renders the direction field, converting screen coordinates to (x₀, y₀), and
re-running the existing Euler/RK4 trace on drag — the trace math itself already
exists (it's what powers the current static plot).

**Thread the target region, playable spring-mass-damper, race the methods.** No
current implementation for any of the three. The source doc notes the spring-mass-
damper is already on this project's own roadmap as "best visual payoff, still
unbuilt" independent of this interactivity pass — worth checking
`docs/phase-1-plan/` (referenced by the source doc as where that roadmap line lives)
before scoping this one, since there may already be a design for it beyond what's in
the interactivity-ideas doc.

### Number Theory

Files checked: `math-lab/assets/js/{primitive-roots,primality-testing}.js`.

**Live modular rosette.** Confirmed already further along than the source doc's own
framing suggests. `primitive-roots.js` already draws a real rosette on a genuine
`<canvas>` 2D context (`rosetteCanvas`, `math-lab/assets/js/primitive-roots.js:19-74`):
residues placed at `angle = 2π·r/n`, connected in the order `g⁰→g→g²→…`, with a
generated caption describing the star-polygon structure. What's missing is exactly
what the source doc says — it redraws on compute, not continuously as a base/modulus
slider drags. Since the rosette-drawing function already exists and already takes
`(g, n)` as plain arguments, wiring a slider's `"input"` event straight to a call of
that same function is close to the same shape as the Taylor-series fix above: cheap,
mostly-wiring, not new math.

**Proof as a level, not a paragraph.** No current implementation — this is genuinely
new UI (a step-by-step, click-to-advance legal-move proof builder), inspired by Kevin
Buzzard's Natural Number Game. Substantial net-new work; nothing to wire up.

**Guess before Miller-Rabin runs.** `primality-testing.js` confirmed to already
compute and render the exact data this idea needs: the full Miller-Rabin witness chain
per base (`mrBody.innerHTML = (mr.witnesses || []).map(...)`,
`math-lab/assets/js/primality-testing.js:51`), the specific witness that proved
compositeness when applicable, and the Fermat/Carmichael cross-check note. Nothing
about the actual primality certificate needs to be built. The only addition is a
guess-first UI gate: a prime/composite button pair shown before Compute is enabled (or
before results reveal), storing the guess, then diffing it against `mr.prime` once the
existing render runs, with a line naming where intuition and certificate diverged (or
agreed). This is the cleanest, lowest-risk implementation of the source doc's own
"verify-gate, exposed" principle — the gate already exists computationally, it's just
never been surfaced as a gate.

### Complex Analysis

Files checked: `math-lab/assets/js/domain-coloring.js`,
`archive/docs/engine-plans/COMPLEX_ANALYSIS_ENGINE_PLAN_V2.md`.

**Animated two-plane map.** Not merely "already scoped" as the source doc says — a
full, detailed, dated plan already exists at
`archive/docs/engine-plans/COMPLEX_ANALYSIS_ENGINE_PLAN_V2.md` (dated 2026-07-24,
predating the interactivity-ideas doc by a week), explicitly naming this "the flagship
visual," proposing a new `assets/js/complex-viewer.js` two-plane Plotly viewer, and
demoting domain coloring to a supplementary view. Confirmed **not built**:
`complex-viewer.js` does not exist anywhere in the repo, and no page under
`engines/complex-analysis/methods/` loads Plotly. This is the one item in the entire
backlog with a pre-existing, more-detailed-than-this-document design ready to execute
against — read that plan directly before scoping any calendar time here; re-deriving
its design from the interactivity-ideas doc's one-line summary would be redundant and
worse than what already exists.

**Pannable, zoomable domain coloring.** `domain-coloring.js` confirmed to be a pure
per-pixel numeric renderer into a fixed-size `<canvas>` 2D context
(`math-lab/assets/js/domain-coloring.js:80-106`), redrawn fully on every compute, with
genuinely zero pan/zoom machinery anywhere in the file (the file's few "wheel" hits are
the hue-wheel *legend*, not a mouse-wheel handler — checked directly, not assumed).
Per the V2 plan above, this view is being intentionally demoted to secondary, so
pan/zoom here is worth doing only after the two-plane map ships, and only if domain
coloring is still judged worth keeping as the supplementary view the plan calls for.

**Study these two directly before building.** No code implication — this is a
"go read `complex-analysis.com` and Chebfun's conformal-map visualizer for an hour"
recommendation from the source doc, unchanged by this pass.

## Recommended build order

Ordered by the ratio of (validated user-facing payoff) to (confirmed remaining
implementation work), given everything verified above — not the source doc's original
per-engine grouping:

1. **Taylor series degree-drag** (Calculus) and **live modular rosette** (Number
   Theory) — both confirmed to be wiring an existing render function to an existing
   slider's existing continuous event; the smallest possible first wins, and both prove
   out the "drag → live recompute" pattern this whole backlog is missing before it gets
   used anywhere harder.
2. **Guess before Miller-Rabin runs** (Number Theory) — the underlying certificate data
   is already fully computed and rendered; this is a UI-gate addition with no new math
   and no new rendering primitive.
3. **Live 3D grid, made actually live** (Linear Algebra) — the three.js scene, the
   transform math, and the basis-vector visualization all already exist and work; the
   work is converting "rebuild scene on form submit" into "update geometry in place on
   drag," which is a real but bounded rendering-loop change against existing code, not
   a from-scratch build.
4. **Animated two-plane map** (Complex Analysis) — the highest payoff item with a
   pre-existing detailed plan, but real from-scratch work (a new Plotly-based viewer
   module). Start once the plan in `COMPLEX_ANALYSIS_ENGINE_PLAN_V2.md` has been
   re-read in full against the current engine state (it predates several other
   Complex Analysis changes made since 2026-07-24 and should be re-validated, not
   assumed current).
5. Everything else — genuinely new interaction loops with no existing wiring to lean
   on (eigenvector explorer, hit-the-target game, all four Statistics ideas, drag-the-
   starting-point and the other two ODE ideas, Fourier epicycles, proof-as-a-level,
   ladder of abstraction, pannable domain coloring). None of these are unusually hard
   individually, but none are shortcuts either — scope each on its own once the first
   four have established real patterns (a live-drag-to-recompute loop, a guess-then-
   reveal gate, a live three.js update loop) to build the rest on top of.

## Open items for a future pass

- Calculus's "live tangent line" and "ladder of abstraction," and all three remaining
  ODE ideas beyond direction fields, were not read at the file level in this pass —
  flagged above rather than estimated blind.
- `docs/phase-1-plan/` (cited by the source doc as carrying the spring-mass-damper
  roadmap line) was not opened in this pass; check it before scoping that item so two
  independent design intents for the same visual don't diverge.
- No canvas-node-side work is implied or required by anything in this document — see
  the scope note at the top.
