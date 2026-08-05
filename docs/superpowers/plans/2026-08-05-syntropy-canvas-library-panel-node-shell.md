# Syntropy Canvas — Library Panel + Generic Node Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A left library sidebar listing the real 7 General Lab engines and their real methods; clicking a method spawns an empty, purpose-built "node" on the canvas that behaves like a real Excalidraw element (draggable, resizable, selectable, saved); and the app's accent color dynamically matches whichever engine's node is currently selected, falling back to neutral white when nothing engine-specific is selected.

**Architecture:** Nodes are Excalidraw `embeddable` elements carrying a `customData.syntropyNode` marker — not a new element type. Two already-public `<Excalidraw>` props, `validateEmbeddable` and `renderEmbeddable`, are supplied from `excalidraw-app/App.tsx` to (a) treat elements whose `link` starts with `syntropy://` as always-valid, bypassing the normal URL-embed validator, and (b) render our own `<SyntropyNode>` React component instead of an iframe when `customData.syntropyNode` is present. This means **zero changes to `canvas/packages/excalidraw`'s element/scene internals** — everything new lives in `excalidraw-app/` except one small neutral-color correction to `theme.scss`. Selection/drag/resize/undo/redo/persistence all come free from the existing embeddable-element lifecycle.

**Tech Stack:** React/TSX, the same vendored Excalidraw fork from the prior two plans, vitest for the one pure-function unit test in this plan.

## Global Constraints

