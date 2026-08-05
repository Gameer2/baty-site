# Design: Syntropy Canvas — node host + first real method (phase B)

Date: 2026-08-05
Status: Design approved, ready for `writing-plans`.

Second sub-project after [`2026-08-05-syntropy-canvas-board-and-lab-integration-design.md`](2026-08-05-syntropy-canvas-board-and-lab-integration-design.md)
(phase A, implemented). Reference mockup: [`assets/2026-08-04-math-canvas-v6-mockup.html`](assets/2026-08-04-math-canvas-v6-mockup.html).

## Purpose

Phase A fixed the board's chrome. Every node on it is still the placeholder shell from
`2026-08-05-syntropy-canvas-node-visual-language-design.md`: two `INPUT —` rows and an empty
output row, no real values, no plot. This phase builds the mechanism that makes a node real —
for exactly one method, end to end — and the three things the user asked for on top of it:

1. **A portal.** Every node gets a tab that opens the method's real page on `math-lab`, with the
   node's current input values carried over so the page opens already filled in. This is
   explicitly the *first* step — not the last. The user was clear that this doesn't replace
   in-canvas computation; it's what ships before it.
2. **In-canvas computation**, reusing the exact same core file the page calls — no duplicate
   algorithm code, per the project's standing rule.
3. **n8n-style wiring** in phase C, which needs real ports to attach to. This phase's job is to
   give nodes a place for those ports to live: real DOM, real pointer events, not the
   pointer-events-gated embeddable content the nodes render through today.

## The blocker: embeddable content is pointer-dead

`SyntropyNode.scss:43-49` already documents it: embeddable content is `pointer-events: none`
until Excalidraw marks the embeddable "active" via a double-click
(`packages/excalidraw/components/App.tsx:1587-1601`). A scrub chip can't be dragged, a portal tab
can't be clicked, and a wire port (phase C) can't be grabbed through that gate without first
double-clicking into the node — which also hijacks canvas panning while you're inside it.

## Architecture: keep the element, move the rendering

Confirmed by reading the renderer directly (`packages/element/src/renderElement.ts:326,824`):
`embeddable` elements are painted on the **static scene canvas** exactly like a `rectangle` —
`rc.draw(ShapeCache.generateElementShape(element, renderConfig))` using the element's own
`strokeColor`/`backgroundColor`. Nothing about selection, drag, resize, undo, persistence, or
export depends on what (if anything) `renderEmbeddable` returns for that element — those all
come from the element's geometry, which Excalidraw owns regardless.

