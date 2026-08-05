# Design: Syntropy Canvas — build, ship as a static page, link from the site, fix the toolbar regression

Date: 2026-08-05
Status: Design approved, ready for `writing-plans`.

## Purpose

Syntropy Canvas (`canvas/`) currently only exists as a Vite/React dev server (`yarn start`,
`localhost:3001`). It is not reachable from the site at all — no link exists anywhere in
`index.html` or `math-lab/index.html` — and even run directly it doesn't behave like the rest
of the site: every other page is a plain static HTML file you open directly; Canvas requires a
running Node/Vite process. This design closes that gap: build Canvas to a static bundle, commit
it, and link to it from the General Lab hub the same way every engine is linked — click, it
opens, nothing to install or run.

Separately, this session's browser testing also turned up a real, verifiable layout bug: the
library panel added in the prior plan (`2026-08-05-syntropy-canvas-library-panel-node-shell.md`)
silently shrinks Excalidraw's own responsive breakpoint on every load, collapsing the intended
floating pill toolbar (visible in the approved `2026-08-04-math-canvas-v6-mockup.html` mockup
and the reference screenshot) into Excalidraw's compact/mobile toolbar on ordinary laptop-sized
windows. This design fixes that using Excalidraw's own supported extension point — no vendored
source is patched.

**Explicitly out of scope** (deferred, matches the user's direction not to plan engine
computation right now): real per-method computation, node-to-node wiring, the scrub-chip/
pulseFlash visual language, live plots, and the "already placed on canvas" library-row
highlighting seen in the reference screenshot. All of that is `2026-08-04-math-canvas-design.md`
territory and stays there until that phase is explicitly greenlit.

## 1. Build configuration

`canvas/excalidraw-app/vite.config.mts` currently has no `base` (defaults to `/`, i.e. it
assumes it's served from the site's root) and builds to `canvas/excalidraw-app/build/`. Both
assumptions are wrong for a page nested under the site:

- Set `base: "./"` — relative asset paths, so the built page works correctly regardless of what
  path it's served from (matches how the rest of the site has no absolute-root assumptions
  either).
- Point `outDir` at `canvas/dist/` (one level up from `excalidraw-app/`, so the built output
  lives at the `canvas/` package root) instead of the current nested
  `canvas/excalidraw-app/build/` — a shorter, stable path to link to, and it visually mirrors
  `math-lab/` being a self-contained, directly-servable folder.

## 2. Commit the build output

The site has no CI/deploy pipeline — it is opened as plain static files, the same way
`math-lab/`'s hand-written HTML/CSS/JS is committed directly rather than generated at deploy
time. To make Canvas behave the same way, `canvas/dist/` gets built once (`yarn build`) and
committed to git.

**Known limitation, accepted for now**: unlike `math-lab/` (vanilla JS, no build step — the
committed source *is* what runs), `canvas/dist/` is generated output. If `canvas/`'s source
changes later, `canvas/dist/` needs a manual `yarn build` + recommit — nothing rebuilds it
automatically. Setting up that automation is out of scope here; the immediate goal is making
Canvas reachable and usable today.

## 3. Navigation — a new card on the General Lab hub, not an 8th engine

`math-lab/index.html`'s `#engines` section has exactly one `.grid.grid--2.engine-grid` holding
the 7 real engine cards, each numbered `N / 7`. Syntropy Canvas is not an 8th engine — it's a
workspace that *uses* the 7 engines — so it does not go inside that grid (which would force
renumbering all 7 cards to `N / 8` and misrepresent it as a subject-matter engine).

Instead, a new section is added directly after `#engines` and before the footer, using the same
`.card.engine-card.crosshair-host` visual language for consistency, but:

- No `engine-index` badge (nothing to count it against).
- Accent color is neutral (`--electric-teal:#e7e7e7`, matching Syntropy Canvas's own default
  neutral-white accent from the visual-identity work) rather than one engine's color, since it
  isn't tied to a single subject.
- Eyebrow: "The workspace". Heading: "Bring it all onto one canvas." Body copy explains it's an
  infinite canvas where you sketch and drop in live nodes from any of the 7 engines above.
- Links to `canvas/dist/index.html`.

## 4. Toolbar/form-factor fix

**Root cause** (verified by reading `packages/excalidraw/components/App.tsx`'s
`refreshEditorInterface`): Excalidraw decides its own responsive form factor
(`"phone" | "tablet" | "desktop"`, which controls whether the floating pill toolbar or the
compact mobile toolbar renders) by measuring `excalidrawContainerRef.current.getBoundingClientRect().width`
— the width of Excalidraw's *own* container element, not `window.innerWidth`. Since
`LibraryPanel` renders as a 240px-wide flex sibling of `<Excalidraw>`, Excalidraw's container is
240px narrower than the actual browser window on every load. Checked against the real
breakpoints in `packages/common/src/editorInterface.ts`
(`MQ_MAX_TABLET = 1180`, `MQ_MIN_WIDTH_DESKTOP = 1440`): a completely ordinary 1366px-wide laptop
window leaves only `1366 - 240 = 1126px` for Excalidraw — under 1180, so it renders in tablet/
compact mode and never shows the floating pill toolbar the mockup and reference screenshot show,
even though the same window would clear the desktop threshold without the library panel present.

**Fix**: `<Excalidraw>` already exposes a supported host-app override for exactly this —
`UIOptions.getFormFactor?: (editorWidth, editorHeight) => FormFactor` (see
`packages/excalidraw/types.ts`, explicitly documented as "control the editor form factor... from
the host app"). `App.tsx` passes a `getFormFactor` that adds the library panel's width back
before calling Excalidraw's own default `getFormFactor` (imported from `@excalidraw/common`, the
same function it uses internally when no override is given) — so the breakpoint decision is made
against the width the user's window actually has, not penalized by our sidebar:

```ts
import { getFormFactor } from "@excalidraw/common";

const LIBRARY_PANEL_WIDTH = 240; // must match LibraryPanel.scss's .LibraryPanel { width }

// in <Excalidraw> props:
UIOptions={{
  getFormFactor: (editorWidth, editorHeight) =>
    getFormFactor(editorWidth + LIBRARY_PANEL_WIDTH, editorHeight),
}}
```

No vendored file is touched — this is a one-prop addition in our own `App.tsx`, using
Excalidraw's own public extension point.

**Verification note**: this session's browser-automation tooling could not be resized past
~714–780px wide (an environment limitation, not a code issue), so the fix's effect on the
floating-pill toolbar could not be visually confirmed in-session. It's verified by reading the
exact breakpoint math above; visual confirmation on a real desktop window is the first
verification step in the implementation plan.

## 5. Verification

1. `yarn build` succeeds with no errors.
2. Open `canvas/dist/index.html` directly (e.g. via a plain static file server, not `yarn start`)
   — app boots, library panel lists real engines/methods, clicking a method still spawns a node,
   no console errors.
3. On a normal desktop-width browser window, confirm the floating pill toolbar renders (not the
   compact/mobile bar) — the concrete fix for point 4.
4. `math-lab/index.html`'s new card renders correctly, uses the site's real card styling, and
   the link opens `canvas/dist/index.html`.
5. Full regression suite (`yarn test:app --watch=false`) still passes at baseline.
