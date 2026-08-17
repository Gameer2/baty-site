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
3. **The lab identity, not a generic widget.** One accent per role (§3). The page must
   read as part of the lab, not as an off-the-shelf geometry/data widget.
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

## 3. The identity rule — one accent per role

This is the single most important fingerprint. **Every** lesson follows it (canonical).

| Role | Token | Hex | Used for |
|---|---|---|---|
| Neutrals / given / structure | `--off-white`, `--neural-fog`, `--pulse-ash` | `#e7e7e7`/`#dadada`/`#7d858c` | the given elements (segment, rays, points), body text |
| **Teal — compass work / active** | `--electric-teal` | `#5c939f` | construction arcs, active mode button, active step, links, the live cursor |
| **Green — provably-correct result** | `--validation-green` | `#59a993` | the final constructed line/ray/value |
| **Infrared — CTA only** | `--infrared` | `#ed6d40` | the Explain button, the tour ring, markers — **never on the board** |

**Rules:**
- No orange/infrared reaches the construction geometry. The board reads as teal+green
  on neutrals.
- The result distinguishes itself from the compass arcs by being **solid + thicker**
  (and green), not by being a different shape.
- One accent per role, locked across the whole page. No warm-cool mixing, no second
  accent for a stray badge.

**Company-design demos (Apple, Google, …) are a documented one-off** that may collapse
all roles onto a single brand accent (e.g. Apple `#0A84FF`). They live in a *copy*
file, keep all behavior identical, override identity via a **trailing `:root` token
block + a swapped in-page palette object**, and must NOT propagate into canonical
lessons. See §10.3.

---

## 4. Tokens (from `lesson-shell.css`)

```
colors: --core-black #090909  --rich-carbon #111  --urban-smoke #1b1b1b
        --pulse-ash #7d858c  --off-white #e7e7e7  --neural-fog #dadada
        --electric-teal #5c939f  --infrared #ed6d40  --validation-green #59a993
fonts:  --mono "Azeret Mono"  --serif "Bricolage Grotesque"  --display "Roc Grotesk"
        AR: .ar-display "El Messiri"  .ar-body/.ar-ui "Vazirmatn"
type:   --fs-2xs 11 … --fs-3xl 48 (1.2 ratio from 16px base)
        --lh-tight 1.12 / snug 1.4 / base 1.6 / relaxed 1.78
        --tr-tight -.015em / normal 0 / label .06em / wide .1em
space:  --sp-1 4 … --sp-16 64 (4px rhythm)
```
Mono is reserved for numeric/coordinate readouts only. Chrome (crumb, labels, buttons,
heads, nav) uses the display face. Use these tokens — don't hard-code sizes/colors.

---

## 5. Motion language (`lesson-motion.js`)

The motion **is the metaphor**. Match the element type to the motion:

| Element | Motion | Helper |
|---|---|---|
| Solid stroke (segment, the result line) | **draws on** via `stroke-dashoffset` | `draw(node, {duration})` |
| Dashed compass arc / circle | **swings in** (fade ± scale ± deblur) | `appear`/`appearLayered` |
| Intersection / marked point | **lands** (pop with overshoot spring) | `popPoint` |
| Scene / panel on scroll-in | **reveals** (opacity + y) | `reveal` / `revealStagger` |
| Continuous parameter (slider) | **springs** to the value (no jumps) | `springValue` |

- `EXPO = [0.16, 1, 0.3, 1]` is the default ease. `STATE_SPRING` for spring transitions.
- **`draw` uses WAAPI**, not Motion's `animate` (Motion no-ops on `strokeDashoffset`,
  verified). See the contract in §6.
- Apple/quiet demos may flatten `appearLayered`/`popPoint` to plain fades + gentle
  settles (no blur, no overshoot). Canonical lessons keep the richer motion.
- `@media (prefers-reduced-motion: reduce)` disables the ambient aurora and pulsing
  badges; the reveals stay (they're brief).

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

### 10.3 The Apple dark demo (`-apple.html`)
A **standalone one-off** that keeps all behavior/geometry identical and overrides only
identity:
- Trailing `:root` block re-points every shell token: pure-black `#000` canvas,
  `#1c1c1e` surfaces, `#f5f5f7` text, single accent `#0A84FF` (teal+green+infrared all
  collapse onto it), SF Pro system stack, opaque panels, no glows, 18px/100px radii.
- In-page `C = { fog, ash, white, teal:#0A84FF, infrared:#0A84FF, green:#0A84FF }`.
- Quieter motion: `appearLayered` = plain fade, `popPoint` = gentle scale 0.6→1 (no
  blur, no overshoot spring).
- The result line distinguishes itself by **solid + thicker**, not hue (since hue is
  gone).

> **To build another company-design copy** (Google, Linear, …): same pattern — trailing
> token block + swapped `C` + a quiet-motion pass; keep all JS/geometry; document the
> accent decision. A Google/Gemini copy was built+deleted this session: gradient
> `#4285F4→#9b72cb→#d96570`, cards `#1e1f20` 28px radius, Google Sans + Roboto Mono,
> drifting blue/purple/pink aurora on the board. Do not let any demo's collapsed-accent
> choice leak into a canonical lesson.

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
- [ ] Uses the shell tokens (no hard-coded colors/sizes); one accent per role (§3).
- [ ] App-shell layout (or the simpler `.shell` for short lessons): eq-bar, controls, workspace (scene | rail), teach, nav.
- [ ] `T = {en, ar}` with every string; `initI18n` + `onLangChange` re-renders; AR digits via `arNum`; strict title separation.
- [ ] Equation bar (KaTeX) stating the invariant, revealed progressively; result text in the result color.
- [ ] Step reveal via `THRESH` + `applyStep` + `revealEl` dispatcher; auto-play 0→3 then stop; manual control cancels.
- [ ] Motion matches the metaphor (§5); `draw`/`appear`/`popPoint` from the shared `lesson-motion.js` (not duplicated).
- [ ] Sliders drive `springValue`s; `--fill` set on input.
- [ ] JSXGraph board: `keepaspectratio`, tagged elements, `syncBoardSize` after any rebuild, `point.highlight = false`.
- [ ] Explain affordance (tour and/or notebook, optionally behind a chooser popover); notebook state-aware + non-blocking.
- [ ] `prefers-reduced-motion` quiets ambient motion.
- [ ] No company-design accent collapse in a canonical lesson (demos stay in `-apple`/`-google` copies).

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