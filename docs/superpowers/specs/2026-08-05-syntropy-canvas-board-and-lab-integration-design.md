# Design: Syntropy Canvas — board & lab integration (phase A)

Date: 2026-08-05
Status: Implemented on branch `canvas-lab-integration`.

Reference mockup: [`assets/2026-08-04-math-canvas-v6-mockup.html`](assets/2026-08-04-math-canvas-v6-mockup.html)
(the same approved v6 mockup cited by `2026-08-04-math-canvas-design.md`).

## Why this phase exists

Every canvas phase after the fork scaffold scoped itself to chrome and deferred content. The
node-visual-language design says so outright — it "does **not** compute real values, does not
decide what any specific method's inputs/outputs are, and does not build 2D plots or the
interactive 3D viewport" — and the phase before it "deliberately shipped nodes as empty visual
shells."

But roughly 80% of the mockup's visual weight *is* content: `√x`, `[0, 4]`, `a = 2`, the
curve-with-tangent SVG, `f'(2) = 0.354`, `V = π∫f²dx = 25.133`, the swept solid, the handwritten
callouts. Decoration wrapped around `INPUT —` reads as broken where the same decoration around
real math reads as an instrument. That is why each successive chrome phase made the result feel
worse rather than better.

The work was therefore decomposed into four sub-projects, each with its own spec/plan cycle:

- **A — board & lab integration** *(this document)*
- **B — node host + first real method.** The hybrid overlay (nodes stay Excalidraw elements for
  geometry, persistence, undo and export, but render and take input through a DOM overlay that
  reads their `x/y/width/height` off the scene), the canvas-side port-spec manifest, one method
  implemented end to end, content-driven node size, and the portal tab that opens the method's
  lab page pre-filled with the canvas node's values.
- **C — n8n-style wiring.** Ports on the node edges, drag-to-connect, the semantic graph, drawn
  in the mockup's dashed-flowing-accent language. Depends on B's overlay and input model.
- **D — port-spec rollout** to the remaining methods.

Phase A is deliberately the cheap, mechanical one: it makes Canvas part of the site, puts the
note-taker inside it so board-level design bugs can be flagged from here on, and closes the
board-level visual gap. **No node content, computation, port specs, wiring, or portal tab.**

## 1. One serving root

`math-lab/note-taker/serve.py` served `math-lab/` as its root, so `canvas/` was unreachable from
it and the hub's own `../canvas/dist/index.html` link 404'd. `SITE_ROOT` now resolves to the repo
root and `SAVE_PATH` moves to `/math-lab/note-taker/save`, so one origin carries the top-level
hub at `/`, the General Lab at `/math-lab/`, and Canvas at `/canvas/dist/`.

`engine-core.js`'s widget loader previously guessed a relative path by counting segments after a
`/math-lab/` marker — which silently failed on the top-level hub, since it sits outside
`math-lab/` entirely. It now resolves against `document.currentScript.src`, a fixed offset
(`../../note-taker/notes-widget.js`), so one resolution works at every depth over both `http` and
`file://`.

## 2. Note-taker inside Canvas

Canvas's `index.html` loads `/math-lab/note-taker/notes-widget.js` behind the same
`localhost`/`file://` runtime guard `engine-core.js` uses — same widget, no fork. Over `file://`
it falls back to a relative path, since there is no origin to be absolute against.

Vite's dev server proxies `/math-lab` to `http://localhost:8000`, so both the widget script and
its save POST work in dev exactly as on the built dist.

**Bug found and fixed during verification:** every space typed into a note was silently swallowed
inside Canvas. The widget lives in a Shadow DOM, so when a keystroke crosses the shadow boundary
the browser **retargets** it — a document-level listener sees `event.target` as the host `<div>`,
not the textarea. Excalidraw's guard (`isWritableElement`, `packages/common/src/utils.ts:77`)
tests `target instanceof HTMLTextAreaElement`, so it failed to recognise typing, fell through to
its Space-to-pan binding (`components/App.tsx:5718`), and called `preventDefault()`. Fixed in the
widget by stopping propagation at the shadow root for events originating in an `INPUT`/`TEXTAREA`
— which protects it on *any* host page with global shortcuts, not just this one.

**Known limits.** The widget pins to DOM elements, so inside Canvas the toolbar, panels, dialogs
and nodes can be flagged, but shapes drawn on the `<canvas>` surface cannot — they aren't DOM.
And since Canvas is a single-page app, all its notes key to `/canvas/dist/index.html`.

## 3. Board chrome

- **Welcome screen removed.** Its hint arrows, centered logo/heading block and Open/Help menu
  covered the top third of the board.
- **Dot grid** — the mockup's `.canvas5` field (24px, `rgba(255,255,255,.05)`), drawn on the
  static scene canvas via a new `renderDotGrid` render-config flag. It has to be drawn rather
  than set as a CSS background because the canvas is painted opaque with `viewBackgroundColor`;
  drawing it there is also what makes it scroll and zoom with the board. Deliberately *not*
  Excalidraw's own grid, which draws ruled lines and whose toggle (`isGridModeEnabled`) also
  switches on element snapping. The flag defaults off so overlay canvases and exports don't
  repaint it, and yields to the ruled grid so the two never stack.
- **Toolbar** restyled to the mockup's `.toolbar5` pill: `999px` radius, hairline border, tighter
  padding, numbered shortcut badges hidden (the bindings still work), and the permanent
  "To move canvas, hold Scroll wheel…" hint suppressed. **Every tool is retained** — the mockup's
  five icons would have cost arrow, ellipse, line, image, eraser and laser, and arrow is what the
  mockup's own annotation callouts are made of.
- **Crosshairs.** `Island` drew four corner ticks unconditionally, including on Islands used as
  transparent layout wrappers with no background or padding — where they rendered as four `+`
  glyphs floating in space. Suppressed there, and on the toolbar, which is now a pill and has no
  corners to tick. Rectangular surfaces keep theirs.

## 4. Library panel

`generate-engine-manifest.mjs` already opened calculus's five category pages to find its methods,
then flattened them and discarded the grouping — which is why the panel rendered 26 calculus
methods as one wall of text. Category is now kept on each method record.

The panel gets: all engines **collapsed by default**; a **sticky search field** filtering method
names across all seven engines (matching engines are force-expanded, non-matching ones dropped);
**category sub-grouping** where categories exist; and the mockup's `.method5` row treatment — an
engine-accent dot and a soft accent glow bleeding in from the left on hover.

Engine rows lost their crosshairs: the site's motif is sized for a full `.engine-card` with 28px
of padding, and on a ~36px row the four marks land on the border and read as clutter. The
mockup's own `.eng5-head` has none.

The mockup's `RUN` badge is **not** included — nothing yet knows which methods are run-mode. That
belongs to the port spec in phase B.

## Verification

All performed against the built dist served from the repo root:

1. `/`, `/math-lab/index.html`, `/canvas/dist/index.html` and the widget all return 200 from one
   origin; the hub's `../canvas/dist/index.html` link resolves 200.
2. The widget loads on a method page, on the top-level hub (previously broken), and inside Canvas.
3. A note pinned to a Canvas DOM element writes to `notes.json`/`notes.md` with the correct page
   path and element selector, and note text keeps its spaces.
4. Dot grid renders at 24px; welcome screen, hint line and stray `+` glyphs are gone; toolbar
   reads as a pill with all tools present; panel opens collapsed with search and categories.
5. `yarn test:typecheck` clean, ESLint clean on all changed files, `yarn test:app --watch=false`
   → 122 files, 1841 passed, baseline held.
