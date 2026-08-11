# Design: Scene Builder — the real v1 (composition, persistence, themes, site integration)

Date: 2026-08-11
Status: Draft, approved in brainstorm. Not yet planned/built.

Reference: [`2026-08-10-scene-editor-primitive-library-design.md`](2026-08-10-scene-editor-primitive-library-design.md) (the primitive contract and composition model this builds on), [`2026-08-10-scene-editor-school-curriculum-rollout-design.md`](2026-08-10-scene-editor-school-curriculum-rollout-design.md) (the downstream product this tool would eventually feed — out of scope here).

## What "real" means here

The existing `scene-editor/app/index.html` is a working prototype: 10 primitive types render, keyframes interpolate, play/scrub/drag/inspector all function, every demo self-check passes. What makes it a prototype rather than a product:

1. **No composition.** The only multi-object scenes are two hardcoded `compound` types (`newtonSequence`, `matrixTransform`) that build their sub-objects internally. There is no way to link a Transform to *your* Grid, or point a Vector at *your* Point.
2. **No persistence.** Scenes vanish on refresh.
3. **No site presence.** `scene-editor/` is unlinked and untracked.
4. **No scene-level visual theme.** The three render treatments (Instrument / Ink & Light / Depth Field) exist only inside the label primitive.
5. **No adaptive quality.** `QualityMonitor` is built but unused.

This spec is the work to close those five gaps. It is a personal **authoring tool** for the owner until they approve it — UX polish is tuned for fast composition by one user who knows the tool, not for first-time onboarding. 3D is out of scope (stays Canvas2D; 3D is Phase 5 of the primitive-library spec).

## 1. The composition system (Option A)