That separates two things phase A's design conflated: *the element* (geometry, undo, save/load,
export) and *the content* (what's actually interactive). The fix:

- **The element stays an `embeddable`**, created exactly as today via `createSyntropyNode.ts`,
  still carrying `customData.syntropyNode`. Set `strokeColor: "transparent"` and
  `backgroundColor: "transparent"` so the canvas-drawn rectangle underneath is invisible — all
  visible chrome comes from the overlay below. This element remains the single source of truth
  for position/size/selection/drag/undo/persistence/export; nothing about that changes.
- **`renderEmbeddable` returns `null`** for syntropy nodes instead of a `<SyntropyNode>`. This is
  already a supported path — real embeds fall through the same `if (!syntropyNode) return null`
  branch today (`App.tsx:1116`).
- **A new `NodeOverlay` component**, rendered as a sibling of `<Excalidraw>` in `App.tsx` (same
  pattern as `LibraryPanel`/`LibraryToggle` today), not inside Excalidraw's own DOM tree — so it
  is never subject to `.excalidraw__embeddable-container { pointer-events: none }`
  (`packages/excalidraw/css/styles.scss:158`) at all. For every element carrying
  `customData.syntropyNode`, it renders a real `SyntropyNodeCard` positioned in screen space.

### Positioning

`sceneCoordsToViewportCoords` already exists (`packages/common/src/utils.ts:310`) and does
exactly the needed math: `screenX = (element.x + scrollX) * zoom.value + offsetLeft` (same for
Y). The overlay recomputes every node's screen position on the existing `onChange` handler
(`App.tsx:708`) — the same hook phase A already extended for wire auto-styling — so position
updates ride the same per-frame callback Excalidraw already fires during drag/pan/zoom, with no
separate render loop. Each card is sized at the element's natural `width`/`height` in scene units
with `transform: scale(zoom.value)` and `transform-origin: top left`, matching the technique
overlay libraries (React Flow, tldraw) use for exactly this problem — cheaper than recomputing
internal layout on every zoom tick.

### Pointer-events layering

The overlay div covering a node must let mouse-downs on its **header/background** pass through
to Excalidraw underneath (so drag-to-move and click-to-select on the real element still work),
while its **interactive content** (scrub chip inputs, the portal tab, later the wire ports)
captures its own clicks. Concretely: the card's outer container is `pointer-events: none`; each
interactive child sets `pointer-events: auto` individually. This is the one genuinely fiddly part
of this phase and gets its own explicit verification step (see below) rather than being assumed
to work.

## The port spec

The repeatable unit `2026-08-04-math-canvas-design.md` already named but never defined. One
method, one TypeScript object:

```ts
type PortSpec = {
  engineId: EngineId;
  methodId: string;                    // matches manifest.generated.json
  inputs: { key: string; label: string; kind: "expression" | "number"; default: unknown }[];
  outputs: { key: string; label: string; kind: "number" | "plot2d" }[];
  compute: (inputs: Record<string, unknown>) => { outputs: Record<string, unknown>; error?: string };
  executionMode: "live";               // "run" is out of scope — see below
  pagePath: string;                    // e.g. "/math-lab/engines/calculus/methods/riemann-sums.html"
  pageStoreKey: string;                // e.g. "engine-lab:calculus-riemann-sums" — see Portal below
};
```

`compute` is the *only* place a method's real core file gets called. For phase B's one method
this is a thin adapter over `Algorithms.runRiemannSum` (`math-lab/assets/js/algorithms.js:283`,
confirmed pure/DOM-free — zero `document`/`window` references, already consumed by Node in
`math-lab/tests/verify.js:11`), so canvas and the page both call the identical function. It's
importable directly: `import Algorithms from "../../../math-lab/assets/js/algorithms.js"` — Vite
handles the UMD/CJS interop.

Only **one port spec ships this phase**: Riemann Sums. `executionMode: "run"` (the CAS-backed
methods) is explicitly out of scope — this phase proves the live path only, matching the original
v0 scope's own sequencing.

## Why Riemann Sums

Recommended over the original v0 pick (Derivative/Tangent) for this specific phase: four plain
numeric/expression inputs (`f(x)`, `a`, `b`, `n`), no CAS worker, pure arithmetic so it recomputes
on every keystroke with no lag, and its return shape
(`{ width, rectangles: [{x0,x1,mid,height,area,running}], total }`) is *already built to be
plotted* — "so a page can draw them," per the function's own comment. That gives phase B a real
2D output, not just a number, while touching the fewest new mechanisms (no `math.derivative`, no
symbolic worker bridge).

`f(x)` needs the same expression parsing the page uses. `math-lab` loads `mathjs` as a vendored
script global (`math-lab/assets/vendor/math.min.js`, consumed via `Engine.compileFx` in
`engine-core.js:78`); canvas has no such global. Add `mathjs` as an npm dependency to
`canvas/excalidraw-app` — same library, imported rather than script-tagged, since canvas is a
real bundled app and math-lab's vendor/global pattern doesn't apply there.

## The portal tab

Each node's header gets an "open ↗" control. On click:

1. Read the node's current input values (already in the overlay's React state for the live
   `compute` call).
2. Write them to `localStorage` under the port spec's `pageStoreKey`, in the exact shape the
   page's own `Proto.loadState`/`saveState` round-trip already expects — confirmed in
   `riemann-sums.js:23,78-90`: key `engine-lab:calculus-riemann-sums`, shape
   `{ fx, a, b, n }`. **No page changes required.** Its existing restore-on-load block
   (`riemann-sums.js:84-90`) already reads exactly this.
3. `window.open(pagePath, "_blank")`.

This works today only because phase A put the hub, `math-lab`, and canvas on one origin — cross-
origin pages can't share `localStorage`, which is exactly the constraint phase A's "one serving
root" removed. Confirms phase A was the correct prerequisite, not just convenient ordering.

## Node sizing

Phase A's critique of the current 260×200 constant stands: content decides size. The port spec
doesn't carry a fixed size; `createSyntropyNode` computes an initial height from the spec's input
count and output kind (a `plot2d` output reserves ~140px), width stays close to today's constant
for now. Not pixel-perfect to the mockup's exact 230/290/290 — matching that precisely across
arbitrary future methods is explicitly deferred to phase D once more methods exist to calibrate
against.

## Explicitly out of scope

Wiring/ports (phase C), any `executionMode: "run"` method, the remaining 130+ port specs
(phase D), 3D plot viewport (no method in this phase needs one).

## Verification

1. Spawn a Riemann Sums node; scrub chips hold real default values (`f(x)=sin(x)+2`, `a=0`,
   `b=…`, `n=…`); editing any of them recomputes `total` and the rectangle plot live.
2. Drag the node by its header — moves on the canvas exactly as today (embeddable geometry
   unaffected); click a scrub chip input — receives focus and accepts typed input without a
   double-click into the node first. This is the pointer-events split's explicit go/no-go check.
3. Click the portal tab — a new tab opens `math-lab/engines/calculus/methods/riemann-sums.html`
   with `fxInput`/`aInput`/`bInput`/`nSlider` already showing the canvas node's values.
4. Undo after creating/moving/editing a node behaves as it does for any other element today.
5. `yarn test:typecheck`, ESLint, `yarn test:app --watch=false` all hold baseline.
