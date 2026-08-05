# Design: Math Canvas — infinite workspace with live engine nodes

Date: 2026-08-04
Status: Design approved (6 mockup iterations), ready for `writing-plans`.

Reference mockup (final, approved as "ممتاز" — matches after that): [`assets/2026-08-04-math-canvas-v6-mockup.html`](assets/2026-08-04-math-canvas-v6-mockup.html). Open it in a browser — it's self-contained (fonts embedded) and includes a real, mouse-draggable 3D viewport.

Not to be confused with `2026-08-01-mathematica-canvas-design.md` (the Universities-vertical Wolfram-language teaching tool) — different project, coincidentally similar name.

## Purpose

An infinite canvas — modeled directly on Excalidraw, which the user already has cloned locally
at `/home/ameer/excalidraw` (MIT-licensed) — where a professor explaining a lesson (primary
user) or a student reviewing notes (secondary) can freely draw/write/sticky-note **and** drop
in live "engine nodes" sourced from the General Lab's existing 7 engines (140+ methods). Nodes
can be wired together with real arrows so one node's output feeds another's input, live —
turning a lecture board into an executable diagram instead of a static drawing.

## Users & primary scenario

Primary: an instructor, live or pre-building a board, walking through a topic that touches more
than one method (e.g. a function → its derivative/tangent → the solid it sweeps out under
revolution). Secondary: a student reviewing a saved board. Presentation-mode / projector
specifics were explicitly deferred by the user as "not important right now" — out of scope for
this spec.

## Architecture

- **New, separate app**: `canvas/` at the repo root, next to `math-lab/` — not a subfolder of
  it, not a plugin bolted onto stock Excalidraw. It is **our own fork** of the Excalidraw
  source (copied in from `/home/ameer/excalidraw`, not consumed as an npm dependency), so we
  can edit its internals directly, not just its public plugin API. This is a deliberate
  reversal of the more common "extend Excalidraw" pattern: the user wants to own the code, not
  live as a guest inside someone else's app shell.
- Excalidraw's real stack carries over as-is: **React + TypeScript + Vite**, with its own build
  step. This is a hard mismatch with `math-lab/`'s no-build vanilla-JS site, and that's
  accepted — `canvas/` is a self-contained app with its own `package.json`/dev server, linked
  from the root hub (`index.html`) the same way the other "labs" are, not merged into
  `math-lab/`'s asset pipeline.
- **Collaboration/live-multiplayer and the save-server**, both present in the real Excalidraw
  repo, are **not built now** — explicitly deprioritized by the user ("maybe later, not a
  priority"). Local-only persistence for v0 (exact mechanism — browser storage vs. `.excalidraw`-
  style file export/import matching the user's existing lecture-file habit at
  `~/Desktop/math channel/Excalidraw/*.excalidraw` — is an open question for the implementation
  plan, not decided here).

## Library panel

Left sidebar, always visible, styled with the site's real `.engine-card` language (radial
accent glow, crosshair corners) rather than a generic file tree:

- One collapsible group per engine (Complex Analysis, Calculus, ODE/PDE, Linear Algebra,
  Numerical, Statistics, Number Theory), each carrying **that engine's own real accent color**
  already defined per-engine in the existing site (e.g. Complex Analysis `#b45fd0`, Calculus
  `#4f9e82` — pulled live from `math-lab/engines/*/index.html`, not invented).
- Each engine expands to its method list. Methods needing an explicit "Run" step (CAS/symbolic
  — see Execution model below) carry a small dashed "Run" badge in the list itself, so the
  cost is visible before you drag one out.
- Clicking a method instantiates a node on the canvas at a default/click position.

## Node design

Nodes are **purpose-built for the canvas — not reused/embedded copies of the existing method
pages**. The user was explicit that the existing pages carry too much page-chrome baggage for
this context. Each node is a small, self-contained component built fresh, but its computation
calls the **same pure, DOM-free core files that already exist** per method (e.g. `mobius.js`,
`complex.js` under `math-lab/assets/js/`) — zero duplication of algorithm code, consistent with
the project's existing rule that each algorithm lives in exactly one file.

Visual language (validated in the mockup, matches `DESIGN_SYSTEM.md` tokens exactly — real
embedded Roc Grotesk / Azeret Mono / Fraunces, `--core-black`/`--rich-carbon`/`--electric-teal`/
`--infrared`, the real `.engine-card` glow and crosshair-corner motifs, real `pulseFlash` as an
actual looping ring animation rather than a described concept):

- **Node chrome**: drag-grip, mono-uppercase title with a dot in the source engine's accent
  color, overflow/collapse affordances in the header — reads as a real tool, not a form embed.
