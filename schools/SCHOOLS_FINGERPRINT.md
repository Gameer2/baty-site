# SCHOOLS — Design Fingerprint & Vision

> The distinguishing design DNA and the vision of the Schools vertical (Jordan National
> Curriculum math lessons). Use this to **match any lesson to the system** — to audit
> past work, fix drift, or build a new lesson that belongs to the same family.
>
> The fingerprint (§2–§9) is what **every** lesson shares. The vision (§1) is why.
> §10 is the **reference implementation** (the Geometric Constructions lesson, including
> its Apple dark demo and the exact fixes landed this session) — the concrete instance
> to compare against.

---

## 1. Vision

**What it is.** A vertical of interactive math lessons for the **Jordan National
Curriculum**, one self-contained HTML page per lesson. Each page teaches **one**
curriculum objective as a live, manipulable scene the student can step through, drag,
and hear explained — not a static figure or a slideshow.

**Audience.** Classroom students (Grade 5–6 and onward), bilingual **English / Arabic**,
RTL-aware. The page is the teacher's demonstrator and the student's explorer at once.

**Pedagogical core.** Every lesson turns a curriculum objective into a **construction**
or **model** the student can *see being built* and *prove to themselves*:
- Steps reveal progressively (the "build" metaphor).
- The reasoning is shown, not hidden — an equation bar states the invariant, a
  "Why it works" block states the proof, and the Explain system narrates it live.
- Interaction is direct: drag the given, slide a parameter, watch the result follow.
  The result must be **provably correct by construction**, not measured.

**Principles.**
1. **One HTML page per lesson.** No build step, no framework, no router. A lesson is a
   single file you can open with `file://`.
2. **Shared shell, bespoke scene.** Every page loads the same shell (chrome, tokens,
   i18n, notebook, tour) and then authors its **own** scene in its own `<style>`/`<script>`.
   There is no shared "scene" component — only the shell (DESIGN_SYSTEM.md §14.3).
3. **The lab identity, not a generic widget or a generic "AI" look.** One accent for the
   whole page, on true black, with no glow and no glass (§3). The page must read as part
   of this lab specifically — its own typefaces, its own bilingual voice, its own
   provably-correct pedagogy — not as an off-the-shelf geometry/data widget, and not as
   a templated dark-mode dashboard either.
4. **Real engines, not hand-rolled.** JSXGraph for geometry, Motion for animation, KaTeX
   for equations — all vendored. Don't reinvent them per lesson.
5. **Bilingual by construction.** EN/AR from the first line; AR gets its own fonts and
   eastern-Arabic digits.
6. **Quiet, purposeful motion.** Motion serves the metaphor (a stroke *draws on*, a
   compass arc *swings in*, a point *lands*). No ambient looping decoration on the
   lesson content; the only ambient motion is a slow board aurora (and it is optional).

**Where it lives.** `schools/grade-N/N-M-topic.html`. Grades are directories; lessons
are files named `unit-lesson-slug.html`. The shell lives in `schools/assets/`.

---

## 2. The fingerprint — what every lesson shares

If a lesson is missing any of these, it has **drifted** from the family. Fix it.

### 2.1 Stack (no build)
```html
<link rel="stylesheet" href="../assets/vendor/jsxgraph.css" />
<script src="../assets/vendor/jsxgraphcore.js"></script>
<script src="../assets/vendor/motion.min.js"></script>
<link rel="stylesheet" href="../../math-lab/assets/vendor/katex.min.css" />
<script src="../../math-lab/assets/vendor/katex.min.js"></script>
<link rel="stylesheet" href="../assets/css/lesson-shell.css" />
<link rel="stylesheet" href="../assets/css/jsxgraph-skin.css" />
<script src="../assets/js/lesson-shell.js"></script>
<script src="../assets/js/lesson-motion.js"></script>
```
Lesson script destructures the shell + motion APIs:
```js
const { initI18n, renderEquation, buildNotebook, buildTour } = LessonShell;
const { springValue, appear, draw, reveal, animate, EXPO, STATE_SPRING } = LessonMotion;
```
Non-geometry lessons (e.g. a probability scale, a number line) may not need JSXGraph and
build their scene with plain HTML/CSS + GSAP/Motion instead — but they still use the
shell, the tokens, the i18n, and the Explain/tour system.

### 2.2 Layout archetype
```
<div class="app">                      full-viewport flex column (no page scroll on desktop)
  <header class="app-bar">             crumb eyebrow + title (EN/AR) | prev/next nav | lang | Explain
  <div class="stage">                  the dark card
    <div class="eq-bar">               KaTeX equation (left) | mode/segmented control (right)
    <div class="control-row">          labelled sliders + value readouts (the numeric control)
    <div class="workspace">            flex row
      <div class="board-wrap">         the scene (JSXGraph board or bespoke scene) — flex 64%
      <div class="procedure">          textbook steps rail, live-highlighted, scrolls — flex 36%
        <div class="teach">            "What this teaches" closing note
```
- The scene fills its wrap; the procedure rail is **bare text on the same black
  surface**, not a boxed column. A single hairline divider separates them.
- Mobile (`max-width:760px`): the workspace stacks; the board gets a fixed height; the
  rail flows below; the app scrolls.
- Some lessons use the simpler shell layout (`.shell` + `.stage` + `.scene`) without the
  app-bar workspace — that is the older pattern, still valid for shorter lessons.

### 2.3 Shared shell (`lesson-shell.css` / `lesson-shell.js`)
Provides: the `:root` tokens (§4), `.shell`/`.app`/`.stage`/`.eq-bar`/`.control-row`/
`.scene`/`.teach`/`.nav-row`, the lang pill, the slider styles, the **tour** (ring +
scrim + tip), and the **professor's notebook** (glassy panel + highlight ring + live
virtual cursor + typewriter). JS: `initI18n(T, {onLangChange})`, `renderEquation(el,
latexSrc)`, `buildNotebook(...)`, `buildTour(...)`.

### 2.4 Every lesson has these, authored in-page
- **`T = { en:{...}, ar:{...} }`** — all strings, including per-mode `proc` steps,
  `why` blocks, and `tour` stops. Never hard-code UI text.
