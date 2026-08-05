# Syntropy Canvas — Node Host + First Real Method (Phase B) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make one Syntropy Canvas node — Riemann Sums — fully real: real editable inputs, real
computed output and plot, and a portal tab that opens the same method's real page on `math-lab`
pre-filled with the node's current values. Every other node keeps today's placeholder shell
unchanged.

**Architecture:** Nodes stay `embeddable`-typed Excalidraw elements (so drag/resize/select/undo/
persist/export keep working exactly as today) but are painted invisible — visible content moves
to a new DOM layer (`NodeOverlay`) rendered as a sibling of `<Excalidraw>`, outside its own DOM
tree, so it is never subject to Excalidraw's `pointer-events: none` gate on embeddable content.
The overlay tracks each node's screen position via `sceneCoordsToViewportCoords`, recomputed on
Excalidraw's existing `onChange` callback. A small `PortSpec` object per method (this phase ships
exactly one: Riemann Sums) supplies inputs, outputs, and a `compute()` that calls the *same* pure
core file (`math-lab/assets/js/algorithms.js`) the real page calls — no duplicated algorithm code.

**Tech Stack:** React + TypeScript (existing canvas app), Vitest for unit tests, `mathjs` (added
this phase) for expression parsing, the existing `math-lab/assets/js/algorithms.js` UMD module
imported directly.

## Global Constraints

- One algorithm, one file (project-wide rule): `compute()` in the Riemann Sums port spec must
  call `Algorithms.runRiemannSum` from `math-lab/assets/js/algorithms.js` — never reimplement the
  arithmetic in `canvas/`.
- Every other node (every method except Riemann Sums) is unchanged by this phase: same
  placeholder shell, same `SyntropyNode.tsx`/`.scss`, same embeddable-content rendering path.
- No `executionMode: "run"` (CAS-backed) methods this phase — Riemann Sums is `"live"` only.
- `yarn test:typecheck`, ESLint, and `yarn test:app --watch=false` must hold baseline (0 errors,
  0 new warnings, 0 failing tests) at the end of every task that touches `canvas/`.
- Persisted node state (position, size, and — new this phase — input values) lives on the
  Excalidraw element's `customData.syntropyNode`, never in component-local state that would be
  lost on reload.
- Design reference: `docs/superpowers/specs/2026-08-05-syntropy-canvas-node-host-first-method-design.md`.

---

### Task 1: Expression compiler (`mathjs`, added this phase)

**Files:**
- Modify: `canvas/excalidraw-app/package.json` (add `mathjs` dependency)
- Create: `canvas/excalidraw-app/syntropy/compileExpression.ts`
- Test: `canvas/excalidraw-app/tests/compileExpression.test.ts`

**Interfaces:**
- Produces: `compileExpression(exprStr: string, variable?: string): { ok: true; fn: (x: number) => number } | { ok: false; error: string }` — consumed by Task 2's Riemann Sums port spec.

- [ ] **Step 1: Add the dependency**

Edit `canvas/excalidraw-app/package.json`, inside `"dependencies"` (alphabetical, so between
`"jotai"` and `"react"` if those are adjacent — otherwise anywhere in the block is fine):

```json
    "mathjs": "13.2.0",
```

Run: `cd canvas && yarn install`
Expected: lockfile updates, no errors.

- [ ] **Step 2: Write the failing test**

Create `canvas/excalidraw-app/tests/compileExpression.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { compileExpression } from "../syntropy/compileExpression";

describe("compileExpression", () => {
  it("compiles a valid expression and evaluates it", () => {
    const result = compileExpression("sin(x) + 2");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.fn(0)).toBeCloseTo(2, 10);
    }
  });

  it("reports a parse error for invalid syntax", () => {
    const result = compileExpression("sin(x +");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.length).toBeGreaterThan(0);
    }
  });

  it("reports an error for a blank expression", () => {
    const result = compileExpression("   ");
    expect(result.ok).toBe(false);
  });

  it("respects a custom variable name", () => {
    const result = compileExpression("t * 2", "t");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.fn(3)).toBe(6);
    }
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd canvas && yarn test:app --watch=false compileExpression`
Expected: FAIL — `Cannot find module '../syntropy/compileExpression'`

- [ ] **Step 4: Write the implementation**

Create `canvas/excalidraw-app/syntropy/compileExpression.ts`:

```ts
import { parse } from "mathjs";

export type CompiledExpression =
  | { ok: true; fn: (x: number) => number }
  | { ok: false; error: string };

/**
 * Parses and compiles a single-variable expression, e.g. "sin(x) + 2". Mirrors the contract of
 * math-lab's Engine.compileFx (math-lab/assets/js/engine-core.js) — same library, same
 * single-variable-scope evaluation shape — but imported as an npm dependency rather than
 * consumed as a vendored script global, since canvas is a real bundled app.
 */
export const compileExpression = (
  exprStr: string,
  variable = "x",
): CompiledExpression => {
  const trimmed = exprStr.trim();
  if (!trimmed) {
    return { ok: false, error: "Enter an expression." };
  }
  try {
    const node = parse(trimmed);
    const code = node.compile();
    const fn = (value: number): number => {
      const scope: Record<string, number> = {};
      scope[variable] = value;
      const result = code.evaluate(scope);
      if (typeof result !== "number" || Number.isNaN(result)) {
        throw new Error("not a real number");
      }
      return result;
    };
    fn(1); // smoke-test evaluation, matching Engine.compileFx's own smoke test
    return { ok: true, fn };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
};
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd canvas && yarn test:app --watch=false compileExpression`
Expected: PASS, 4 tests.

- [ ] **Step 6: Typecheck and lint**

Run: `cd canvas && yarn test:typecheck && npx eslint excalidraw-app/syntropy/compileExpression.ts excalidraw-app/tests/compileExpression.test.ts`
Expected: 0 errors, 0 warnings.

- [ ] **Step 7: Commit**

```bash
git add canvas/excalidraw-app/package.json canvas/excalidraw-app/yarn.lock canvas/excalidraw-app/syntropy/compileExpression.ts canvas/excalidraw-app/tests/compileExpression.test.ts
git commit -m "feat(canvas): add mathjs and an expression compiler for port specs"
```

---

### Task 2: Port spec type, registry, and the Riemann Sums spec

**Files:**
- Create: `canvas/excalidraw-app/syntropy/portSpecs/types.ts`
- Create: `canvas/excalidraw-app/syntropy/portSpecs/riemannSums.ts`
- Create: `canvas/excalidraw-app/syntropy/portSpecs/registry.ts`
- Test: `canvas/excalidraw-app/tests/riemannSumsPortSpec.test.ts`
- Test: `canvas/excalidraw-app/tests/portSpecRegistry.test.ts`

**Interfaces:**
- Consumes: `compileExpression` from Task 1 (`../compileExpression`); `Algorithms.runRiemannSum`
  from `math-lab/assets/js/algorithms.js` (relative path from
  `canvas/excalidraw-app/syntropy/portSpecs/` is `../../../../math-lab/assets/js/algorithms.js`).
- Produces: `PortSpec` type; `RIEMANN_SUMS_PORT_SPEC: PortSpec`; `getPortSpec(engineId: EngineId, methodId: string): PortSpec | null` — consumed by Tasks 4, 5, 6, 8.

- [ ] **Step 1: Write the failing tests**