- **Inputs are "scrub" value chips**, not plain boxed `<input>` fields: a pill with a fill-bar
  background and a large mono value, in the spirit of Blender/Figma-variables/Framer numeric
  controls, not a bare HTML text box.
- **Linked inputs** (fed by an upstream node) render read-only with a distinct linked style and
  a small "↦ linked · SourceNode" tag.
- **Outputs** are stat-tile rows; a row that just changed briefly `pulseFlash`es (a real
  expanding-ring + glow animation, reusing the site's actual documented mechanic).
- **Plots**: 2D output is a real inline SVG line/area chart, not a placeholder box. 3D output
  (e.g. volumes of revolution) is a **real, currently-interactive** canvas viewport — drag to
  orbit, scroll to zoom, idle auto-spin — built with plain canvas + a small hand-rolled 3D
  projection (no WebGL/three.js dependency needed for this), matching the "I want to be able to
  go inside and move the camera" requirement.

## Wiring

Uses Excalidraw's **real arrow-binding mechanic** (arrows already bind their start/end to
elements and follow them when dragged) — not a custom-drawn connector system. Dragging an arrow
from a node's output port to another node's input port:

1. Renders as a real bound Excalidraw arrow (diamond port markers, animated flowing dashes so a
   connection visibly reads as "live," per the validated mockup).
2. Is also recorded in a small internal graph data structure we own (which node feeds which
   input) — the binding is visual *and* semantic, not visual-only.
3. Triggers recompute of the downstream node whenever the upstream value changes, per the
   Execution model below.

## Execution model

Decided **per method, not globally**: closed-form/algebraic methods (Complex Arithmetic,
Möbius Mapping, Derivative/Tangent, Volume of Revolution as scoped for v0) recompute **live**
on every upstream change, no button. Heavier CAS/symbolic methods (Contour Integration, Laurent
Series, Taylor Series, …) require an explicit **Run** button in the node header (infrared-
styled) — avoids stalling the canvas on every keystroke for a slow symbolic computation. Which
bucket a method falls into is part of that method's port spec (see below).

## Free-draw / handwriting layer

Untouched native Excalidraw functionality — pan/zoom/shapes/sticky-notes/freehand
drawing/text — coexists on the same canvas as nodes, using Excalidraw's actual bundled
handwriting font (Virgil, confirmed present at `/home/ameer/excalidraw/public/Virgil.woff2`) so
freehand annotations look like Excalidraw text, not a generic italic serif standing in for it.
Annotations can carry their own bound arrows pointing at a specific node's output value (same
binding mechanic as node-to-node wiring) — validated in the mockup as the thing that makes a
board read as "one explained topic" instead of disconnected boxes.

## Per-method integration unit: the "port spec"

The repeatable unit of work for turning an existing method into a node, without touching the
method's existing pure-core file:

- **inputs**: which parameters, their type/range (drives the scrub-chip UI)
- **outputs**: which results, and how to render each (number / KaTeX / 2D plot / 3D plot)
- **compute**: reference to the existing pure-core function to call
- **execution mode**: `live` or `run`

This is what makes onboarding future methods (beyond v0's initial set) additive work, not a
redesign each time.

## v0 scope — the walking skeleton

Explicitly the *first* build slice, chosen to exercise every mechanism above end-to-end without
committing to all 140+ methods up front:

1. `canvas/` app scaffolded from the forked Excalidraw source, running standalone, no
   collaboration/save-server.
2. Library panel with exactly the engines/methods needed to demonstrate the mechanism — not a
   full 140-method rollout.
3. **Complex Analysis** pair (both closed-form/live, validates simple node + live wiring):
   Complex Arithmetic → Möbius Mapping.
4. **Calculus** trio (validates fan-out wiring — one output feeding two different downstream
   nodes — plus both plot types): Function (`f(x)`) → Derivative/Tangent (2D plot) and
   Function → Volume of Revolution (interactive 3D viewport).
5. Free-draw layer with real Virgil-font handwriting and bound annotation arrows, coexisting
   with the above nodes on one board.

**Explicitly out of scope for v0** (deferred, not forgotten): the remaining 130+ methods across
all engines, real-time collaboration, the `.excalidraw`-style save/export flow, any CAS/
symbolic "Run"-mode method (both v0 pairs are closed-form/live only — a Run-mode method is a
second slice once the live path is proven), presentation/projector mode.

## Open questions for the implementation plan

- Exact persistence mechanism for v0 (local file export/import vs. browser storage).
- Where in `canvas/` the port-spec files live and how the library panel's manifest is generated
  (hand-maintained JSON vs. a build-time scan of `math-lab/engines/`).
- Whether the interactive 3D viewport should be reused as one shared component across future
  3D-output methods, or built per-method — a decision `writing-plans` can make once it's
  looking at the actual node component structure.
