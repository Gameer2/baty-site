# Syntropy Canvas — Visual Identity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reskin the vendored Excalidraw app's own UI chrome — colors, fonts, two motion touches — to match `DESIGN_SYSTEM.md`, entirely by overriding the CSS custom properties Excalidraw already exposes, with zero component layout/behavior changes.

**Architecture:** Every themeable value lives in `.theme--dark` in `canvas/packages/excalidraw/css/theme.scss` and one `--ui-font` declaration in `canvas/packages/excalidraw/css/styles.scss` — both files we own outright (vendored fork, not an npm dependency). Edit their values in place rather than adding an override stylesheet. The two motion touches (corner crosshairs, standard easing) touch exactly the shared `Island` component (used by the toolbar and every side panel/dialog) and the two existing easing declarations in `LayerUI.scss`.

**Tech Stack:** SCSS (compiled by Vite), React/TSX for the one markup change (`Island.tsx`), self-hosted `@font-face` (no CDN).

## Global Constraints

- No change to component layout, structure, tool order, or behavior — colors/fonts/motion only.
- The canvas's own hand-drawn text font (Virgil/Excalifont) is never touched — `--ui-font` only affects app chrome, not canvas content.
- Fonts are self-hosted (`@font-face`, files copied into `canvas/public/`), no CDN.
- Dark theme only (`.theme--dark`) — do not touch the light-theme block in the same file.
- Every task ends in its own commit.
- After the last task, run `yarn test:app --watch=false` from `canvas/` and confirm it's still green (120 files / 1828 tests passing, the baseline recorded when this branch's fork-scaffold plan finished).

---

### Task 1: Recolor `.theme--dark` to the site's palette

**Files:**
- Modify: `canvas/packages/excalidraw/css/theme.scss:185-263` (the `.theme--dark` block)

**Interfaces:**
- Produces: every Excalidraw UI surface (backgrounds, borders, the primary accent, popups, dialogs) reading the site's palette instead of stock Excalidraw's purple/dark-gray one. No new variables — same names, new values, so every component that already consumes them (`Island.scss`, `Toolbar.scss`, `FilledButton.scss`, etc.) picks this up automatically.

- [ ] **Step 1: Apply the color changes**

In `canvas/packages/excalidraw/css/theme.scss`, inside the existing `&.theme--dark { ... }` block, change these lines (left column is the current value to find, right column what to replace it with — every other line in the block is untouched):

| Variable | From | To |
|---|---|---|
| `--default-bg-color` | `#121212` | `#090909` |
| `--input-bg-color` | `#121212` | `#090909` |
| `--input-border-color` | `#2e2e2e` | `rgba(255, 255, 255, 0.12)` |
| `--input-hover-bg-color` | `#181818` | `#1b1b1b` |
| `--island-bg-color` | `#232329` | `#111111` |
| `--island-bg-color-alt` | `hsl(240, 12%, 12%)` | `#1b1b1b` |
| `--popup-secondary-bg-color` | `#222` | `#1b1b1b` |
| `--popup-text-color` | `#{$color-gray-4}` | `#7d858c` |
| `--dialog-border-color` | `var(--color-gray-80)` | `rgba(255, 255, 255, 0.12)` |
| `--color-primary` | `#a8a5ff` | `#c9a24c` |
| `--color-primary-darker` | `#b2aeff` | `#b58e37` |
| `--color-primary-darkest` | `#beb9ff` | `#96752d` |
| `--color-primary-light` | `#4f4d6f` | `#443d2e` |
| `--color-primary-light-darker` | `#43415e` | `#322e26` |
| `--color-primary-hover` | `#bbb8ff` | `#d2b26b` |
| `--color-selection` | `#3530c4` | `#6b5220` |
| `--color-surface-high` | `#2e2d39` | `#1b1b1b` |
| `--color-surface-mid` | `hsl(240 6% 10%)` | `#111111` |
| `--color-surface-low` | `hsl(240, 8%, 15%)` | `#0d0d0d` |
| `--color-surface-lowest` | `hsl(0, 0%, 7%)` | `#090909` |
| `--color-on-surface` | `#e3e3e8` | `#e7e7e7` |
| `--color-brand-hover` | `#bbb8ff` | `#d2b26b` |
| `--color-brand-active` | `#d0ccff` | `#dabe83` |
| `--color-on-primary-container` | `#e0dfff` | `#e0dbce` |
| `--color-surface-primary-container` | `#403e6a` | `#443d2e` |
| `--color-border-outline` | `#8e8d9c` | `rgba(255, 255, 255, 0.2)` |
| `--color-border-outline-variant` | `#46464f` | `rgba(255, 255, 255, 0.08)` |

