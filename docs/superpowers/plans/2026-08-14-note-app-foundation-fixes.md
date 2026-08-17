# Note App Foundation Fixes — Implementation Plan

> **STATUS (2026-08-18): built, but diverged from this plan on Phase 0 and Phase 3's
> architecture — read this before executing any remaining checkbox below.**
>
> - **Phase 1** (strip Excalidraw's own product surface) — **done**, closely matching this
>   plan: `ExcalidrawPlusPromoBanner.tsx`, `TTDStorage.ts`, and the community/upsell links
>   are gone; the accessibility heading reads "Syntropy Canvas"; no Google Fonts preconnect
>   remains.
> - **Phase 2** (drop mermaid/cytoscape/codemirror) — **done**, closely matching this plan:
>   the whole `TTDDialog/` directory and `mermaid.ts`/`mermaid.test.ts` are deleted.
> - **Phase 0** (move `chrome/` out of `syntropy/`, rename `LibraryPanel`→`MethodLibrary`)
>   — **never happened.** There is no `chrome/` folder; `ChromeRail.tsx` and friends are
>   still under `syntropy/`; `LibraryPanel.tsx` was never renamed.
> - **Phase 3** (the document layer) — **done, but architecturally different from what's
>   specified below.** What's actually on disk: `excalidraw-app/data/notes.ts` uses plain
>   `localStorage` (not IndexedDB via `idb-keyval`, even though `idb-keyval` is installed
>   and available), and `excalidraw-app/syntropy/NotesPanel.tsx` is a side panel sharing the
>   rail slot with the method library (mutually exclusive with it) — not the full-screen
>   `DocumentLibrary.tsx` entry-point screen with `?note={id}` routing this plan specifies.
>   The shipped version works: tested end-to-end this session (create/rename/delete notes,
>   switching notes correctly isolates canvas state, migration of pre-existing single-canvas
>   content into a first note). It just isn't what Task 3.1–3.4 below describe.
>
> **What this means for picking this plan back up:** Tasks 1.1–1.8 and 2.1 below are
> already done — skip them, they're kept here only as a record of what shipped. Tasks
> 3.1–3.4 and all of Phase 0 are **not** done as specified; before touching them, decide
> whether to (a) leave the shipped localStorage/side-panel version alone and treat this
> plan as superseded by what actually got built, or (b) do the Phase 0 reorg and rebuild
> Phase 3 to match this plan's IndexedDB/full-screen-library design. Not decided as of this
> note — pick one before resuming this file's checkboxes.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn `canvas/` from "an Excalidraw fork with a math-lab layer bolted on" into the actual foundation of the user's own note-taking app — strip Excalidraw's own product surface, cut dependency weight the note app doesn't need, and build the one piece of architecture currently missing entirely: a document layer, so "a note" becomes a real, separately-saved, nameable thing instead of the single shared canvas the whole app currently is.

**Architecture:** Four phases, each shippable on its own, in dependency order. Phase 0 reorganizes existing files into a structure that reflects what they actually are (math-lab-specific vs. general note-taking chrome vs. app shell) — pure moves, no logic changes, done first so Phase 3 doesn't add new files to a structure about to be reorganized out from under it. Phase 1 and 2 are subtractive (delete/edit existing files, no new subsystems). Phase 3 adds one new module (`excalidraw-app/data/documents.ts`) backed by IndexedDB via the already-installed `idb-keyval`, a migration that runs once on first load, and a new "library" screen that becomes the app's entry point instead of loading straight onto a canvas.

**Tech Stack:** React 19, TypeScript, Vite, Vitest, `idb-keyval` (already a dependency — no new packages for Phase 3). Phase 2 *removes* `@excalidraw/mermaid-to-excalidraw`, `cytoscape`, and the `@codemirror/*` packages.

**Spec:** No separate spec doc — this plan is written directly from the "Syntropy Canvas Audit" findings agreed on earlier in this project (math-lab node system stays; the real gap is that `excalidraw-app/app_constants.ts` has exactly one fixed `localStorage` key for the whole app, not one per note).

## Global Constraints

- Do not change any math-lab *logic* (the `compute()` bodies, `wiring.ts`'s topological sort, the archetype node renderers' behavior) — Phase 0 moves these files, it does not edit what they do.
- Do not introduce a paginated/multi-page-per-note structure — each note stays a single infinite canvas internally; this plan only adds the ability to have *more than one* of them.
- Every new/modified file must pass `yarn test:typecheck`, `npx eslint --max-warnings=0 <file>`, and the existing Vitest suite before being considered done.
- Existing user data (the current single canvas in `localStorage`) must survive Phase 3 — no task may ship without the migration in Task 3.2 landing first.
- Every file move in Phase 0 must be a `git mv` (not delete+recreate), so `git log --follow` still traces each file's history.

---

## Phase 0 — Reorganize `syntropy/` before it grows further

Right now `excalidraw-app/syntropy/` is a flat 23-file directory (plus `nodes/` and `portSpecs/`) mixing three genuinely different things with no folder boundary between them: the math-computation node system, general note-taking chrome that has nothing to do with math, and (about to land in Phase 3) a notes-library screen that doesn't belong under a folder named after the math feature at all. Confirmed clean split — none of the four chrome components (`ChromeRail`, `PaperPicker`, `PenPresets`, `ThemeSwitcher`) import anything from the math-specific files (`grep -n "^import" syntropy/ChromeRail.tsx syntropy/PaperPicker.tsx syntropy/PenPresets.tsx syntropy/ThemeSwitcher.tsx` shows only `@excalidraw/*`/React/each-other's own `.scss`).

**Also caught while reading file names for this phase:** `LibraryPanel.tsx` (the math-method browser) and the new `DocumentLibrary.tsx` (Phase 3, the notes list) are one word-swap away from being confused with each other. Renaming the older one to `MethodLibrary.tsx` as part of this move fixes that before it's a live source of bugs from someone importing the wrong one.

### Task 0.1: Move the math-computation system into `syntropy/` (unchanged) minus the two files that don't belong there

**Files:**
- Move (git mv, no content change): `syntropy/NodeOverlay.tsx`, `syntropy/NodeOverlay.scss`, `syntropy/SyntropyNode.tsx`, `syntropy/SyntropyNode.scss`, `syntropy/createSyntropyNode.ts`, `syntropy/createSyntropyWire.ts`, `syntropy/syntropyWire.ts`, `syntropy/wiring.ts`, `syntropy/engineAccents.ts`, `syntropy/compileExpression.ts`, `syntropy/portalPrefill.ts`, `syntropy/nodeGeometry.ts`, `syntropy/manifest.generated.json`, `syntropy/nodes/` (whole directory, all 12 files), `syntropy/portSpecs/` (whole directory, all 97 files) — these all stay under `syntropy/`, no move needed, they're already in the right place.
- Rename (git mv): `syntropy/LibraryPanel.tsx` → `syntropy/MethodLibrary.tsx`, `syntropy/LibraryPanel.scss` → `syntropy/MethodLibrary.scss`.
- Move out (git mv): `syntropy/ChromeRail.tsx`, `syntropy/ChromeRail.scss`, `syntropy/PaperPicker.tsx`, `syntropy/PaperPicker.scss`, `syntropy/PenPresets.tsx`, `syntropy/PenPresets.scss`, `syntropy/ThemeSwitcher.tsx`, `syntropy/ThemeSwitcher.scss`, `syntropy/boardChrome.scss` → all to a new sibling directory `chrome/` (i.e. `excalidraw-app/chrome/ChromeRail.tsx`, etc.)
- Modify: every file that imports `MethodLibrary` (was `LibraryPanel`) or any of the nine chrome files, by path.