- **An equation bar** that states the invariant (KaTeX), revealed progressively as the
  construction justifies it.
- **A control surface** — at minimum a step slider; commonly a parameter slider driven
  by a `springValue`. Sliders carry a teal `--fill` progress (JS sets the var on input).
- **A procedure rail** (for construction lessons) — the textbook's own steps,
  live-highlighted by the step; clicking a step jumps the board.
- **An Explain affordance** — either the tour (`buildTour`) or the professor's notebook
  (`buildNotebook`) reached via an "Explain this" button (often behind a chooser
  popover: "Whole construction" vs a single step).
- **A "What this teaches" closing note** (`.teach`).
- **Prev/next nav** to the neighbouring lessons.

---

## 3. The identity rule — one accent for the whole page (Apple-pass, now canonical)

**Revised.** This vertical used to run a *one-accent-per-role* system (teal for active
work, green for a provably-correct result, infrared for CTAs, each locked to its own
job). That system is retired. Every lesson now runs the **Apple-pass identity**
prototyped in `4-5-geometric-constructions-apple.html` and proven on a real canonical
lesson in `8-5-probabilities.html`: **one accent for the whole page**, true black, no
glow, no glass. It's defined once in `schools/assets/css/lesson-shell.css`'s trailing
`:root` block (a Schools-only override — it does not touch `math-lab/assets/css/
tokens.css`, so the main math-lab site's own multi-accent identity is untouched) and
every lesson gets it automatically just by loading the shared shell.

| Token | Hex | Used for |
|---|---|---|
| `--core-black` | `#000000` | Page/board background — pure black, not the lab's warmer near-black. |
| `--rich-carbon` | `#1c1c1e` | Panel/surface background — the stage, the notebook, opaque (no blur). |
| `--urban-smoke` | `#2c2c2e` | A second, slightly lighter elevation step. |
| `--pulse-ash` / `--off-white` / `--neural-fog` | `#98989d` / `#f5f5f7` / `#ebebf5` | Tertiary / primary / secondary text — unchanged roles, Apple-pass values. |
| `--electric-teal`, `--infrared`, `--validation-green` | **all `#0A84FF`** | The one accent, doing every job the old three tokens split up: active/selected state, the live cursor, the Explain CTA, **and** the provably-correct result. |
| `--validation-red` | `#cb3500` (unchanged) | **Deliberately not collapsed.** A real wrong-answer/error state still needs its own color — this is the one place the page still has a second hue, and it means something specific (see §12.5 in the games-section plan for the same principle applied to Games). |

**Rules:**
- A "provably correct" result distinguishes itself from in-progress construction work
  by being **solid + thicker, drawn last** — not by hue, since hue no longer separates
  them. This was already true of the geometry board's own convention; it's now the
  whole page's convention.
- No glow, no `backdrop-filter`/glass, on any shell component (the notebook overlay,
  the Explain popover, button hovers, slider thumbs). Elevation is shown by a real
  two-layer shadow (`0 1px 2px` tight + `0 10px 30px` soft), never a colored blur.
  Glassmorphism-on-everything and neon-glow-on-dark are the two most common "this was
  obviously AI-generated" tells in current design criticism — both are switched off.
- One radius scale: **18px surfaces, full-pill (100px) controls.** Not the old mixed
  10/14/22px set.
- **Typography is not part of this collapse.** `--mono`/`--serif`/`--display` stay
  Azeret Mono / Bricolage Grotesque / Roc Grotesk — never SF Mono/SF Pro/system-ui.
  Swapping the type stack too would trade this vertical's own identity for a generic
  "looks like an Apple settings panel" identity, which is a different kind of
  genericness, not the absence of one. Apple-pass is a *material* language (color,
  elevation, glow, radius, motion) borrowed on purpose; it is not a full skin-clone.

**Historical note, so this doesn't get "fixed" back by accident:** the two files that
introduced this (`-apple.html`, `8-5-probabilities.html`) each still carry their own
copy of this override as a per-file trailing `:root` block, written before it moved
into the shared shell. Those per-file blocks are now redundant (the shell provides the
same values by default) — safe to delete next time either file is touched, not urgent.
**Do not read their presence as "this is still a one-off demo."** It isn't; see §10.3.

---

## 4. Tokens (from `lesson-shell.css`)

```
colors (Apple-pass, from lesson-shell.css's trailing override — see §3):
        --core-black #000000  --rich-carbon #1c1c1e  --urban-smoke #2c2c2e
        --pulse-ash #98989d  --off-white #f5f5f7  --neural-fog #ebebf5
        --electric-teal / --infrared / --validation-green  →  all #0A84FF
        --validation-red #cb3500  (unchanged — the one real second hue, for errors)
fonts:  --mono "Azeret Mono"  --serif "Bricolage Grotesque"  --display "Roc Grotesk"
        (unchanged by the Apple pass — see §3's typography rule)
        AR: .ar-display "El Messiri"  .ar-body/.ar-ui "Vazirmatn"
type:   --fs-2xs 11 … --fs-3xl 48 (1.2 ratio from 16px base)
        --lh-tight 1.12 / snug 1.4 / base 1.6 / relaxed 1.78
        --tr-tight -.015em / normal 0 / label .06em / wide .1em
space:  --sp-1 4 … --sp-16 64 (4px rhythm)
radius: 18px surfaces, 100px (full pill) controls — one scale, not the old mixed set
```
Mono is reserved for numeric/coordinate readouts only. Chrome (crumb, labels, buttons,
heads, nav) uses the display face. Use these tokens — don't hard-code sizes/colors.
The base values `math-lab/assets/css/tokens.css` still defines (`#090909`/`#5c939f`/
`#ed6d40`/`#59a993`, etc.) are unchanged and still power the main math-lab site — the
Apple-pass values above are a Schools-only override layered on top, per §3.

---

## 5. Motion language (`lesson-motion.js`)

The motion **is the metaphor**. Match the element type to the motion:

| Element | Motion | Helper |
|---|---|---|
| Solid stroke (segment, the result line) | **draws on** via `stroke-dashoffset` | `draw(node, {duration})` |
| Dashed compass arc / circle | **swings in** (plain fade, no blur/scale) | `appear` |
| Intersection / marked point | **lands** (gentle scale-in, no overshoot) | `settle` |
| Scene / panel on scroll-in | **reveals** (opacity + y) | `reveal` / `revealStagger` |
| Continuous parameter (slider) | **springs** to the value (no jumps, no bounce) | `springValue` |

- `EXPO = [0.16, 1, 0.3, 1]` is the default ease for non-spring transitions.
- **Revised (was: elastic spring by default).** `QUIET_SPRING` (no overshoot, gentle
  settle) is now the default for `springValue` and for `appear`/`settle` when
  `opts.spring` isn't a specific config. `STATE_SPRING` (the ~back.out(1.7) elastic pop)
  still exists and is still exported, but is now an explicit opt-in
  (`{ spring: LessonMotion.STATE_SPRING }`) for a lesson that wants a livelier feel at
  one specific moment — not the page-wide default anymore. This is the Apple-pass
  motion decision (SCHOOLS_FINGERPRINT.md §3) made real in the shared module instead of
  each lesson hand-flattening its own points/arcs.
- **`draw` uses WAAPI**, not Motion's `animate` (Motion no-ops on `strokeDashoffset`,
  verified). See the contract in §6.
