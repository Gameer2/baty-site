# Changelog

Everything below has accumulated on `upload-main` since the last snapshot pushed to GitHub (`accddd7`). It spans the canvas app (an Excalidraw fork under `canvas/`) and small fixes in `math-lab/`. Organized by feature area, not by commit — this was all still one working tree.

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

## Production build

`canvas/dist/` (intentionally committed for deployment — see `canvas/.gitignore`'s `!/dist/` override) rebuilt to match all of the above: new hashed asset bundles (including the new `pdfjs-dist`-pulling `CodeMirrorEditor` chunks split across several files), updated `index.html`, and a regenerated service worker (`sw.js`) precache manifest.