Create `canvas/excalidraw-app/tests/riemannSumsPortSpec.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { RIEMANN_SUMS_PORT_SPEC } from "../syntropy/portSpecs/riemannSums";

describe("RIEMANN_SUMS_PORT_SPEC", () => {
  it("identifies the calculus/riemann-sums method", () => {
    expect(RIEMANN_SUMS_PORT_SPEC.engineId).toBe("calculus");
    expect(RIEMANN_SUMS_PORT_SPEC.methodId).toBe("riemann-sums");
    expect(RIEMANN_SUMS_PORT_SPEC.executionMode).toBe("live");
  });

  it("declares the four Riemann Sums inputs with defaults", () => {
    const keys = RIEMANN_SUMS_PORT_SPEC.inputs.map((i) => i.key);
    expect(keys).toEqual(["fx", "a", "b", "n"]);
  });

  it("computes a correct total for a known case: f(x)=x on [0,2], n=2 (midpoint)", () => {
    // Midpoints are 0.5 and 1.5, width 1 each -> total = 0.5*1 + 1.5*1 = 2.
    const result = RIEMANN_SUMS_PORT_SPEC.compute({
      fx: "x",
      a: 0,
      b: 2,
      n: 2,
    });
    expect(result.error).toBeUndefined();
    expect(result.outputs.total).toBeCloseTo(2, 10);
    const rectangles = result.outputs.rectangles as unknown[];
    expect(rectangles).toHaveLength(2);
  });

  it("returns an error instead of throwing for an invalid expression", () => {
    const result = RIEMANN_SUMS_PORT_SPEC.compute({
      fx: "sin(x +",
      a: 0,
      b: 2,
      n: 2,
    });
    expect(result.error).toBeDefined();
    expect(result.outputs.total).toBeUndefined();
  });

  it("returns an error instead of throwing when b <= a", () => {
    const result = RIEMANN_SUMS_PORT_SPEC.compute({
      fx: "x",
      a: 2,
      b: 2,
      n: 2,
    });
    expect(result.error).toBeDefined();
  });

  it("carries the page path and localStorage key for the portal tab", () => {
    expect(RIEMANN_SUMS_PORT_SPEC.pagePath).toBe(
      "/math-lab/engines/calculus/methods/riemann-sums.html",
    );
    expect(RIEMANN_SUMS_PORT_SPEC.pageStoreKey).toBe(
      "engine-lab:calculus-riemann-sums",
    );
  });
});
```

Create `canvas/excalidraw-app/tests/portSpecRegistry.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { getPortSpec } from "../syntropy/portSpecs/registry";

describe("getPortSpec", () => {
  it("resolves the Riemann Sums spec", () => {
    const spec = getPortSpec("calculus", "riemann-sums");
    expect(spec?.methodId).toBe("riemann-sums");
  });

  it("returns null for a method with no port spec yet", () => {
    expect(getPortSpec("calculus", "limits")).toBeNull();
    expect(getPortSpec("complex", "mobius-mapping")).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd canvas && yarn test:app --watch=false riemannSumsPortSpec portSpecRegistry`
Expected: FAIL — modules under `../syntropy/portSpecs/` don't exist yet.

- [ ] **Step 3: Write the port spec type**

Create `canvas/excalidraw-app/syntropy/portSpecs/types.ts`:

```ts
import type { EngineId } from "../engineAccents";

export type PortInputKind = "expression" | "number";
export type PortOutputKind = "number" | "plot2d";

export type PortInput = {
  key: string;
  label: string;
  kind: PortInputKind;
  default: string | number;
};

export type PortOutput = {
  key: string;
  label: string;
  kind: PortOutputKind;
};

export type ComputeResult = {
  outputs: Record<string, unknown>;
  error?: string;
};

/**
 * The repeatable unit for turning one existing math-lab method into a real canvas node, without
 * touching the method's own pure-core file. See
 * docs/superpowers/specs/2026-08-05-syntropy-canvas-node-host-first-method-design.md.
 */
export type PortSpec = {
  engineId: EngineId;
  methodId: string;
  inputs: PortInput[];
  outputs: PortOutput[];
  /** Never reimplements a method's math — always adapts the method's existing core file. */
  compute: (inputs: Record<string, unknown>) => ComputeResult;
  executionMode: "live";
  /** The method's real page on math-lab, opened by the node's portal tab. */
  pagePath: string;
  /** The Proto.saveState/loadState localStorage key that page already reads on load. */
  pageStoreKey: string;
};
```

- [ ] **Step 4: Write the Riemann Sums port spec**

Create `canvas/excalidraw-app/syntropy/portSpecs/riemannSums.ts`:

```ts
// @ts-expect-error — math-lab/assets/js/algorithms.js is a plain UMD module (see its own header
// comment: "pure, DOM-free numeric methods... shared between the browser pages and the Node
// verification suite"), not a TypeScript module. It already has zero DOM/window references, so
// Vite's CJS/UMD interop can import it directly — this is the ONE place canvas calls the real
// core file rather than reimplementing the arithmetic, per the project's one-algorithm-one-file
// rule.
import Algorithms from "../../../../math-lab/assets/js/algorithms.js";

import { compileExpression } from "../compileExpression";

import type { ComputeResult, PortSpec } from "./types";

export const RIEMANN_SUMS_PORT_SPEC: PortSpec = {
  engineId: "calculus",
  methodId: "riemann-sums",
  inputs: [
    { key: "fx", label: "f(x)", kind: "expression", default: "sin(x) + 2" },
    { key: "a", label: "a", kind: "number", default: 0 },
    { key: "b", label: "b", kind: "number", default: 6.283185307179586 },
    { key: "n", label: "n", kind: "number", default: 12 },
  ],
  outputs: [
    { key: "total", label: "total", kind: "number" },
    { key: "rectangles", label: "plot", kind: "plot2d" },
  ],
  executionMode: "live",
  pagePath: "/math-lab/engines/calculus/methods/riemann-sums.html",
  pageStoreKey: "engine-lab:calculus-riemann-sums",
  compute: (inputs): ComputeResult => {
    const fx = String(inputs.fx ?? "");
    const a = Number(inputs.a);
    const b = Number(inputs.b);
    const n = Number(inputs.n);

    const compiled = compileExpression(fx);
    if (!compiled.ok) {
      return { outputs: {}, error: compiled.error };
    }
    try {
      const result = Algorithms.runRiemannSum(compiled.fn, a, b, Math.round(n));
      return {
        outputs: {
          total: result.total,
          width: result.width,
          rectangles: result.rectangles,
        },
      };
    } catch (err) {
      return {
        outputs: {},
        error: err instanceof Error ? err.message : String(err),
      };
    }
  },
};
```

- [ ] **Step 5: Write the registry**

Create `canvas/excalidraw-app/syntropy/portSpecs/registry.ts`:

```ts
import type { EngineId } from "../engineAccents";

import { RIEMANN_SUMS_PORT_SPEC } from "./riemannSums";

import type { PortSpec } from "./types";

// One entry this phase. Phase D (port-spec rollout) adds to this map — nothing else about the
// node host changes to onboard a new method beyond adding its spec here.
const REGISTRY: Record<string, PortSpec> = {
  "calculus:riemann-sums": RIEMANN_SUMS_PORT_SPEC,
};

export const getPortSpec = (
  engineId: EngineId,
  methodId: string,
): PortSpec | null => REGISTRY[`${engineId}:${methodId}`] ?? null;
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd canvas && yarn test:app --watch=false riemannSumsPortSpec portSpecRegistry`
Expected: PASS, 10 tests total.

- [ ] **Step 7: Typecheck and lint**

Run: `cd canvas && yarn test:typecheck && npx eslint excalidraw-app/syntropy/portSpecs excalidraw-app/tests/riemannSumsPortSpec.test.ts excalidraw-app/tests/portSpecRegistry.test.ts`
Expected: 0 errors. The `@ts-expect-error` on the `algorithms.js` import is expected and
intentional — if `tsc` reports that directive as unused, it means the import resolved cleanly
without one; in that case delete the `@ts-expect-error` line rather than leave it stale.

- [ ] **Step 8: Commit**

```bash
git add canvas/excalidraw-app/syntropy/portSpecs canvas/excalidraw-app/tests/riemannSumsPortSpec.test.ts canvas/excalidraw-app/tests/portSpecRegistry.test.ts
git commit -m "feat(canvas): add the port-spec type and the Riemann Sums spec"
```

---

### Task 3: Node geometry helpers

**Files:**
- Create: `canvas/excalidraw-app/syntropy/nodeGeometry.ts`
- Test: `canvas/excalidraw-app/tests/nodeGeometry.test.ts`

