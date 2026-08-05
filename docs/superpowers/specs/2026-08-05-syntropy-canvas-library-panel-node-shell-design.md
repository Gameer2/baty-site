# Design: Syntropy Canvas — library panel + generic node shell

Date: 2026-08-05
Status: Design approved, ready for `writing-plans`.

Third sub-project of the Math Canvas work, after the fork/scaffold
(`2026-08-04-math-canvas-fork-scaffold.md`) and the visual identity pass
(`2026-08-04-syntropy-canvas-visual-identity-design.md`, plan
`2026-08-04-syntropy-canvas-visual-identity.md`), both merged to `main`. Scope: the
library sidebar and a purpose-built, empty node shell that a library click spawns on the
canvas — no real engine computation, no node-to-node wiring. Those are explicitly the next
sub-project, once this shell is proven to actually render, drag, resize, and save like a real
Excalidraw element.

## Purpose

Prove the node-rendering mechanism end to end with a real (if computation-free) node, and give
the library sidebar real content, before spending effort on the harder problem (wiring real
`math-lab` engine functions into nodes and building the arrow-based data-flow graph). Building
the shell first, empty, means any bugs in the rendering/positioning/persistence mechanism get
found and fixed without also debugging engine-integration code at the same time.

## Architecture: nodes are embeddable elements, not a new element type

Investigated `canvas/packages/excalidraw/components/App.tsx`'s `renderEmbeddables()` (~line
1749): every `ExcalidrawEmbeddableElement` (currently used for iframe embeds like YouTube) is
mapped to a `<div className="excalidraw__embeddable-container">` positioned with
`transform: translate(x, y) scale(zoom)`, where `x`/`y` come from
`sceneCoordsToViewportCoords(el.x, el.y, this.state)` — recomputed every render from the
element's scene coordinates and the current pan/zoom state. Inside that div, the method
currently renders either an `<iframe>` (embed) or generated HTML (the AI/"magic" iframe
feature).

Rather than introducing a new Excalidraw element type — which would require touching the scene
schema, serialization, undo/redo history, and hit-testing/selection code throughout the
codebase — Syntropy nodes are **embeddable elements carrying a marker in `customData`**
(e.g. `customData.syntropyNode = { methodId, engineId }`). `renderEmbeddables()` branches on
that marker: present → render our own `<SyntropyNode>` React component in the positioned div
instead of an iframe; absent → existing behavior, completely unchanged. This means Syntropy
nodes get selection, dragging, resizing, deletion, and scene persistence for free, exactly like
every other element already does — nothing about the general element system changes.

## Library panel

Left sidebar, `.engine-card`-styled per `DESIGN_SYSTEM.md`, listing the real 7 General Lab
engines and their real methods — not placeholder data. Sourced from a **manifest generated
once** by a small script that reads each engine's existing `math-lab/engines/*/methods.html`
index page (already lists every method's real display name and link for humans) and produces a
static JSON file the `canvas/` app imports — not a runtime scan of `math-lab/`'s HTML, which
would be slower and would make the library's content depend on `math-lab/`'s file layout at
request time. Each engine section uses that engine's already-established accent color (Complex
`#b45fd0`, Calculus `#4f9e82`, Linear Algebra `#8570b3`, ODE `#4f8fc0`, Numerical `#9ec23f`,
Statistics `#c15a86`, Number Theory — needs its own accent, not yet assigned in any prior spec;
picked during implementation following the same mid-tone/moderately-desaturated family).

Clicking a method in the library creates a new embeddable element at a default canvas position
(centered in the current viewport), with `customData.syntropyNode` set to that method's
`{ methodId, engineId }`.

## Generic node shell

The `<SyntropyNode>` component rendered inside the positioned overlay div. Visual language
already validated in the approved mockup
(`docs/superpowers/specs/assets/2026-08-04-math-canvas-v6-mockup.html`) and now backed by real
implemented pieces from the visual identity pass — reuses the same tokens, not a new visual
language:

- **Header**: method name (mono, matches `--ui-font`), a dot in the source engine's accent
  color, drag affordance — same chrome language as the rest of the app now.
- **Corner ticks**: the same crosshair-tick motif implemented for `Island` in the visual
  identity pass, reimplemented here as a small shared CSS class (`SyntropyNode` isn't an
  `Island` — it's inside an embeddable container, not the app chrome layer — so it needs its
  own instance of the same 4-span pattern, not a shared component with `Island` itself).
- **Body**: 2-3 placeholder "scrub-style" input fields (the fill-bar value-chip pattern from
  the mockup) with dummy labels/values — no real parameters, since no method has a port spec
  yet.
- **Output area**: an empty stat-tile row, present and styled but empty — proves the
  `pulseFlash` CSS animation (already built for `Island`'s output-row pattern conceptually;
  needs its own instance here too) can be triggered on this component without yet having
  anything real to trigger it *from*.
- **Sizing**: responsive to the embeddable element's actual width/height (resizable via
  Excalidraw's normal element resize handles), not a fixed pixel size like the mockup used —
  the mockup was a static illustration, the real component must reflow.

## Explicitly out of scope

- Any real `math-lab` engine computation — inputs/outputs are placeholder/dummy.
- Arrow-based node-to-node wiring and the data-flow graph — meaningless without real
  input/output shapes to connect, deferred to the sub-project that adds the first real methods.
- 2D/3D plot rendering inside nodes.
- The `live` vs. `run` execution-mode distinction — no execution exists yet.

## Open questions for the implementation plan

- Exact `customData.syntropyNode` shape and where the manifest-generation script and its output
  JSON live under `canvas/`.
- Whether the corner-tick and pulse-flash CSS should be factored into a small shared partial
  once both `Island` and `SyntropyNode` need it, or left duplicated for now (two consumers is a
  thin justification for an abstraction — a call for `writing-plans` once it's looking at the
  actual file layout).
- Number Theory's accent color (not assigned in any prior spec) — pick one in the same family
  during implementation, record it here or in `DESIGN_SYSTEM.md` once chosen.
