# Changelog

Everything below is the full delta between what's currently on GitHub (`origin/main`, `8c9c1ce`) and this snapshot: 56 commits already on `upload-main` plus everything that was still sitting uncommitted in the working tree. It spans the canvas app (an Excalidraw fork under `canvas/`), fixes and the run-mode engine rollout in `math-lab/`, a full logo/branding pass, a repo-wide organization audit, and — landing in git for the first time in this push — the Schools vertical, the math-lab test/verification suite, the symbolic-kernel project, and the formal plans/specs system. Organized by feature area, not by commit.

## 3D shapes (cube / pyramid / cylinder / cone / sphere)

A new element type (`canvas/packages/element/src/shape3d.ts`) that projects hand-picked 3D primitives onto the 2D canvas and draws them through the existing rough.js pipeline — no WebGL, no three.js. Selectable from the toolbar's shape-tool fan alongside rectangle/diamond/polygon/ellipse, with rotation (X/Y/Z) and solid/wireframe controls in the properties panel (`actionShape3D.tsx`).

Fixed this session, after live-testing in the browser surfaced real problems:
- **Flat shading**: every face used to render in the exact same flat color, so a cube read as a shapeless blob with a few stray lines instead of a recognizable solid. Added directional flat-shading (`shadeForNormal` in shape3d.ts, `shadeColor` utility in `packages/common/src/colors.ts`) that lightens/darkens each face by its angle to a fixed light — cube, pyramid, and the cylinder/cone end caps now visibly read as 3D.
- **Overflow past the drawn box**: a rotated cube's silhouette (e.g. its diagonal) could project larger than the box the user actually drew, so shapes visibly stuck out past their own selection outline. Added a `rescaleToFit` pass that re-normalizes every shape's *current-rotation* silhouette to fit inside its bounding box, the way a sphere's silhouette (rotation-invariant) always incidentally did.
- **That fit had to be uniform, not stretched**: the first pass at the fix above scaled X and Y independently to force an exact fit on both axes, which squashed/stretched the cylinder and cone's curved caps every time the rotation changed their natural aspect ratio — reading as the object warping rather than turning. Switched to a single uniform scale factor (fits the tighter axis, centers the rest), which preserves true rigid-body proportions and still never overflows.
- **Cone side edges detaching from the base at odd rotations**: the cone's straight side edges were drawn to whichever base-ring point had the min/max screen X — correct only when the axis stays roughly vertical in the 2D view. At other rotations (particularly nonzero Z) those points stop being true tangent points, so the sides visibly floated off the ellipse instead of touching it, reading as "a triangle dropped onto a disconnected circle." Replaced with a real tangent-line-from-the-apex calculation (`ringTangentsFromPoint`) that's correct at any rotation.
- **Rotation-slider lag**: dragging the rotation X/Y/Z sliders fired a full geometry rebuild + rough.js redraw on every pixel of pointer movement (unlike opacity/roughness sliders, which don't touch cached geometry at all). Throttled slider commits to once per animation frame.

## Selection & drag performance

- `excalidraw-app/App.tsx`'s `onChange` handler ran a full pass over every element — rebuilding a lookup map, auto-styling Syntropy wires, syncing the node-card overlay — on **every single pointermove** during any drag or selection, regardless of whether anything relevant had changed. Coalesced this work to run at most once per animation frame via a pending-state ref + `requestAnimationFrame`, cutting most of the redundant per-frame cost during drags.
- `boxSelectionMode` default changed from Excalidraw's upstream `"contain"` (drag-select box must fully enclose an element) to `"overlap"` (any touch selects) — better suited to a board full of small nodes and wires. Still a normal user preference in the main menu.

## PDF import

New `data/pdf.ts` renders PDF pages to PNG via `pdf.js` (lazy-loaded, worker served through Vite's `?url` import) and hands the results to the existing image pipeline — no new "PDF element" type. `PdfImportDialog.tsx` shows page thumbnails, lets the user pick which pages to import, and choose a layout (grid / row / column / stacked, with configurable gap and column count) via the new `positionElementsInLayout.ts` helper. Wired into `App.tsx` for both the toolbar's PDF button and drag-and-drop of `.pdf` files. Adds `pdfjs-dist` as a dependency.

## Video elements

A new `video` element type (`packages/element/src/video.ts`), mirroring how images work: a `videoCache` keyed by file ID, populated from the same `BinaryFiles`, with the live `<video>` rendered as a DOM overlay (`App.tsx`'s `renderVideos`) and a cached `HTMLVideoElement` frame used for static/export rendering. Supports toolbar insertion and drag-and-drop, with a 25MB upload cap (videos are stored inline as base64 in the scene). Wired into the shared geometry helpers (`bounds.ts`, `comparisons.ts`, `distance.ts`) alongside images so selection, resizing, and hit-testing all work the same way.

## Eraser: three modes + adjustable size

`actionEraser.tsx` adds a mode switcher (radio buttons) and a free-moving size slider (6–48px, replacing a coarse few-step picker), backed by new `EraserMode`/`ERASER_SIZE_*` constants:
- **Precision** (new): cuts exactly the points the eraser circle passed over, for freedraw and non-polygon lines — a razor cut rather than deleting the whole stroke. Implemented in `eraser/splitStrokeElement.ts`, which finds which of a stroke's *original* points were touched (with safety-net sampling for long segments so a fast eraser drag doesn't skip a whole gap between sparse points) and splits the stroke into surviving runs, dropping fragments under 2 points.
- **Stroke** (default, unchanged): deletes the whole element on touch — the original behavior.
- **Clear** (new): deletes every unlocked element on the very first touch, anywhere — equivalent to select-all + delete, bypassing the eraser trail/hit-testing entirely. Still undoable.

## Polygon tool

A new `polygon` element type: a regular N-gon (3–20 sides, default hexagon) inscribed in the element's bounding box, with a sides-count slider in the properties panel. Wired into hit-testing (`getPolygonPoints` in `bounds.ts`, `distanceToPolygonElement` in `distance.ts`) and the same style-panel predicates (background, stroke color/width/style) as the other closed shapes. Selectable from the toolbar's shape-tool fan.

## Engineering / drafting instruments

Six new on-canvas instrument overlays — compass, ruler, protractor, T-square, set square, angle bisector — grouped behind one toolbar flyout (`EngineeringToolsDropdown` in `Tools.tsx`; the trigger icon shows whichever sub-tool is active). Unlike generic shapes, these aren't drawn once and left as elements: each is a live, persistent instrument (`InstrumentOverlay` state in `components/engineeringOverlay.ts`, ~1550 lines, plus the `engineeringTools.ts` type registry) rendered on the interactive canvas that you manipulate directly, the same way you'd handle a physical drafting tool, before committing an actual mark.

**Interaction model** (after GeoGebra's ruler/protractor): every instrument exposes up to five drag zones, hit-tested against the pointer in scene space —
- **move** (drag the body) and **rotate** (a dedicated handle) on all six;
- **draw** (drag the pen/tip handle) sweeps out the mark and only *previews* it — nothing is added to the scene until the gesture ends;
- **radius** (compass only) opens/closes the legs to set the circle's radius before scribing, independent of drawing;
- **spread** (angle bisector only) drags either leg tip to open/close the bisected angle — both legs stay symmetric around the bisector by construction.

**What each one actually does:**
- **Compass** — hinge-and-legs geometry with a locked radius while scribing, so the pen is mathematically constrained to a perfect circle as it swings (the radius only changes via the separate "radius" handle, never while drawing). A full sweep (≥ ~355°) commits a true `ellipse` element with `roughness: 0`; a partial swing commits a densely-sampled (~1.5° steps, up to 720 points) polyline arc along that same perfect circle — so you can scribe part of a circle and still get a mathematically clean curve, not a hand-drawn approximation. Live radius readout in real centimeters.
- **Ruler** — a real metric scale: ticks at every mm (short), half-cm (medium), and cm (tall + labelled), derived from the CSS reference-pixel convention (96dpi, so 1 scene unit reads as a real screen cm — `PX_PER_CM = 96/2.54`). Dragging the pen along the edge previews an ink line under live length; releasing commits a `line` element.
- **Protractor** — a semicircle with 5° ticks, 10° majors, and 30° labels, plus a live numeric angle readout as the swivel ray is dragged. Commits an `arrow` (not a line) along the marked ray, so the drawn angle stays visually anchored to its vertex.
- **T-square** and **set square** — straightedges (set square: a right-triangle edge at 45°) with the same real cm/mm tick convention as the ruler, each committing a `line` along their blade/hypotenuse.
- **Angle bisector** — two symmetric legs plus a fixed center arm; dragging either leg's tip opens/closes the angle (`MIN_SPREAD`/`MAX_SPREAD` ≈ 5°–165°) while the bisector ray stays exactly centered between them by construction. Commits an `arrow` along the bisector.

**Rendering**: each instrument is drawn as a themed, semi-transparent "frosted glass and metal" object — gradient-filled bodies, brushed-metal legs/hinges with knurled grip ticks, drop shadows, accent-colored handles — with light/dark palettes pulled from the same accent tokens as the rest of the UI (`instrumentStyle`), not hard-coded colors. All sizing (tick spacing, handle radii, line widths) is expressed in screen pixels via `1/zoom`, so instruments stay a constant, legible on-screen size at any canvas zoom level rather than scaling with it.

All committed marks (ellipse/line/arrow) go through the normal scene + undo pipeline (`app.scene.insertElementsAtIndex` + `scheduleCapture`), so drafting with an instrument is a regular, undoable action indistinguishable in history from drawing by hand.

## Toolbar & chrome redesign

- **ChromeRail** (`excalidraw-app/syntropy/ChromeRail.tsx`, new): merges the previously-separate Library toggle, Paper picker, and Theme switcher into one bordered capsule instead of three separately-shadowed chips, matching the site's existing `.mode-tabs` styling used elsewhere. Replaces the deleted `LibraryToggle.tsx`.
- **Paper picker** (`PaperPicker.tsx`, new, ~350 lines): a GoodNotes-style panel controlling paper type (blank/lined/grid/dotted, with live preview tiles), paper color (curated swatches + color wheel + hex field), line/dot color (with an "Auto" theme-default reset), and grid/ruled/dot spacing. Paper type stays in sync with element-snap grid mode. All three settings (`paperMode`, `paperColor`, `paperBgOverride`) now persist as part of the saved document.
- **Theme switcher** (`ThemeSwitcher.tsx`, new): light / dark / system, with "system" tracking the OS `prefers-color-scheme` live.
- **Library panel**: method rows now cascade in with a staggered reveal (~30ms per row, capped at 240ms total) when an engine section opens, and only the open engine's dot pulses instead of all seven at rest.
- Toolbar (`Tools.tsx`, `Toolbar.tsx`/`.scss`, `icons.tsx`) updated throughout to register and theme all of the above new tools.

## Syntropy node fixes

- **Deleted node cards stuck on screen**: `NodeOverlay.tsx` was including soft-deleted elements (since `App.tsx` feeds it from `getElementsIncludingDeleted`, matching what Excalidraw's own `onChange` does) without filtering them, so a deleted node's card lingered forever even though the underlying element was gone. Now filtered out.
- **Node cards clipping on resize**: nodes stamp a content-driven minimum size at creation (`createSyntropyNode.ts`, via `nodeGeometry.ts`'s initial-size calculation) into `customData.syntropyNode`. `resizeElements.ts` now reads it generically (`syntropyMinSize.ts`) to stop a resize-drag from shrinking a node below what its fixed-height rows/chart need — previously this clipped or visually collapsed the card.
- **Light-theme accent colors**: `engineAccents.ts`'s `deriveAccentShades` was dark-theme-only (baking in dark-board container/surface tone shifts). Added a `theme` parameter with a proper light-theme ramp (tints instead of dark shifts, inverted hover direction) so the toolbar/UI accent reads correctly in light mode.
- **Broken lab-page links**: `openMethodPage`/`openMethodPageByPath` used a hard-coded root-absolute `/math-lab/...` URL, which only resolves when served from the repo root — opened from `canvas/dist/` directly, or via `file://`, the link 404s. Now resolved relative to the current document so it works under any serving context.
- **Riemann-sums port spec import**: was importing `math-lab/assets/js/algorithms.js` (a plain UMD module) as if it had a default export, which Vite's ESM handling doesn't actually provide. Fixed to import for side effect and read the function off the global the UMD wrapper sets — paired with a matching fix in `algorithms.js` itself (see below).
- `RiemannPlot.tsx`'s axis line now uses `currentColor` (theme-aware) instead of a hard-coded white-ish `rgba`, so it's visible on both light and dark plot surfaces.

## math-lab

- `algorithms.js`'s UMD wrapper only attached `root.Algorithms` in the *non*-CJS branch. Canvas's Vite/Vitest tooling shims a `module` global onto plain `.js` files even outside `node_modules`, so under `yarn test:app` the CJS branch was taken and `root.Algorithms` was never set — breaking the riemann-sums port spec fix above in tests even though real browsers and Node's `require()` both worked. Now always attaches to `root` regardless of which export path also ran.
- Minor `note-taker/notes.json` / `notes.md` update.

## Syntropy engine rollout — Complex Analysis, ODE/PDE, Calculus, Number Theory, Statistics

Completed the run-mode port-spec rollout across the remaining engines, unblocked by the async CAS-worker bridge: **ODE/PDE** (9/9 methods — general solver, systems, Laplace transform, series solutions, heat/wave/Laplace-Poisson equations, direction fields, Fourier series), **Complex Analysis** (9/12 — the 3 domain-coloring methods deliberately deferred pending a Field-archetype visualization), **Calculus** (26/26), **Number Theory** (29/29), **Statistics** (12/12), **Numerical** (29/29), **Linear Algebra** (18/18). Each method is a live-computed canvas node wired to its real math-lab core, with the six-archetype visual redesign (Matrix, Trace, Scalar, Distribution, Real-line, Field) covering every node's output shape.

## Pen — restored to match upstream Excalidraw

The freedraw pen had drifted from upstream Excalidraw's own behavior in two ways, found by diffing against `excalidraw/excalidraw` v0.18.0 directly: (1) stroke smoothing (`streamline`) was lowered from the original 0.5 to 0.2 specifically for pen/touch input, making stylus strokes visibly rougher than mouse strokes for no reason upstream doesn't share; (2) the default `currentItemStrokeVariability` was `"constant"` (a flat, uniform-width "laser" look) instead of `"variable"` (the real pressure-sensitive pen), only correcting itself once a real stylus touch was detected — devices that never report `pointerType: "pen"` stayed stuck on the flat look permanently. Both reverted to match upstream exactly (`packages/excalidraw/appState.ts`, `components/App.tsx`).

## Field-archetype node rendering — fixed a real layout bug

Every Field-archetype node (Heat Equation, Wave Equation, Laplace & Poisson, Direction Field) was rendering its plot crushed to a few pixels tall instead of a proper heatmap/vector-field grid. Root cause: the plot SVG had no real intrinsic size for flexbox to respect, and nothing protected it from being squeezed when the card's initial height guess (`nodeGeometry.ts`) fell short — which it reliably did, since the sizing formula never reserved room for a `"field"`-kind output in the first place (only `"curve"`). Fixed by giving the SVG a real `aspect-ratio` plus `flex-shrink: 0`, and adding `"field"` to the plot-reservation check (`syntropy/nodeGeometry.ts`, `syntropy/nodes/FieldNode.scss`).

## Fourier Series node — overlay was unreadable

The Fourier Series node (Calculus and ODE/PDE) overlaid the target function `f(x)` on top of the computed partial sum using the `samples` field, which the real-line renderer only ever draws as small scatter dots — fine for a handful of interpolation points, but the overlay had 401 sampled points, so it rendered as a dense, illegible blob instead of a second curve. Added a proper `overlay` field to `CurveOutput`, rendered as its own dashed secondary path (`syntropy/nodes/RealLineNode.tsx`, `portSpecs/types.ts`), and switched both Fourier specs to use it.

## Number Theory — portal-prefill retrofit (29 methods)

Number Theory was the one engine whose canvas nodes computed correctly but whose "Open ↗" link to the real math-lab page never prefilled — none of the 29 pages called the shared `Proto.saveState`/`loadState` localStorage bridge the other engines already used. Added the save/load wiring and the `proto.js` script tag to all 29 method pages and their JS, matching the existing convention (including two trickier cases: methods where the node's input key doesn't literally match the page's own field id, and methods with comma-separated vector inputs). Verified end-to-end in-browser for representative cases (RSA, a key-name-mismatch case, and a vector-input case).

## Rebranding — internal naming, not just UI text

An earlier pass already handled UI-visible de-branding (accessibility heading, community/upsell links, promo banners — see `docs/superpowers/plans/2026-08-14-note-app-foundation-fixes.md`). This pass covers internal naming that doesn't show up in the UI but still identified the app as Excalidraw's: the `excalidraw-app/` directory renamed to `syntropy-app/` (with every functional reference fixed — `package.json` workspaces/scripts, `tsconfig.json`, cross-package imports, the woff2 build plugin — plus two imports that the rename itself broke, caught and fixed); the `localStorage`/IndexedDB key strings (`"excalidraw"` → `"syntropy"` and siblings, except the one legacy-migration key that's deliberately left pointing at the old value since detecting it is its whole job); the PWA manifest `id`; this fork's own `.excalidraw-app` CSS wrapper class (distinct from upstream's `.excalidraw` root class) → `.syntropy-app`; the `ExcalidrawFontFace` class and `EXCALIDRAW_ASSET_PATH` global, both renamed across every file that references them. Deliberately **not** touched: the `@excalidraw/*` npm package scope (1,438 import lines across 400 files) and upstream's own `.excalidraw` root CSS class (75 files) — both real, scriptable, but large enough to warrant their own pass rather than folding into this one. `ExcalidrawLogo.tsx` also deliberately left alone at the time — it's Excalidraw's actual hand-drawn logo artwork, not just a name, so renaming the component without replacing the artwork would have been more misleading, not less. It now has a real replacement — see "Sitewide logo rollout" below.

## Notes / document layer — built, then deliberately pulled back out

A per-note document layer (separate, nameable notes instead of one shared canvas) was built and tested working (`data/notes.ts`, `syntropy/NotesPanel.tsx` — localStorage-backed, a side panel sharing the rail slot with the method library). It has since been unwired from the live app and moved to `note-app-standalone/` (repo root, inert, not imported by anything) — the canvas app currently behaves exactly as it did before any notes work, one shared canvas. A separate, more detailed plan (`docs/superpowers/plans/2026-08-14-note-app-foundation-fixes.md`, since annotated with its actual status) specifies a different architecture (IndexedDB, full-screen library-as-entry-point); which direction to build for real is still an open decision, not resolved by either the build or the revert.

## Sitewide logo rollout

The project got a real logo (a black-background hourglass mark with gold/blue neon geometric framing) applied across the whole site, not just the canvas:
- Source artwork kept at `assets/brand/` (original upload, a plain copy, and a background-removed transparent cut). Generated the full standard icon set from it via ImageMagick (16×16, 32×32, 180×180, 192×192, 512×512, plus a multi-resolution `.ico`) — the transparent cut for general use, the solid-background cut specifically for `apple-touch-icon.png` (iOS fills transparent icon backgrounds badly, so the flat version reads correctly on a home screen).
- Wired into `canvas/public/` (already referenced by `canvas/syntropy-app/index.html` and its PWA manifest) and mirrored at the repo root so `math-lab/` and `schools/` pages pick it up automatically via browser favicon auto-discovery, with explicit `<link>` tags added to the root hub `index.html` for the higher-res variants.
- New `SyntropyLogo.tsx`/`.scss` component (`canvas/packages/excalidraw/components/`) renders the new mark and is now used on the canvas app's own welcome-screen branding, replacing `ExcalidrawLogo`. `ExcalidrawLogo.tsx` itself is intentionally untouched and still used in exactly one place — the "Export to Excalidraw+" dialog — since that screen genuinely links out to the real external Excalidraw+ product and showing its actual logo there is correct, not leftover branding.
- Note: the canvas app currently opens straight onto an empty board by design (see the `syntropy-app/App.tsx` comment: "No welcome screen: Syntropy Canvas opens straight onto an empty board"), so today the only *live* in-app surface showing the new mark is the browser tab/favicon and the PWA install icon; the welcome-screen swap is correct and ready the moment that screen is re-enabled.
- Rebuilt `canvas/dist/` and verified in a live browser against the built output: tab title, favicon links, and manifest icons all resolve correctly.

## Repo organization & documentation audit

A full read-everything audit of the whole project (not just canvas), written up in `the next vision/repo-organization-and-classification.md`, with a matching investigation of the math-lab interactivity backlog in `the next vision/math-lab-interactivity-investigation.md`. Deletion was off the table throughout — every candidate went to `the next vision/for-delete.md` and, where already executed, to an outer `../baty-site-for-delete/` folder (a sibling of this repo, not inside it) instead of being removed.

What the audit found and fixed:
- **The note-app plan and the actual note-app build had diverged architecturally** (localStorage/side-panel as built vs. IndexedDB/full-screen-library as specified) — see "Notes / document layer" above for the resolution (pulled out of the live app, isolated in `note-app-standalone/`, decision left open).
- **A second, much larger symbolic-kernel project** (`math-lab/assets/js/kernel/`, a from-scratch computer-algebra engine — polynomial algebra, term rewriting, assumptions, series/limits) turned out to be genuinely complete through Phase 4's foundation slice, verified by actually running its gate suites (196 passing checks across `verify-kernel.js`/`verify-poly.js`/`verify-series.js`), not by trusting the plan doc's own status claims.
- **The Schools vertical has an active, undecided tech-stack migration** (JSXGraph + Motion replacing hand-rolled SVG + GSAP) that the "Grade 5 + Grade 6 shipped" summary didn't capture — one reference lesson (`schools/grade-6/4-5-geometric-constructions.html`) built on the new stack, the other 90 shipped lessons still on the original pattern.
- Re-homed two misplaced-but-real tools: root `probe_all.js` (a general lesson console-error checker) → `scripts/probe_all.js`; root `syntropy-execute-prompts.txt` → `archive/docs/root-planning/` (superseded by the formal plan files it predates, all confirmed built).
- Added a pointer note to `math-lab/docs/CALCULUS_ENGINE_PLAN.md` (confirmed genuinely stale, predates the phase-1 extraction) pointing at its current replacement — after first nearly misclassifying a second file (`ODE_PDE_ENGINE_PLAN.md`) as stale too, catching the mistake by actually reading it (it's a deliberately-maintained, current "Status: complete" doc) before adding a false pointer.
- Moved the 6 hardcoded one-off `_probe_*.js` debug scripts and the 5 orphaned `.claude/worktrees/agent-*` directories (39 MB, superseded uncommitted method work already shipped for real) to the outer for-delete folder.

## First time in git: Schools, the math-lab test suite, the symbolic kernel, and the plans/specs system

A large amount of already-built project content had simply never been committed before this snapshot — landing in git for the first time here, not new work from this pass:
- **Schools vertical** (`schools/`) — Grade 5 (52/52 lessons) and Grade 6 (39/39 lessons) of the Jordan National Curriculum, one self-contained HTML page per lesson, plus its own `DESIGN_SYSTEM.md` typography/pattern addendum (§14, bilingual Arabic/English layer).
- **math-lab's test/verification suite** (`math-lab/tests/`, 272 files) — the `verify-*.js` gate suites for every engine plus the symbolic kernel, aggregated by `tests/run-all.js`, and the `math-lab/assets/js/kernel/` symbolic-kernel project itself (41 files) that the suite verifies.
- **The formal plans/specs system** (`docs/superpowers/`, 46 files: `plans/` = task-by-task build instructions, `specs/` = the design decisions each plan implements) — the planning trail this whole session's audit cross-referenced against actual shipped code.
- **Curriculum reference notes** (`docs/curriculum-references/`) — extracted-text mirrors and topic/grade breakdowns (11 `.md` + 31 `.txt` files) used to ground the Schools vertical's scope against the Jordan MoE and Cambridge curricula. The source PDFs themselves (31 files, copyrighted textbooks/syllabi) are deliberately excluded via a new `.gitignore` rule — only the derived research notes are tracked.
- `run.sh` — the documented one-command local launcher for the whole site (hub + math-lab + canvas), needed because canvas is a Vite/React app whose ES modules won't run over `file://`.

## Production build

`canvas/dist/` (intentionally committed for deployment — see `canvas/.gitignore`'s `!/dist/` override) rebuilt to match all of the above: new hashed asset bundles, updated `index.html` and manifest (now under the `syntropy-app` naming and the new logo), and a regenerated service worker (`sw.js`) precache manifest.
