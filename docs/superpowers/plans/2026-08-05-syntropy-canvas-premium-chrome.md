# Syntropy Canvas Premium Chrome Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the shipped library panel's flat file-tree look and the node cards' flat, shadowless shell with the site's real `.engine-card` / crosshair / motion language so both read as premium and on-brand.

**Architecture:** Three presentational changes, all inside `canvas/excalidraw-app/syntropy/`. (1) Extract the four corner ticks into one `<CrosshairCorners />` component + shared SCSS ported class-for-class from `math-lab/assets/css/engine.css`'s `.crosshair`, and swap it into `SyntropyNode`. (2) Restore the approved v6 mockup's node ambient polish (drop shadow, radial accent glow bleed, hover lift + border brighten) on `.SyntropyNode`, plus one scoped `:has(.SyntropyNode)` override so the embeddable container's `overflow: hidden` doesn't clip the shadow/lift. (3) Give `LibraryPanel`'s engine-header rows the full `.engine-card` treatment (radial glow, crosshair corners, pulsing dot, hover lift + accent border, site easing) and add the easing curve to method-row hovers. No logic changes — verification is visual plus the existing `yarn test:app` regression gate.

**Tech Stack:** React + TypeScript, SCSS, Excalidraw embeddable rendering, vitest (regression only).

## Global Constraints

- **Visuals only, every method.** No computation, no plots, no 3D viewport. Same boundary as `2026-08-05-syntropy-canvas-node-visual-language-design.md`.
- **No fork-internal Excalidraw source edits.** All changes live in `canvas/excalidraw-app/syntropy/`. App-level SCSS may *target* Excalidraw's container classes (e.g. `.excalidraw__embeddable-container__inner`) but must not edit files under `packages/excalidraw/`.
- **One easing curve site-wide:** `cubic-bezier(0.16, 1, 0.3, 1)` for every hover/lift/opacity transition (`DESIGN_SYSTEM.md` §10). No default/linear transitions on the new motion.
- **Per-engine accent via CSS custom property.** Engine glows/borders read `var(--engine-accent)` (set inline per engine header); node glow reads the existing `var(--node-accent)`. No hardcoded teal.
- **Method rows stay a plain list** — only the engine-header (picker) level gets the card treatment + pulsing dot. Method-row dots do not pulse.
- **Lint gate:** `yarn test:code` (eslint `--max-warnings=0`) and `yarn test:typecheck` must stay green; run `npx eslint --fix` on touched files before committing.

---

## File Structure

- **Create:** `canvas/excalidraw-app/syntropy/CrosshairCorners.tsx` — presentational component rendering the four corner ticks.
- **Create:** `canvas/excalidraw-app/syntropy/crosshairCorners.scss` — shared corner-tick styles, ported from `engine.css` `.crosshair`.
- **Modify:** `canvas/excalidraw-app/syntropy/SyntropyNode.tsx` — swap four inline crosshair spans for `<CrosshairCorners />`.
- **Modify:** `canvas/excalidraw-app/syntropy/SyntropyNode.scss` — remove old `.SyntropyNode__crosshair` block; add node ambient polish + scoped embeddable overflow override.
- **Modify:** `canvas/excalidraw-app/syntropy/LibraryPanel.tsx` — set `--engine-accent` per engine header, render `<CrosshairCorners />` in each header.
- **Modify:** `canvas/excalidraw-app/syntropy/LibraryPanel.scss` — engine-header `.engine-card` treatment, pulsing dot, method-row easing.

---

### Task 1: Shared `<CrosshairCorners />` component + swap into the node

**Files:**
- Create: `canvas/excalidraw-app/syntropy/CrosshairCorners.tsx`
- Create: `canvas/excalidraw-app/syntropy/crosshairCorners.scss`
- Modify: `canvas/excalidraw-app/syntropy/SyntropyNode.tsx:1-47`
- Modify: `canvas/excalidraw-app/syntropy/SyntropyNode.scss:17-58`

