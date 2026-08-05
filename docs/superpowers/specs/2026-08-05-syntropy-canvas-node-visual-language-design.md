# Design: Syntropy Canvas — the mockup's node visual language, generic and visuals-only

Date: 2026-08-05
Status: Design approved, ready for `writing-plans`.

Reference mockup: [`assets/2026-08-04-math-canvas-v6-mockup.html`](assets/2026-08-04-math-canvas-v6-mockup.html)
(same file `2026-08-04-math-canvas-design.md` cites as approved). This design ports its visual
language into the real `SyntropyNode`/wiring system built by
`2026-08-05-syntropy-canvas-library-panel-node-shell.md`.

## Purpose

The library-panel-node-shell plan (already implemented) deliberately shipped nodes as empty
visual shells: a header, two placeholder "INPUT —" rows, an empty output area — explicitly
scoped that way. The mockup — approved on 2026-08-04, "ready for `writing-plans`" per its own
design doc — shows a much richer look: scrub-chip inputs, wired arrows between nodes with
diamond port markers and flowing dashes, output rows that pulse when they change, and
handwritten annotation callouts pointing at specific values. That richer look was never built.

**This design's scope is strictly the visual language** — how nodes, wires, and annotations
*look and render* — applied generically to every node the library panel can already spawn
(all 140+ methods), using static/placeholder content throughout. It does **not** compute real
values, does not decide what any specific method's inputs/outputs are, and does not build 2D
plots or the interactive 3D viewport (both are tied to a specific method's real output — that's
`2026-08-04-math-canvas-design.md`'s "port spec" territory, explicitly deferred). Nothing here
requires deciding "how the engines get used."

## 1. Scrub-chip inputs

Replace `SyntropyNode`'s current plain `.SyntropyNode__scrub` rows (a flat label/value pair)
with the mockup's `.scrub5` treatment, ported class-for-class:

- A pill (rounded rect, `--core-black` background, subtle border) containing a fill-bar layer
  (`scrub5-fill`, a horizontal gradient sized by a `--pct` custom property) behind a
  label/value row (mono uppercase label left, larger mono value right).
- Content stays exactly what it is today — placeholder label ("input") and value ("—") — only
  the chrome changes. `--pct` gets a fixed placeholder (e.g. 50%) since there's no real value
  driving it yet.

## 2. Output row + the `pulseFlash` capability

Replace `SyntropyNode__output`'s current empty dashed div with a proper output row matching
`.out5-row`: a mono key/value pair on a slightly-elevated background, in a bordered group
(`.out5`) separated from the inputs by a dashed rule (already present). Content is a single
placeholder row (key: "output", value: "—").

Port the `pulseFlash` mechanic as a CSS capability — the `.flash` modifier class, its
`rowglow5`/`ringpulse5` keyframe animations (background glow pulse + expanding-ring border) —
onto the new output row, but **nothing applies the `.flash` class anywhere in this phase**. No
computation exists yet to react to; the capability exists so a later phase (real per-method
computation) can flip it on without touching CSS again.

## 3. Wiring

**Mechanism**: Excalidraw arrows already natively support everything the mockup's wires need as
plain element properties — no custom rendering, no new element type:

- `strokeStyle: "dashed"` — the dash pattern itself.
- `startArrowhead` / `endArrowhead: "diamond"` — the mockup's port markers *are* diamond
  arrowheads; no separate decorative port-dot element is needed.
- `strokeColor` — set to the **source** node's engine accent (`ENGINE_ACCENTS[engineId]` from
  `engineAccents.ts`, the same system Task 1/3 already built), so a wire leaving a Complex
  Analysis node is purple, a Calculus one is green, etc. — not a single fixed teal like the
  single-engine mockup.

**Detection**: extended inside the existing `onChange` handler in `App.tsx` (which already reads
`customData.syntropyNode` off every element on every scene change for the accent-switching
mechanism) — when an arrow element's `startBinding.elementId`/`endBinding.elementId` both
resolve to elements carrying `customData.syntropyNode`, and the arrow doesn't already carry a
`customData.syntropyWire` marker, apply the styling above via `newElementWith` and stamp
`customData.syntropyWire = true` so it's only auto-styled once (a user can still override the
style manually afterward — the marker just prevents re-forcing it every `onChange` tick).

**Flowing dashes (stretch within this phase, not required for approval)**: `AnimationController`
(`packages/excalidraw/renderer/animation.ts`), already used elsewhere in this fork (e.g.
`animatedTrail.ts`) for exactly this kind of continuous canvas-redraw-driven effect, can drive a
periodically-incrementing dash offset for elements carrying `customData.syntropyWire`. This is
called out separately because it's the one piece with a real, if small, performance cost (a
recurring re-render while any wire exists on the board) — the implementation plan can build the
static (non-animated) dashed wire first, confirm it reads correctly, then add the animation as
its own task with an explicit go/no-go rather than bundling the perf tradeoff into the base
feature.

**Linked scrub-chip reaction**: when a wire's target is a `SyntropyNode`, that node's *first*
scrub-chip switches to the mockup's `.scrub5.linked` treatment — tinted border/fill in the
source's engine accent, a small `↦ linked` tag — purely because a wire now points at it. No
value is actually read from the source node; this is a visual reaction to the wire's existence,
matching the mockup's appearance without simulating data flow.

## 4. Annotations

Already fully supported by native, untouched Excalidraw functionality: freehand text plus a
bound arrow pointing at any element (including a `SyntropyNode`) is exactly what the mockup's
handwritten callouts are — a normal text element in the hand-drawn Excalifont, a normal arrow
bound to it and to the target node. **Nothing to build.** This phase's verification step confirms
it actually works against a real `SyntropyNode` (bind an annotation arrow to one, confirm it
tracks the node when dragged), since it's never been explicitly exercised against the new node
type before.

## Explicitly out of scope

2D plots, the interactive 3D viewport, real per-method computation, the semantic
node-feeds-node graph data structure described in `2026-08-04-math-canvas-design.md`'s "Wiring"
section (recompute triggering) — all deferred. This phase only changes what things *look like*
and what *native Excalidraw mechanics* (arrow binding, annotation binding) already do when
pointed at the new node type.

## Verification

1. Spawn a node from the library panel — scrub chips render with fill-bar/label/value chrome
   matching the mockup; output row renders as a stat-tile, not an empty dashed box.
2. Draw an arrow between two nodes from different engines — it auto-styles dashed, diamond
   arrowheads, colored to the *source* node's engine accent; the target's first scrub-chip
   flips to the linked style with the correct accent and the `↦ linked` tag.
3. Manually re-style a wire arrow afterward (e.g. change its color) — confirm it does not get
   force-reset back on the next `onChange` tick (the `customData.syntropyWire` marker is
   respected).
4. Draw a normal text + bound arrow annotation pointing at a node's output row; drag the node;
   confirm the annotation's arrow follows it (native behavior, just confirming it isn't broken
   for the new element type).
5. `yarn test:app --watch=false` still passes at baseline.