- `settle` supersedes the old per-lesson hand-rolled `popPoint` functions — it's now a
  real shared primitive, not something every geometry lesson reimplements.
- `@media (prefers-reduced-motion: reduce)` disables the ambient aurora and any
  remaining pulsing badges; the reveals stay (they're brief). New/updated lessons
  should skip the ambient board aurora glow by default now — it was already optional
  per §1's motion principle, and the Apple pass turns it off outright.

---

## 6. The motion-primitives contract (shared, do not duplicate)

These live **once** in `schools/assets/js/lesson-motion.js`. Fix them there, never
per-lesson.

- **`springValue(initial, onUpdate, opts)`** — a Motion motionValue the slider writes
  and the scene reads each frame. `onUpdate: () => board.update()` drives JSXGraph so
  radii resize fluidly. This is the fix for "slider jumps the visual".
- **`draw(node, {duration, ease, onComplete})`** — sets `strokeDasharray = "L L"`,
  `strokeDashoffset = L`, opacity 1; WAAPI-animates offset `L → 0`, `fill:"forwards"`;
  **`onfinish` sets `strokeDashoffset = "0"` AND `strokeDasharray = "none"`**.
  - The dasharray-clear on finish is **load-bearing**: without it, any later geometry
    change (a drag, a spring resize) makes the line longer than `L`, and the extra
    length falls into the dash gap and vanishes — the stroke looks like it re-animates.
  - A finished line is just a solid line, so clearing the pattern is visually identical
    and drag-safe.
- **`appear(node, {spring, duration, onComplete})`** — opacity 0→1, EXPO or spring.
  `spring:true` now resolves to `QUIET_SPRING`; pass the `STATE_SPRING` object itself
  for the elastic variant.
- **`settle(node, {spring, onComplete})`** — opacity 0→1 + scale 0.6→1, `QUIET_SPRING`
  by default. The shared "a point lands" primitive (§5) — use this instead of a
  per-lesson hand-rolled pop function.
- **`reveal(node)` / `revealStagger(nodes)`** — inView opacity+y.

---

## 7. JSXGraph patterns & gotchas (geometry lessons)

- **Board init:** `JXG.JSXGraph.initBoard(elId, { boundingbox:[...], axis:false,
  showCopyright:false, showNavigation:false, keepaspectratio:true,
  pan:{enabled:false}, zoom:{enabled:false}, grid:false })`. `keepaspectratio:true` is
  mandatory — geometry must not distort.
- **`keepaspectratio` scale ≠ width/unitsWide.** The unit scale is
  `min(width/unitsWide, height/unitsTall)`; the plot area is centered in the wrap with
  empty margins. When probing, derive px/unit from **two known points**, never from
  `width/unitsWide`.
- **Resize:** JSXGraph pins an inline pixel size on the container, so measure the
  **parent** (`.board-wrap`), not the board. `syncBoardSize()` reads the parent's
  `getBoundingClientRect()` and calls `board.resizeContainer(w,h)`. It auto-runs on
  mount + window resize **only** — call `requestAnimationFrame(syncBoardSize)` at the
  end of any function that rebuilds the board (`buildScene`/mode switch), or the new
  board collapses to 0 height.
- **Tag every element:** `tag(el, id, groupKey)` sets `el.rendNode.id`, adds `dimmable`,
  sets `dataset.el`. Stable ids are how the tour, the notebook ring, the dim scheme, and
  Playwright probes address SVG nodes.
- **Rendering:** points & circles → `<ellipse>`; lines/segments → `<line>`. `el.elType`
  is `point|line|segment|circle|intersection`.
- **Kill point highlight:** `board.options.point.highlight = false` (or per-element
  `highlight:false`). Otherwise hovering/clicking a point flashes it to the accent and
  grows it — reads as an unwanted animation. **Drag still works** with highlight off.
- **`getTotalLength()` is 0 if probed too early** (~30ms) after a step change — JSXGraph
  hasn't re-projected the new line. Re-probe at ~120ms. Do not "fix" `draw` from the
  early reading.
- **`straightLast:true` makes rays hit the board edge.** Use `straightLast:false` to end
  at the defining point when you want finite, edge-safe strokes (and an arrowhead that
  lands on a handle, not the edge).
- **Function points track drags:** define point coords as functions of other points'
  `.X()/.Y()` so P, Q, intersections follow live. Use explicit "along a ray at distance
  r" placement to avoid circle-vs-infinite-line intersection ambiguity.

---

## 8. The step-reveal + auto-play pattern

- **`THRESH = { given:0, arcA:1, arcB:2, arcs:1, marks:2, result:3 }`** — group → step.
  4 steps (0–3) match the 4 procedure items / 4 tour stops.
- **`applyStep(s, instant)`** — shows groups with `s >= THRESH[k]`, hides the rest.
  Reveals only if the node is currently hidden (`opacity==="0"|""`) so re-running on an
  already-shown element is a no-op (no re-trigger). `instant` snaps visible with no
  motion (used by `buildScene`). Staggers elements within a group ~60ms. Ends with
  `renderEquationBar() + highlightProcedure(s) + nbUpdate()`.
- **`revealEl(el, delay)`** dispatcher → `draw` (solid line) / `appearLayered` (circle
  or dashed) / `popPoint` (point). See §5.
- **Auto-play:** `startAuto()` ticks step 0→3 every 3000ms then **stops** (no loop).
  Fires on mount (`setTimeout(startAuto, 900)`) and on mode switch. **Any manual
  control calls `stopAuto()` first** — the user takes over.

---

## 9. The Explain system + i18n

### 9.1 Explain (two layers, pick one or both)
- **Tour** (`buildTour`) — a fixed ring + scrim + tip walkthrough of tagged elements.
  Simpler lessons use this.
- **Professor's notebook** (`buildNotebook`) — a state-aware overlay: for the *current*
  (mode × step × parameter × language) it shows a rich entry `{ids, kicker,
  sections:[{h,p}]}` with a **live virtual cursor** that glides to the explained element
  and "clicks" it (ripple), plus a **non-blocking highlight ring**. The board stays
  interactive while it's open. `{r}`-style placeholders are interpolated with the live
  board value so the explanation tracks reality. Four section voices: *On the board now
  / The move / Why it holds / Next (→ Result)*.
- **Chooser popover** (premium): the Explain button opens a popover — "Whole
  construction" (auto-advance 0→3) vs a single step (jump, no auto) — then opens the
  notebook. Magnetic button parallax on `(pointer: fine)` only.
- **Ring/cursor accent tracks the actual drawn color, not a fixed teal.** An entry can
  set `accent:"result"` (currently the only role) and `buildNotebook`'s `render()` sets
  `--explain-accent`/`--explain-accent-rgb` on the ring + cursor, read via
  `rgba(var(--explain-accent-rgb, var(--electric-teal-rgb)),…)`; every step without a
  tag falls back to teal. This exists because the reference lesson draws three role
  colors (teal/green/neutral, §10.1) but the highlight was always teal regardless of
  which one it was pointing at (§10.4). **Do not tag Apple-pass lessons with this** —
  the shared Apple override (§3) doesn't redefine every `-rgb` companion token, so a
  "result" tag there leaks a stray green into a theme whose whole point is one accent.

### 9.2 i18n
- `i18n = initI18n(T, { onLangChange })`. `T` is `{en, ar}` with every string.
- `onLangChange` re-renders procedure, equation bar, notebook, popover.
- AR uses **eastern Arabic-Indic digits + Arabic decimal separator** via `arNum(s)`.
- Strict title separation: `html[lang="en"] #titleAr{display:none}` and vice versa.
- AR font roles: `.ar-display` (El Messiri), `.ar-body`/`.ar-ui` (Vazirmatn). Label
  `data-role="ui|body"` so the shell can swap fonts per language.

---

## 10. Reference implementation — Geometric Constructions (Grade 6 · Unit 4 · Lesson 5)

`schools/grade-6/4-5-geometric-constructions.html` is the canonical lesson; `-apple.html`
is its Apple dark demo. Both teach **bisecting a segment and an angle** with
straightedge + compass. This is the most complete lesson and the one to compare against.

### 10.1 Two constructions, both returning group buckets
`{ given:[], arcA/arcs:[], arcB/marks:[], result:[] }` for the step thresholds.

**Perpendicular bisector** — `buildBisector()`:
- A `[1.5,1]`, B `[7,1]` (draggable); segment fog strokeWidth 2.5.
- Equal circles cA, cB radius `A.Dist(B)/2 * (1.05 + 0.05*(widthSpring+1))`, teal,
  strokeWidth 2.25, dash 2. (Equal radius = the lesson; a second color would lie.)
- P, Q = intersections (white/teal). Result line [P,Q] full-infinite, green,
  strokeWidth 4 (canonical) / 3 (apple), no arrow.
- `arcA` and `arcB` are **separate steps** — "do not change the compass opening."

**Angle bisector** — `buildAngle()` (after this session's tuning, apple values):
- V `[1.5,1]` (vertex); U `[8,1]`, W `[6.5,4]` (unlabeled draggable handles, ash).
- Sides r1 [V,U], r2 [V,W]: fog, strokeWidth 2.5, **straightLast:false** (end at handle),
  lastArrow size 4.
- First arc cV radius `min(V.Dist(U), V.Dist(W)) * (0.45 + 0.02*widthSpring)` (≈3.09 at
  default), teal, dash 2. P, Q placed at distance r1 along each side.
- Equal arcs cP, cQ radius `P.Dist(Q) * 1.1` (≈1.81), teal, dash 2.
- R = farther intersection of cP,cQ. Result ray [V,R]: **straightLast:false** (ends at
  R), **no arrow**, green (#0A84FF in apple), strokeWidth 3.

### 10.2 The fixes landed this session (the "reached result")
Each is a fingerprint-grade lesson — apply the same thinking to any lesson.

1. **Canvas collapsed to 0 height after a mode switch.** `syncBoardSize` only ran on
   mount + resize, not after `buildScene`. Fix: `requestAnimationFrame(syncBoardSize)`
   at the end of `buildScene`, plus `setTimeout(startAuto, 900)` on mode switch so the
   new construction animates. → *Any lesson that rebuilds its board on a control change
   must re-size the fresh board next frame.*
2. **Circles too small, arrows too big.** A fixed arc radius left the arcs tiny next to
   board-edge rays; the equal-arc factor 0.8 made them near-invisible on a narrow
   angle. Fix: scale the first arc to the shorter side (capped ~65% so the crossing
   points stay on the sides); bump the equal-arc factor 0.8→1.1; shrink arrowheads 6→4
   and the result stroke 4→3. → *Arc radii should relate to the side length, not be a
   magic constant; size the arrowheads to the stroke, not the board.*
3. **Arrows touched the canvas edge.** `straightLast:true` ran rays to the edge. Fix:
   `straightLast:false` — sides end at their handles (arrow at the handle), result ends
   at R (no arrow, R is the terminator). → *Finite strokes for finite constructions;
   reserve true rays for when the direction, not the reach, is the point.*
4. **Dragging a handle re-animated the strokes.** `draw` left `strokeDasharray` pinned
   to the old length; a drag made the line longer than the dash and the extra vanished
   into the gap. Fix (shared, `lesson-motion.js`): clear `strokeDasharray` on finish
   (§6). → *Every lesson using `draw` is fixed by this one change.*
5. **Clicking an object flashed it.** JSXGraph point highlight flashed the point to the
   accent + grew it on hover/click. Fix: `board.options.point.highlight = false` (drag
   still works). → *Suppress highlight feedback unless the lesson intends it.*

### 10.3 The Apple pass — from one-off demo to the vertical's real identity

`-apple.html` started as a **standalone one-off**: keep all behavior/geometry
identical, override only identity, via a trailing `:root` block + an in-page
`C = {...}` palette object for JSXGraph (which needs literal hex, not CSS vars). That
demo is what got read, liked, and then applied for real to a canonical lesson
(`8-5-probabilities.html`, no `-apple` suffix) — at which point it stopped being a
demo. **The decision this session: the Apple pass is now the whole vertical's
identity**, promoted out of the two per-file overrides and into
`schools/assets/css/lesson-shell.css` and `schools/assets/js/lesson-motion.js` (§3,
§5, §6) so every lesson gets it by default instead of needing its own copy of the
override block. See §3 for the exact rule and the token table.

What the two original files still get right, as reference:
- Pure-black `#000` canvas, `#1c1c1e` surfaces, single accent `#0A84FF`
  (teal+green+infrared collapse onto it, `--validation-red` does not — §3).
- Opaque panels, no glows, 18px/100px radii.
- Quieter motion: plain fades for arcs, a gentle no-overshoot scale-in for points (now
  `LessonMotion.settle`, §6) instead of the old elastic pop.
- The result line distinguishes itself by **solid + thicker**, not hue (since hue no
  longer separates it from in-progress work).

What did **not** get promoted, and stays a per-lesson choice: the SF Pro/SF Mono
typeface swap. §3 explains why — the type stack is this vertical's own identity, not
part of the "avoid AI-slop" material fixes, and stays Azeret Mono / Bricolage
Grotesque / Roc Grotesk everywhere.

> **A Google/Gemini-styled copy was also built and deleted** in an earlier session
> (gradient `#4285F4→#9b72cb→#d96570`, `#1e1f20` cards at 28px radius, Google Sans +
> Roboto Mono, drifting multicolor aurora). It was not promoted — a second company-
> design language competing with the now-canonical Apple pass would just be a new
> source of drift. If a future company-design demo is worth building again, treat it
> as exploration only; promoting a *different* one to canonical later means repeating
> this section's process (audit what's genuinely a material-language win vs. what's
> just skin-deep, move only the former into the shared shell), not stacking demos.

**A third file, `4-5-geometric-constructions-apple-integrated.html`**, exists as a copy
of `-apple.html` with two changes, made because the standalone demo's *own* local
`<style>` override had drifted out of sync with the shared shell above and read as a
different product wearing the lesson's layout rather than a calmer version of the same
site:
1. Deleted the local `--mono/--serif/--display` re-point to SF Pro/SF Mono, so the file
   now inherits Azeret Mono / Bricolage Grotesque / Roc Grotesk from the shared shell —
   exactly the "did not get promoted, stays per-lesson" typeface rule above, just
   applied. This was the single biggest reason the demo read as foreign.
2. Every hardcoded `#0A84FF` (CSS *and* the JSXGraph `C` palette object) is now `#5c939f`
   — the lab's own flagship teal — instead of Apple's blue. Same "one accent, state read
   by weight not hue" rule as the original pass, just tied to this site's own hue family.
This is **not** merged into the shared shell yet — `lesson-shell.css`'s canonical
Apple-pass override (§3) still defaults to `#0A84FF`. Treat the integrated file as a
pending proposal to fold both changes into §3/§4's token table, not as a second
standard living alongside the first.

---

### 10.4 The Explain cursor — from hand-drawn to a real glyph, this session

The `.nb-cursor` glyph (the live pointer `buildNotebook` glides to the explained
element) was a hand-tweaked SVG polygon (`M0,0 L0,14 L3.8,10.5 …`) filled flat white
with a thick black outline — it read as generic clip-art, not part of this site's
identity, and the outline made it look literally hand-drawn.

- **Glyph replaced** with Lucide's `mouse-pointer-2` path (ISC-licensed, the standard
  "collaborator's live cursor" shape used by tools like Figma) — same dart-with-flag
  concept, real rounded corners at the tip/notch/tail instead of raw straight-edge
  vertices at arbitrary coordinates. `viewBox` is offset (`4.037 4.037 17 17`) so the
  glyph's own tip lands at local `(0,0)`, preserving the "tip sits at the cursor box's
  origin" contract the positioning code in `buildNotebook` depends on.
- **Colored solid fill, not an outline.** `fill:var(--explain-accent, var(--electric-teal))`
  with only a hairline dark stroke for edge definition — no more fixed white+black.
  This is also what plugs it into the §9.1 accent-tracking mechanism.
- **Premium glow, plain lesson only.** `.nb-cursor`'s filter gained a second,
  accent-tinted `drop-shadow` alongside the existing contact shadow, so the cursor now
  has a soft colored halo instead of a flat dark shadow. The two Apple-pass files keep
  `filter:none` — flat/no-glow is a deliberate rule of that theme (§10.3), not an
  oversight, so this addition was scoped to the file that doesn't carry that rule.
- Box resized 18×26 → 20×20 (the new glyph's bounding box is roughly square, unlike the
  old tall polygon); the label offset was nudged to match.

All three lesson files (`-apple.html`, `-apple-integrated.html`, and the plain lesson)
keep the same base `.nb-cursor*` CSS in sync as a matter of course (§10, "reference
implementation") — only the two things above that are theme-specific rules (the tag
that drives green-on-result, and the glow) were deliberately left to diverge.

---

### 10.5 The rebuild recipe — porting a lesson to the full archetype

**Status: proven on a second, non-construction lesson.** `4-5-geometric-constructions-
apple-integrated.html` was the only lesson carrying the full app-shell + procedure rail
+ professor's-notebook archetype; every other shipped lesson (90 of 93 files) still used
the older, thinner `.shell` layout + `buildTour`. `grade-5/1-4-negative-numbers.html`
was rebuilt this session to match the reference **exactly**, proving the archetype isn't
geometry-construction-specific — it generalizes to a lesson with no "modes," no
discrete construction steps, and a continuous drag-driven diagram instead of a JSXGraph
board. This section is the durable recipe for repeating that rebuild on the remaining
lessons — written as a prompt so it can be handed to a fresh session verbatim.

**Why a rebuild, not a styling pass:** the first attempt on this lesson was a color/
token cleanup (hardcoded old-teal hex → `var(--electric-teal-rgb)`, no-glow, radius
normalization) inside the *old* `.shell` layout. That was correct as far as it went, but
the user's actual complaint was structural — "it's not even like the geometric
construction" — because the layout archetype itself (app-shell, procedure rail,
notebook) had never been ported, only the color tokens. **Match the archetype first;
tokens alone are not enough.**