**Interfaces:**
- Produces: `CrosshairCorners` — a zero-prop React component (`() => JSX.Element`) rendering four `<span className="crosshair-corner crosshair-corner--{tl,tr,bl,br}" />`. Consumed by `SyntropyNode.tsx` (Task 1) and `LibraryPanel.tsx` (Task 3). The host element must be `position: relative` and must establish a stacking context (`isolation: isolate`) so the `z-index: -1` glow added in later tasks paints behind content; the ticks themselves use `currentColor` so they inherit the host's text color.

- [ ] **Step 1: Create `crosshairCorners.scss`** — port `math-lab/assets/css/engine.css` `.crosshair` class-for-class (10px, opacity .5, `currentColor` hairlines via `::before`/`::after`, corners at 10px inset) under BEM-ish class names:

```scss
.crosshair-corner {
  position: absolute;
  width: 10px;
  height: 10px;
  opacity: 0.5;
  pointer-events: none;

  &::before,
  &::after {
    content: "";
    position: absolute;
    background: currentColor;
  }
  &::before {
    width: 100%;
    height: 1px;
    top: 50%;
    left: 0;
  }
  &::after {
    height: 100%;
    width: 1px;
    left: 50%;
    top: 0;
  }

  &--tl {
    top: 10px;
    left: 10px;
  }
  &--tr {
    top: 10px;
    right: 10px;
  }
  &--bl {
    bottom: 10px;
    left: 10px;
  }
  &--br {
    bottom: 10px;
    right: 10px;
  }
}
```

- [ ] **Step 2: Create `CrosshairCorners.tsx`**

```tsx
import "./crosshairCorners.scss";

export const CrosshairCorners = () => (
  <>
    <span className="crosshair-corner crosshair-corner--tl" aria-hidden="true" />
    <span className="crosshair-corner crosshair-corner--tr" aria-hidden="true" />
    <span className="crosshair-corner crosshair-corner--bl" aria-hidden="true" />
    <span className="crosshair-corner crosshair-corner--br" aria-hidden="true" />
  </>
);
```

- [ ] **Step 3: Swap the four inline spans in `SyntropyNode.tsx`** — add the import and replace the four `<span className="SyntropyNode__crosshair ...">` blocks (lines 32–47) with a single `<CrosshairCorners />`.

Edit the import block (top of file) to add:

```tsx
import "./SyntropyNode.scss";

import { ENGINE_ACCENTS, type EngineId } from "./engineAccents";
import { CrosshairCorners } from "./CrosshairCorners";
```

Replace lines 32–47 (the four crosshair spans) with:

```tsx
      <CrosshairCorners />
```

- [ ] **Step 4: Remove the now-unused `.SyntropyNode__crosshair` block from `SyntropyNode.scss`** — delete lines 17–58 (the entire `.SyntropyNode__crosshair { ... }` rule including all `&--tl/tr/bl/br` modifiers). The shared `crosshairCorners.scss` replaces it.

- [ ] **Step 5: Lint + typecheck**

Run: `npx eslint --fix excalidraw-app/syntropy/CrosshairCorners.tsx excalidraw-app/syntropy/SyntropyNode.tsx excalidraw-app/syntropy/crosshairCorners.scss excalidraw-app/syntropy/SyntropyNode.scss`
Then: `yarn test:typecheck`
Expected: no errors. (Prettier may rewrite the new files; let it.)