Every object exposes a typed **output**. Any keyframeable input (or the Grid's transform slot) can be switched from a literal to a **link** pointing at another object's output. Each frame, links are resolved in topological order before `computeCore` runs, so a linked input always reads the target's *current live* state (including its interpolated track value at the playhead).

### Output types

Each primitive declares one output type. The resolver reads the target's computed state and produces the typed value.

| Primitive | Output type | Value |
|---|---|---|
| Point | `point` | `{x, y}` |
| Vector | `point` | its tip `{x, y}` (the `to` endpoint) |
| Tangent | `point` | the point on the curve `{x, y}` |
| Transform | `transformFn` | `(pt) => pt` (bound `apply`) |
| IterationStepper | `scalar` | `sequence[round(revealIndex)]` — the currently revealed value |
| Shape (bars) | `scalar` | the running `sum` |
| FunctionPlot | `pointList` | sampled `[{x,y}…]` |
| Shape (region) | `pointList` | boundary `[{x,y}…]` |
| Grid, Camera, Label | `none` | not referenceable (consumers / visual only) |

### Link format (scene data)

```
links: {
  "toX": { ref: "obj3", path: "x" },   // a scalar field linking to a point's x
  "transform": { ref: "obj2" }          // Grid's transform slot linking to a Transform's fn (no path — primary output)
}
```

`path` is required only when a scalar field links to a non-scalar output (e.g. a Point's `x` linking to another Point needs `path: "x"`). It defaults to the target's primary output. Compatible (target output type, expected input type) pairs are enforced in the inspector dropdown, not at resolve time — resolve just substitutes; a type mismatch renders the consuming object as errored rather than crashing.

### Resolution algorithm (per frame)

1. `liveConfig` = base `config` + interpolated track values at `transport.t` (existing `resolveConfig`, unchanged).
2. Build the dependency graph: object A depends on B if any of A's `links` references B.
3. Topological sort. If a cycle is detected, every object on the cycle is flagged `errored: "circular link"` and skipped; objects not on the cycle still resolve.
4. In topo order, for each object: `inputs = resolveInputs(liveConfig, links, resolvedOutputs)` — for each link, substitute the target's already-resolved output (with `path` projection). Then `state = primitive.computeCore(inputs)`. Store `state` (and its derived output) keyed by id.
5. Render pass: camera first (if present, wraps the rest), then each non-camera object renders with its stored `state`. Errored objects render a small red marker instead of geometry.

The resolver is pure and synchronous; it returns `{states, errors, order}`. The render function consumes it. This keeps the existing "compute once, render once" discipline the primitives already follow.

### What changes in the object model

- Drop `compound` and `renderCompound`. Every object is the same shape: `{id, type, primitive, config, tracks, links, errored}`.
- `newtonSequence` and `matrixTransform` are **removed** as library types. The scenes they hardcoded are now built by linking: a Newton scene = an IterationStepper object + a Point whose `x` links to the stepper + a Tangent whose `at` links to that Point; a matrix scene = a Grid object whose `transform` slot links to a Transform object + two Vectors whose tips link through the same Transform's output.
- **New standalone library objects:** `grid`, `transform`, `iterationStepper` (previously only reachable inside the compounds).

### IterationStepper's step function (the one JS-shaped input)

Per the primitive-library spec's own open question, v1 keeps the step as a typed expression, not a node graph. The stepper exposes a compiled expression in `x` (the previous value), with `fx` (f at x) and `dfx` (numeric derivative of f at x) available as names. Default step expression: `x - fx/dfx` (Newton's method). This covers Newton, fixed-point iteration, gradient descent, and any single-variable recurrence — the cases the prototypes proved. The `expr` field is the function `f(x)`, compiled by the existing `compileExpression`.

## 2. Persistence

- **Autosave** the full scene (`objects`, `tracks`, `links`, `theme`, `viewDomain`, `viewRange`) to `localStorage` on every change (add/delete/pose/type/link/theme). Restore on load. A "Reset" button clears it.
- **Export / Import:** download the scene as a `.scene.json` file; import via a file picker. Scenes are portable files, not trapped in the browser. No backend.

Format = the exact in-memory scene shape plus a `version: 1` field. No schema migration in v1; a version mismatch shows a "scene from a newer version" message and refuses.

## 3. Render themes

One scene-level selector: `instrument` | `ink` | `depth`. A `theme.js` module exports three style bundles (stroke colors, fill colors, label font/color/glow, axis treatment). Each primitive's `render` already takes a `style`; the render pass merges the active theme bundle into each object's `style` before calling `render`. The label primitive's three treatments are already this — I extend the same idea to curves, points, vectors, grids, and shapes so the whole scene reads as one system. Theme is part of the persisted scene.

## 4. Adaptive quality

Wire `QualityMonitor` into the render loop with a small tier list: `[{name:'full', samples:150, dprCap:2}, {name:'reduced', samples:60, dprCap:1}]`. The monitor degrades after sustained low fps and recovers when idle (its existing hysteresis). On tier change, the per-object sample counts and canvas dpr update. Only affects `FunctionPlot` and `Shape` sample counts and the canvas dpr — nothing else changes. This is mostly wiring; the monitor is already built and stress-tested.

## 5. Site integration

- Add a hub entry "Scene Builder" alongside "Open Canvas" and "Enter General Lab" in `index.html`.
- The isolation contract stays: nothing outside `scene-editor/` imports from it. It is merely *linked* and *reachable*, not coupled.
- Apply the site's real visual system (Roc Grotesk / Azeret Mono / dark palette) to the shell — `app/index.html` already does most of this; I'll align the remaining shell chrome to match the hub and lab pages.

## 6. File structure

```
scene-editor/
  src/
    compose/
      output-types.js   — per-primitive output declarations + path projection
      resolve.js         — topological resolver + link evaluation, returns {states, errors, order}
    scene/
      persistence.js     — localStorage autosave + JSON export/import
      theme.js           — the three style bundles
  app/
    index.html          — reworked: links UI in inspector, theme switch, save/load, adaptive loop; compounds removed
  demo/
    composition.html    — NEW validation gate: rebuilds Newton + matrix scenes via links only, self-checks the maths match the old hardcoded compounds
    (existing demos untouched)
```

Primitives get small additions: each declares its output type (one line); Grid accepts a resolved `transformFn`; Vector/Tangent/Point already accept point/scalar inputs that the resolver substitutes. No primitive is rewritten.

## Validation gate

Matching the project's established pattern (demos with inline self-checks prove claims), `demo/composition.html` builds the two former compound scenes using **only** linked standalone objects and asserts:
- The linked Newton scene's revealed Point matches `IterationStepper.sequence[revealIndex]` to 9 decimals (same assertion the existing primitives demo uses).
- The linked matrix scene's Grid vertices match `Transform.apply` for each grid intersection (same assertion the matrix demo uses).
- A deliberate circular link is detected and flagged without throwing.

If all three pass, the reference system is proven equivalent to the hardcoded compounds it replaces — the same standard the original prototypes were held to.

## Scope cuts (explicit, not built in v1)

- No 3D (Canvas2D only).
- No undo/redo (add if missed during authoring).
- No multi-select.
- No snapping / grid-to-pixel alignment.
- No presets ("add Newton scene as one click") — the objects + links to build them are enough for v1; presets are a cheap follow-up if composition feels tedious.
- No node-graph editor (v2, per the primitive-library spec; the link data model is already the graph a future editor would draw over).

## Build order

1. `compose/output-types.js` + `compose/resolve.js` — the resolver, with unit-style self-checks in a scratch demo.
2. Rework `app/index.html` object model (drop compounds, add `links`, standalone grid/transform/iterationStepper).
3. Inspector links UI (link toggle + compatible-object dropdown).
4. `demo/composition.html` validation gate — must pass before anything else ships.
5. `scene/persistence.js` (autosave + export/import).
6. `scene/theme.js` + theme switch + per-primitive theme routing.
7. Adaptive quality wiring.
8. Hub link + shell visual alignment.