**The rebuild prompt** (fill in the bracketed parts for the target lesson):

> Rebuild `[target lesson].html` to structurally match
> `schools/grade-6/4-5-geometric-constructions-apple-integrated.html` exactly — not a
> styling pass, a full port of that file's architecture:
>
> 1. **Read the complete reference file** (head, CSS, HTML, JS — all of it, not an
>    excerpt) and the complete target file before changing anything.
> 2. **Head**: drop JSXGraph includes if the target has no geometry board; keep
>    `gsap.min.js` only if the target's own bespoke diagram already depends on it (don't
>    force a port to the Motion library purely for stack purity — that's an invisible
>    implementation detail, not part of what the user is judging). Add
>    `lesson-motion.js` + `motion.min.js` for `LessonMotion.reveal()` on mount.
> 3. **CSS**: copy the reference's app-shell/procedure/explain-popover/nb-cursor blocks
>    and the trailing Apple-pass-integrated `:root` override *verbatim* — these are
>    generic machinery, not construction-specific. Only the bespoke board-content rules
>    (the target lesson's own diagram) get rewritten, and when you do:
>    - every hardcoded old-teal `rgba(92,147,159,…)` → `rgba(var(--electric-teal-rgb),…)`
>    - every literal hex tied to the old palette → the matching token
>    - remove ambient colored glow (soft colored `box-shadow`), replace with a flat dark
>      contact shadow
>    - normalize radii to the 18px/pill scale
>    - any element carrying real words (not just digits) that will be Arabic in AR mode
>      needs an explicit `.ar-ui`/`.ar-body` override for `font-family` + `direction` —
>      the shared `.ar-ui{font-family:Vazirmatn}` rule loses the cascade tie to a
>      same-specificity, later-loading per-file rule (§9.1's cursor accent note is the
>      same class of bug)
>    - check every absolutely-positioned label against its container's `overflow:hidden`
>      — a centered-on-a-narrow-anchor label is the single most common clipping bug
>      found so far (§10.5's own fix, and 9 other shipped lessons share the identical
>      pattern, unfixed as of this writing — see the list below)
> 4. **Layout**: header `.app-bar` (crumb, EN/AR `<h1>` pair, prev/next `nav-pill`s,
>    lang-pill, explain-btn) → `.stage` → `.eq-bar` (+ `.mode-toggle` only if the lesson
>    actually has multiple constructions/modes — don't invent one) → `.control-row` →
>    `.workspace` (`.board-wrap` + `.procedure`).
> 5. **Content adaptation, not literal copying**: the reference has 2 modes × 4 steps
>    because a compass-and-straightedge construction naturally has 4 provable stages.
>    Most lessons won't. Decide honestly:
>    - If the lesson has real sequential steps → mirror the reference's step-reveal
>      pattern directly.
>    - If the lesson is continuous/drag-driven (no natural "steps") → repurpose the step
>      slider as "which of N ideas is being demonstrated," each step jumping the
>      interactive element to a representative value (see `STEP_VALUE` in
>      `1-4-negative-numbers.html`) rather than revealing/hiding anything. This is a
>      legitimate adaptation, not a deviation — the point being ported is the
>      *mechanism* (a step axis independent of free-play, each step drivable from the
>      procedure rail or the notebook popover), not the specific "construction reveals
>      progressively" behavior.
>    - Drop what doesn't apply (no mode-toggle for a single-construction lesson) rather
>      than faking a second mode to fill the slot.
> 6. **Procedure rail**: `procedure-head`, `#procList` (N numbered `.proc-step` rows,
>    click-to-jump), `#procWhy` (one "why it works" callout), `.teach` (existing "what
>    this teaches" paragraph, moved into the rail — not left in an old header position).
> 7. **Explain system**: replace `buildTour` with `buildNotebook`. Write real 4-section
>    content per step, in both languages — *On the board now* (what's visibly true right
>    now) / *The move* (what the student just did or should do) / *Why it holds* (the
>    actual invariant or reasoning — this is the section §9.1's original gap analysis
>    found missing everywhere outside this one lesson) / *Next* (or *Result* on the
>    final step). Interpolate the live state into the text (`{r}` for a construction's
>    live radius, `{value}` for negative-numbers' live position) exactly like the
>    reference's `getEntry()` pattern — the explanation must track the actual board,
>    not describe a fixed example.
> 8. **Explain chooser popover** ("whole walkthrough" vs. a single step) and the
>    magnetic Explain-button microinteraction: port verbatim, they're generic.
> 9. **If the lesson animates its own interactive element** (a drag-driven value tween,
>    not just discrete step reveals): hook `notebook.reposition(true)` (§10.4's shared
>    addition to `buildNotebook`) into whatever per-frame ticker already tracks that
>    element, so the ring/cursor track it 1:1 instead of chasing it through their own
>    CSS transition on top of the element's own easing. This is what "explain mode isn't
>    synced with the canvas" turned out to mean on this lesson, and it will recur on any
>    other lesson with a similarly-animated interactive element.
> 10. **Verify, don't assume — use Playwright, not visual judgment** (this codebase's
>     `glm-5.2:cloud` agent has no image input, §11): load the file, check zero console
>     errors, check every `data-role` element's computed `font-family`/`direction` in
>     both languages, check no element's rect starts left of its `overflow:hidden`
>     ancestor, click through the explain popover and confirm the notebook actually
>     opens and types content, switch language and re-check, resize to the mobile
>     breakpoint and confirm the workspace stacks. Report exact measured deltas, not "it
>     looks right."
> 11. **The interactive element itself must use a real geometry/plotting library —
>     never hand-rolled world-to-pixel projection math.** §10.6 covers this in full;
>     the short version: if a lesson computes its own `value → pixel` formula
>     (`yFor()`/`vFromClientY()`-style functions) to position a draggable diagram, that
>     is the same "hardcoded canvas" problem the reference lesson's JSXGraph board
>     avoids — port it onto JSXGraph (a `point`/`glider` constrained to an axis is
>     usually enough) even when the lesson isn't "geometry" in the construction sense.

**Known backlog from this pass** — lessons sharing the exact clipped-hint pattern found
and fixed on `1-4-negative-numbers.html` (step 3 of the recipe above), not yet rebuilt:
`grade-6/1-2-comparing-ordering-integers.html`, `grade-6/3-1-multiplying-decimals.html`,
`grade-6/3-3-measurement-unit-problems.html`, `grade-6/6-4-percentage-decimal-
fractions.html`. (`grade-6/1-1-integers-absolute-value.html`,
`grade-5/5-4-double-bar-graph.html`, `grade-5/2-4-estimating-quotients.html`,
`grade-5/2-2-estimating-products.html`, and
`grade-5/6-7-multiplying-dividing-decimals-powers-ten.html` were in this list
originally but are now fully rebuilt — see §10.6 and the notes below.)

**Fourth/fifth/sixth proof points — click-and-type lessons, no drag at all.** The three
estimation/place-value lessons above have no draggable diagram — inputs are typed
numbers, native range sliders, and click-to-select buttons/points. Confirms §10.6's
rule reads correctly in both directions: port to JSXGraph only when there's a genuine
reverse pixel→value mapping to replace, and these three simply don't have one (the
existing percentage-based/cell-width line-placement math is a one-way, low-risk
formula, unlike the drag-reversal formulas that caused real bugs elsewhere). Two other
things worth carrying forward:
- **A second dual-role color pair recurred**: "estimate" vs. "exact" needs the same
  treatment as the bar-graph's two series — gold (`#c99a3c`) for the approximate/
  chosen value, teal (`#5c939f`) for the real/exact one, reused consistently across
  `2-4-estimating-quotients.html` and `2-2-estimating-products.html` rather than
  inventing a new pair each time. Worth checking for on any lesson that compares an
  estimate to a precise answer.
- **Found the same AR-font cascade-tie bug on a third kind of element**: a *static*
  HTML node (`.verdict` in `2-2-estimating-products.html`) that was never given a
  `data-role` attribute at all, so `initI18n`'s automatic scan skipped it entirely —
  distinct from the dynamically-created-node case in §10.6's double-bar-graph note.
  Check every element carrying translated sentences (not just dynamically created
  ones) for a `data-role`, not just for the class actually landing once present.

The

**Third proof point — a lesson with no coordinate math at all.**
`grade-5/5-4-double-bar-graph.html` (a bar chart, not a number line) was rebuilt to
test whether the recipe over-applies §10.6 by reflex. It doesn't: bars are plain CSS
heights, not a value-to-pixel formula, so there was no hand-rolled projection to port
onto JSXGraph — the recipe correctly recognized §10.6 as irrelevant here rather than
forcing a geometry-engine port where none was needed. Two things this lesson did
differently from the two number-line rebuilds, both legitimate per §10.5 point 5:
- **Step drives a real reveal**, not a value jump: step 0 shows series 1 only
  (`opacity:0` on every series-2 bar), step 1 fades series 2 in, step 2 auto-triggers
  the gap badge for the first category — closer to the geometric-constructions
  reference's own "reveal groups progressively" behavior than either number-line
  lesson's "jump to a representative value," because this content genuinely builds up
  in layers the way a construction does.
- **Two data series kept two distinct colors** (`#5c939f` teal / `#c99a3c` gold —
  the gold reused from DESIGN_SYSTEM.md §8's existing accent palette, not invented)
  instead of collapsing to the single accent — the same category of exception §3
  already carries for `--validation-red`: a real semantic distinction (which series is
  which), not decoration, so the "one accent" rule doesn't apply to it.

Also caught and fixed the same Arabic-font cascade-tie bug as `.zero-badge`/
`.diver-tag` elsewhere (§9.1) on a *new* element this time — `.cat-label` (the day-name
labels), which hardcodes `font-family:var(--mono)` and never had an `.ar-body` class
applied at all (not just outranked by the cascade — the class was never added on
creation). Worth checking for on every rebuild: any dynamically-created text node needs
its own `ar-ui`/`ar-body` class added explicitly in the JS that creates it; `initI18n`'s
automatic `[data-role]` scan only reaches elements that exist in the static HTML.

The
other 80 lessons haven't been individually audited yet — this list is only the files
sharing byte-for-byte the same hint-centering pattern grep found, not a full survey.

---

### 10.6 Real geometry, not hand-rolled projection math

**The gap:** both number-line lessons (`1-4-negative-numbers.html`,
`1-1-integers-absolute-value.html`) were rebuilt to match the app-shell/notebook
archetype (§10.5) while keeping their *original* interactive engine — a hand-written
`yFor(value)` / `vFromClientY(clientY)` pair of linear-interpolation formulas, plus
manual `pointerdown`/`pointermove` listeners, to turn a signed number into a pixel
position and back. That is the exact same "hardcoded canvas" problem the geometric-
constructions reference avoids by using JSXGraph — a real geometry engine that owns
the world-to-pixel projection, the drag constraint, and the coordinate math — for a
board that happens to be 1-D (a number line) instead of 2-D (a construction).

**The fix, applied to both lessons:**
- The diver is now a JSXGraph `point` on a board with `boundingbox` set to the
  value's actual range (`[-1.2, MAX+1, 6.8, MIN-1]` for the absolute-value lesson —
  asymmetric so world `x=0`, the diver's column, lands near the *left* of the
  container the way the original fixed-pixel layout did, not the horizontal centre).
  Dragging is constrained to `x=0` and snapped to whole numbers inside the point's own
  `on("drag", …)` handler — `diverPt.setPosition(JXG.COORDS_BY_USER, [0, v])` — rather
  than a hand-derived `vFromClientY()` formula.
- Tick marks + labels are real JSXGraph `segment`/`text` elements (a small loop,
  still authored by hand, but every element's *position* comes from a world
  coordinate the library projects — not a manually computed pixel `top`).
- On `1-1-integers-absolute-value.html`, the "ghost" (opposite number) is a point
  **functionally** dependent on the diver — `[0, () => -diverPt.Y()]` — so it is
  structurally incapable of drifting out of sync; the absolute-value bracket is a
  segment + two end-cap segments the same way, not three divs with hand-computed
  `top`/`height`.
- The HTML pill labels (zero-badge, diver-tag, ghost-tag, bracket-label, drag-hint)
  **stay** as CSS-styled overlay divs — rebuilding those as JSXGraph text elements
  too would lose the pill background/border/padding treatment for no real gain — but
  their position is now read from JSXGraph's own projection
  (`point.coords.scrCoords`) via a single `syncOverlay()` function, never computed by
  hand. This hybrid (real geometry engine + CSS-styled label overlay synced from its
  coordinates) is the pattern to reuse, not "port everything into JSXGraph including
  the labels."

**A real bug this surfaced, worth watching for on the next lesson:** the first pass of
the drag handler updated the point's position and called `syncOverlay()` (which only
repositions the *label pills*, via CSS `top`) but never refreshed the diver-tag text,
the KaTeX equation, or the slider readout — because that text/equation update used to
live entirely inside the position-tweening `render()` function, which the drag handler
doesn't call (calling it would fight JSXGraph's own drag with a redundant gsap tween on
top of it). Fixed by splitting `render()` into `renderLabels()` (text/equation/slider —
called from *both* the drag handler and programmatic value changes) and the tween
itself. **Any lesson with a draggable element needs this same split**: one function
that only touches text/derived state, callable from a native-library drag event
without also re-triggering a position animation.