- [ ] **Step 6: Visual check** — with the dev server running (`yarn start` at http://localhost:3001/), spawn a node. Confirm the four corner ticks still render at the node's corners, now at the site-standard 10px inset / opacity .5 (slightly larger and more present than the old 9px/.35). They inherit the node's `#e7e7e7` text color via `currentColor`.

- [ ] **Step 7: Commit**

```bash
git add excalidraw-app/syntropy/CrosshairCorners.tsx excalidraw-app/syntropy/crosshairCorners.scss excalidraw-app/syntropy/SyntropyNode.tsx excalidraw-app/syntropy/SyntropyNode.scss
git commit -m "refactor(canvas): extract CrosshairCorners, share with SyntropyNode"
```

---

### Task 2: Node card ambient polish (depth, glow, hover lift)

**Files:**
- Modify: `canvas/excalidraw-app/syntropy/SyntropyNode.scss:1-15` (the `.SyntropyNode` outer rule)
- Modify: `canvas/excalidraw-app/syntropy/SyntropyNode.scss` (append one scoped override rule)

**Interfaces:**
- Consumes: `var(--node-accent)` already set inline on `.SyntropyNode` by `SyntropyNode.tsx:30`.
- Produces: a `.SyntropyNode` with a real drop shadow, a top-left radial accent glow behind content, and a hover lift + border brighten — all on the site easing curve. Also produces a scoped `:has(.SyntropyNode)` override on `.excalidraw__embeddable-container__inner` so the embeddable wrapper's `overflow: hidden` (set in `packages/excalidraw/css/styles.scss:899`) does not clip the node's box-shadow or its 2px hover lift. This override is scoped to embeddables that contain a Syntropy node only; iframe embeddables are unaffected.

- [ ] **Step 1: Extend the `.SyntropyNode` outer rule** — add `isolation`, `box-shadow`, `transition`, a `::before` glow, and `:hover`. The full replacement for lines 1–15:

```scss
.SyntropyNode {
  --node-accent: #ffffff;
  position: relative;
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  background: #111111;
  border: 1px solid rgba(255, 255, 255, 0.09);
  border-radius: 12px;
  font-family: var(--ui-font);
  color: #e7e7e7;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  isolation: isolate;
  box-shadow: 0 14px 34px rgba(0, 0, 0, 0.5);
  transition: transform 0.45s cubic-bezier(0.16, 1, 0.3, 1),
    border-color 0.3s ease;

  // Approved v6 mockup .node5 radial-glow bleed, top-left, in the node's own
  // accent. z-index: -1 + isolation: isolate above keep it behind content but
  // above the #111 background; overflow: hidden clips it to the card.
  &::before {
    content: "";
    position: absolute;
    top: -35%;
    left: -15%;
    width: 75%;
    height: 75%;
    background: radial-gradient(
      circle,
      var(--node-accent) 0%,
      transparent 72%
    );
    opacity: 0.15;
    filter: blur(6px);
    pointer-events: none;
    z-index: -1;
    transition: opacity 0.4s cubic-bezier(0.16, 1, 0.3, 1);
  }

  &:hover {
    border-color: rgba(255, 255, 255, 0.24);
    transform: translateY(-2px);
  }
}
```

- [ ] **Step 2: Append the scoped embeddable overflow override** — at the end of `SyntropyNode.scss`, add:

```scss
// The embeddable wrapper clips overflow (packages/excalidraw/css/styles.scss),
// which would hide the node's drop shadow and clip its hover lift. Scope a
// visible-overflow override to embeddables that actually contain a Syntropy
// node so iframe embeddables keep their default clipping.
.excalidraw__embeddable-container__inner:has(.SyntropyNode) {
  overflow: visible;
}
```

- [ ] **Step 3: Lint + typecheck**

Run: `npx eslint --fix excalidraw-app/syntropy/SyntropyNode.scss`
Then: `yarn test:typecheck`
Expected: no errors.

- [ ] **Step 4: Visual check** — spawn a node. Confirm:
  - A real drop shadow now separates the card from the canvas background (not flat/flush).
  - A faint accent-colored glow bleeds from the top-left corner, matching the node's engine color.
  - Hovering lifts the card ~2px and brightens its border, with a snappy ease-out-expo ease (not an instant snap).
  - The glow paints *behind* the header text and body (content is not tinted).

- [ ] **Step 5: Commit**

```bash
git add excalidraw-app/syntropy/SyntropyNode.scss
git commit -m "style(canvas): restore node depth, accent glow, and hover lift"
```

---

### Task 3: Library panel engine-card treatment

**Files:**
- Modify: `canvas/excalidraw-app/syntropy/LibraryPanel.tsx:5-45`
- Modify: `canvas/excalidraw-app/syntropy/LibraryPanel.scss:22-81`

**Interfaces:**
- Consumes: `CrosshairCorners` (from Task 1); `engine.accent` (already on each manifest entry, used for the inline dot background today).
- Produces: each engine-header row reads as a card — radial glow in `var(--engine-accent)` (set inline per header), crosshair corners, a pulsing dot, hover lift + accent border — and method rows gain the site easing on their existing hover tint. `--engine-accent` is set on `.LibraryPanel__engine-head` via inline `style`.

- [ ] **Step 1: Wire `--engine-accent` + `<CrosshairCorners />` into `LibraryPanel.tsx`** — add the import, set the CSS var on the engine-head button, and render `<CrosshairCorners />` as the first child inside it.

Add to the import block (after `import "./LibraryPanel.scss";`):

```tsx
import "./LibraryPanel.scss";

import { CrosshairCorners } from "./CrosshairCorners";
```

Replace the `<button ... className="LibraryPanel__engine-head" ...>` opening + first child (lines 28–38) with:

```tsx
            <button
              type="button"
              className="LibraryPanel__engine-head"
              style={
                { "--engine-accent": engine.accent } as React.CSSProperties
              }
              onClick={() =>
                setOpenEngineId(isOpen ? null : (engine.engineId as EngineId))
              }
            >
              <CrosshairCorners />
              <span
                className="LibraryPanel__engine-dot"
                style={{ background: engine.accent }}
              />
```

(Leave the engine-name, engine-count, closing `</button>`, and the methods block exactly as-is.)

- [ ] **Step 2: Rewrite `LibraryPanel.scss` engine-header + dot + method rules** — replace lines 22–81 (from `.LibraryPanel__engine` through the end of `.LibraryPanel__method`) with:

```scss
.LibraryPanel__engine {
  margin-bottom: 8px;
}

.LibraryPanel__engine-head {
  all: unset;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 12px 14px;
  position: relative;
  overflow: hidden;
  isolation: isolate;
  border: 1px solid rgba(255, 255, 255, 0.09);
  border-radius: 8px;
  background: #0e0e0e;
  font-size: 12px;
  color: #e7e7e7;
  cursor: pointer;
  transition: transform 0.45s cubic-bezier(0.16, 1, 0.3, 1),
    border-color 0.3s cubic-bezier(0.16, 1, 0.3, 1);

  // .engine-card::before — radial accent glow bleeding from the top-left,
  // in this engine's own accent. Ported from proto.css; .14 → .26 on hover.
  &::before {
    content: "";
    position: absolute;
    top: -35%;
    left: -15%;
    width: 75%;
    height: 75%;
    background: radial-gradient(
      circle,
      var(--engine-accent, #ffffff) 0%,
      transparent 72%
    );
    opacity: 0.14;
    filter: blur(6px);
    pointer-events: none;
    z-index: -1;
    transition: opacity 0.4s cubic-bezier(0.16, 1, 0.3, 1);
  }

  &:hover {
    transform: translateY(-2px);
    border-color: var(--engine-accent, rgba(255, 255, 255, 0.24));
  }
  &:hover::before {
    opacity: 0.26;
  }
}

.LibraryPanel__engine-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  flex-shrink: 0;
  animation: LibraryPanel-engineDotPulse 2.4s ease-in-out infinite;
}

.LibraryPanel__engine-name {
  flex: 1;
  text-align: left;
}

.LibraryPanel__engine-count {
  color: #7d858c;
  font-size: 10.5px;
}

.LibraryPanel__methods {
  padding-left: 10px;
  margin-top: 4px;
}

.LibraryPanel__method {
  all: unset;
  box-sizing: border-box;
  display: block;
  width: 100%;
  padding: 8px 10px 8px 14px;
  border-radius: 6px;
  font-size: 12px;
  color: #dadada;
  cursor: pointer;
  transition: background-color 0.3s cubic-bezier(0.16, 1, 0.3, 1),
    color 0.3s cubic-bezier(0.16, 1, 0.3, 1);

  &:hover {
    background: rgba(255, 255, 255, 0.04);
    color: #ffffff;
  }
}

// Site .engineDotPulse (proto.css) — scale 1 → 1.4, opacity 1 → .5, 2.4s.
// Only the engine-picker dot pulses; method rows have no dot.
@keyframes LibraryPanel-engineDotPulse {
  0%,
  100% {
    opacity: 1;
    transform: scale(1);
  }
  50% {
    opacity: 0.5;
    transform: scale(1.4);
  }
}
```

Note the deliberate changes vs. the old rules: `.LibraryPanel__engine` drops `border-radius` + `overflow: hidden` (so the header's hover lift isn't clipped); `.LibraryPanel__engine-head` becomes a bordered rounded card with glow/crosshairs/lift instead of a flat hover-tint row; `.LibraryPanel__methods` gains a 4px top margin to separate the plain method list from the card header; `.LibraryPanel__method` gains the easing curve on its existing hover tint.

- [ ] **Step 3: Lint + typecheck**

Run: `npx eslint --fix excalidraw-app/syntropy/LibraryPanel.tsx excalidraw-app/syntropy/LibraryPanel.scss`
Then: `yarn test:typecheck`
Expected: no errors.

- [ ] **Step 4: Visual check** — open the library panel. Confirm against spec verification §1:
  - Each engine header shows a soft accent-colored glow bleeding from its top-left corner, crosshair ticks in its corners, and a gently pulsing dot. Different engines show different glow colors matching their real accents.
  - Hovering an engine header lifts it ~2px and brightens its border to that engine's accent, on the snappy site ease (not a snap).
  - It reads as a card, not a file-tree row.
  - Method rows (inside an expanded engine) keep their flat layout but their hover tint now eases (not an instant flash). Method rows have no pulsing dot (none exist) and no card border.
  - Crosshair ticks render identically here and on a spawned node (same 10px inset, opacity .5, `currentColor`) — spec verification §4.

- [ ] **Step 5: Commit**

```bash
git add excalidraw-app/syntropy/LibraryPanel.tsx excalidraw-app/syntropy/LibraryPanel.scss
git commit -m "style(canvas): give library engine headers the real engine-card treatment"
```

---

### Task 4: Full regression + finishing

**Files:** none (verification only).

- [ ] **Step 1: Run the full app test suite**

Run: `yarn test:app --watch=false`
Expected: all tests pass (baseline was 1841 passed / 0 failures). No snapshots broke (the change is CSS/JSX-markup in components that have no snapshots, but confirm).

- [ ] **Step 2: Run lint + typecheck gates**

Run: `yarn test:code` then `yarn test:typecheck`
Expected: both green, zero warnings.

- [ ] **Step 3: Final visual sweep** — with the dev server, confirm spec verification §2 and §3:
  - A spawned node has visible depth and a faint accent glow from its top-left matching its engine; hovering lifts it slightly and brightens its border — "feels alive at rest, not flat."
  - All new transitions (node glow/lift/border, panel glow/lift/border, method hover) visibly use the same snappy ease-out-expo curve as the rest of the site, not an instant snap or generic ease.

- [ ] **Step 4: Finish the branch** — announce "I'm using the finishing-a-development-branch skill to complete this work." and follow superpowers:finishing-a-development-branch to verify tests, present options, and execute the chosen finish.