Leave every other variable in the block (danger/warning/success colors, shadows, link color) as-is — they're functional/semantic, not brand color, and the design spec only calls for changing them if they visually clash (checked in Step 3 below).

- [ ] **Step 2: Boot the dev server**

Run (from `canvas/`, background it): `yarn start`
Expected: `Local:   http://localhost:3001/` within a few seconds.

- [ ] **Step 3: Verify visually**

Open `http://localhost:3001/` in a browser. Expected: the canvas background, toolbar, and any open panel are near-black (`#090909`/`#111111`) instead of stock Excalidraw's dark purple-gray, the selected-tool highlight and any primary-colored control read gold (`#c9a24c`) instead of lavender, and borders read as thin near-invisible hairlines rather than solid gray. Draw a shape and open the properties panel (left side, after selecting a tool) — confirm text stays legible (off-white on near-black) and nothing renders as unreadable dark-on-dark. Danger/warning colors (e.g. the delete/trash icon on a selected element) should still read clearly red/orange — if any functional color has become illegible against the new near-black background, note it and adjust that one variable now rather than deferring.

- [ ] **Step 4: Stop the dev server**

- [ ] **Step 5: Commit**

```bash
git add canvas/packages/excalidraw/css/theme.scss
git commit -m "$(cat <<'EOF'
style(canvas): recolor dark theme to the site palette

Overrides theme.scss's existing .theme--dark CSS custom properties in
place — backgrounds to core-black/rich-carbon, borders to the site's
hairline convention, and the primary accent to Syntropy Canvas's own gold
(#c9a24c, following the same per-section-accent pattern the General Lab
engines already use). No new variables, no component changes — every
consumer of these variables picks this up automatically.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Self-host the site's fonts and repoint `--ui-font`

**Files:**
- Create: `canvas/public/roc-grotesk-regular.woff2`, `canvas/public/roc-grotesk-medium.woff2`, `canvas/public/azeret-mono-regular.otf` (copied from `math-lab/assets/fonts/`)
- Modify: `canvas/packages/excalidraw/css/styles.scss:41-43`

**Interfaces:**
- Consumes: the font files already shipped at `math-lab/assets/fonts/{roc-grotesk-regular,roc-grotesk-medium}.woff2` and `math-lab/assets/fonts/azeret-mono-regular.otf`.
- Produces: `--ui-font` resolving to the site's real Azeret Mono/Roc Grotesk instead of stock Excalidraw's "Assistant" — every component using `font-family: var(--ui-font)` (buttons, menus, tooltips, dialogs) picks this up. Does not touch canvas drawing fonts (Virgil/Excalifont/ComicShanns), which are declared and consumed separately and never reference `--ui-font`.

- [ ] **Step 1: Copy the font files into `canvas/public/`**

```bash
cp "math-lab/assets/fonts/roc-grotesk-regular.woff2" canvas/public/
cp "math-lab/assets/fonts/roc-grotesk-medium.woff2" canvas/public/
cp "math-lab/assets/fonts/azeret-mono-regular.otf" canvas/public/
```

Run from the repo root (matches the flat layout already used in `canvas/public/` — e.g. `Assistant-Regular.woff2` sits there directly, no subfolder — served at `/roc-grotesk-regular.woff2` etc. by Vite's `publicDir`).

- [ ] **Step 2: Verify the files are in place**

Run: `ls canvas/public/ | grep -E "roc-grotesk|azeret-mono"`
Expected: all three filenames listed.

- [ ] **Step 3: Add the `@font-face` rules and repoint `--ui-font`**

In `canvas/packages/excalidraw/css/styles.scss`, immediately before the `.excalidraw {` rule (currently starting at line 40), insert:

```scss
@font-face {
  font-family: "Azeret Mono";
  src: url("/azeret-mono-regular.otf") format("opentype");
  font-weight: 400 700;
  font-display: swap;
}
@font-face {
  font-family: "Roc Grotesk";
  src: url("/roc-grotesk-regular.woff2") format("woff2");
  font-weight: 400;
  font-display: swap;
}
@font-face {
  font-family: "Roc Grotesk";
  src: url("/roc-grotesk-medium.woff2") format("woff2");
  font-weight: 500;
  font-display: swap;
}
```

Then change the existing `--ui-font` line inside `.excalidraw { ... }` from:

```scss
  --ui-font: Assistant, system-ui, BlinkMacSystemFont, -apple-system, Segoe UI,
    Roboto, Helvetica, Arial, sans-serif;
```

to:

```scss
  --ui-font: "Azeret Mono", ui-monospace, "Roc Grotesk", system-ui, -apple-system,
    sans-serif;
```

- [ ] **Step 4: Boot the dev server**

Run (from `canvas/`, background it): `yarn start`

- [ ] **Step 5: Verify visually**

Open `http://localhost:3001/`. Expected: toolbar labels, menu items, and dialog text render in the mono site font instead of stock Excalidraw's "Assistant" sans-serif — visibly monospaced, not a cosmetic-only difference. Then select the text tool, click the canvas, and type a short phrase. Expected: the text you just drew on the canvas uses Excalidraw's own hand-drawn font (Virgil/Excalifont), visibly different from the mono UI chrome around it — confirms the canvas content font is untouched.

- [ ] **Step 6: Stop the dev server**

- [ ] **Step 7: Commit**

```bash
git add canvas/public/roc-grotesk-regular.woff2 canvas/public/roc-grotesk-medium.woff2 canvas/public/azeret-mono-regular.otf canvas/packages/excalidraw/css/styles.scss
git commit -m "$(cat <<'EOF'
style(canvas): self-host site fonts, repoint --ui-font

Copies the site's real Roc Grotesk/Azeret Mono font files into
canvas/public/ and repoints Excalidraw's single --ui-font variable at
them instead of stock "Assistant" — every chrome component (buttons,
menus, tooltips, dialogs) already reads that one variable. The canvas's
own hand-drawn text font (Virgil/Excalifont) is a separate declaration
that never references --ui-font, so it's untouched by this change —
verified by drawing text on the canvas after the swap.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Add corner-crosshair ticks to the shared `Island` panel component

**Files:**
- Modify: `canvas/packages/excalidraw/components/Island.tsx`
- Modify: `canvas/packages/excalidraw/components/Island.scss`

**Interfaces:**
- Consumes: nothing new — `Island` is already the shared wrapper for the toolbar (`Toolbar.tsx`), the properties panel (`Actions.tsx`), dialogs (`Dialog.tsx`), popovers (`PropertiesPopover.tsx`), the mobile menu, and the user list — confirmed by grep, 7 consumers.
- Produces: every one of those 7 surfaces gets the four corner ticks automatically, with zero changes to those 7 files, since they all render through this one shared component.

- [ ] **Step 1: Add the four tick elements to Island's markup**

In `canvas/packages/excalidraw/components/Island.tsx`, change:

```tsx
    <div
      className={clsx("Island", className)}
      style={{ "--padding": padding, ...style }}
      data-viewport-ui={viewportUI}
      data-viewport-ui-name={viewportUIName}
      ref={ref}
    >
      {children}
    </div>
```

to:

```tsx
    <div
      className={clsx("Island", className)}
      style={{ "--padding": padding, ...style }}
      data-viewport-ui={viewportUI}
      data-viewport-ui-name={viewportUIName}
      ref={ref}
    >
      <span className="Island__crosshair Island__crosshair--tl" aria-hidden="true" />
      <span className="Island__crosshair Island__crosshair--tr" aria-hidden="true" />
      <span className="Island__crosshair Island__crosshair--bl" aria-hidden="true" />
      <span className="Island__crosshair Island__crosshair--br" aria-hidden="true" />
      {children}
    </div>
```

- [ ] **Step 2: Style the ticks**

In `canvas/packages/excalidraw/components/Island.scss`, change:

```scss
.excalidraw {
  .Island {
    --padding: 0;
    box-sizing: border-box;
    background-color: var(--island-bg-color);
    box-shadow: var(--shadow-island);
    border-radius: var(--border-radius-lg);
    padding: calc(var(--padding) * var(--space-factor));
    position: relative;

    &.zen-mode {
      box-shadow: none;
    }
  }
}
```

to:

```scss
.excalidraw {
  .Island {
    --padding: 0;
    box-sizing: border-box;
    background-color: var(--island-bg-color);
    box-shadow: var(--shadow-island);
    border-radius: var(--border-radius-lg);
    padding: calc(var(--padding) * var(--space-factor));
    position: relative;

    &.zen-mode {
      box-shadow: none;

      .Island__crosshair {
        display: none;
      }
    }
  }

  .Island__crosshair {
    position: absolute;
    width: 9px;
    height: 9px;
    opacity: 0.35;
    pointer-events: none;

    &::before,
    &::after {
      content: "";
      position: absolute;
      background: var(--color-on-surface);
    }

    &::before {
      width: 9px;
      height: 1px;
      top: 4px;
      left: 0;
    }

    &::after {
      width: 1px;
      height: 9px;
      left: 4px;
      top: 0;
    }

    &--tl {
      top: 6px;
      left: 6px;
    }

    &--tr {
      top: 6px;
      right: 6px;
    }

    &--bl {
      bottom: 6px;
      left: 6px;
    }

    &--br {
      bottom: 6px;
      right: 6px;
    }
  }
}
```

- [ ] **Step 3: Boot the dev server**

Run (from `canvas/`, background it): `yarn start`

- [ ] **Step 4: Verify visually**

Open `http://localhost:3001/`. Expected: the main toolbar pill at the top of the screen now shows four small tick marks, one in each corner. Select an element on the canvas to open the properties panel on the left — expected: it also shows the four corner ticks (confirms the shared-component change reached a second surface without touching `Actions.tsx`). Open the hamburger menu (main menu) — expected: same ticks on that dropdown.

- [ ] **Step 5: Stop the dev server**

- [ ] **Step 6: Commit**

```bash
git add canvas/packages/excalidraw/components/Island.tsx canvas/packages/excalidraw/components/Island.scss
git commit -m "$(cat <<'EOF'
style(canvas): add corner-crosshair ticks to the shared Island component

DESIGN_SYSTEM.md's "instrument panel" corner-tick motif, added once to
Island (the shared wrapper behind the toolbar, properties panel, dialogs,
popovers, mobile menu, and user list — 7 consumers) rather than to each
surface individually. Hidden in zen-mode alongside the rest of Island's
chrome.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Swap panel transitions to the site's standard easing curve

**Files:**
- Modify: `canvas/packages/excalidraw/components/LayerUI.scss:4-6` and `:44-46`

**Interfaces:**
- Consumes: nothing new.
- Produces: the sidebar-width transition and the zen-mode panel-slide transition both use the site's `cubic-bezier(.16,1,.3,1)` timing function instead of `ease-in-out`. Purely a timing-function swap — durations and the properties being animated are unchanged.

- [ ] **Step 1: Swap the sidebar-width transition**

In `canvas/packages/excalidraw/components/LayerUI.scss`, change:

```scss
  .layer-ui__wrapper.animate {
    transition: width 0.1s ease-in-out;
  }
```

to:

```scss
  .layer-ui__wrapper.animate {
    transition: width 0.1s cubic-bezier(0.16, 1, 0.3, 1);
  }
```

- [ ] **Step 2: Swap the zen-mode transition**

In the same file, change:

```scss
    .zen-mode-transition {
      transition: transform 0.5s ease-in-out;
```

to:

```scss
    .zen-mode-transition {
      transition: transform 0.5s cubic-bezier(0.16, 1, 0.3, 1);
```

- [ ] **Step 3: Boot the dev server**

Run (from `canvas/`, background it): `yarn start`

- [ ] **Step 4: Verify visually**

Open `http://localhost:3001/`. Select an element to open the right-side properties dock, then toggle it docked/undocked (or resize the window) — the panel should still resize smoothly, just with a slightly snappier deceleration than before (the `expo-out` feel used site-wide) rather than the previous even `ease-in-out`. This is a subtle difference — the main check is that nothing visibly breaks or jumps; exact timing-curve comparison is a judgment call, not a hard pass/fail.

- [ ] **Step 5: Stop the dev server**

- [ ] **Step 6: Commit**

```bash
git add canvas/packages/excalidraw/components/LayerUI.scss
git commit -m "$(cat <<'EOF'
style(canvas): use the site's standard easing curve for panel transitions

Swaps the two existing LayerUI.scss transitions (sidebar width, zen-mode
slide) from ease-in-out to cubic-bezier(.16,1,.3,1) — the curve used for
every transition on the rest of the site. Timing-function only; durations
and animated properties unchanged.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Full regression check

**Files:** none (verification only).

- [ ] **Step 1: Run the full vendored test suite**

Run (from `canvas/`): `yarn test:app --watch=false`
Expected: `Test Files  120 passed (120)` / `Tests  1828 passed | 47 skipped | 1 todo` — same numbers as the fork-scaffold plan's baseline. A color/font/markup change in `Island.tsx` is the only edit in this plan touching a file with direct test coverage risk; this run confirms nothing broke.

- [ ] **Step 2: If anything regressed**

Stop and investigate — do not proceed to finishing the branch on a red suite. Likely culprit given this plan's changes would be a snapshot or class-name assertion touching `Island`; if so, the fix is updating that assertion to expect the four new `Island__crosshair` spans, not reverting Task 3.

No commit for this task — it's a verification gate, not a code change.