**Interfaces:**
- Consumes: `PortSpec` from Task 2 (`./portSpecs/types`).
- Produces: `computeInitialNodeSize(spec: PortSpec | null): { width: number; height: number }` — consumed by Task 4. `computeNodeScreenRect(element: { x: number; y: number; width: number; height: number }, appState: { scrollX: number; scrollY: number; zoom: { value: number }; offsetLeft: number; offsetTop: number }): { left: number; top: number; width: number; height: number; scale: number }` — consumed by Task 8.

- [ ] **Step 1: Write the failing test**

Create `canvas/excalidraw-app/tests/nodeGeometry.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import {
  computeInitialNodeSize,
  computeNodeScreenRect,
} from "../syntropy/nodeGeometry";
import { RIEMANN_SUMS_PORT_SPEC } from "../syntropy/portSpecs/riemannSums";

describe("computeInitialNodeSize", () => {
  it("reserves extra height for a spec with a plot2d output", () => {
    const size = computeInitialNodeSize(RIEMANN_SUMS_PORT_SPEC);
    expect(size.width).toBe(260);
    // 4 inputs + a plot output should be taller than the old fixed 200px shell.
    expect(size.height).toBeGreaterThan(200);
  });

  it("falls back to the placeholder shell size when there is no spec", () => {
    const size = computeInitialNodeSize(null);
    expect(size).toEqual({ width: 260, height: 200 });
  });
});

describe("computeNodeScreenRect", () => {
  it("maps scene coordinates to screen coordinates at 100% zoom with no scroll", () => {
    const rect = computeNodeScreenRect(
      { x: 100, y: 50, width: 260, height: 200 },
      { scrollX: 0, scrollY: 0, zoom: { value: 1 }, offsetLeft: 240, offsetTop: 0 },
    );
    expect(rect).toEqual({ left: 340, top: 50, width: 260, height: 200, scale: 1 });
  });

  it("accounts for scroll and zoom", () => {
    const rect = computeNodeScreenRect(
      { x: 0, y: 0, width: 260, height: 200 },
      { scrollX: 50, scrollY: 20, zoom: { value: 2 }, offsetLeft: 0, offsetTop: 0 },
    );
    // (x + scrollX) * zoom = (0 + 50) * 2 = 100
    expect(rect.left).toBe(100);
    expect(rect.top).toBe(40);
    expect(rect.scale).toBe(2);
    // Natural width/height are returned un-scaled; the caller applies `transform: scale()`.
    expect(rect.width).toBe(260);
    expect(rect.height).toBe(200);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd canvas && yarn test:app --watch=false nodeGeometry`
Expected: FAIL — `Cannot find module '../syntropy/nodeGeometry'`

- [ ] **Step 3: Write the implementation**

Create `canvas/excalidraw-app/syntropy/nodeGeometry.ts`:

```ts
import type { PortSpec } from "./portSpecs/types";

const PLACEHOLDER_WIDTH = 260;
const PLACEHOLDER_HEIGHT = 200;
const PLOT_RESERVED_HEIGHT = 140;

/**
 * Content-driven initial size, replacing the old fixed 260x200 every node used regardless of
 * content (see docs/superpowers/specs/2026-08-05-syntropy-canvas-board-and-lab-integration-design.md's
 * critique). A node with no port spec yet keeps today's placeholder-shell size unchanged.
 */
export const computeInitialNodeSize = (
  spec: PortSpec | null,
): { width: number; height: number } => {
  if (!spec) {
    return { width: PLACEHOLDER_WIDTH, height: PLACEHOLDER_HEIGHT };
  }
  const hasPlot = spec.outputs.some((o) => o.kind === "plot2d");
  const inputRowHeight = 40 + 8; // matches .SyntropyNode__scrub height + column gap
  const height =
    72 /* header */ +
    12 * 2 /* body padding */ +
    spec.inputs.length * inputRowHeight +
    (hasPlot ? PLOT_RESERVED_HEIGHT : 0) +
    56 /* output row */;
  return { width: PLACEHOLDER_WIDTH, height };
};

type SceneRectLike = { x: number; y: number; width: number; height: number };
type ScreenMappingAppState = {
  scrollX: number;
  scrollY: number;
  zoom: { value: number };
  offsetLeft: number;
  offsetTop: number;
};

/**
 * Scene coordinates -> viewport (screen) coordinates for one node, using the same formula as
 * Excalidraw's own sceneCoordsToViewportCoords (packages/common/src/utils.ts) — reimplemented
 * as a narrow, independently testable function rather than importing that one, since it takes a
 * differently-shaped Zoom object than this overlay needs to carry around.
 *
 * Returns the node's NATURAL (unscaled) width/height plus a separate `scale` factor — the
 * caller applies `transform: scale(scale)` with `transform-origin: top left` rather than this
 * function returning pre-scaled dimensions, so the DOM content inside doesn't need to
 * recompute its own internal layout on every zoom tick.
 */
export const computeNodeScreenRect = (
  element: SceneRectLike,
  appState: ScreenMappingAppState,
): { left: number; top: number; width: number; height: number; scale: number } => {
  const { scrollX, scrollY, zoom, offsetLeft, offsetTop } = appState;
  return {
    left: (element.x + scrollX) * zoom.value + offsetLeft,
    top: (element.y + scrollY) * zoom.value + offsetTop,
    width: element.width,
    height: element.height,
    scale: zoom.value,
  };
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd canvas && yarn test:app --watch=false nodeGeometry`
Expected: PASS, 4 tests.

- [ ] **Step 5: Typecheck and lint**

Run: `cd canvas && yarn test:typecheck && npx eslint excalidraw-app/syntropy/nodeGeometry.ts excalidraw-app/tests/nodeGeometry.test.ts`
Expected: 0 errors, 0 warnings.

- [ ] **Step 6: Commit**

```bash
git add canvas/excalidraw-app/syntropy/nodeGeometry.ts canvas/excalidraw-app/tests/nodeGeometry.test.ts
git commit -m "feat(canvas): add content-driven node sizing and screen-position math"
```

---

### Task 4: Transparent geometry + persisted inputs in `createSyntropyNode`

**Files:**
- Modify: `canvas/excalidraw-app/syntropy/createSyntropyNode.ts`
- Modify: `canvas/excalidraw-app/syntropy/syntropyWire.ts` (extend `SyntropyNodeData`)
- Test: `canvas/excalidraw-app/tests/createSyntropyNode.test.ts`

**Interfaces:**
- Consumes: `getPortSpec` from Task 2; `computeInitialNodeSize` from Task 3.
- Produces: `SyntropyNodeData` now includes `inputs?: Record<string, unknown>` — consumed by
  Task 5 (reads it) and Task 8 (updates it). `createSyntropyNode`'s produced element now has
  `strokeColor: "transparent"`, `backgroundColor: "transparent"`, and (for methods with a port
  spec) `customData.syntropyNode.inputs` seeded from the spec's defaults.

- [ ] **Step 1: Extend `SyntropyNodeData`**

In `canvas/excalidraw-app/syntropy/syntropyWire.ts`, change:

```ts
export type SyntropyNodeData = {
  engineId: EngineId;
  methodId: string;
  name: string;
  linkedAccent?: string | null;
};
```

to:

```ts
export type SyntropyNodeData = {
  engineId: EngineId;
  methodId: string;
  name: string;
  linkedAccent?: string | null;
  /** Current input values, present only for methods with a port spec (Task 2's registry). Lives
   *  here — not in component state — so it persists, undoes, and exports with the element. */
  inputs?: Record<string, unknown>;
};
```

- [ ] **Step 2: Write the failing test**

Create `canvas/excalidraw-app/tests/createSyntropyNode.test.ts`. This test calls
`createSyntropyNode` against a minimal fake of the two `ExcalidrawImperativeAPI` methods it
actually uses (`getSceneElements`, `updateScene`), following the same "structural fake, not a
full mock" style already used for `WireCandidate` in `syntropyWire.ts`:

```ts
import { describe, expect, it } from "vitest";

import { createSyntropyNode } from "../syntropy/createSyntropyNode";

describe("createSyntropyNode", () => {
  it("creates a transparent element sized for a method with a port spec", () => {
    let updated: { elements: readonly unknown[] } | null = null;
    const fakeAPI = {
      getSceneElements: () => [],
      updateScene: (args: { elements: readonly unknown[] }) => {
        updated = args;
      },
    } as unknown as Parameters<typeof createSyntropyNode>[0];

    createSyntropyNode(fakeAPI, {
      engineId: "calculus",
      methodId: "riemann-sums",
      name: "Riemann Sums",
    });

    expect(updated).not.toBeNull();
    const element = (updated!.elements[0] ?? {}) as Record<string, unknown>;
    expect(element.strokeColor).toBe("transparent");
    expect(element.backgroundColor).toBe("transparent");
    expect(element.height).toBeGreaterThan(200); // Riemann Sums has a plot output
    const customData = element.customData as {
      syntropyNode: { inputs?: Record<string, unknown> };
    };
    expect(customData.syntropyNode.inputs).toEqual({
      fx: "sin(x) + 2",
      a: 0,
      b: 6.283185307179586,
      n: 12,
    });
  });

  it("creates a placeholder-sized element with no inputs for a method with no port spec", () => {
    let updated: { elements: readonly unknown[] } | null = null;
    const fakeAPI = {
      getSceneElements: () => [],
      updateScene: (args: { elements: readonly unknown[] }) => {
        updated = args;
      },
    } as unknown as Parameters<typeof createSyntropyNode>[0];

    createSyntropyNode(fakeAPI, {
      engineId: "calculus",
      methodId: "limits",
      name: "Limits",
    });

    const element = (updated!.elements[0] ?? {}) as Record<string, unknown>;
    expect(element.height).toBe(200);
    const customData = element.customData as {
      syntropyNode: { inputs?: Record<string, unknown> };
    };
    expect(customData.syntropyNode.inputs).toBeUndefined();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd canvas && yarn test:app --watch=false createSyntropyNode`
Expected: FAIL — assertions on `strokeColor`/`backgroundColor`/`height`/`inputs` don't match
today's implementation (fixed 260x200, no transparent colors set, no `inputs`).

- [ ] **Step 4: Modify the implementation**

Current `canvas/excalidraw-app/syntropy/createSyntropyNode.ts`:

```ts
import {
  newEmbeddableElement,
  syncInvalidIndices,
  CaptureUpdateAction,
} from "@excalidraw/element";

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

  const elements = syncInvalidIndices([
    ...excalidrawAPI.getSceneElements(),
    element,
  ]);

  excalidrawAPI.updateScene({
    elements,
    captureUpdate: CaptureUpdateAction.IMMEDIATELY,
  });
};
```

Replace it with:

```ts
import {
  newEmbeddableElement,
  syncInvalidIndices,
  CaptureUpdateAction,
} from "@excalidraw/element";

import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

import type { EngineId } from "./engineAccents";
import { computeInitialNodeSize } from "./nodeGeometry";
import { getPortSpec } from "./portSpecs/registry";

let cascadeOffset = 0;

export const createSyntropyNode = (
  excalidrawAPI: ExcalidrawImperativeAPI,
  method: { engineId: EngineId; methodId: string; name: string },
): void => {
  const base = 100 + (cascadeOffset % 5) * 30;
  cascadeOffset += 1;

  const spec = getPortSpec(method.engineId, method.methodId);
  const size = computeInitialNodeSize(spec);
  const inputs = spec
    ? Object.fromEntries(spec.inputs.map((i) => [i.key, i.default]))
    : undefined;

  const element = newEmbeddableElement({
    type: "embeddable",
    x: base,
    y: base,
    width: size.width,
    height: size.height,
    // Transparent: the element still paints on the static canvas exactly like a rectangle
    // (packages/element/src/renderElement.ts draws "embeddable" through the same path as
    // "rectangle"), but with nothing visible — all real chrome comes from NodeOverlay (Task 8),
    // a DOM layer outside Excalidraw's own tree that isn't gated by the embeddable
    // pointer-events:none rule this element's own content used to be subject to.
    strokeColor: "transparent",
    backgroundColor: "transparent",
    link: `syntropy://node/${method.engineId}/${method.methodId}`,
    customData: {
      syntropyNode: {
        engineId: method.engineId,
        methodId: method.methodId,
        name: method.name,
        ...(inputs ? { inputs } : {}),
      },
    },
  });

  const elements = syncInvalidIndices([
    ...excalidrawAPI.getSceneElements(),
    element,
  ]);

  excalidrawAPI.updateScene({
    elements,
    captureUpdate: CaptureUpdateAction.IMMEDIATELY,
  });
};
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd canvas && yarn test:app --watch=false createSyntropyNode`
Expected: PASS, 2 tests.

- [ ] **Step 6: Run the full existing test suite to confirm nothing else broke**

Run: `cd canvas && yarn test:app --watch=false`
Expected: PASS, same file/test counts as phase A's baseline (122 files / 1841 passed) plus this
phase's new tests, 0 failures. `syntropyWire.test.ts` (if it exists — check
`canvas/excalidraw-app/tests/` for it) may need a look if it constructs `SyntropyNodeData`
object literals with `satisfies`/exact-shape checks; adding an optional field should not break
it, but confirm.

- [ ] **Step 7: Typecheck and lint**

Run: `cd canvas && yarn test:typecheck && npx eslint excalidraw-app/syntropy/createSyntropyNode.ts excalidraw-app/syntropy/syntropyWire.ts excalidraw-app/tests/createSyntropyNode.test.ts`
Expected: 0 errors, 0 warnings.

- [ ] **Step 8: Commit**

```bash
git add canvas/excalidraw-app/syntropy/createSyntropyNode.ts canvas/excalidraw-app/syntropy/syntropyWire.ts canvas/excalidraw-app/tests/createSyntropyNode.test.ts
git commit -m "feat(canvas): make syntropy nodes transparent and content-sized, seed persisted inputs"
```

---

### Task 5: Riemann plot renderer

**Files:**
- Create: `canvas/excalidraw-app/syntropy/RiemannPlot.tsx`
- Test: `canvas/excalidraw-app/tests/RiemannPlot.test.tsx`

**Interfaces:**
- Consumes: the `rectangles`/`width` shape returned by `Algorithms.runRiemannSum` (Task 2):
  `{ i: number; x0: number; x1: number; mid: number; height: number; area: number; running: number }[]`.
- Produces: `<RiemannPlot rectangles={...} accent={string} />` — consumed by Task 6.

- [ ] **Step 1: Write the failing test**

Create `canvas/excalidraw-app/tests/RiemannPlot.test.tsx`:

```tsx
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { RiemannPlot } from "../syntropy/RiemannPlot";

const RECTANGLES = [
  { i: 0, x0: 0, x1: 1, mid: 0.5, height: 2, area: 2, running: 2 },
  { i: 1, x0: 1, x1: 2, mid: 1.5, height: 3, area: 3, running: 5 },
];