Verified via a real simulated Playwright drag (`page.mouse.down/move/up` with enough
intermediate steps for the library's own drag threshold to register — a single large
jump can get swallowed; several small moves with short waits between them works
reliably), not assumed from the code reading correctly.

---

## 11. Verification methodology

- **Never Read PNG/screenshot files** — `glm-5.2:cloud` has no image input. Judge from
  text/Playwright probes; the user eyeballs visuals.
- Run probes **from the project root** so `playwright` resolves:
  `await page.goto('file://' + encodeURI(absPath), { waitUntil:'domcontentloaded' });`
- Drive the page: click `.mode-btn[data-mode=x]`; set `#stepSlider.value` + dispatch
  `input`; wait ~1200–1600ms for animation + JSXGraph projection.
- Read SVG geometry from tagged nodes (`getAttribute('cx','rx','x2',…)`). Derive
  **px/unit from two known points** before converting pixel sizes to units.
- `MutationObserver({attributes:true})` confirms whether an interaction re-triggers
  style/attribute changes (used to diagnose the highlight + drag bugs).
- Assert no `pageerror` / no new console errors. (The pre-existing
  `file:///math-lab/note-taker/save` fetch error is unrelated — file:// can't fetch.)

---

## 12. Match-a-lesson checklist

Auditing or starting a lesson? Check it against this.

- [ ] One self-contained HTML file; loads the shared shell + motion + jsxgraph-skin (+ JSXGraph/KaTeX as needed).
- [ ] Uses the shell tokens (no hard-coded colors/sizes); one accent for the whole page, Apple-pass palette (§3) — not the old one-accent-per-role split.
- [ ] App-shell layout (or the simpler `.shell` for short lessons): eq-bar, controls, workspace (scene | rail), teach, nav.
- [ ] `T = {en, ar}` with every string; `initI18n` + `onLangChange` re-renders; AR digits via `arNum`; strict title separation.
- [ ] Equation bar (KaTeX) stating the invariant, revealed progressively; result text in the result color.
- [ ] Step reveal via `THRESH` + `applyStep` + `revealEl` dispatcher; auto-play 0→3 then stop; manual control cancels.
- [ ] Motion matches the metaphor (§5); `draw`/`appear`/`popPoint` from the shared `lesson-motion.js` (not duplicated).
- [ ] Sliders drive `springValue`s; `--fill` set on input.
- [ ] JSXGraph board: `keepaspectratio`, tagged elements, `syncBoardSize` after any rebuild, `point.highlight = false`.
- [ ] Explain affordance (tour and/or notebook, optionally behind a chooser popover); notebook state-aware + non-blocking.
- [ ] `prefers-reduced-motion` quiets ambient motion.
- [ ] Motion uses `QUIET_SPRING`/`settle` by default (§5, §6); `STATE_SPRING`'s elastic pop is an explicit, deliberate opt-in, not left over from before the Apple pass.
- [ ] No ambient board-aurora glow on a new/updated lesson (optional even before, off by default now — §5).

---

## 13. File map

```
schools/SCHOOLS_FINGERPRINT.md                     ← this file
schools/assets/css/lesson-shell.css                ← shell + tokens + tour/notebook CSS
schools/assets/js/lesson-shell.js                  ← initI18n, renderEquation, buildNotebook, buildTour
schools/assets/js/lesson-motion.js                 ← draw/appear/springValue/EXPO  (§6 contract; §10.2.4 fix)
schools/assets/css/jsxgraph-skin.css               ← JSXGraph label/nav base skin
schools/assets/vendor/jsxgraphcore.js, jsxgraph.css, motion.min.js   ← vendored engines
math-lab/assets/vendor/katex.min.js + css          ← equations
schools/grade-5/, schools/grade-6/                 ← lessons (one HTML per lesson)
DESIGN_SYSTEM.md §14                               ← the schools-shell design decisions (the upstream source)
```

**When you come back to the schools system:** read §1 (vision) and §2 (fingerprint),
run the §12 checklist against the lesson you're touching, and use §10 as the concrete
reference for how a fully-built lesson looks — including the exact parameters and the
five fixes that define the current, working state.