**Interfaces:** No exported names change — `LibraryPanel` the component is exported unchanged except for the file (and, since this task renames it for clarity, the export itself becomes `MethodLibrary` — see Step 3).

- [ ] **Step 1: Do the moves**

```bash
cd canvas/excalidraw-app
git mv syntropy/LibraryPanel.tsx syntropy/MethodLibrary.tsx
git mv syntropy/LibraryPanel.scss syntropy/MethodLibrary.scss

mkdir -p chrome
git mv syntropy/ChromeRail.tsx chrome/ChromeRail.tsx
git mv syntropy/ChromeRail.scss chrome/ChromeRail.scss
git mv syntropy/PaperPicker.tsx chrome/PaperPicker.tsx
git mv syntropy/PaperPicker.scss chrome/PaperPicker.scss
git mv syntropy/PenPresets.tsx chrome/PenPresets.tsx
git mv syntropy/PenPresets.scss chrome/PenPresets.scss
git mv syntropy/ThemeSwitcher.tsx chrome/ThemeSwitcher.tsx
git mv syntropy/ThemeSwitcher.scss chrome/ThemeSwitcher.scss
git mv syntropy/boardChrome.scss chrome/boardChrome.scss
```

- [ ] **Step 2: Fix the two self-referencing imports inside the moved chrome files**

`chrome/ChromeRail.tsx` imports `./PaperPicker` and `./ThemeSwitcher` — both moved together, so these relative imports are unchanged (still `./PaperPicker`, `./ThemeSwitcher`) and need no edit. Confirm with `grep -n "^import" canvas/excalidraw-app/chrome/ChromeRail.tsx` — every relative import should resolve to a file now sitting in the same `chrome/` directory.

- [ ] **Step 3: Rename the component inside the renamed file**

In `syntropy/MethodLibrary.tsx`, rename the export:
```tsx
export const LibraryPanel = ({ excalidrawAPI }: LibraryPanelProps) => {
```
to:
```tsx
export const MethodLibrary = ({ excalidrawAPI }: MethodLibraryProps) => {
```
and rename the `LibraryPanelProps` type to `MethodLibraryProps` (both its declaration and the one usage in the function signature above). Also update `syntropy/MethodLibrary.tsx`'s own `import "./LibraryPanel.scss";` to `import "./MethodLibrary.scss";` (the file was renamed in Step 1, this import string wasn't updated by `git mv`).

- [ ] **Step 4: Update every import site**

Run: `grep -rln "syntropy/LibraryPanel\|syntropy/ChromeRail\|syntropy/PaperPicker\|syntropy/PenPresets\|syntropy/ThemeSwitcher\|syntropy/boardChrome" canvas/excalidraw-app --include=*.ts --include=*.tsx | grep -v node_modules`

At minimum this will list `canvas/excalidraw-app/App.tsx` (imports all five) — update each to the new path and, for the library one, the new name:
```tsx
// before
import { LibraryPanel } from "./syntropy/LibraryPanel";
import { ChromeRail } from "./syntropy/ChromeRail";
import { PenPresets } from "./syntropy/PenPresets";
// after
import { MethodLibrary } from "./syntropy/MethodLibrary";
import { ChromeRail } from "./chrome/ChromeRail";
import { PenPresets } from "./chrome/PenPresets";
```
and update `<LibraryPanel excalidrawAPI={excalidrawAPI} />` to `<MethodLibrary excalidrawAPI={excalidrawAPI} />` in the JSX. Also fix the `import "./syntropy/boardChrome.scss";` side-effect import to `import "./chrome/boardChrome.scss";`.

- [ ] **Step 5: Typecheck**

Run: `cd canvas && yarn test:typecheck`
Expected: any import path this task missed shows up here as a "Cannot find module" error — fix each one the same way as Step 4 and re-run until clean.

- [ ] **Step 6: Lint**

Run: `cd canvas && npx eslint --max-warnings=0 excalidraw-app/App.tsx excalidraw-app/chrome/*.tsx excalidraw-app/syntropy/MethodLibrary.tsx`

- [ ] **Step 7: Run the full test suite**

Run: `cd canvas && npx vitest run --silent`
Expected: all pass. Any test file importing the old `LibraryPanel`/`ChromeRail`/etc. paths directly needs the same path fix as Step 4 — check `grep -rln "syntropy/LibraryPanel\|syntropy/ChromeRail\|syntropy/PaperPicker\|syntropy/PenPresets\|syntropy/ThemeSwitcher" canvas/excalidraw-app/tests` first.

- [ ] **Step 8: Manual check**