- No new Excalidraw element type, no changes to element serialization/history/hit-testing code in `canvas/packages/excalidraw`.
- No real engine computation, no node-to-node wiring — nodes are visual shells this round (per the design spec's explicit scope).
- The app's accent is dynamic, not a fixed brand color: matches the selected node's source engine, or neutral white with nothing engine-specific selected.
- Every task ends in its own commit.
- After the last task, run `yarn test:app --watch=false` from `canvas/` and confirm 120+ files pass with 0 failures (baseline: 120 files / 1827 passed / 48 skipped, recorded at the end of the visual-identity plan).

---

### Task 1: Engine accent data + shade-derivation utility

**Files:**
- Create: `canvas/excalidraw-app/syntropy/engineAccents.ts`
- Test: `canvas/excalidraw-app/tests/engineAccents.test.ts`

**Interfaces:**
- Produces: `ENGINE_ACCENTS: Record<EngineId, string>` (the 7 engines' real hex colors, read from `math-lab/engines/*/index.html`'s `--electric-teal` override); `type EngineId = "calculus" | "complex" | "linear-algebra" | "number-theory" | "numerical" | "ode" | "statistics"`; `deriveAccentShades(baseHex: string): AccentShades` where `AccentShades = { primary: string; primaryDarker: string; primaryDarkest: string; primaryLight: string; primaryLightDarker: string; primaryHover: string; brandHover: string; brandActive: string; onPrimaryContainer: string; surfacePrimaryContainer: string; selection: string }`.
- Consumed by: Task 3 (dynamic accent injection) and Task 6 (node header accent dot).

- [ ] **Step 1: Write the failing test**

```typescript
// canvas/excalidraw-app/tests/engineAccents.test.ts
import { describe, expect, it } from "vitest";

import {
  ENGINE_ACCENTS,
  deriveAccentShades,
} from "../syntropy/engineAccents";

describe("engineAccents", () => {
  it("has a real hex accent for all 7 engines", () => {
    expect(ENGINE_ACCENTS.calculus).toBe("#4f9e82");
    expect(ENGINE_ACCENTS.complex).toBe("#b45fd0");
    expect(ENGINE_ACCENTS["linear-algebra"]).toBe("#8570b3");
    expect(ENGINE_ACCENTS["number-theory"]).toBe("#a3623c");
    expect(ENGINE_ACCENTS.numerical).toBe("#5c939f");
    expect(ENGINE_ACCENTS.ode).toBe("#4f8fc0");
    expect(ENGINE_ACCENTS.statistics).toBe("#c99a3c");
  });

  it("derives a hover shade lighter than the base", () => {
    const shades = deriveAccentShades("#4f9e82");
    expect(shades.primary).toBe("#4f9e82");
    expect(shades.primaryHover).not.toBe(shades.primary);
  });

  it("derives distinct shades for a warm base color", () => {
    const shades = deriveAccentShades("#b45fd0");
    expect(shades.primaryDarker).not.toBe(shades.primary);
    expect(shades.primaryDarkest).not.toBe(shades.primaryDarker);
    expect(shades.surfacePrimaryContainer).not.toBe(shades.primary);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd canvas && yarn test:app --watch=false engineAccents`
Expected: FAIL — `Cannot find module '../syntropy/engineAccents'`

- [ ] **Step 3: Write the implementation**

```typescript
// canvas/excalidraw-app/syntropy/engineAccents.ts

// Real per-engine accent colors, read from each engine's own
// math-lab/engines/*/index.html (`:root{--electric-teal:#...}` override).
// Keep in sync by hand if an engine's accent ever changes there.
export const ENGINE_ACCENTS = {
  calculus: "#4f9e82",
  complex: "#b45fd0",
  "linear-algebra": "#8570b3",
  "number-theory": "#a3623c",
  numerical: "#5c939f",
  ode: "#4f8fc0",
  statistics: "#c99a3c",
} as const;

export type EngineId = keyof typeof ENGINE_ACCENTS;

export type AccentShades = {
  primary: string;
  primaryDarker: string;
  primaryDarkest: string;
  primaryLight: string;
  primaryLightDarker: string;
  primaryHover: string;
  brandHover: string;
  brandActive: string;
  onPrimaryContainer: string;
  surfacePrimaryContainer: string;
  selection: string;
};

const hexToRgb = (hex: string): [number, number, number] => {
  const n = parseInt(hex.replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

const rgbToHex = (r: number, g: number, b: number): string => {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  return (
    "#" +
    [clamp(r), clamp(g), clamp(b)]
      .map((v) => v.toString(16).padStart(2, "0"))
      .join("")
  );
};

const rgbToHsl = (r: number, g: number, b: number): [number, number, number] => {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;
  const d = max - min;
  if (d !== 0) {
    s = d / (1 - Math.abs(2 * l - 1));
    switch (max) {
      case r:
        h = ((g - b) / d) % 6;
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      default:
        h = (r - g) / d + 4;
    }
    h *= 60;
    if (h < 0) {
      h += 360;
    }
  }
  return [h, s, l];
};

const hslToRgb = (h: number, s: number, l: number): [number, number, number] => {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let [r, g, b] = [0, 0, 0];
  if (h < 60) {
    [r, g, b] = [c, x, 0];
  } else if (h < 120) {
    [r, g, b] = [x, c, 0];
  } else if (h < 180) {
    [r, g, b] = [0, c, x];
  } else if (h < 240) {
    [r, g, b] = [0, x, c];
  } else if (h < 300) {
    [r, g, b] = [x, 0, c];
  } else {
    [r, g, b] = [c, 0, x];
  }
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
};

/** Lighten/darken (dl) and saturate/desaturate (ds) a hex color by a delta
 * in HSL space, clamped to [0,1]. Same formula used to derive the site's
 * original Syntropy gold shade ramp — now parameterized per engine. */
const adjust = (hex: string, dl: number, ds = 0): string => {
  const [r, g, b] = hexToRgb(hex);
  const [h, s, l] = rgbToHsl(r, g, b);
  const newS = Math.max(0, Math.min(1, s + ds));
  const newL = Math.max(0, Math.min(1, l + dl));
  const [r2, g2, b2] = hslToRgb(h, newS, newL);
  return rgbToHex(r2, g2, b2);
};

export const deriveAccentShades = (baseHex: string): AccentShades => ({
  primary: baseHex,
  primaryDarker: adjust(baseHex, -0.08),
  primaryDarkest: adjust(baseHex, -0.16),
  primaryLight: adjust(baseHex, -0.32, -0.35),
  primaryLightDarker: adjust(baseHex, -0.37, -0.4),
  primaryHover: adjust(baseHex, 0.08),
  brandHover: adjust(baseHex, 0.08),
  brandActive: adjust(baseHex, 0.14),
  onPrimaryContainer: adjust(baseHex, 0.3, -0.3),
  surfacePrimaryContainer: adjust(baseHex, -0.32, -0.35),
  selection: adjust(baseHex, -0.27, -0.2),
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd canvas && yarn test:app --watch=false engineAccents`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add canvas/excalidraw-app/syntropy/engineAccents.ts canvas/excalidraw-app/tests/engineAccents.test.ts
git commit -m "$(cat <<'EOF'
feat(canvas): add engine accent data and shade-derivation utility

Real per-engine hex colors (read from each math-lab engine's own
--electric-teal override) plus a pure HSL-based shade-ramp derivation,
reusing the same lighten/darken/desaturate formula the original Syntropy
gold shade ramp used — now parameterized per engine instead of hardcoded.
No consumers yet; wired into the dynamic accent switch in a later task.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Neutralize the static gold accent to a default white

**Files:**
- Modify: `canvas/packages/excalidraw/css/theme.scss`

**Interfaces:**
- Consumes: nothing new.
- Produces: `.theme--dark`'s `--color-primary` and related variables default to neutral white/gray instead of the fixed Syntropy gold — resolves the collision with Statistics' near-identical existing accent (`#c99a3c` vs. the old `#c9a24c`, RGB distance ~18). Task 3 layers the dynamic per-engine override on top of this neutral baseline.

- [ ] **Step 1: Replace the gold values with neutral ones**

In `canvas/packages/excalidraw/css/theme.scss`, inside `&.theme--dark { ... }`, change:

```scss
    --color-primary: #c9a24c;
    --color-primary-darker: #b58e37;
    --color-primary-darkest: #96752d;
    --color-primary-light: #443d2e;
    --color-primary-light-darker: #322e26;
    --color-primary-hover: #d2b26b;
```

to:

```scss
    --color-primary: #e7e7e7;
    --color-primary-darker: #c7c7c7;
    --color-primary-darkest: #a8a8a8;
    --color-primary-light: #3a3a3a;
    --color-primary-light-darker: #2c2c2c;
    --color-primary-hover: #ffffff;
```

And further down in the same block, change:

```scss
    --color-brand-hover: #d2b26b;
    --color-on-primary-container: #e0dbce;
    --color-surface-primary-container: #443d2e;
    --color-brand-active: #dabe83;
```

to:

```scss
    --color-brand-hover: #ffffff;
    --color-on-primary-container: #1b1b1b;
    --color-surface-primary-container: #3a3a3a;
    --color-brand-active: #ffffff;
```

And:

```scss
    --color-selection: #6b5220;
```

to:

```scss
    --color-selection: #5c5c5c;
```

- [ ] **Step 2: Boot the dev server and verify visually**

Run (from `canvas/`, background it): `yarn start`, then open `http://localhost:3001/` and draw/select a shape. Expected: selection handles and any "active tool" highlight are neutral white/gray, not gold — matches the pre-node-selection default state described in the design.

- [ ] **Step 3: Stop the dev server**

- [ ] **Step 4: Commit**

```bash
git add canvas/packages/excalidraw/css/theme.scss
git commit -m "$(cat <<'EOF'
style(canvas): neutralize the static gold accent to white

The fixed Syntropy gold (#c9a24c) was nearly identical to the Statistics
engine's real accent (#c99a3c, RGB distance ~18) — a real collision once
both appear in the library panel together. Rather than pick yet another
static color, Syntropy Canvas no longer has one: the app defaults to
neutral white/gray and dynamically takes on the color of whichever
engine's node is selected (Task 3), landing back on this neutral default
when nothing engine-specific is selected.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Dynamic accent switching driven by node selection

**Files:**
- Modify: `canvas/excalidraw-app/App.tsx`

**Interfaces:**
- Consumes: `ENGINE_ACCENTS`, `deriveAccentShades` from Task 1; the existing `onChange(elements, appState, files)` handler (already wired to `<Excalidraw onChange={onChange}>`); `customData.syntropyNode.engineId` (the marker shape Task 5 will start attaching to real node elements — this task only needs to *read* it, so it can land before Task 5 creates any).
- Produces: a `<style>` tag injected into the DOM whose content is regenerated whenever the active engine changes, overriding the `.theme--dark` variables from Task 2 with that engine's derived shades; reverts (removes the override, falls back to Task 2's neutral CSS) when the selection no longer includes a Syntropy node.

- [ ] **Step 1: Add the active-engine state and derive it from selection**

In `canvas/excalidraw-app/App.tsx`, near the top of `ExcalidrawWrapper` (alongside the other `useState` calls), add:

```typescript
const [activeEngineId, setActiveEngineId] = useState<EngineId | null>(null);
```

Add the import at the top of the file:

```typescript
import {
  ENGINE_ACCENTS,
  deriveAccentShades,
  type EngineId,
} from "./syntropy/engineAccents";
```

- [ ] **Step 2: Compute the active engine inside the existing `onChange` handler**

In the `onChange` function (starts around line 679), add at the top of the function body, before the existing `if (collabAPI?.isCollaborating())` check:

```typescript
  const selectedSyntropyEngine = elements
    .filter((el) => appState.selectedElementIds[el.id])
    .map((el) => (el.customData as { syntropyNode?: { engineId: EngineId } } | undefined)?.syntropyNode?.engineId)
    .find((engineId): engineId is EngineId => Boolean(engineId));
  setActiveEngineId(selectedSyntropyEngine ?? null);
```

- [ ] **Step 3: Render the dynamic override `<style>` tag**

In the JSX returned by `ExcalidrawWrapper`, immediately before the `<Excalidraw` opening tag (inside the same `<div className={clsx("excalidraw-app", ...)}>` wrapper), add:

```tsx
{activeEngineId && (
  <style>{(() => {
    const s = deriveAccentShades(ENGINE_ACCENTS[activeEngineId]);
    return `.excalidraw.theme--dark {
      --color-primary: ${s.primary};
      --color-primary-darker: ${s.primaryDarker};
      --color-primary-darkest: ${s.primaryDarkest};
      --color-primary-light: ${s.primaryLight};
      --color-primary-light-darker: ${s.primaryLightDarker};
      --color-primary-hover: ${s.primaryHover};
      --color-brand-hover: ${s.brandHover};
      --color-brand-active: ${s.brandActive};
      --color-on-primary-container: ${s.onPrimaryContainer};
      --color-surface-primary-container: ${s.surfacePrimaryContainer};
      --color-selection: ${s.selection};
    }`;
  })()}</style>
)}
```

This works because a `<style>` tag rendered later in the document beats an equal-specificity rule (`.excalidraw.theme--dark` in `theme.scss`) earlier in the cascade — no `!important` needed. Removing the tag (when `activeEngineId` is `null`) reverts to Task 2's neutral values with no extra code.

- [ ] **Step 4: Verify with a manually-injected test element**

There are no real Syntropy nodes yet (Task 5 builds creation), so verify the mechanism directly via the browser console rather than the UI. Boot the dev server (`yarn start` from `canvas/`, backgrounded), open `http://localhost:3001/`, draw a rectangle, then in the browser console:

```javascript
// Simulates what a real Syntropy node's customData will look like once Task 5 exists.
const api = window.EXCALIDRAW_API; // see note below if this isn't set
```

Since there's no existing global API handle, instead verify via React DevTools or by temporarily hardcoding `setActiveEngineId("complex")` in a `useEffect(() => setActiveEngineId("complex"), [])` right after the `useState` line, reloading, and confirming the selection/highlight color turns purple (`#b45fd0`-derived). Remove the temporary `useEffect` afterward — it was a manual verification aid, not part of the shipped code.

Expected: with the temporary override in place, drawing/selecting a shape shows a purple selection color instead of white. After removing the override, it's back to white.

- [ ] **Step 5: Stop the dev server**

- [ ] **Step 6: Commit**

```bash
git add canvas/excalidraw-app/App.tsx
git commit -m "$(cat <<'EOF'
feat(canvas): switch the app accent dynamically based on node selection

Reads customData.syntropyNode.engineId off the currently selected
element(s) inside the already-wired onChange handler, and injects a
<style> tag overriding theme.scss's neutral .theme--dark values with that
engine's derived accent shades — reverting to neutral when nothing
engine-specific is selected. No real Syntropy nodes exist yet (Task 5),
so verified with a temporary hardcoded override rather than a live node;
removed before committing.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Generate the engine/method manifest from math-lab

**Files:**
- Create: `canvas/scripts/generate-engine-manifest.mjs`
- Create: `canvas/excalidraw-app/syntropy/manifest.generated.json` (generated output, committed — not regenerated on every build, since `math-lab/`'s method list changes rarely)

**Interfaces:**
- Produces: `manifest.generated.json` — an array of `{ engineId: EngineId, engineName: string, accent: string, methods: { methodId: string, name: string }[] }`, one entry per engine, sourced from each engine's real `math-lab/engines/<engineId>/methods.html`.
- Consumed by: Task 7 (library panel UI).

- [ ] **Step 1: Write the generator script**

```javascript
// canvas/scripts/generate-engine-manifest.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../..");
const ENGINES_DIR = path.join(REPO_ROOT, "math-lab/engines");
const OUT_FILE = path.join(
  __dirname,
  "../excalidraw-app/syntropy/manifest.generated.json",
);

const ENGINE_IDS = [
  "calculus",
  "complex",
  "linear-algebra",
  "number-theory",
  "numerical",
  "ode",
  "statistics",
];

const ENGINE_NAMES = {
  calculus: "Calculus",
  complex: "Complex Analysis",
  "linear-algebra": "Linear Algebra",
  "number-theory": "Number Theory",
  numerical: "Numerical",
  ode: "ODE / PDE",
  statistics: "Statistics",
};

const decodeEntities = (s) =>
  s.replace(/&amp;/g, "&").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();

const extractAccent = (indexHtml) => {
  const m = indexHtml.match(/--electric-teal:\s*(#[0-9a-fA-F]{6})/);
  if (!m) {
    throw new Error("no --electric-teal override found");
  }
  return m[1];
};

const extractMethods = (methodsHtml) => {
  const methods = [];
  const linkRe = /href="methods\/([a-z0-9-]+)\.html"[^>]*class="card engine-card/g;
  let match;
  while ((match = linkRe.exec(methodsHtml))) {
    const methodId = match[1];
    const afterLink = methodsHtml.slice(match.index);
    const h3 = afterLink.match(/<h3 class="h3">([^<]+(?:<[^/][^<]*<\/[^>]+>[^<]*)*)<\/h3>/);
    if (!h3) {
      continue;
    }
    const name = decodeEntities(h3[1].replace(/<[^>]+>/g, ""));
    methods.push({ methodId, name });
  }
  return methods;
};

const manifest = ENGINE_IDS.map((engineId) => {
  const indexHtml = readFileSync(
    path.join(ENGINES_DIR, engineId, "index.html"),
    "utf-8",
  );
  const methodsHtml = readFileSync(
    path.join(ENGINES_DIR, engineId, "methods.html"),
    "utf-8",
  );
  return {
    engineId,
    engineName: ENGINE_NAMES[engineId],
    accent: extractAccent(indexHtml),
    methods: extractMethods(methodsHtml),
  };
});

writeFileSync(OUT_FILE, JSON.stringify(manifest, null, 2) + "\n");
console.log(
  `Wrote ${manifest.length} engines, ${manifest.reduce((n, e) => n + e.methods.length, 0)} methods to ${path.relative(REPO_ROOT, OUT_FILE)}`,
);
```

- [ ] **Step 2: Run it and inspect the output**

Run: `cd canvas && node scripts/generate-engine-manifest.mjs`
Expected: prints `Wrote 7 engines, N methods to canvas/excalidraw-app/syntropy/manifest.generated.json` where N is roughly 140 (matches the README's "140+ methods" figure).

- [ ] **Step 3: Spot-check the output**

Run: `node -e "const m = require('./canvas/excalidraw-app/syntropy/manifest.generated.json'); console.log(m.find(e => e.engineId === 'complex').methods.slice(0, 3))"`
Expected: prints 3 objects like `{ methodId: 'complex-arithmetic', name: 'Complex Arithmetic & the Plane' }` — real method names, ampersands correctly decoded (not `&amp;`).

- [ ] **Step 4: Commit**

```bash
git add canvas/scripts/generate-engine-manifest.mjs canvas/excalidraw-app/syntropy/manifest.generated.json
git commit -m "$(cat <<'EOF'
feat(canvas): generate the engine/method manifest from math-lab

One-time script (not run on every build) that scans each of the 7 real
math-lab engines' index.html (for its accent color) and methods.html
(for its real method names/slugs) and writes a static JSON manifest the
library panel reads. Re-run by hand if math-lab's method list changes.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Node creation — `renderEmbeddable`/`validateEmbeddable` wiring and the creation helper

**Files:**
- Create: `canvas/excalidraw-app/syntropy/createSyntropyNode.ts`
- Modify: `canvas/excalidraw-app/App.tsx`

**Interfaces:**
- Consumes: `EngineId` from Task 1; `newEmbeddableElement`, `CaptureUpdateAction` from `@excalidraw/element`.
- Produces: `createSyntropyNode(excalidrawAPI, { engineId, methodId, name }): void` — appends a new node element to the scene at a cascading default position. `<Excalidraw validateEmbeddable={...} renderEmbeddable={...}>` wired so elements with `customData.syntropyNode` render `<SyntropyNode>` (Task 6 builds that component — this task can pass a temporary inline placeholder and swap it in Task 6, since a task's deliverable must be independently testable and "does a node visually appear and behave like an element" doesn't require the final visual design yet).

- [ ] **Step 1: Write the node-creation helper**

```typescript
// canvas/excalidraw-app/syntropy/createSyntropyNode.ts
import { newEmbeddableElement, CaptureUpdateAction } from "@excalidraw/element";

import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

import type { EngineId } from "./engineAccents";

let cascadeOffset = 0;

export const createSyntropyNode = (
  excalidrawAPI: ExcalidrawImperativeAPI,
  method: { engineId: EngineId; methodId: string; name: string },
): void => {
  const base = 100 + (cascadeOffset % 5) * 30;
  cascadeOffset += 1;

  const element = newEmbeddableElement({
    type: "embeddable",
    x: base,
    y: base,
    width: 260,
    height: 200,
    link: `syntropy://node/${method.engineId}/${method.methodId}`,
    customData: {
      syntropyNode: {
        engineId: method.engineId,
        methodId: method.methodId,
        name: method.name,
      },
    },
  });

  excalidrawAPI.updateScene({
    elements: [...excalidrawAPI.getSceneElements(), element],
    captureUpdate: CaptureUpdateAction.IMMEDIATELY,
  });
};
```

- [ ] **Step 2: Wire `validateEmbeddable` and `renderEmbeddable` on `<Excalidraw>`**

In `canvas/excalidraw-app/App.tsx`, add to the `<Excalidraw ...>` props (alongside the existing `onLinkOpen` prop):

```tsx
        validateEmbeddable={(link) =>
          link.startsWith("syntropy://") ? true : undefined
        }
        renderEmbeddable={(element) => {
          const syntropyNode = (
            element.customData as
              | { syntropyNode?: { engineId: EngineId; methodId: string; name: string } }
              | undefined
          )?.syntropyNode;
          if (!syntropyNode) {
            return null;
          }
          return (
            <div style={{ padding: 12, color: "white", fontFamily: "var(--ui-font)" }}>
              {syntropyNode.name}
            </div>
          );
        }}
```

- [ ] **Step 3: Verify node creation from the browser console**

Boot the dev server (`yarn start` from `canvas/`, backgrounded). Open `http://localhost:3001/`. In the browser console, since `excalidrawAPI` isn't globally exposed, temporarily add a debug button — or simpler, verify by calling the library panel once Task 7 exists. For this task in isolation, verify the plumbing compiles and the app boots with no console errors (the real interactive check happens in Task 7 once there's a UI trigger). Confirm:

Run: `curl -s http://localhost:3001/ | grep -o '<title>[^<]*</title>'`
Expected: `<title>Syntropy Canvas</title>` (server still boots).

Check the dev server log/browser console for TypeScript or ESLint errors introduced by this task's changes — expected: none.

- [ ] **Step 4: Stop the dev server**

- [ ] **Step 5: Commit**

```bash
git add canvas/excalidraw-app/syntropy/createSyntropyNode.ts canvas/excalidraw-app/App.tsx
git commit -m "$(cat <<'EOF'
feat(canvas): wire Syntropy node creation via renderEmbeddable

Syntropy nodes are embeddable elements with a customData.syntropyNode
marker and a syntropy:// link (satisfying embeddableURLValidator's !url
check without needing a real URL). validateEmbeddable treats that scheme
as always-valid; renderEmbeddable renders node content instead of an
iframe when the marker is present, falling through (returns null) for
real embeds so existing embed behavior is untouched. createSyntropyNode()
appends a new node via the standard updateScene + CaptureUpdateAction
path, cascading position on repeated calls.

Render content here is a plain placeholder — Task 6 replaces it with the
real SyntropyNode component; this task only needed to prove the
element/render-prop plumbing works.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: The `SyntropyNode` visual component

**Files:**
- Create: `canvas/excalidraw-app/syntropy/SyntropyNode.tsx`
- Create: `canvas/excalidraw-app/syntropy/SyntropyNode.scss`
- Modify: `canvas/excalidraw-app/App.tsx`

**Interfaces:**
- Consumes: `ENGINE_ACCENTS` from Task 1; the `syntropyNode` marker shape from Task 5.
- Produces: `<SyntropyNode engineId={..} methodId={..} name={..} />` — replaces Task 5's inline placeholder in `renderEmbeddable`.

- [ ] **Step 1: Write the component**

```tsx
// canvas/excalidraw-app/syntropy/SyntropyNode.tsx
import "./SyntropyNode.scss";

import { ENGINE_ACCENTS, type EngineId } from "./engineAccents";

type SyntropyNodeProps = {
  engineId: EngineId;
  methodId: string;
  name: string;
};

export const SyntropyNode = ({ engineId, name }: SyntropyNodeProps) => {
  const accent = ENGINE_ACCENTS[engineId];

  return (
    <div className="SyntropyNode" style={{ "--node-accent": accent } as React.CSSProperties}>
      <span className="SyntropyNode__crosshair SyntropyNode__crosshair--tl" aria-hidden="true" />
      <span className="SyntropyNode__crosshair SyntropyNode__crosshair--tr" aria-hidden="true" />
      <span className="SyntropyNode__crosshair SyntropyNode__crosshair--bl" aria-hidden="true" />
      <span className="SyntropyNode__crosshair SyntropyNode__crosshair--br" aria-hidden="true" />
      <div className="SyntropyNode__header">
        <span className="SyntropyNode__dot" />
        <span className="SyntropyNode__title">{name}</span>
      </div>
      <div className="SyntropyNode__body">
        <div className="SyntropyNode__scrub">
          <span className="SyntropyNode__scrub-label">input</span>
          <span className="SyntropyNode__scrub-value">—</span>
        </div>
        <div className="SyntropyNode__scrub">
          <span className="SyntropyNode__scrub-label">input</span>
          <span className="SyntropyNode__scrub-value">—</span>
        </div>
        <div className="SyntropyNode__output" />
      </div>
    </div>
  );
};
```

- [ ] **Step 2: Style it**

```scss
// canvas/excalidraw-app/syntropy/SyntropyNode.scss
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
}

.SyntropyNode__crosshair {
  position: absolute;
  width: 9px;
  height: 9px;
  opacity: 0.35;
  pointer-events: none;

  &::before,
  &::after {
    content: "";
    position: absolute;
    background: #e7e7e7;
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

.SyntropyNode__header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  font-size: 11.5px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  flex-shrink: 0;
}

.SyntropyNode__dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--node-accent);
  flex-shrink: 0;
}

.SyntropyNode__title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.SyntropyNode__body {
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 0;
  flex: 1;
}

.SyntropyNode__scrub {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 34px;
  padding: 0 10px;
  background: #090909;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  font-size: 11px;
  flex-shrink: 0;
}

.SyntropyNode__scrub-label {
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #7d858c;
  font-size: 9.5px;
}

.SyntropyNode__output {
  flex: 1;
  min-height: 24px;
  border-top: 1px dashed rgba(255, 255, 255, 0.1);
}
```

- [ ] **Step 3: Swap it into `renderEmbeddable`**

In `canvas/excalidraw-app/App.tsx`, replace the placeholder `renderEmbeddable` body from Task 5:

```tsx
          if (!syntropyNode) {
            return null;
          }
          return (
            <div style={{ padding: 12, color: "white", fontFamily: "var(--ui-font)" }}>
              {syntropyNode.name}
            </div>
          );
```

with:

```tsx
          if (!syntropyNode) {
            return null;
          }
          return <SyntropyNode {...syntropyNode} />;
```

And add the import:

```typescript
import { SyntropyNode } from "./syntropy/SyntropyNode";
```

- [ ] **Step 4: Verify visually**

Boot the dev server. This task still has no UI trigger to create a node (Task 7 builds the library panel), so verify by temporarily calling `createSyntropyNode` once from a `useEffect` in `ExcalidrawWrapper` right after `excalidrawAPI` becomes available:

```typescript
useEffect(() => {
  if (excalidrawAPI) {
    createSyntropyNode(excalidrawAPI, {
      engineId: "complex",
      methodId: "complex-arithmetic",
      name: "Complex Arithmetic & the Plane",
    });
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [excalidrawAPI]);
```

Reload `http://localhost:3001/`. Expected: a node card appears on canvas with a purple dot, the title "Complex Arithmetic & the Plane", two placeholder input rows, corner ticks, and — since Task 3 already reads `customData.syntropyNode.engineId` off the selection — selecting it should turn the app's accent purple. Remove the temporary `useEffect` before committing; it was a manual verification aid.

- [ ] **Step 5: Stop the dev server**

- [ ] **Step 6: Commit**

```bash
git add canvas/excalidraw-app/syntropy/SyntropyNode.tsx canvas/excalidraw-app/syntropy/SyntropyNode.scss canvas/excalidraw-app/App.tsx
git commit -m "$(cat <<'EOF'
feat(canvas): build the SyntropyNode visual shell

Header with the method name and source-engine accent dot, corner-tick
motif (own instance — SyntropyNode isn't an Island, it renders inside the
embeddable overlay, not the app chrome layer), two placeholder scrub-style
input rows, an empty output area. Sized to 100%/100% of its embeddable
container rather than a fixed pixel size, so it reflows when the element
is resized via Excalidraw's normal resize handles.

Verified with a temporary hardcoded createSyntropyNode() call (removed
before commit) — confirmed the node renders, and selecting it turns the
app accent purple via the Task 3 mechanism, proving the two pieces
integrate correctly.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: The library panel

**Files:**
- Create: `canvas/excalidraw-app/syntropy/LibraryPanel.tsx`
- Create: `canvas/excalidraw-app/syntropy/LibraryPanel.scss`
- Modify: `canvas/excalidraw-app/App.tsx`

**Interfaces:**
- Consumes: `manifest.generated.json` (Task 4), `createSyntropyNode` (Task 5).
- Produces: a left-docked, always-visible sidebar rendered as a flex sibling of `<Excalidraw>` (not an Excalidraw `Sidebar`/drawer, which is toggle-based) listing every engine and its methods; clicking a method calls `createSyntropyNode`.

- [ ] **Step 1: Write the component**

```tsx
// canvas/excalidraw-app/syntropy/LibraryPanel.tsx
import { useState } from "react";

import "./LibraryPanel.scss";

import manifest from "./manifest.generated.json";
import { createSyntropyNode } from "./createSyntropyNode";

import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import type { EngineId } from "./engineAccents";

type LibraryPanelProps = {
  excalidrawAPI: ExcalidrawImperativeAPI | null;
};

export const LibraryPanel = ({ excalidrawAPI }: LibraryPanelProps) => {
  const [openEngineId, setOpenEngineId] = useState<EngineId | null>(
    (manifest[0]?.engineId as EngineId) ?? null,
  );

  return (
    <div className="LibraryPanel">
      <div className="LibraryPanel__eyebrow">Engines · Library</div>
      {manifest.map((engine) => {
        const isOpen = engine.engineId === openEngineId;
        return (
          <div className="LibraryPanel__engine" key={engine.engineId}>
            <button
              type="button"
              className="LibraryPanel__engine-head"
              onClick={() =>
                setOpenEngineId(isOpen ? null : (engine.engineId as EngineId))
              }
            >
              <span
                className="LibraryPanel__engine-dot"
                style={{ background: engine.accent }}
              />
              <span className="LibraryPanel__engine-name">
                {engine.engineName}
              </span>
              <span className="LibraryPanel__engine-count">
                {engine.methods.length}
              </span>
            </button>
            {isOpen && (
              <div className="LibraryPanel__methods">
                {engine.methods.map((method) => (
                  <button
                    type="button"
                    key={method.methodId}
                    className="LibraryPanel__method"
                    onClick={() => {
                      if (excalidrawAPI) {
                        createSyntropyNode(excalidrawAPI, {
                          engineId: engine.engineId as EngineId,
                          methodId: method.methodId,
                          name: method.name,
                        });
                      }
                    }}
                  >
                    {method.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};
```

- [ ] **Step 2: Style it**

```scss
// canvas/excalidraw-app/syntropy/LibraryPanel.scss
.LibraryPanel {
  width: 240px;
  flex-shrink: 0;
  height: 100%;
  overflow-y: auto;
  background: #111111;
  border-right: 1px solid rgba(255, 255, 255, 0.08);
  padding: 16px 12px;
  box-sizing: border-box;
  font-family: var(--ui-font);
  color: #e7e7e7;
}

.LibraryPanel__eyebrow {
  font-size: 11px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: #7d858c;
  margin: 4px 6px 14px;
}

.LibraryPanel__engine {
  margin-bottom: 6px;
  border-radius: 8px;
  overflow: hidden;
}

.LibraryPanel__engine-head {
  all: unset;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 9px 10px;
  border-radius: 8px;
  font-size: 12px;
  cursor: pointer;

  &:hover {
    background: rgba(255, 255, 255, 0.04);
  }
}

.LibraryPanel__engine-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  flex-shrink: 0;
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

  &:hover {
    background: rgba(255, 255, 255, 0.04);
    color: #ffffff;
  }
}
```

- [ ] **Step 3: Wire it into the app layout**

Excalidraw's own `Sidebar` component is a toggleable drawer (typically right-docked); the design calls for an always-visible left panel, so `LibraryPanel` is rendered as a plain flex sibling of `<Excalidraw>`, not through Excalidraw's own sidebar system.

In `canvas/excalidraw-app/App.tsx`, find the outer wrapper:

```tsx
    <div
      style={{ height: "100%" }}
      className={clsx("excalidraw-app", {
        "is-collaborating": isCollaborating,
      })}
    >
```

change to:

```tsx
    <div
      style={{ height: "100%", display: "flex" }}
      className={clsx("excalidraw-app", {
        "is-collaborating": isCollaborating,
      })}
    >
      <LibraryPanel excalidrawAPI={excalidrawAPI} />
      <div style={{ position: "relative", flex: 1, minWidth: 0, height: "100%" }}>
```

And at the end of the same return statement, change:

```tsx
      </Excalidraw>
    </div>
  );
};
```

to:

```tsx
      </Excalidraw>
      </div>
    </div>
  );
};
```

closing the new inner wrapper div before the existing outer one. Add the import:

```typescript
import { LibraryPanel } from "./syntropy/LibraryPanel";
```

- [ ] **Step 4: Boot the dev server and verify end to end**

Run (from `canvas/`, background it): `yarn start`. Open `http://localhost:3001/` in a browser.

Expected, checked in order:
1. A left sidebar renders listing 7 engines with real names and method counts, each with its own accent dot color.
2. Clicking an engine expands its method list (real names, e.g. "Complex Arithmetic & the Plane" under Complex Analysis).
3. Clicking a method spawns a node card on the canvas at a cascading position, showing that method's name and the engine's accent dot.
4. Clicking a second method from a different engine spawns a second node, offset from the first (not on top of it).
5. Dragging a node moves it; resizing it (drag a corner handle) reflows its contents rather than clipping.
6. Selecting a node turns the app's overall accent (selection color, etc.) to that engine's color; clicking empty canvas reverts to white.
7. Reload the page — both nodes persist (Excalidraw's existing local-storage save, unmodified, already covers this since nodes are real elements).

- [ ] **Step 5: Check the browser console for errors**

Expected: no errors.

- [ ] **Step 6: Stop the dev server**

- [ ] **Step 7: Commit**

```bash
git add canvas/excalidraw-app/syntropy/LibraryPanel.tsx canvas/excalidraw-app/syntropy/LibraryPanel.scss canvas/excalidraw-app/App.tsx
git commit -m "$(cat <<'EOF'
feat(canvas): add the library panel, wire it end to end

Always-visible left sidebar (a plain flex sibling of <Excalidraw>, not
Excalidraw's own toggleable Sidebar component) listing the real 7 engines
and their real methods from the generated manifest. Clicking a method
calls createSyntropyNode, spawning a real node on canvas.

Verified end to end in the browser: library renders real content,
clicking spawns cascading (non-overlapping) nodes, drag/resize/reload-
persistence all work via Excalidraw's existing element lifecycle, and
selecting a node retints the whole app via the Task 3 mechanism.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: Full regression check

**Files:** none (verification only).

- [ ] **Step 1: Run the full vendored test suite**

Run (from `canvas/`): `yarn test:app --watch=false`
Expected: at least the 120 files / 1827 passed / 48 skipped baseline from the visual-identity plan, plus this plan's own 3 new `engineAccents` tests (123 passing minimum) — 0 failures.

- [ ] **Step 2: If anything regressed**

Stop and investigate before finishing the branch. The most likely failure mode given this plan's changes: a snapshot test touching `theme.scss`-derived inline styles or `App.tsx`'s prop list — if so, verify the diff is exactly the expected change (neutral colors, new props) before accepting it with `--update`, the same way the visual-identity plan's Task 5 did.

No commit for this task — it's a verification gate, not a code change.