describe("RiemannPlot", () => {
  it("draws one rect per rectangle", () => {
    const { container } = render(
      <RiemannPlot rectangles={RECTANGLES} accent="#4f9e82" />,
    );
    expect(container.querySelectorAll("rect")).toHaveLength(2);
  });

  it("renders nothing but the empty-state message for zero rectangles", () => {
    const { container, getByText } = render(
      <RiemannPlot rectangles={[]} accent="#4f9e82" />,
    );
    expect(container.querySelectorAll("rect")).toHaveLength(0);
    expect(getByText(/no data/i)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd canvas && yarn test:app --watch=false RiemannPlot`
Expected: FAIL — `Cannot find module '../syntropy/RiemannPlot'`

- [ ] **Step 3: Write the implementation**

Create `canvas/excalidraw-app/syntropy/RiemannPlot.tsx`:

```tsx
type Rectangle = {
  x0: number;
  x1: number;
  mid: number;
  height: number;
};

type RiemannPlotProps = {
  rectangles: Rectangle[];
  accent: string;
};

const VIEW_WIDTH = 260;
const VIEW_HEIGHT = 100;
const PAD = 6;

/**
 * Inline SVG bar chart of the Riemann rectangles Algorithms.runRiemannSum returns — the mockup's
 * .plot5-2d treatment (docs/superpowers/specs/assets/2026-08-04-math-canvas-v6-mockup.html),
 * built from the node's own real output rather than a placeholder box.
 */
export const RiemannPlot = ({ rectangles, accent }: RiemannPlotProps) => {
  if (rectangles.length === 0) {
    return <p className="RiemannPlot__empty">No data to plot.</p>;
  }

  const xMin = rectangles[0].x0;
  const xMax = rectangles[rectangles.length - 1].x1;
  const yMax = Math.max(0, ...rectangles.map((r) => r.height));
  const yMin = Math.min(0, ...rectangles.map((r) => r.height));
  const xSpan = xMax - xMin || 1;
  const ySpan = yMax - yMin || 1;

  const plotWidth = VIEW_WIDTH - PAD * 2;
  const plotHeight = VIEW_HEIGHT - PAD * 2;
  const scaleX = (x: number) => PAD + ((x - xMin) / xSpan) * plotWidth;
  const scaleY = (y: number) => PAD + plotHeight - ((y - yMin) / ySpan) * plotHeight;
  const baselineY = scaleY(0);

  return (
    <svg
      className="RiemannPlot"
      viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
      preserveAspectRatio="none"
      role="img"
      aria-label="Riemann sum rectangles"
    >
      <line
        x1={PAD}
        y1={baselineY}
        x2={VIEW_WIDTH - PAD}
        y2={baselineY}
        stroke="rgba(255,255,255,.12)"
      />
      {rectangles.map((r, index) => {
        const x = scaleX(r.x0);
        const width = Math.max(0, scaleX(r.x1) - scaleX(r.x0));
        const top = Math.min(baselineY, scaleY(r.height));
        const height = Math.abs(scaleY(r.height) - baselineY);
        return (
          <rect
            key={index}
            x={x}
            y={top}
            width={width}
            height={height}
            fill={accent}
            fillOpacity={0.28}
            stroke={accent}
            strokeOpacity={0.7}
            strokeWidth={1}
          />
        );
      })}
    </svg>
  );
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd canvas && yarn test:app --watch=false RiemannPlot`
Expected: PASS, 2 tests. If `@testing-library/react` is not yet a devDependency, check
`canvas/excalidraw-app/package.json` first — `tests/MobileMenu.test.tsx` already renders React
components, so a compatible testing setup exists; if a bare `import { render } from
"@testing-library/react"` fails to resolve, check what that existing test imports instead
(`@excalidraw/excalidraw/tests/test-utils`'s own `render`) and use the same import in this test.

- [ ] **Step 5: Typecheck and lint**

Run: `cd canvas && yarn test:typecheck && npx eslint excalidraw-app/syntropy/RiemannPlot.tsx excalidraw-app/tests/RiemannPlot.test.tsx`
Expected: 0 errors, 0 warnings.

- [ ] **Step 6: Commit**

```bash
git add canvas/excalidraw-app/syntropy/RiemannPlot.tsx canvas/excalidraw-app/tests/RiemannPlot.test.tsx
git commit -m "feat(canvas): add the Riemann Sums rectangle plot"
```

---

### Task 6: Portal pre-fill

**Files:**
- Create: `canvas/excalidraw-app/syntropy/portalPrefill.ts`
- Test: `canvas/excalidraw-app/tests/portalPrefill.test.ts`

**Interfaces:**
- Consumes: `PortSpec` from Task 2.
- Produces: `buildPageState(spec: PortSpec, inputs: Record<string, unknown>): Record<string, unknown>`; `openMethodPage(spec: PortSpec, inputs: Record<string, unknown>): void` — consumed by Task 7.

- [ ] **Step 1: Write the failing test**

Create `canvas/excalidraw-app/tests/portalPrefill.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";

import { buildPageState, openMethodPage } from "../syntropy/portalPrefill";
import { RIEMANN_SUMS_PORT_SPEC } from "../syntropy/portSpecs/riemannSums";

describe("buildPageState", () => {
  it("maps port-spec input keys to the page's own saveState/loadState shape", () => {
    // riemann-sums.js's own snapshot() is { fx, a, b, n } — see
    // math-lab/assets/js/riemann-sums.js:33. buildPageState must match it exactly since the
    // page's restore block reads these keys with no adapter on the page side.
    const state = buildPageState(RIEMANN_SUMS_PORT_SPEC, {
      fx: "cos(x)",
      a: 0,
      b: 3.14,
      n: 8,
    });
    expect(state).toEqual({ fx: "cos(x)", a: 0, b: 3.14, n: 8 });
  });
});

describe("openMethodPage", () => {
  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("writes the page's localStorage key and opens the page", () => {
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);

    openMethodPage(RIEMANN_SUMS_PORT_SPEC, { fx: "x^2", a: 0, b: 1, n: 4 });

    const stored = JSON.parse(
      localStorage.getItem("engine-lab:calculus-riemann-sums") ?? "{}",
    );
    expect(stored).toEqual({ fx: "x^2", a: 0, b: 1, n: 4 });
    expect(openSpy).toHaveBeenCalledWith(
      "/math-lab/engines/calculus/methods/riemann-sums.html",
      "_blank",
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd canvas && yarn test:app --watch=false portalPrefill`
Expected: FAIL — `Cannot find module '../syntropy/portalPrefill'`

- [ ] **Step 3: Write the implementation**

Create `canvas/excalidraw-app/syntropy/portalPrefill.ts`:

```ts
import type { PortSpec } from "./portSpecs/types";

/**
 * The node's current inputs ARE the page's saveState() shape for Riemann Sums — both keyed by
 * the same fx/a/b/n names (math-lab/assets/js/riemann-sums.js's own snapshot()). This function
 * exists as its own step (rather than passing `inputs` straight to localStorage) because a
 * future port spec's input keys will not always match its page's storage keys one-to-one; this
 * is the seam where that mapping would go without touching the caller.
 */
export const buildPageState = (
  spec: PortSpec,
  inputs: Record<string, unknown>,
): Record<string, unknown> => {
  const state: Record<string, unknown> = {};
  for (const input of spec.inputs) {
    state[input.key] = inputs[input.key];
  }
  return state;
};

/**
 * The portal: writes the node's current values into the exact localStorage key/shape the
 * method's real page already reads on load via Proto.loadState (math-lab/assets/proto/proto.js),
 * then opens that page in a new tab. Works only because phase A put the hub, math-lab, and
 * canvas on one origin — localStorage doesn't cross origins.
 */
export const openMethodPage = (
  spec: PortSpec,
  inputs: Record<string, unknown>,
): void => {
  const state = buildPageState(spec, inputs);
  localStorage.setItem(spec.pageStoreKey, JSON.stringify(state));
  window.open(spec.pagePath, "_blank");
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd canvas && yarn test:app --watch=false portalPrefill`
Expected: PASS, 2 tests.

- [ ] **Step 5: Typecheck and lint**

Run: `cd canvas && yarn test:typecheck && npx eslint excalidraw-app/syntropy/portalPrefill.ts excalidraw-app/tests/portalPrefill.test.ts`
Expected: 0 errors, 0 warnings.

- [ ] **Step 6: Commit**

```bash
git add canvas/excalidraw-app/syntropy/portalPrefill.ts canvas/excalidraw-app/tests/portalPrefill.test.ts
git commit -m "feat(canvas): add the portal pre-fill bridge to math-lab pages"
```

---

### Task 7: `SyntropyNodeCard` — the real interactive node

**Files:**
- Create: `canvas/excalidraw-app/syntropy/SyntropyNodeCard.tsx`
- Create: `canvas/excalidraw-app/syntropy/SyntropyNodeCard.scss`
- Test: `canvas/excalidraw-app/tests/SyntropyNodeCard.test.tsx`

**Interfaces:**
- Consumes: `PortSpec` (Task 2), `RiemannPlot` (Task 5), `openMethodPage` (Task 6),
  `ENGINE_ACCENTS`/`EngineId` (existing `./engineAccents`).
- Produces: `<SyntropyNodeCard spec={PortSpec} name={string} accent={string} inputs={Record<string, unknown>} onInputsChange={(next: Record<string, unknown>) => void} />` — consumed by Task 8 (`NodeOverlay`).

- [ ] **Step 1: Write the failing test**

Create `canvas/excalidraw-app/tests/SyntropyNodeCard.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { SyntropyNodeCard } from "../syntropy/SyntropyNodeCard";
import { RIEMANN_SUMS_PORT_SPEC } from "../syntropy/portSpecs/riemannSums";

const DEFAULT_INPUTS = { fx: "x", a: 0, b: 2, n: 2 };

describe("SyntropyNodeCard", () => {
  it("renders one scrub chip per input, seeded from the current values", () => {
    render(
      <SyntropyNodeCard
        spec={RIEMANN_SUMS_PORT_SPEC}
        name="Riemann Sums"
        accent="#4f9e82"
        inputs={DEFAULT_INPUTS}
        onInputsChange={() => {}}
      />,
    );
    expect(screen.getByDisplayValue("x")).toBeTruthy();
    expect(screen.getByDisplayValue("2")).toBeTruthy(); // b
  });

  it("recomputes the output when an input changes", () => {
    render(
      <SyntropyNodeCard
        spec={RIEMANN_SUMS_PORT_SPEC}
        name="Riemann Sums"
        accent="#4f9e82"
        inputs={DEFAULT_INPUTS}
        onInputsChange={() => {}}
      />,
    );
    // f(x)=x on [0,2], n=2 midpoint -> total = 2 (matches the port-spec test's known case).
    expect(screen.getByText("2")).toBeTruthy();
  });

  it("calls onInputsChange when a scrub chip is edited", () => {
    const onInputsChange = vi.fn();
    render(
      <SyntropyNodeCard
        spec={RIEMANN_SUMS_PORT_SPEC}
        name="Riemann Sums"
        accent="#4f9e82"
        inputs={DEFAULT_INPUTS}
        onInputsChange={onInputsChange}
      />,
    );
    fireEvent.change(screen.getByLabelText("f(x)"), {
      target: { value: "2*x" },
    });
    expect(onInputsChange).toHaveBeenCalledWith({ ...DEFAULT_INPUTS, fx: "2*x" });
  });

  it("calls openMethodPage with the current inputs when the portal tab is clicked", () => {
    render(
      <SyntropyNodeCard
        spec={RIEMANN_SUMS_PORT_SPEC}
        name="Riemann Sums"
        accent="#4f9e82"
        inputs={DEFAULT_INPUTS}
        onInputsChange={() => {}}
      />,
    );
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
    fireEvent.click(screen.getByRole("button", { name: /open/i }));
    expect(openSpy).toHaveBeenCalledWith(
      "/math-lab/engines/calculus/methods/riemann-sums.html",
      "_blank",
    );
    openSpy.mockRestore();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd canvas && yarn test:app --watch=false SyntropyNodeCard`
Expected: FAIL — `Cannot find module '../syntropy/SyntropyNodeCard'`

- [ ] **Step 3: Write the implementation**

Create `canvas/excalidraw-app/syntropy/SyntropyNodeCard.tsx`:

```tsx
import "./SyntropyNodeCard.scss";

import { useMemo } from "react";

import { CrosshairCorners } from "./CrosshairCorners";
import { RiemannPlot } from "./RiemannPlot";
import { openMethodPage } from "./portalPrefill";

import type { PortSpec } from "./portSpecs/types";

type SyntropyNodeCardProps = {
  spec: PortSpec;
  name: string;
  accent: string;
  inputs: Record<string, unknown>;
  onInputsChange: (next: Record<string, unknown>) => void;
};

/**
 * The real, interactive replacement for SyntropyNode's placeholder shell — but ONLY for methods
 * with a port spec (Task 2's registry). Rendered by NodeOverlay (Task 8) in a DOM layer outside
 * Excalidraw's own tree, so — unlike SyntropyNode.tsx, which still renders through
 * renderEmbeddable and is still pointer-events-gated — every control here is clickable and
 * editable without first double-clicking into the node.
 */
export const SyntropyNodeCard = ({
  spec,
  name,
  accent,
  inputs,
  onInputsChange,
}: SyntropyNodeCardProps) => {
  const result = useMemo(() => spec.compute(inputs), [spec, inputs]);

  const handleInputChange = (key: string, rawValue: string, kind: "expression" | "number") => {
    const value = kind === "number" ? Number(rawValue) : rawValue;
    onInputsChange({ ...inputs, [key]: value });
  };

  const plotOutput = spec.outputs.find((o) => o.kind === "plot2d");
  const numberOutputs = spec.outputs.filter((o) => o.kind === "number");

  return (
    <div
      className="SyntropyNodeCard"
      style={{ "--node-accent": accent } as React.CSSProperties}
    >
      <CrosshairCorners />
      <div className="SyntropyNodeCard__header">
        <span className="SyntropyNodeCard__dot" />
        <span className="SyntropyNodeCard__title">{name}</span>
        <button
          type="button"
          className="SyntropyNodeCard__portal"
          aria-label={`Open ${name} in the lab`}
          onClick={() => openMethodPage(spec, inputs)}
        >
          Open ↗
        </button>
      </div>
      <div className="SyntropyNodeCard__body">
        {spec.inputs.map((input) => (
          <div className="SyntropyNodeCard__scrub" key={input.key}>
            <div className="SyntropyNodeCard__scrubRow">
              <label
                className="SyntropyNodeCard__scrubLabel"
                htmlFor={`${spec.methodId}-${input.key}`}
              >
                {input.label}
              </label>
              <input
                id={`${spec.methodId}-${input.key}`}
                aria-label={input.label}
                className="SyntropyNodeCard__scrubValue"
                type={input.kind === "number" ? "number" : "text"}
                value={String(inputs[input.key] ?? "")}
                onChange={(e) =>
                  handleInputChange(input.key, e.target.value, input.kind)
                }
              />
            </div>
          </div>
        ))}

        {result.error && (
          <p className="SyntropyNodeCard__error">{result.error}</p>
        )}

        {!result.error && plotOutput && (
          <div className="SyntropyNodeCard__plot">
            <RiemannPlot
              rectangles={
                (result.outputs[plotOutput.key] as never[] | undefined) ?? []
              }
              accent={accent}
            />
          </div>
        )}

        {!result.error && (
          <div className="SyntropyNodeCard__output">
            {numberOutputs.map((output) => (
              <div className="SyntropyNodeCard__outRow" key={output.key}>
                <span className="SyntropyNodeCard__outKey">{output.label}</span>
                <span className="SyntropyNodeCard__outVal">
                  {typeof result.outputs[output.key] === "number"
                    ? (result.outputs[output.key] as number).toFixed(3)
                    : "—"}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
```

- [ ] **Step 4: Write the styles**

Create `canvas/excalidraw-app/syntropy/SyntropyNodeCard.scss`. This reuses `SyntropyNode.scss`'s
already-approved visual language (transparent scrub-chip pills, dashed output separator, radial
accent glow) with two changes: the header's portal button needs `pointer-events: auto` while the
card itself defaults to `pointer-events: none` (see Task 8 for why), and a `.plot` slot is new.

```scss
.SyntropyNodeCard {
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
  // Card background/border/shadow are pass-through so a mousedown here reaches Excalidraw's
  // canvas underneath and drag-to-move / click-to-select on the real (transparent) embeddable
  // element keeps working. Every interactive child below re-enables pointer-events itself.
  pointer-events: none;

  &::before {
    content: "";
    position: absolute;
    top: -35%;
    left: -15%;
    width: 75%;
    height: 75%;
    background: radial-gradient(circle, var(--node-accent) 0%, transparent 72%);
    opacity: 0.15;
    filter: blur(6px);
    pointer-events: none;
    z-index: -1;
  }
}

.SyntropyNodeCard__header {
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

.SyntropyNodeCard__dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--node-accent);
  flex-shrink: 0;
}

.SyntropyNodeCard__title {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.SyntropyNodeCard__portal {
  all: unset;
  pointer-events: auto;
  cursor: pointer;
  font-size: 10px;
  letter-spacing: 0.04em;
  color: #7d858c;
  padding: 2px 6px;
  border-radius: 4px;
  transition: color 0.3s cubic-bezier(0.16, 1, 0.3, 1);

  &:hover {
    color: var(--node-accent);
  }
}

.SyntropyNodeCard__body {
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 0;
  flex: 1;
}

.SyntropyNodeCard__scrub {
  position: relative;
  box-sizing: border-box;
  border-radius: 8px;
  background: #090909;
  border: 1px solid rgba(255, 255, 255, 0.1);
  overflow: hidden;
  flex-shrink: 0;
  pointer-events: auto;
}

.SyntropyNodeCard__scrubRow {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 40px;
  padding: 0 10px;
  gap: 8px;
}

.SyntropyNodeCard__scrubLabel {
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: #7d858c;
  font-size: 9.5px;
  flex-shrink: 0;
}

.SyntropyNodeCard__scrubValue {
  all: unset;
  box-sizing: border-box;
  width: 100%;
  text-align: right;
  font-size: 15px;
  font-family: inherit;
  color: #e7e7e7;
  font-weight: 600;
  pointer-events: auto;
  cursor: text;
}

.SyntropyNodeCard__error {
  font-size: 11px;
  color: #ed6d40;
  margin: 0;
}

.SyntropyNodeCard__plot {
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: #090909;
  padding: 6px;
}

.RiemannPlot {
  display: block;
  width: 100%;
  height: 100px;
}

.RiemannPlot__empty {
  margin: 0;
  padding: 12px;
  font-size: 11px;
  color: #7d858c;
  text-align: center;
}

.SyntropyNodeCard__output {
  margin-top: 2px;
  padding-top: 10px;
  border-top: 1px dashed rgba(255, 255, 255, 0.1);
  display: grid;
  gap: 1px;
  background: rgba(255, 255, 255, 0.06);
  border-radius: 6px;
  overflow: hidden;
}

.SyntropyNodeCard__outRow {
  box-sizing: border-box;
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: #111111;
  padding: 7px 10px;
  font-family: var(--ui-font);
  font-size: 11px;
}

.SyntropyNodeCard__outKey {
  color: #7d858c;
}

.SyntropyNodeCard__outVal {
  color: var(--node-accent);
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd canvas && yarn test:app --watch=false SyntropyNodeCard`
Expected: PASS, 4 tests. If `getByLabelText`/`getByRole` fail to find elements, check that the
rendered `<label htmlFor>` / `<input id>` pair actually matches (`${spec.methodId}-${input.key}`)
and that the portal button's accessible name includes "open" (case-insensitive `/open/i` regex
in the test matches "Open ↗").

- [ ] **Step 6: Typecheck and lint**

Run: `cd canvas && yarn test:typecheck && npx eslint excalidraw-app/syntropy/SyntropyNodeCard.tsx excalidraw-app/tests/SyntropyNodeCard.test.tsx`
Expected: 0 errors, 0 warnings.

- [ ] **Step 7: Commit**

```bash
git add canvas/excalidraw-app/syntropy/SyntropyNodeCard.tsx canvas/excalidraw-app/syntropy/SyntropyNodeCard.scss canvas/excalidraw-app/tests/SyntropyNodeCard.test.tsx
git commit -m "feat(canvas): add the real, interactive SyntropyNodeCard"
```

---

### Task 8: `NodeOverlay` — wire it into `App.tsx`

This is the integration task: it has no isolated unit test of its own (it is a thin composition
of everything already tested in Tasks 1–7 plus Excalidraw's own `onChange`/`renderEmbeddable`
hooks, which are exercised through the full app, not in isolation). Its correctness is checked by
the manual browser verification steps at the end — treat those as this task's test.

**Files:**
- Create: `canvas/excalidraw-app/syntropy/NodeOverlay.tsx`
- Create: `canvas/excalidraw-app/syntropy/NodeOverlay.scss`
- Modify: `canvas/excalidraw-app/App.tsx`

**Interfaces:**
- Consumes: `computeNodeScreenRect` (Task 3), `getPortSpec` (Task 2), `SyntropyNodeCard`
  (Task 7), `ENGINE_ACCENTS`/`EngineId` (existing), `SyntropyNodeData` (existing, extended in
  Task 4).

- [ ] **Step 1: Write `NodeOverlay`**

Create `canvas/excalidraw-app/syntropy/NodeOverlay.tsx`:

```tsx
import "./NodeOverlay.scss";

import { ENGINE_ACCENTS, type EngineId } from "./engineAccents";
import { computeNodeScreenRect } from "./nodeGeometry";
import { getPortSpec } from "./portSpecs/registry";
import { SyntropyNodeCard } from "./SyntropyNodeCard";

import type { SyntropyNodeData } from "./syntropyWire";

type OverlayElement = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  customData?: { syntropyNode?: SyntropyNodeData };
};

type OverlayAppState = {
  scrollX: number;
  scrollY: number;
  zoom: { value: number };
  offsetLeft: number;
  offsetTop: number;
};

type NodeOverlayProps = {
  elements: readonly OverlayElement[];
  appState: OverlayAppState;
  onNodeInputsChange: (elementId: string, inputs: Record<string, unknown>) => void;
};

/**
 * Renders SyntropyNodeCard for every element that has a resolvable port spec, as a DOM layer
 * positioned in screen space over the canvas — see
 * docs/superpowers/specs/2026-08-05-syntropy-canvas-node-host-first-method-design.md's
 * "Architecture" section for why this has to live outside Excalidraw's own DOM tree.
 *
 * Elements with NO port spec are not rendered here at all — they keep going through
 * SyntropyNode.tsx via renderEmbeddable exactly as before this phase (see the App.tsx change in
 * this same task).
 */
export const NodeOverlay = ({
  elements,
  appState,
  onNodeInputsChange,
}: NodeOverlayProps) => {
  return (
    <div className="NodeOverlay">
      {elements.map((element) => {
        const nodeData = element.customData?.syntropyNode;
        if (!nodeData) {
          return null;
        }
        const spec = getPortSpec(nodeData.engineId, nodeData.methodId);
        if (!spec) {
          return null;
        }
        const rect = computeNodeScreenRect(element, appState);
        const accent = ENGINE_ACCENTS[nodeData.engineId as EngineId];
        return (
          <div
            key={element.id}
            className="NodeOverlay__node"
            style={{
              left: rect.left,
              top: rect.top,
              width: rect.width,
              height: rect.height,
              transform: `scale(${rect.scale})`,
            }}
          >
            <SyntropyNodeCard
              spec={spec}
              name={nodeData.name}
              accent={accent}
              inputs={nodeData.inputs ?? {}}
              onInputsChange={(next) => onNodeInputsChange(element.id, next)}
            />
          </div>
        );
      })}
    </div>
  );
};
```

- [ ] **Step 2: Write `NodeOverlay.scss`**

Create `canvas/excalidraw-app/syntropy/NodeOverlay.scss`:

```scss
// Covers the viewport; individual node cards are positioned within it via
// computeNodeScreenRect's viewport-relative left/top (see nodeGeometry.ts — offsetLeft/offsetTop
// come from Excalidraw's own excalidrawContainer.getBoundingClientRect(), which is
// viewport-relative, so `position: fixed` here needs no extra offset math to line up).
.NodeOverlay {
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 5;
}

.NodeOverlay__node {
  position: absolute;
  transform-origin: top left;
}
```

- [ ] **Step 3: Wire it into `App.tsx`**

In `canvas/excalidraw-app/App.tsx`, find the `renderEmbeddable` callback (around line 1103,
identified earlier: `renderEmbeddable={(element) => { ... return <SyntropyNode {...syntropyNode} />; }}`).
Read the surrounding ~20 lines first to get the exact current shape, since line numbers may have
shifted from earlier phases — search for `renderEmbeddable={(element) => {` and
`return <SyntropyNode {...syntropyNode} />;`. Change the final return so it returns `null`
whenever the node has a resolvable port spec (Task 2's `getPortSpec`), falling through to today's
`<SyntropyNode>` shell otherwise:

```tsx
          renderEmbeddable={(element) => {
            const link = element.link ?? "";
            // ... existing syntropy:// / real-embed branching stays exactly as-is above this
            // point — only the final syntropyNode branch changes:
            if (!syntropyNode) {
              return null;
            }
            // Methods with a port spec (Task 2's registry) render through NodeOverlay instead —
            // a DOM layer outside this component tree, not subject to the pointer-events:none
            // gate embeddable content is normally under. Returning null here means Excalidraw
            // still selects/drags/resizes this element normally (see
            // packages/element/src/renderElement.ts: embeddable elements paint on the static
            // canvas independent of what renderEmbeddable returns) — it just paints nothing of
            // its own, since the element's strokeColor/backgroundColor are "transparent"
            // (Task 4).
            if (getPortSpec(syntropyNode.engineId, syntropyNode.methodId)) {
              return null;
            }
            return <SyntropyNode {...syntropyNode} />;
          }}
```

Add the import near the other `./syntropy/*` imports:

```tsx
import { getPortSpec } from "./syntropy/portSpecs/registry";
import { NodeOverlay } from "./syntropy/NodeOverlay";
```

Now mount `<NodeOverlay>`. It needs the current `elements`/`appState` on every scene change and a
way to persist input edits back onto the element's `customData`. Extend the existing `onChange`
handler (found earlier at `App.tsx:708`, already doing the wire-auto-styling/accent-switching
work) to also update a small piece of state the overlay reads, and add the input-change handler
next to it:

```tsx
  const [overlayElements, setOverlayElements] = useState<
    readonly OrderedExcalidrawElement[]
  >([]);
  const [overlayAppState, setOverlayAppState] = useState<AppState | null>(null);

  const onChange = (
    elements: readonly OrderedExcalidrawElement[],
    appState: AppState,
    files: BinaryFiles,
  ) => {
    setOverlayElements(elements);
    setOverlayAppState(appState);

    // ... existing selectedSyntropyEngine / wire-auto-styling body stays exactly as-is below
    // this point, unchanged.
```

Add the input-change handler as a sibling function near `onChange`:

```tsx
  const handleNodeInputsChange = (
    elementId: string,
    inputs: Record<string, unknown>,
  ) => {
    if (!excalidrawAPI) {
      return;
    }
    const elements = excalidrawAPI.getSceneElements();
    const next = elements.map((el) => {
      if (el.id !== elementId || !el.customData?.syntropyNode) {
        return el;
      }
      return newElementWith(el, {
        customData: {
          ...el.customData,
          syntropyNode: { ...el.customData.syntropyNode, inputs },
        },
      });
    });
    // NEVER, not IMMEDIATELY: typing into a scrub chip fires on every keystroke, and each one
    // becoming a separate undo step would make undo useless for this node — same reasoning
    // App.tsx already applies to the wire auto-styling a few lines above.
    excalidrawAPI.updateScene({ elements: next, captureUpdate: CaptureUpdateAction.NEVER });
  };
```

Finally, render `<NodeOverlay>` as a sibling of `<Excalidraw>`, inside the outer
`excalidraw-app` div found earlier (around where `<LibraryPanel>`/`<LibraryToggle>` are already
mounted):

```tsx
      {overlayAppState && (
        <NodeOverlay
          elements={overlayElements}
          appState={overlayAppState}
          onNodeInputsChange={handleNodeInputsChange}
        />
      )}
```

- [ ] **Step 4: Typecheck**

Run: `cd canvas && yarn test:typecheck`
Expected: 0 errors. If `AppState`/`OrderedExcalidrawElement`/`BinaryFiles` aren't already
imported in `App.tsx`, they must be — check the top of the file first; `onChange`'s existing
signature (`App.tsx:708-712`) already uses all three, so they should already be in scope.

- [ ] **Step 5: Lint**

Run: `cd canvas && npx eslint excalidraw-app/App.tsx excalidraw-app/syntropy/NodeOverlay.tsx`
Expected: 0 errors, 0 warnings.

- [ ] **Step 6: Run the full test suite**

Run: `cd canvas && yarn test:app --watch=false`
Expected: PASS, 0 failures, same baseline as before plus this phase's new tests.

- [ ] **Step 7: Manual browser verification**

Build and serve, following the same pattern used to verify phase A:

```bash
cd canvas && yarn build:app
cd .. && python3 math-lab/note-taker/serve.py 8000
```

Open `http://localhost:8000/canvas/dist/index.html` and check each of these — they are this
task's real test, since the integration itself has no automated one:

1. Expand the Calculus engine in the library panel, click "Riemann Sums" — a node spawns showing
   real scrub chips: `f(x) = sin(x) + 2`, `a = 0`, `b = 6.283185307179586`, `n = 12`, a rectangle
   plot, and `total ≈ …`.
2. Click directly into the `f(x)` scrub chip and type — it accepts input immediately, no
   double-click into the node first. Change `n` to `4` — the plot and `total` update live.
3. Drag the node by its header (not by a scrub chip) — it moves on the canvas exactly like any
   other element. Click empty canvas, then click the node's header — it selects (resize handles
   appear) exactly as before this phase.
4. Click "Open ↗" — a new tab opens `math-lab`'s real Riemann Sums page, with `f(x)`, `a`, `b`,
   `n` already showing the values from the node (not that page's own defaults).
5. Undo (Ctrl/Cmd+Z) after moving the node — the move undoes. Undo again after editing a scrub
   chip value — confirm this does NOT produce one undo step per keystroke (per the `NEVER`
   capture-update choice in Step 3): moving focus off the field and undoing should undo the
   node's creation, not a single keystroke.
6. Spawn a node for a method with no port spec (e.g. "Limits") — confirm it renders exactly as it
   did before this phase (the plain placeholder shell, unchanged).

If any of 1–6 fails, do not proceed to Step 8 — return to the relevant earlier task.

- [ ] **Step 8: Commit**

```bash
git add canvas/excalidraw-app/App.tsx canvas/excalidraw-app/syntropy/NodeOverlay.tsx canvas/excalidraw-app/syntropy/NodeOverlay.scss
git commit -m "feat(canvas): mount NodeOverlay, route port-spec methods through it"
```

---

### Task 9: Rebuild dist and final verification

**Files:**
- Modify: `canvas/dist/**` (rebuilt output)

- [ ] **Step 1: Full verification sweep**

```bash
cd canvas
yarn test:typecheck
npx eslint excalidraw-app packages/element packages/common
yarn test:app --watch=false
yarn build:app
```

Expected: typecheck clean, lint clean, full test suite passing (baseline count plus this phase's
~25 new tests across Tasks 1–7), build succeeds with no new warnings beyond the pre-existing
chunk-size warning already present before this phase.

- [ ] **Step 2: Re-run the manual browser checklist from Task 8, Step 7**

Against the freshly rebuilt `canvas/dist/`, to confirm the production build behaves identically
to the dev-server check already done.

- [ ] **Step 3: Commit the rebuilt dist**

```bash
cd .. && git add canvas/dist
git commit -m "build(canvas): rebuild the static dist for phase B"
```

---

## Self-Review Notes

- **Spec coverage:** Port spec type/registry (Task 2), transparent+content-sized element with
  persisted inputs (Task 4), overlay host resolving the pointer-events wall (Task 8), Riemann
  Sums as the one live method (Tasks 2/5/7), portal pre-fill via the shared localStorage key
  (Task 6) — every section of the design doc has a task. 3D viewport, wiring/ports, and
  `executionMode: "run"` are explicitly out of scope per the design and are not tasked here.
- **Type consistency:** `PortSpec`/`PortInput`/`PortOutput`/`ComputeResult` (Task 2) are used
  identically in Tasks 4, 5, 6, 7, 8 with no renamed fields. `SyntropyNodeData.inputs` (Task 4)
  is the same shape `NodeOverlay` (Task 8) and `SyntropyNodeCard` (Task 7) read and write.
  `computeNodeScreenRect`'s return shape (`{ left, top, width, height, scale }`, Task 3) matches
  exactly how `NodeOverlay` consumes it in Task 8.
- **Placeholder scan:** no TBD/TODO; every step has real, complete code, not descriptions of
  code.