Dev server → confirm the app looks and behaves identically (this task changes zero behavior, only file locations and one component's name) — Library/Paper/Theme rail, pen presets rail, and the method browser panel all still work.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "refactor: split chrome UI out of syntropy/, rename LibraryPanel to MethodLibrary"
```

---

## Phase 1 — Strip Excalidraw's own product surface

Eight small, independent edits. Each is its own task so a reviewer can approve/reject them individually; none depend on each other.

### Task 1.1: Fix the accessibility heading

**Files:**
- Modify: `canvas/excalidraw-app/index.html:201`

**Interfaces:** None — static HTML text change.

- [ ] **Step 1: Change the heading text**

Find:
```html
<h1 class="visually-hidden">Excalidraw</h1>
```
Replace with:
```html
<h1 class="visually-hidden">Syntropy Canvas</h1>
```

- [ ] **Step 2: Verify**

Run: `grep -n "visually-hidden" canvas/excalidraw-app/index.html`
Expected: the line shows `Syntropy Canvas`, not `Excalidraw`.

- [ ] **Step 3: Commit**

```bash
git add canvas/excalidraw-app/index.html
git commit -m "fix: correct app name in accessibility heading"
```

### Task 1.2: Remove the dormant Excalidraw+ auto-redirect script

**Files:**
- Modify: `canvas/excalidraw-app/index.html:87-106`

**Interfaces:** None.

- [ ] **Step 1: Delete the whole block**

Remove this entire block (the `<!-- ... -->` divider comment lines above/below it can go too):
```html
<!------------------------------------------------------------------------->
<% if (typeof PROD != 'undefined' && PROD == true) { %>
<script>
  // Redirect Excalidraw+ users which have auto-redirect enabled.
  //
  // Redirect only the bare root path, so link/room/library urls are not
  // redirected.
  //
  // Putting into index.html for best performance (can't redirect on server
  // due to location.hash checks).
  if (
    window.location.pathname === "/" &&
    !window.location.hash &&
    !window.location.search &&
    // if its present redirect
    document.cookie.includes("excplus-autoredirect=true")
  ) {
    window.location.href = "https://app.excalidraw.com";
  }
</script>
```

- [ ] **Step 2: Verify**

Run: `grep -n "excplus-autoredirect\|app.excalidraw.com" canvas/excalidraw-app/index.html`
Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add canvas/excalidraw-app/index.html
git commit -m "fix: remove dormant Excalidraw+ redirect script"
```

### Task 1.3: Remove the unused Google Fonts preconnect

**Files:**
- Modify: `canvas/excalidraw-app/index.html:83-85`

- [ ] **Step 1: Delete the two preconnect links**

Remove:
```html
<!-- Warmup the connection for Google fonts -->
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
```

Nothing else in `index.html` or `packages/excalidraw/fonts/fonts.css` actually loads from `fonts.googleapis.com` (all fonts are self-hosted `.woff2` files) — confirmed by `grep -rn "fonts.googleapis\|fonts.gstatic" canvas/excalidraw-app/index.html canvas/packages/excalidraw/fonts/fonts.css` returning only these two lines before deletion.

- [ ] **Step 2: Verify**

Run: `grep -n "fonts.googleapis\|fonts.gstatic" canvas/excalidraw-app/index.html`
Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add canvas/excalidraw-app/index.html
git commit -m "fix: remove unused Google Fonts preconnect hint"
```

### Task 1.4: Remove the Excalidraw community/upsell links from the command palette and main menu

**Files:**
- Modify: `canvas/excalidraw-app/App.tsx:1043-1058` (`ExcalidrawPlusCommand`, `ExcalidrawPlusAppCommand` definitions)
- Modify: `canvas/excalidraw-app/App.tsx:1449-1531` (GitHub/X/Discord/YouTube/Excalidraw+ command palette entries, and the `isExcalidrawPlusSignedUser ? [...] : [...]` spread that includes them)

**Interfaces:** `CommandPalette`'s `customCommandPaletteItems` prop is an array — removing entries is just deleting array elements, no signature change.

- [ ] **Step 1: Delete the two command definitions**

Remove the `ExcalidrawPlusCommand` and `ExcalidrawPlusAppCommand` `const` objects entirely (both defined just above the `return (` in `ExcalidrawWrapper`).

- [ ] **Step 2: Remove their usage and the four social-link commands from `customCommandPaletteItems`**

In the `customCommandPaletteItems={[...]}` array passed to `<CommandPalette>`, delete the five object literals whose `label` is one of: `"GitHub"`, `t("labels.followUs")` (X/Twitter), `t("labels.discordChat")`, `"YouTube"`, and delete the trailing:
```tsx
...(isExcalidrawPlusSignedUser
  ? [
      {
        ...ExcalidrawPlusAppCommand,
        label: "Sign in / Go to Excalidraw+",
      },
    ]
  : [ExcalidrawPlusCommand, ExcalidrawPlusAppCommand]),
```
Also delete the `{ label: t("overwriteConfirm.action.excalidrawPlus.button"), ... perform: () => { exportToExcalidrawPlus(...) } }` entry (the "Save to Excalidraw+" export command) — same reasoning, it exports to Excalidraw's own cloud product.

- [ ] **Step 3: Remove the now-unused imports**

`GithubIcon`, `XBrandIcon`, `DiscordIcon`, `youtubeIcon`, `exportToPlus`, `share` (only if `share` was solely used by the deleted block — check remaining usages first with `grep -n "share\b" canvas/excalidraw-app/App.tsx` before removing it, since `ShareDialog`/`shareDialogStateAtom` are separate and still used) from the `@excalidraw/excalidraw/components/icons` import block, and `exportToExcalidrawPlus`/`isExcalidrawPlusSignedUser` if nothing else references them (`ExportToExcalidrawPlus` component usage in `UIOptions.canvasActions.export.renderCustomUI` is a **separate** concern — see Task 1.5, don't remove `exportToExcalidrawPlus` the function if that render path still calls it).

- [ ] **Step 4: Typecheck**

Run: `cd canvas && yarn test:typecheck`
Expected: no errors (this will surface any import you missed removing/keeping).

- [ ] **Step 5: Lint**

Run: `cd canvas && npx eslint --max-warnings=0 excalidraw-app/App.tsx`
Expected: no output (0 problems).

- [ ] **Step 6: Manual check**

Run the dev server (`cd canvas/excalidraw-app && npx vite`), open the command palette (Ctrl/Cmd+K), confirm none of GitHub/X/Discord/YouTube/Excalidraw+ appear.

- [ ] **Step 7: Commit**

```bash
git add canvas/excalidraw-app/App.tsx
git commit -m "fix: remove Excalidraw's own community/upsell links from command palette"
```

### Task 1.5: Remove the Excalidraw+ export promo path and the "Excalidraw+" export button

**Files:**
- Modify: `canvas/excalidraw-app/App.tsx` (the `UIOptions.canvasActions.export.renderCustomUI` callback, and the `ExcalidrawPlusPromoBanner` render in `renderTopRightUI`)
- Modify: `canvas/excalidraw-app/components/AppMainMenu.tsx` — no change needed (confirmed in the audit it doesn't render social/Excalidraw+ items), skip.

**Interfaces:** `renderCustomUI` and `renderTopRightUI` are Excalidraw props with fixed signatures from `@excalidraw/excalidraw/types` (`ExcalidrawProps["UIOptions"]["canvasActions"]["export"]["renderCustomUI"]`) — this task removes what App.tsx passes into them, not the prop shape itself.

- [ ] **Step 1: Remove the `ExportToExcalidrawPlus` render**

In `UIOptions.canvasActions.export`, change:
```tsx
export: {
  onExportToBackend,
  renderCustomUI: excalidrawAPI
    ? (elements, appState, files) => {
        return (
          <ExportToExcalidrawPlus
            elements={elements}
            appState={appState}
            files={files}
            name={excalidrawAPI.getName()}
            onError={(error) => { ... }}
            onSuccess={() => { ... }}
          />
        );
      }
    : undefined,
},
```
to:
```tsx
export: {
  onExportToBackend,
},
```

- [ ] **Step 2: Remove the promo banner**

In `renderTopRightUI`, delete:
```tsx
{excalidrawAPI?.getEditorInterface().formFactor === "desktop" && (
  <ExcalidrawPlusPromoBanner isSignedIn={isExcalidrawPlusSignedUser} />
)}
```

- [ ] **Step 3: Remove now-unused imports**

`ExportToExcalidrawPlus`, `exportToExcalidrawPlus` (from `./components/ExportToExcalidrawPlus`), `ExcalidrawPlusPromoBanner` (from `./components/ExcalidrawPlusPromoBanner`) — re-run `grep -n "exportToExcalidrawPlus\|ExportToExcalidrawPlus\|ExcalidrawPlusPromoBanner" canvas/excalidraw-app/App.tsx` first; `exportToExcalidrawPlus` the function is also called from the `OverwriteConfirmDialog.Action` block a few dozen lines down — remove that whole `{excalidrawAPI && (<OverwriteConfirmDialog.Action title={t("overwriteConfirm.action.excalidrawPlus.title")} ...>...)}` block too, same reasoning.

- [ ] **Step 4: Typecheck, lint, verify in browser**

Same as Task 1.4 steps 4-6, checking the export dialog (toolbar → export) no longer shows an "Excalidraw+" option and the top-right corner has no promo banner.

- [ ] **Step 5: Commit**

```bash
git add canvas/excalidraw-app/App.tsx
git commit -m "fix: remove Excalidraw+ export promo and cloud-save path"
```

### Task 1.6: Remove the misleading encryption badge and the Help dialog's link strip

**Files:**
- Delete: `canvas/excalidraw-app/components/EncryptedIcon.tsx`
- Modify: `canvas/excalidraw-app/components/AppFooter.tsx`
- Modify: `canvas/packages/excalidraw/components/HelpDialog.tsx:21-60` (the `Header` component)

**Interfaces:** `AppFooter` and `HelpDialog` keep their existing exported signatures (`AppFooter: React.FC<{onChange: () => void}>`, `HelpDialog: ({onClose}: {onClose?: () => void}) => JSX.Element`) — only their rendered contents shrink.

- [ ] **Step 1: Delete the encryption icon file**

```bash
rm canvas/excalidraw-app/components/EncryptedIcon.tsx
```

- [ ] **Step 2: Remove its usage from the footer**

In `canvas/excalidraw-app/components/AppFooter.tsx`, remove:
```tsx
import { EncryptedIcon } from "./EncryptedIcon";
```
and:
```tsx
{!isExcalidrawPlusSignedUser && <EncryptedIcon />}
```
If `isExcalidrawPlusSignedUser` (from `../app_constants`) is now unused in this file, remove that import too — check with `grep -n "isExcalidrawPlusSignedUser" canvas/excalidraw-app/components/AppFooter.tsx`.

- [ ] **Step 3: Trim the Help dialog's `Header` to the two links that still make sense**

In `canvas/packages/excalidraw/components/HelpDialog.tsx`, the `Header` component currently renders four buttons (Documentation → `docs.excalidraw.com`, Blog → `plus.excalidraw.com/blog`, GitHub issues → `github.com/excalidraw/excalidraw/issues`, YouTube → `youtube.com/@excalidraw`). Since this app has no documentation site or bug tracker of its own yet, remove the `Header` component's contents entirely for now (keep the empty shell so it's a one-line change to add real links later):

```tsx
const Header = () => <div className="HelpDialog__header" />;
```

Remove the now-unused imports this leaves behind: `ExternalLinkIcon`, `GithubIcon`, `youtubeIcon` (check `grep -n "ExternalLinkIcon\|GithubIcon\|youtubeIcon" canvas/packages/excalidraw/components/HelpDialog.tsx` — none of the three should appear anywhere else in the file after this edit).

- [ ] **Step 4: Typecheck**

Run: `cd canvas && yarn test:typecheck`

- [ ] **Step 5: Lint**

Run: `cd canvas && npx eslint --max-warnings=0 excalidraw-app/components/AppFooter.tsx packages/excalidraw/components/HelpDialog.tsx`

- [ ] **Step 6: Manual check**

Dev server → confirm no shield icon bottom-right of the canvas, and Help (main menu → Help) shows the keyboard-shortcuts sections with an empty header strip (no broken layout — the `HelpDialog__header` div has no children but shouldn't collapse the dialog oddly; if it looks visually broken, wrap the empty state with `display: none` via a conditional instead of an empty div).

- [ ] **Step 7: Commit**

```bash
git add canvas/excalidraw-app/components/EncryptedIcon.tsx canvas/excalidraw-app/components/AppFooter.tsx canvas/packages/excalidraw/components/HelpDialog.tsx
git commit -m "fix: remove misleading encryption badge and Excalidraw's help links"
```

### Task 1.7: Remove the dead Excalidraw+ cloud-export route

**Files:**
- Delete: `canvas/excalidraw-app/ExcalidrawPlusIframeExport.tsx`
- Modify: `canvas/excalidraw-app/App.tsx:161,1578-1581`

**Interfaces:** None — `isCloudExportWindow` and its branch are removed together, nothing else references them.

- [ ] **Step 1: Delete the file**

```bash
rm canvas/excalidraw-app/ExcalidrawPlusIframeExport.tsx
```

- [ ] **Step 2: Remove its usage**

In `canvas/excalidraw-app/App.tsx`, remove:
```tsx
import { ExcalidrawPlusIframeExport } from "./ExcalidrawPlusIframeExport";
```
and, inside the `ExcalidrawApp` component:
```tsx
const isCloudExportWindow =
  window.location.pathname === "/excalidraw-plus-export";
if (isCloudExportWindow) {
  return <ExcalidrawPlusIframeExport />;
}
```
leaving `ExcalidrawApp` returning straight to its `<TopErrorBoundary>` wrapper.

- [ ] **Step 3: Typecheck and lint**

```bash
cd canvas && yarn test:typecheck
npx eslint --max-warnings=0 excalidraw-app/App.tsx
```

- [ ] **Step 4: Commit**

```bash
git add canvas/excalidraw-app/ExcalidrawPlusIframeExport.tsx canvas/excalidraw-app/App.tsx
git commit -m "fix: remove dead Excalidraw+ cloud-export route"
```

### Task 1.8: Fix Sentry so it can't silently report to Excalidraw's own project

**Files:**
- Modify: `canvas/excalidraw-app/sentry.ts`

**Interfaces:** None — internal module, no exports change.

- [ ] **Step 1: Understand the current risk**

`sentry.ts`'s `SentryEnvHostnameMap` currently matches `window.location.hostname` against `"excalidraw.com"`, `"staging.excalidraw.com"`, and `"vercel.app"`. There's no Sentry DSN configured in `.env.production`/`.env.development` today (confirmed: `grep -i sentry canvas/.env.production canvas/.env.development` returns nothing), so this is inert right now — but it activates by *hostname substring match*, not by an explicit flag, so deploying a preview build to any `*.vercel.app` subdomain would turn it on unexpectedly, reporting to whatever DSN is compiled in at that time.

- [ ] **Step 2: Replace the hostname allowlist with an explicit opt-in**

Change:
```typescript
const SentryEnvHostnameMap: { [key: string]: string } = {
  "excalidraw.com": "production",
  "staging.excalidraw.com": "staging",
  "vercel.app": "staging",
};

const SENTRY_DISABLED = import.meta.env.VITE_APP_DISABLE_SENTRY === "true";

// Disable Sentry locally or inside the Docker to avoid noise/respect privacy
const onlineEnv =
  !SENTRY_DISABLED &&
  Object.keys(SentryEnvHostnameMap).find(
    (item) => window.location.hostname.indexOf(item) >= 0,
  );
```
to:
```typescript
// Opt-in only — set VITE_APP_SENTRY_ENV explicitly (e.g. "production") in
// the env file for whatever deployment should report errors. No hostname
// matching: a preview/staging deploy on a shared platform (Vercel, etc.)
// must not silently start reporting to whoever's DSN happens to be compiled
// in.
const onlineEnv = import.meta.env.VITE_APP_SENTRY_ENV || false;
```

- [ ] **Step 3: Update the rest of the file to use the new flag consistently**

Search `grep -n "onlineEnv\|SentryEnvHostnameMap\|SENTRY_DISABLED" canvas/excalidraw-app/sentry.ts` and confirm every remaining reference to `onlineEnv` still type-checks as a string-or-false (the `Sentry.init` call's `environment`/`enabled` fields downstream) — no other file imports `SentryEnvHostnameMap` or `SENTRY_DISABLED` directly (confirmed: `grep -rln "SentryEnvHostnameMap\|SENTRY_DISABLED" canvas/excalidraw-app --include=*.ts --include=*.tsx` matches only `sentry.ts` itself), so this is a self-contained change.

- [ ] **Step 4: Typecheck and lint**

```bash
cd canvas && yarn test:typecheck
npx eslint --max-warnings=0 excalidraw-app/sentry.ts
```

- [ ] **Step 5: Commit**

```bash
git add canvas/excalidraw-app/sentry.ts
git commit -m "fix: make Sentry reporting explicit opt-in, not hostname-matched"
```

---

## Phase 2 — Cut the diagramming-tool dependency weight

The "Text to Diagram" (TTD) feature has two tabs — Mermaid-text-to-shapes and AI-wireframe-to-code — and both live in one dialog that's the sole consumer of `@excalidraw/mermaid-to-excalidraw` (which pulls in `cytoscape`) and `@codemirror/*` (confirmed: `grep -rln "@codemirror" canvas/packages/excalidraw --include=*.ts --include=*.tsx` only matches files under `components/TTDDialog/`). Removing the whole dialog removes all three dependencies cleanly in one pass. This is a developer/diagramming feature, not a note-taking one — same reasoning as Phase 1.

### Task 2.1: Remove the Text-to-Diagram dialog and its trigger

**Files:**
- Delete: `canvas/packages/excalidraw/components/TTDDialog/` (whole directory)
- Modify: `canvas/excalidraw-app/App.tsx` (remove `<TTDDialogTrigger />` and its import)
- Modify: `canvas/packages/excalidraw/index.tsx` (remove `TTDDialogTrigger`/`TTDDialog` exports, if present)
- Modify: `canvas/packages/excalidraw/components/App.tsx:441,4720` (the mermaid-paste-detection block)
- Modify: `canvas/packages/excalidraw/components/Tools.tsx` and `canvas/packages/excalidraw/components/icons.tsx` (the `magicframe`/wireframe-to-code toolbar entry)
- Modify: `canvas/packages/excalidraw/package.json` (drop `@excalidraw/mermaid-to-excalidraw`, `@codemirror/commands`, `@codemirror/language`, `@codemirror/state`, `@codemirror/view`, `@lezer/highlight`)

**Interfaces:** None of these are consumed elsewhere — this is a pure deletion, confirmed by the single-directory dependency check above.

- [ ] **Step 1: Delete the dialog directory**

```bash
rm -rf canvas/packages/excalidraw/components/TTDDialog
```

- [ ] **Step 2: Remove the trigger from the app**

In `canvas/excalidraw-app/App.tsx`, remove:
```tsx
import { TTDDialogTrigger } from "@excalidraw/excalidraw";
```
(check the exact import — it's grouped with `Excalidraw, LiveCollaborationTrigger, CaptureUpdateAction, ...` in the top `@excalidraw/excalidraw` import block, remove just `TTDDialogTrigger` from that list) and:
```tsx
<TTDDialogTrigger />
```
from inside `<Excalidraw>`'s children.

- [ ] **Step 3: Remove the paste-mermaid-detection code path**

In `canvas/packages/excalidraw/components/App.tsx`, remove the import at line 441:
```tsx
import { isMaybeMermaidDefinition } from "../mermaid";
```
and the block around line 4720 that calls `import("@excalidraw/mermaid-to-excalidraw")` when pasted text looks like a Mermaid definition. Read the surrounding ~20 lines first (`sed -n '4700,4750p' canvas/packages/excalidraw/components/App.tsx`) to remove the whole `if (isMaybeMermaidDefinition(...))` branch cleanly without leaving a dangling `else` or breaking the rest of the paste handler.

- [ ] **Step 4: Remove the toolbar entry**

Search `grep -rn "magicframe" canvas/packages/excalidraw/components/Tools.tsx canvas/packages/excalidraw/components/icons.tsx canvas/packages/excalidraw/locales/en.json` and remove the toolbar button registration, its icon, and its `toolBar.magicframe` locale string. Also remove `"magicframe"` from the `ToolType` union in `canvas/packages/excalidraw/types.ts:152-180` (it's one line in that union) and from `EngineeringToolsDropdown`/any tool-list array that enumerates all tool types, if `magicframe` appears there.

- [ ] **Step 5: Check for any remaining references**

Run: `grep -rln "TTDDialog\|mermaid-to-excalidraw\|magicframe\|mermaidToExcalidraw" canvas/packages canvas/excalidraw-app --include=*.ts --include=*.tsx 2>/dev/null | grep -v node_modules | grep -v test`
Expected: no output. Anything that shows up here needs the same treatment as steps 2-4 before continuing — this is the actual completeness check for this task, not optional.

- [ ] **Step 6: Remove the dependencies**

In `canvas/packages/excalidraw/package.json`, remove these lines from `dependencies`:
```json
"@codemirror/commands": "^6.0.0",
"@codemirror/language": "^6.0.0",
"@codemirror/state": "^6.0.0",
"@codemirror/view": "^6.0.0",
"@excalidraw/mermaid-to-excalidraw": "2.2.2",
"@lezer/highlight": "^1.0.0",
```
Check `grep -n "cytoscape" canvas/packages/excalidraw/package.json` — if it's not a *direct* dependency (it wasn't, per the audit — it's transitive via `mermaid-to-excalidraw`), no line to remove there; it'll disappear from `node_modules` on the next install automatically.

- [ ] **Step 7: Reinstall and typecheck**

```bash
cd canvas && yarn install && yarn test:typecheck
```
Expected: install succeeds, typecheck passes with no errors referencing the removed packages.

- [ ] **Step 8: Lint the touched files**

```bash
cd canvas && npx eslint --max-warnings=0 excalidraw-app/App.tsx packages/excalidraw/components/App.tsx packages/excalidraw/components/Tools.tsx packages/excalidraw/types.ts
```

- [ ] **Step 9: Run the full test suite**

```bash
cd canvas && npx vitest run --silent
```
Expected: all files pass (any test file under a deleted `TTDDialog/` directory will already be gone with the `rm -rf`; if any *other* test file imports something from that directory, this run will surface it — fix by removing that test's now-invalid assertions).

- [ ] **Step 10: Build and confirm the chunks are gone**

```bash
cd canvas/excalidraw-app && npx vite build
grep -rl "mermaid\|cytoscape\|codemirror" ../dist/assets/*.js 2>/dev/null
```
Expected: the build succeeds, and the grep returns no matching filenames (the `mermaid-to-excalidraw-*.js`, `cytoscape.esm-*.js`, `codemirror.chunk-*.js` chunks from before this change no longer exist in `dist/assets/`).

- [ ] **Step 11: Commit**

```bash
git add canvas/packages/excalidraw canvas/excalidraw-app/App.tsx
git commit -m "feat: remove Text-to-Diagram dialog, drop mermaid/cytoscape/codemirror"
```

---

## Phase 3 — Build the document layer

Currently `canvas/excalidraw-app/app_constants.ts` defines exactly one storage key per data type (`LOCAL_STORAGE_ELEMENTS: "excalidraw"`, `LOCAL_STORAGE_APP_STATE: "excalidraw-state"`) — one scene, for the whole app, forever. This phase adds a real document store: many independently-saved notes, each still a single un-paginated canvas internally (unchanged), with a library screen to create/open/rename/delete between them.

### Task 3.1: The document store module

**Files:**
- Create: `canvas/excalidraw-app/data/documents.ts`
- Test: `canvas/excalidraw-app/tests/documents.test.ts`

**Interfaces:**
- Produces (used by Tasks 3.2, 3.3, 3.4):
  - `type DocumentMeta = { id: string; name: string; createdAt: number; updatedAt: number }`
  - `listDocuments(): Promise<DocumentMeta[]>`
  - `createDocument(name: string): Promise<DocumentMeta>`
  - `loadDocument(id: string): Promise<{ elements: readonly OrderedExcalidrawElement[]; appState: Partial<AppState> } | null>`
  - `saveDocument(id: string, elements: readonly OrderedExcalidrawElement[], appState: AppState): Promise<void>`
  - `renameDocument(id: string, name: string): Promise<void>`
  - `deleteDocument(id: string): Promise<void>`

- [ ] **Step 1: Write the failing tests**

```typescript
// canvas/excalidraw-app/tests/documents.test.ts
import { describe, expect, it, beforeEach } from "vitest";
import "fake-indexeddb/auto";

import {
  listDocuments,
  createDocument,
  loadDocument,
  saveDocument,
  renameDocument,
  deleteDocument,
} from "../data/documents";

describe("document store", () => {
  beforeEach(async () => {
    // clear everything between tests
    const docs = await listDocuments();
    await Promise.all(docs.map((d) => deleteDocument(d.id)));
  });

  it("starts empty", async () => {
    expect(await listDocuments()).toEqual([]);
  });

  it("creates a document and lists it", async () => {
    const created = await createDocument("Week 6 notes");
    const docs = await listDocuments();
    expect(docs).toHaveLength(1);
    expect(docs[0].id).toBe(created.id);
    expect(docs[0].name).toBe("Week 6 notes");
    expect(docs[0].createdAt).toBe(docs[0].updatedAt);
  });

  it("saves and loads elements/appState for a document", async () => {
    const doc = await createDocument("Untitled");
    const elements = [{ id: "el1", type: "rectangle" }] as any;
    const appState = {
      viewBackgroundColor: "#ffffff",
      scrollX: 10,
      scrollY: 20,
    } as any;

    await saveDocument(doc.id, elements, appState);
    const loaded = await loadDocument(doc.id);

    expect(loaded).not.toBeNull();
    expect(loaded!.elements).toEqual(elements);
    expect(loaded!.appState.scrollX).toBe(10);
  });

  it("updates updatedAt on save without changing createdAt", async () => {
    const doc = await createDocument("Untitled");
    const before = (await listDocuments())[0];
    await new Promise((r) => setTimeout(r, 5));
    await saveDocument(doc.id, [], {} as any);
    const after = (await listDocuments())[0];

    expect(after.createdAt).toBe(before.createdAt);
    expect(after.updatedAt).toBeGreaterThan(before.updatedAt);
  });

  it("renames a document", async () => {
    const doc = await createDocument("Old name");
    await renameDocument(doc.id, "New name");
    const docs = await listDocuments();
    expect(docs[0].name).toBe("New name");
  });

  it("deletes a document and its data", async () => {
    const doc = await createDocument("Temp");
    await deleteDocument(doc.id);
    expect(await listDocuments()).toEqual([]);
    expect(await loadDocument(doc.id)).toBeNull();
  });

  it("returns null for an id that was never created", async () => {
    expect(await loadDocument("does-not-exist")).toBeNull();
  });
});
```

Add `fake-indexeddb` as a dev dependency first (it is not currently installed — check `grep -n "fake-indexeddb" canvas/package.json canvas/excalidraw-app/package.json` to confirm, then `cd canvas && yarn add -D fake-indexeddb -W`).

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd canvas && npx vitest run excalidraw-app/tests/documents.test.ts`
Expected: FAIL — `Cannot find module '../data/documents'` (the module doesn't exist yet).

- [ ] **Step 3: Write the implementation**

```typescript
// canvas/excalidraw-app/data/documents.ts
import { get, set, del } from "idb-keyval";

import { clearAppStateForLocalStorage } from "@excalidraw/excalidraw/appState";

import type { AppState } from "@excalidraw/excalidraw/types";
import type { OrderedExcalidrawElement } from "@excalidraw/element/types";

const INDEX_KEY = "syntropy-documents-index";
const documentDataKey = (id: string) => `syntropy-document:${id}`;

export type DocumentMeta = {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
};

type DocumentRecord = {
  elements: readonly OrderedExcalidrawElement[];
  appState: Partial<AppState>;
};

const readIndex = async (): Promise<DocumentMeta[]> => {
  const index = await get<DocumentMeta[]>(INDEX_KEY);
  return index ?? [];
};

const writeIndex = (index: DocumentMeta[]) => set(INDEX_KEY, index);

export const listDocuments = async (): Promise<DocumentMeta[]> => {
  const index = await readIndex();
  // most recently updated first — the library view's natural order
  return [...index].sort((a, b) => b.updatedAt - a.updatedAt);
};

export const createDocument = async (name: string): Promise<DocumentMeta> => {
  const now = Date.now();
  const meta: DocumentMeta = {
    id: `doc-${now}-${Math.random().toString(36).slice(2, 8)}`,
    name,
    createdAt: now,
    updatedAt: now,
  };
  const index = await readIndex();
  await writeIndex([...index, meta]);
  await set(documentDataKey(meta.id), {
    elements: [],
    appState: {},
  } satisfies DocumentRecord);
  return meta;
};

export const loadDocument = async (
  id: string,
): Promise<DocumentRecord | null> => {
  const record = await get<DocumentRecord>(documentDataKey(id));
  return record ?? null;
};

export const saveDocument = async (
  id: string,
  elements: readonly OrderedExcalidrawElement[],
  appState: AppState,
): Promise<void> => {
  const index = await readIndex();
  const next = index.map((meta) =>
    meta.id === id ? { ...meta, updatedAt: Date.now() } : meta,
  );
  await writeIndex(next);
  await set(documentDataKey(id), {
    elements,
    appState: clearAppStateForLocalStorage(appState),
  } satisfies DocumentRecord);
};

export const renameDocument = async (
  id: string,
  name: string,
): Promise<void> => {
  const index = await readIndex();
  await writeIndex(
    index.map((meta) => (meta.id === id ? { ...meta, name } : meta)),
  );
};

export const deleteDocument = async (id: string): Promise<void> => {
  const index = await readIndex();
  await writeIndex(index.filter((meta) => meta.id !== id));
  await del(documentDataKey(id));
};
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd canvas && npx vitest run excalidraw-app/tests/documents.test.ts`
Expected: PASS, all 7 tests.

- [ ] **Step 5: Typecheck and lint**

```bash
cd canvas && yarn test:typecheck
npx eslint --max-warnings=0 excalidraw-app/data/documents.ts excalidraw-app/tests/documents.test.ts
```

- [ ] **Step 6: Commit**

```bash
git add canvas/excalidraw-app/data/documents.ts canvas/excalidraw-app/tests/documents.test.ts canvas/package.json canvas/yarn.lock
git commit -m "feat: add document store (list/create/load/save/rename/delete)"
```

### Task 3.2: Migrate the existing single-scene data into a document

This must land before Task 3.4 (routing) ships to any real user — it's what keeps today's canvas from silently disappearing.

**Files:**
- Create: `canvas/excalidraw-app/data/migrateLegacyScene.ts`
- Test: `canvas/excalidraw-app/tests/migrateLegacyScene.test.ts`

**Interfaces:**
- Consumes: `createDocument`, `saveDocument` from `./documents` (Task 3.1); `importFromLocalStorage` from `./localStorage` (existing); `STORAGE_KEYS` from `../app_constants` (existing).
- Produces: `migrateLegacyScene(): Promise<DocumentMeta | null>` — returns the created document's meta if a migration happened, `null` if there was nothing to migrate or it already ran.

- [ ] **Step 1: Write the failing test**

```typescript
// canvas/excalidraw-app/tests/migrateLegacyScene.test.ts
import { describe, expect, it, beforeEach } from "vitest";
import "fake-indexeddb/auto";

import { migrateLegacyScene } from "../data/migrateLegacyScene";
import { listDocuments, loadDocument } from "../data/documents";
import { STORAGE_KEYS } from "../app_constants";

describe("migrateLegacyScene", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("does nothing when there is no legacy scene", async () => {
    const result = await migrateLegacyScene();
    expect(result).toBeNull();
    expect(await listDocuments()).toEqual([]);
  });

  it("migrates a legacy scene into a new document exactly once", async () => {
    localStorage.setItem(
      STORAGE_KEYS.LOCAL_STORAGE_ELEMENTS,
      JSON.stringify([{ id: "el1", type: "rectangle", isDeleted: false }]),
    );
    localStorage.setItem(
      STORAGE_KEYS.LOCAL_STORAGE_APP_STATE,
      JSON.stringify({ viewBackgroundColor: "#111111" }),
    );

    const result = await migrateLegacyScene();
    expect(result).not.toBeNull();

    const docs = await listDocuments();
    expect(docs).toHaveLength(1);

    const loaded = await loadDocument(docs[0].id);
    expect(loaded!.elements).toHaveLength(1);
    expect(loaded!.appState.viewBackgroundColor).toBe("#111111");

    // second call must not create a duplicate
    const second = await migrateLegacyScene();
    expect(second).toBeNull();
    expect(await listDocuments()).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd canvas && npx vitest run excalidraw-app/tests/migrateLegacyScene.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```typescript
// canvas/excalidraw-app/data/migrateLegacyScene.ts
import { importFromLocalStorage } from "./localStorage";
import { createDocument, saveDocument, type DocumentMeta } from "./documents";

const MIGRATION_DONE_KEY = "syntropy-legacy-migration-done";

export const migrateLegacyScene = async (): Promise<DocumentMeta | null> => {
  if (localStorage.getItem(MIGRATION_DONE_KEY) === "true") {
    return null;
  }

  const legacy = importFromLocalStorage();
  const hasContent = (legacy.elements?.length ?? 0) > 0;

  if (!hasContent) {
    localStorage.setItem(MIGRATION_DONE_KEY, "true");
    return null;
  }

  const meta = await createDocument("My notes");
  await saveDocument(
    meta.id,
    legacy.elements as any,
    legacy.appState as any,
  );
  localStorage.setItem(MIGRATION_DONE_KEY, "true");
  return meta;
};
```

Check `canvas/excalidraw-app/data/localStorage.ts:37` (`importFromLocalStorage`) for its exact return shape before finalizing the `legacy.elements`/`legacy.appState` field names — it returns `{ elements: ExcalidrawElement[] | null; appState: MarkOptional<AppState, ...> | null }` per the existing type there; the two `as any` casts above bridge that to `documents.ts`'s stricter types deliberately, since the legacy data was never guaranteed complete.

- [ ] **Step 4: Run to verify it passes**

Run: `cd canvas && npx vitest run excalidraw-app/tests/migrateLegacyScene.test.ts`
Expected: PASS, both tests.

- [ ] **Step 5: Typecheck and lint**

```bash
cd canvas && yarn test:typecheck
npx eslint --max-warnings=0 excalidraw-app/data/migrateLegacyScene.ts excalidraw-app/tests/migrateLegacyScene.test.ts
```

- [ ] **Step 6: Commit**

```bash
git add canvas/excalidraw-app/data/migrateLegacyScene.ts canvas/excalidraw-app/tests/migrateLegacyScene.test.ts
git commit -m "feat: migrate legacy single-scene data into the document store"
```

### Task 3.3: The library screen

**Files:**
- Create: `canvas/excalidraw-app/library/DocumentLibrary.tsx`
- Create: `canvas/excalidraw-app/library/DocumentLibrary.scss`
- Test: `canvas/excalidraw-app/tests/DocumentLibrary.test.tsx`

**Interfaces:**
- Consumes: `listDocuments`, `createDocument`, `renameDocument`, `deleteDocument` from `../data/documents` (Task 3.1).
- Produces: `<DocumentLibrary onOpen={(id: string) => void} />` — the only prop; opening a document is the caller's (App.tsx, Task 3.4) responsibility, this component only lists/creates/renames/deletes.

- [ ] **Step 1: Write the failing test**

```tsx
// canvas/excalidraw-app/tests/DocumentLibrary.test.tsx
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "fake-indexeddb/auto";

import { DocumentLibrary } from "../library/DocumentLibrary";
import { createDocument, listDocuments } from "../data/documents";

describe("DocumentLibrary", () => {
  beforeEach(async () => {
    const docs = await listDocuments();
    await Promise.all(
      docs.map((d) => import("../data/documents").then((m) => m.deleteDocument(d.id))),
    );
  });

  it("shows an empty state with no documents", async () => {
    render(<DocumentLibrary onOpen={vi.fn()} />);
    expect(await screen.findByText(/no notes yet/i)).toBeInTheDocument();
  });

  it("lists existing documents by name", async () => {
    await createDocument("Chapter 4 review");
    render(<DocumentLibrary onOpen={vi.fn()} />);
    expect(await screen.findByText("Chapter 4 review")).toBeInTheDocument();
  });

  it("creates a new document and opens it", async () => {
    const onOpen = vi.fn();
    render(<DocumentLibrary onOpen={onOpen} />);

    fireEvent.click(await screen.findByRole("button", { name: /new note/i }));

    await waitFor(() => expect(onOpen).toHaveBeenCalledTimes(1));
    expect(onOpen).toHaveBeenCalledWith(expect.any(String));
  });

  it("clicking a listed document opens it", async () => {
    const doc = await createDocument("Existing note");
    const onOpen = vi.fn();
    render(<DocumentLibrary onOpen={onOpen} />);

    fireEvent.click(await screen.findByText("Existing note"));

    expect(onOpen).toHaveBeenCalledWith(doc.id);
  });

  it("deletes a document", async () => {
    await createDocument("To delete");
    render(<DocumentLibrary onOpen={vi.fn()} />);
    await screen.findByText("To delete");

    fireEvent.click(screen.getByRole("button", { name: /delete to delete/i }));
    fireEvent.click(screen.getByRole("button", { name: /confirm delete/i }));

    await waitFor(() =>
      expect(screen.queryByText("To delete")).not.toBeInTheDocument(),
    );
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd canvas && npx vitest run excalidraw-app/tests/DocumentLibrary.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```tsx
// canvas/excalidraw-app/library/DocumentLibrary.tsx
import { useCallback, useEffect, useState } from "react";

import "./DocumentLibrary.scss";

import {
  createDocument,
  deleteDocument,
  listDocuments,
  renameDocument,
  type DocumentMeta,
} from "../data/documents";

type DocumentLibraryProps = {
  onOpen: (id: string) => void;
};

const formatDate = (ms: number) =>
  new Date(ms).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

export const DocumentLibrary = ({ onOpen }: DocumentLibraryProps) => {
  const [documents, setDocuments] = useState<DocumentMeta[] | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const refresh = useCallback(() => {
    listDocuments().then(setDocuments);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleCreate = async () => {
    const meta = await createDocument("Untitled");
    onOpen(meta.id);
  };

  const handleConfirmDelete = async (id: string) => {
    await deleteDocument(id);
    setPendingDeleteId(null);
    refresh();
  };

  const startRename = (doc: DocumentMeta) => {
    setRenamingId(doc.id);
    setRenameValue(doc.name);
  };

  const commitRename = async (id: string) => {
    const trimmed = renameValue.trim();
    if (trimmed) {
      await renameDocument(id, trimmed);
    }
    setRenamingId(null);
    refresh();
  };

  if (documents === null) {
    return <div className="DocumentLibrary" />;
  }

  return (
    <div className="DocumentLibrary">
      <div className="DocumentLibrary__header">
        <h1>Notes</h1>
        <button type="button" onClick={handleCreate}>
          New note
        </button>
      </div>

      {documents.length === 0 && (
        <p className="DocumentLibrary__empty">No notes yet — start one.</p>
      )}

      <ul className="DocumentLibrary__list">
        {documents.map((doc) => (
          <li key={doc.id} className="DocumentLibrary__item">
            {renamingId === doc.id ? (
              <input
                autoFocus
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onBlur={() => commitRename(doc.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    commitRename(doc.id);
                  } else if (e.key === "Escape") {
                    setRenamingId(null);
                  }
                }}
              />
            ) : (
              <button
                type="button"
                className="DocumentLibrary__name"
                onClick={() => onOpen(doc.id)}
                onDoubleClick={() => startRename(doc)}
              >
                {doc.name}
              </button>
            )}
            <span className="DocumentLibrary__date">
              {formatDate(doc.updatedAt)}
            </span>
            {pendingDeleteId === doc.id ? (
              <button
                type="button"
                aria-label="Confirm delete"
                onClick={() => handleConfirmDelete(doc.id)}
              >
                Confirm delete
              </button>
            ) : (
              <button
                type="button"
                aria-label={`Delete ${doc.name}`}
                onClick={() => setPendingDeleteId(doc.id)}
              >
                Delete
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
};
```

```scss
// canvas/excalidraw-app/library/DocumentLibrary.scss
.DocumentLibrary {
  height: 100%;
  overflow-y: auto;
  padding: 40px 32px;
  font-family: var(--ui-font);
  color: var(--color-on-surface);
}

.DocumentLibrary__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 24px;

  h1 {
    font-size: 22px;
    margin: 0;
  }

  button {
    all: unset;
    cursor: pointer;
    padding: 8px 16px;
    border-radius: 8px;
    background: var(--color-primary);
    color: #fff;
    font-size: 13px;
  }
}

.DocumentLibrary__empty {
  color: var(--color-gray-60);
}

.DocumentLibrary__list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.DocumentLibrary__item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 0;
  border-bottom: 1px solid var(--input-border-color);
}

.DocumentLibrary__name {
  all: unset;
  cursor: pointer;
  flex: 1;
  font-size: 14px;
}

.DocumentLibrary__date {
  font-size: 12px;
  color: var(--color-gray-60);
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd canvas && npx vitest run excalidraw-app/tests/DocumentLibrary.test.tsx`
Expected: PASS, all 5 tests.

- [ ] **Step 5: Typecheck and lint**

```bash
cd canvas && yarn test:typecheck
npx eslint --max-warnings=0 excalidraw-app/library/DocumentLibrary.tsx excalidraw-app/tests/DocumentLibrary.test.tsx
```

- [ ] **Step 6: Commit**

```bash
git add canvas/excalidraw-app/library/DocumentLibrary.tsx canvas/excalidraw-app/library/DocumentLibrary.scss canvas/excalidraw-app/tests/DocumentLibrary.test.tsx
git commit -m "feat: add the notes library screen"
```

### Task 3.4: Wire routing — library is the entry point, `?note={id}` opens a canvas

This is the task that actually changes what the app does on load, so it's last and depends on 3.1-3.3 all being in place.

**Files:**
- Modify: `canvas/excalidraw-app/App.tsx`

**Interfaces:**
- Consumes: `DocumentLibrary` (Task 3.3), `listDocuments`/`loadDocument`/`saveDocument` (Task 3.1), `migrateLegacyScene` (Task 3.2).

- [ ] **Step 1: Add the note-id state and URL sync**

In `ExcalidrawWrapper`, add near the other top-level state:
```tsx
const [activeNoteId, setActiveNoteId] = useState<string | null>(() => {
  return new URLSearchParams(window.location.search).get("note");
});

const openNote = (id: string) => {
  const url = new URL(window.location.href);
  url.searchParams.set("note", id);
  window.history.pushState({}, "", url);
  setActiveNoteId(id);
};

const closeNote = () => {
  const url = new URL(window.location.href);
  url.searchParams.delete("note");
  window.history.pushState({}, "", url);
  setActiveNoteId(null);
};
```

- [ ] **Step 2: Run the migration once on mount**

Add a `useEffect` that runs `migrateLegacyScene()` once; if it returns a document (meaning there was legacy data to carry over) and there's no `?note=` in the URL already, open it automatically so returning users land exactly where they left off instead of an empty library:

```tsx
useEffect(() => {
  migrateLegacyScene().then((migrated) => {
    if (migrated && !new URLSearchParams(window.location.search).get("note")) {
      openNote(migrated.id);
    }
  });
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, []);
```

- [ ] **Step 3: Branch the render on `activeNoteId`**

Add the import near the other local imports:
```tsx
import { DocumentLibrary } from "./library/DocumentLibrary";
```

Wrap the existing return value (everything currently returned by `ExcalidrawWrapper`, starting from the top-level `<div className={clsx("excalidraw-app", ...)}>`) so it only renders when `activeNoteId` is set; render `<DocumentLibrary onOpen={openNote} />` otherwise:

```tsx
if (!activeNoteId) {
  return <DocumentLibrary onOpen={openNote} />;
}

return (
  <div className={clsx("excalidraw-app", ...)}>
    {/* existing JSX unchanged */}
  </div>
);
```

- [ ] **Step 4: Load the active note's scene instead of the legacy single scene**

The existing `initializeScene()`-driven `useEffect` (around `App.tsx:578-598` per the current file) currently always loads from `importFromLocalStorage()`. Change its data source to `loadDocument(activeNoteId)` when a note is active, keeping the rest of that effect (image loading, hash-change handling for shared links) unchanged for now — shared/collaboration links are out of scope for this plan. Add `activeNoteId` to that effect's dependency array so switching notes (via `closeNote` then `openNote` on a different id) re-triggers the load.

- [ ] **Step 5: Save to the active document instead of the legacy keys**

In `onChange`, replace the existing `LocalData.save(elements, appState, files, ...)` call's target with `saveDocument(activeNoteId, elements, appState)` when `activeNoteId` is set. Keep `LocalData`'s file-storage handling (`LocalData.fileStorage.*` calls for images) as-is — this plan only moves *elements/appState* into the document store, not binary file storage.

- [ ] **Step 6: Add a way back to the library**

In `ChromeRail` (`canvas/excalidraw-app/chrome/ChromeRail.tsx`), add one more segment before "Library" — a "← Notes" button that calls `closeNote` (passed down as a new `onCloseNote: () => void` prop, following the exact same prop-drilling pattern already used for `onLibraryToggle`/`onPaperToggle`).

- [ ] **Step 7: Typecheck**

Run: `cd canvas && yarn test:typecheck`

- [ ] **Step 8: Lint**

Run: `cd canvas && npx eslint --max-warnings=0 excalidraw-app/App.tsx excalidraw-app/chrome/ChromeRail.tsx`

- [ ] **Step 9: Full test suite**

Run: `cd canvas && npx vitest run --silent`
Expected: all pass. This is the point where any test that assumed "the app always shows a canvas" (rather than sometimes showing the library) will need its render setup updated to pass `?note=<id>` in the test URL, or to click through the library first — fix each one that fails this way rather than skipping it.

- [ ] **Step 10: Manual check**

Dev server → confirm: loading `/` with no prior data shows the empty library; "New note" creates and opens a blank canvas; drawing something, going back to the library, and reopening the note shows the drawing still there; a second note is genuinely separate from the first (nothing drawn in note A appears in note B).

- [ ] **Step 11: Commit**

```bash
git add canvas/excalidraw-app/App.tsx canvas/excalidraw-app/chrome/ChromeRail.tsx
git commit -m "feat: library is the entry point; each note is its own document"
```

---

## Self-review notes (for whoever executes this)

- **Phase 0 must land before Phase 3.** Task 3.3 creates `library/DocumentLibrary.tsx` as a new sibling of the (post-Phase-0) `chrome/` and `syntropy/` directories, and Task 3.4 imports `ChromeRail` from `./chrome/ChromeRail` — both assume Phase 0's moves already happened. Phase 0 has no dependency on Phase 1/2/3.
- Phase 1 and Phase 2 tasks are independent of each other, of Phase 0, and of Phase 3 — safe to do in any order, or in parallel across multiple people, other than the Phase 0-before-Phase-3 rule above.
- Phase 3's four tasks are **not** independent — 3.1 before 3.2 before (3.3 can run parallel to 3.2) before 3.4. Task 3.4 is the only one that changes what a user actually sees on load, so it's the one worth a second pair of eyes before merging.
- Deliberately out of scope for this plan (flagged in the audit, not forgotten): replacing the Firebase project if/when collaboration ships, the internal `localStorage`/`idb-keyval` key naming (`excalidraw*` prefixes elsewhere in the app), the PWA manifest `id: "excalidraw"` field, the `.excalidraw` file format identity question, and renaming the `packages/@excalidraw/*` npm scope or the top-level `excalidraw-app/` directory itself — both real naming leaks, but high-mechanical-cost (the npm scope alone is referenced in thousands of import statements) for close to zero functional benefit until the app has a final chosen name. None of them block this plan; revisit separately once a name is picked.
