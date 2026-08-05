# Syntropy Canvas — Node Visual Language Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port the approved mockup's node visual language — scrub-chip inputs with fill bars, a real output stat row plus a dormant `pulseFlash` capability, and auto-styled dashed/diamond wires colored to the source node's engine accent with a "linked" reaction on the target's first scrub chip — into the existing `SyntropyNode`/library-panel system, using static/placeholder content throughout and no real computation.

**Architecture:** Three changes, all in `canvas/excalidraw-app/` except where noted:
(1) `SyntropyNode.tsx`/`.scss` swap their plain placeholder rows for the mockup's `scrub5`/`out5` visual treatment (a fill-bar pill per input, a stat-tile output row), plus the `pulseFlash` keyframes as a CSS-only capability that nothing applies yet. The node's own `--node-accent` and a per-chip `--link-accent` parameterize the mockup's hardcoded teal so the language is generic across all 7 engines.
(2) A new pure helper `syntropyWire.ts` decides, given the scene, which arrows are "Syntropy wires" (both ends bound to `customData.syntropyNode` elements, not yet marked) and what their source accent is, and produces the exact element-update partials to restyle them and to stamp a target node's `linkedAccent`.
(3) The existing `onChange` handler in `App.tsx` runs that helper once per scene change and, when anything changed, calls `updateScene` with `CaptureUpdateAction.NEVER` (auto-styling isn't a separate undo step). It's idempotent — an arrow carrying `customData.syntropyWire` is never re-forced, so a user can still restyle a wire manually afterward.
Annotations are native Excalidraw (text + bound arrow) and need no code; one task verifies they track a real `SyntropyNode` when dragged.

**Tech Stack:** React/TSX, SCSS (CSS custom properties + `color-mix` for per-engine tinting), the same vendored Excalidraw fork from the prior two plans, vitest for the pure-helper unit tests.

## Global Constraints

- Visuals only — no real per-method computation, no node-feeds-node graph, no 2D plots, no interactive 3D viewport (all deferred to `2026-08-04-math-canvas-design.md`'s "port spec" territory). Content stays placeholder ("input" / "—" / "output").
- No new Excalidraw element type, no changes to element serialization/history/hit-testing in `canvas/packages/excalidraw`. Wires are ordinary arrow elements restyled via their native `strokeStyle`/`startArrowhead`/`endArrowhead`/`strokeColor` properties + `customData.syntropyWire` marker. Detection lives in `App.tsx`'s already-wired `onChange`, the same hook the accent-switching mechanism already uses.
- Generic across engines: the mockup's single hardcoded `--electric-teal` (#4f9e82) is replaced by `--node-accent` (the node's own engine accent, already injected by `SyntropyNode`) for the node's own fills, and by `--link-accent` (the *source* node's accent, stamped onto the target's first scrub chip when a wire points at it) for the linked reaction. No per-engine color is hardcoded anywhere new.
- `pulseFlash` is a CSS capability only — the `.SyntropyNode__outRow--flash` modifier and its `SyntropyNode-rowglow`/`SyntropyNode-ringpulse` keyframes are defined but never applied to any element in this phase.
- Every task ends in its own commit.
- Flowing dashes (animated dash offset) is a stretch goal, NOT required for plan approval — it's Task 6, explicitly behind a GO/NO-GO gate, and the plan is complete and shippable without it.

---

### Task 1: Scrub-chip + output-row visuals, and the dormant `pulseFlash` capability

**Files:**
- Modify: `canvas/excalidraw-app/syntropy/SyntropyNode.scss` (replace `.SyntropyNode__scrub`/`.SyntropyNode__scrub-label`/`.SyntropyNode__output`; add fill/row/value/linktag classes, the `--linked` modifier, the output-row classes, the `--flash` modifier + keyframes)
- Modify: `canvas/excalidraw-app/syntropy/SyntropyNode.tsx` (swap the two scrub rows and the output div for the new structure; placeholder content only; no `--flash` class applied)

**Interfaces:**
- Consumes: `--node-accent` (already set on `.SyntropyNode` from `ENGINE_ACCENTS[engineId]` by the existing component).
- Produces: `.SyntropyNode__scrub` now renders as the mockup's pill (rounded `--core-black` body, a `.SyntropyNode__scrubFill` layer sized by a `--pct` custom property, a `.SyntropyNode__scrubRow` with mono uppercase label left / larger mono value right); `.SyntropyNode__output` now renders the mockup's `.out5` bordered group with a single `.SyntropyNode__outRow` (key "output" / value "—"); `.SyntropyNode__outRow--flash` + `@keyframes SyntropyNode-rowglow`/`SyntropyNode-ringpulse` exist in CSS but are applied by no JSX in this task. The `.SyntropyNode__scrub--linked` modifier and `.SyntropyNode__scrubLinktag` are defined here (consumed in Task 4); `--link-accent` is not set anywhere yet, so the modifier is inert until Task 4.

- [ ] **Step 1: Replace the scrub + output SCSS**

In `canvas/excalidraw-app/syntropy/SyntropyNode.scss`, replace the entire block from `.SyntropyNode__scrub {` through the end of the file (the `.SyntropyNode__scrub`, `.SyntropyNode__scrub-label`, and `.SyntropyNode__output` rules) with:

```scss
.SyntropyNode__scrub {
  position: relative;
  height: 40px;
  border-radius: 8px;
  background: #090909; // mockup --core-black
  border: 1px solid rgba(255, 255, 255, 0.1);
  overflow: hidden;
  flex-shrink: 0;
}

.SyntropyNode__scrubFill {
  position: absolute;
  inset: 0;
  width: var(--pct, 50%);
  background: linear-gradient(
    90deg,
    color-mix(in srgb, var(--node-accent) 22%, transparent),
    color-mix(in srgb, var(--node-accent) 5%, transparent)
  );
}

.SyntropyNode__scrubRow {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 100%;
  padding: 0 10px;
}

.SyntropyNode__scrubLabel {
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: #7d858c; // mockup --pulse-ash
  font-size: 9.5px;
}

.SyntropyNode__scrubValue {
  font-size: 15px;
  color: #e7e7e7; // mockup --off-white
  font-weight: 600;
}

// Linked reaction (applied in Task 4 when --link-accent is set).
.SyntropyNode__scrub--linked {
  border-color: var(--link-accent);

  .SyntropyNode__scrubFill {
    background: linear-gradient(
      90deg,
      color-mix(in srgb, var(--link-accent) 30%, transparent),
      color-mix(in srgb, var(--link-accent) 8%, transparent)
    );
  }
}

.SyntropyNode__scrubLinktag {
  position: absolute;
  top: 2px;
  right: 8px;
  z-index: 2;
  font-size: 8px;
  letter-spacing: 0.05em;
  color: var(--link-accent);
}

.SyntropyNode__output {
  margin-top: 2px;
  padding-top: 10px;
  border-top: 1px dashed rgba(255, 255, 255, 0.1);
  display: grid;
  gap: 1px;
  background: rgba(255, 255, 255, 0.06);
  border-radius: 6px;
  overflow: hidden;
  flex: 1;
  min-height: 24px;
}

.SyntropyNode__outRow {
  position: relative;
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: #111111; // mockup --rich-carbon
  padding: 7px 10px;
  font-size: 11px;
}

.SyntropyNode__outKey {
  color: #7d858c; // mockup --pulse-ash
}

.SyntropyNode__outVal {
  color: var(--node-accent); // mockup used --validation-green; generic → node accent
}

// pulseFlash capability — defined here, applied by NO element this phase.
// A later computation phase can add the --flash modifier to a row without
// touching CSS again.
.SyntropyNode__outRow--flash {
  animation: SyntropyNode-rowglow 1.8s ease-in-out infinite;

  &::after {
    content: "";
    position: absolute;
    inset: 0;
    border-radius: 4px;
    border: 1px solid var(--node-accent);
    animation: SyntropyNode-ringpulse 1.8s cubic-bezier(0.16, 1, 0.3, 1)
      infinite;
  }
}

@keyframes SyntropyNode-rowglow {
  0%,
  100% {
    background: #111111;
  }
  15% {
    background: color-mix(in srgb, var(--node-accent) 14%, transparent);
  }
}

@keyframes SyntropyNode-ringpulse {
  0% {
    transform: scale(1);
    opacity: 0.9;
  }
  70% {
    transform: scale(1.035);
    opacity: 0;
  }
  100% {
    opacity: 0;
  }
}
```

Leave everything above (`.SyntropyNode` through `.SyntropyNode__body`) untouched — the body already has `gap: 8px` and the scrub rows sit in it.

- [ ] **Step 2: Replace the scrub + output JSX**

In `canvas/excalidraw-app/syntropy/SyntropyNode.tsx`, replace the `<div className="SyntropyNode__body">…</div>` block (the two `.SyntropyNode__scrub` rows and the empty `.SyntropyNode__output`) with:

```tsx
      <div className="SyntropyNode__body">
        <div
          className="SyntropyNode__scrub"
          style={{ "--pct": "50%" } as React.CSSProperties}
        >
          <div className="SyntropyNode__scrubFill" />
          <div className="SyntropyNode__scrubRow">
            <span className="SyntropyNode__scrubLabel">input</span>
            <span className="SyntropyNode__scrubValue">—</span>
          </div>
        </div>
        <div
          className="SyntropyNode__scrub"
          style={{ "--pct": "50%" } as React.CSSProperties}
        >
          <div className="SyntropyNode__scrubFill" />
          <div className="SyntropyNode__scrubRow">
            <span className="SyntropyNode__scrubLabel">input</span>
            <span className="SyntropyNode__scrubValue">—</span>
          </div>
        </div>
        <div className="SyntropyNode__output">
          <div className="SyntropyNode__outRow">
            <span className="SyntropyNode__outKey">output</span>
            <span className="SyntropyNode__outVal">—</span>
          </div>
        </div>
      </div>
```

No `--flash` class is applied anywhere — that's intentional (capability only this phase). The `linkedAccent` prop does not exist yet; the linked modifier is inert until Task 4 wires it. The component signature stays exactly `({ engineId, name }: SyntropyNodeProps)` for this task.

- [ ] **Step 3: Boot the dev server and verify visually**

Run (from `canvas/`, background it): `yarn start`, then open `http://localhost:3001/`. Click a method in the library panel to spawn a node.

Expected (verification step 1 from the design): the node's two input rows now render as dark pills with a faint accent-tinted fill bar behind a mono uppercase "input" label (left) and a larger mono "—" value (right); the output area is a bordered stat-tile row reading "output / —" (tinted in the node's engine accent), not an empty dashed box. The fill bar tint matches the node's engine (e.g. purple for a Complex Analysis node, green for Calculus) — confirming the generic-accent parameterization works, not a fixed teal.

- [ ] **Step 4: Confirm the dormant flash keyframes don't misfire**

In the browser, inspect a node's output row. Expected: it does NOT have `SyntropyNode__outRow--flash`, and is static (no pulsing/glow). The keyframes exist in the stylesheet but no element references them — confirmed by the row being visually still.

- [ ] **Step 5: Stop the dev server**

- [ ] **Step 6: Commit**

```bash
git add canvas/excalidraw-app/syntropy/SyntropyNode.scss canvas/excalidraw-app/syntropy/SyntropyNode.tsx
git commit -m "$(cat <<'EOF'
feat(canvas): port the mockup's scrub-chip + output-row visual language

Replaces SyntropyNode's plain label/value rows with the approved mockup's
treatment: each input is a dark pill with an accent-tinted fill-bar layer
(behind a mono uppercase label / larger mono value), and the output area is
a bordered stat-tile row (key/value on a slightly-elevated background).
The mockup's single hardcoded teal is parameterized to --node-accent so the
language reads correctly for all 7 engines, not just one.

Also lands the pulseFlash mechanic as a CSS capability only — the
--flash modifier + rowglow/ringpulse keyframes are defined but applied to
no element this phase; a later computation phase can flip a row's flash on
without touching CSS again. The --linked scrub modifier + linktag are
defined here too, inert until a later task stamps --link-accent.

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Wire-detection pure helpers

**Files:**
- Create: `canvas/excalidraw-app/syntropy/syntropyWire.ts`
- Test: `canvas/excalidraw-app/tests/syntropyWire.test.ts`

**Interfaces:**
- Consumes: `ENGINE_ACCENTS`, `type EngineId` from `./engineAccents`.
- Produces (all pure, no Excalidraw imports — testable with plain mock objects):
  - `type SyntropyNodeData = { engineId: EngineId; methodId: string; name: string; linkedAccent?: string | null }` — the full `customData.syntropyNode` shape (extends the shape `createSyntropyNode` already writes, by one optional `linkedAccent` field).
  - `type WireCandidate = { startBinding: { elementId: string } | null; endBinding: { elementId: string } | null; customData?: { syntropyWire?: boolean } }` — the structural slice of an arrow element these helpers read.
  - `getSyntropyWireStyling(arrow: WireCandidate, resolveNode: (id: string) => { customData?: { syntropyNode?: SyntropyNodeData } } | undefined): string | null` — returns the *source* node's engine accent if `arrow` should be auto-styled as a Syntropy wire (both bindings resolve to `customData.syntropyNode`-carrying elements and the arrow isn't already marked `syntropyWire`), else `null`. "Source" = `startBinding`; "target" = `endBinding`.
  - `styleSyntropyWire(arrow: WireCandidate, accent: string): { strokeStyle: "dashed"; startArrowhead: "diamond"; endArrowhead: "diamond"; strokeColor: string; customData: { syntropyWire: true } & Record<string, unknown> }` — the exact element-update partial that restyles an arrow as a Syntropy wire, preserving any existing `customData`.
  - `computeLinkedAccent(nodeId: string, arrows: ReadonlyArray<WireCandidate>, resolveNode): string | null` — returns the source node's accent for the first arrow whose `endBinding` is `nodeId` and whose `startBinding` resolves to a `customData.syntropyNode` element, else `null`. Drives the target node's linked reaction.
  - `stampLinkedAccent(node: { customData?: { syntropyNode?: SyntropyNodeData } }, accent: string | null): { customData: { syntropyNode: SyntropyNodeData } }` — the element-update partial that writes `linkedAccent` onto a node's `customData.syntropyNode`, preserving `engineId`/`methodId`/`name` and any other top-level `customData` keys.
- Consumed by: Task 3 (the `onChange` integration).

- [ ] **Step 1: Write the failing test**

```typescript
// canvas/excalidraw-app/tests/syntropyWire.test.ts
import { describe, expect, it } from "vitest";

import {
  computeLinkedAccent,
  getSyntropyWireStyling,
  stampLinkedAccent,
  styleSyntropyWire,
} from "../syntropy/syntropyWire";

const node = (id: string, engineId: "complex" | "calculus") => ({
  id,
  customData: {
    syntropyNode: { engineId, methodId: `${id}-m`, name: id },
  },
});

const arrow = (
  id: string,
  startId: string | null,
  endId: string | null,
  extra: Record<string, unknown> = {},
) => ({
  id,
  type: "arrow" as const,
  startBinding: startId === null ? null : { elementId: startId },
  endBinding: endId === null ? null : { elementId: endId },
  ...extra,
});

describe("getSyntropyWireStyling", () => {
  it("returns the source node's accent when both ends bind to Syntropy nodes and the arrow is unmarked", () => {
    const byId = new Map([
      ["a", node("a", "complex")],
      ["b", node("b", "calculus")],
    ]);
    const resolve = (id: string) => byId.get(id);
    // start = a (complex, purple), end = b → accent is the SOURCE's.
    expect(getSyntropyWireStyling(arrow("w", "a", "b"), resolve)).toBe(
      "#b45fd0",
    );
  });

  it("returns null when either end is not a Syntropy node", () => {
    const byId = new Map([
      ["a", node("a", "complex")],
      ["r", { id: "r", customData: {} }],
    ]);
    const resolve = (id: string) => byId.get(id);
    expect(getSyntropyWireStyling(arrow("w", "a", "r"), resolve)).toBeNull();
    expect(getSyntropyWireStyling(arrow("w", "r", "a"), resolve)).toBeNull();
  });

  it("returns null when the arrow is already marked syntropyWire", () => {
    const byId = new Map([
      ["a", node("a", "complex")],
      ["b", node("b", "calculus")],
    ]);
    const resolve = (id: string) => byId.get(id);
    const w = arrow("w", "a", "b", { customData: { syntropyWire: true } });
    expect(getSyntropyWireStyling(w, resolve)).toBeNull();
  });

  it("returns null when a binding is missing", () => {
    const byId = new Map([["a", node("a", "complex")]]);
    const resolve = (id: string) => byId.get(id);
    expect(getSyntropyWireStyling(arrow("w", "a", null), resolve)).toBeNull();
    expect(getSyntropyWireStyling(arrow("w", null, "a"), resolve)).toBeNull();
  });
});

describe("styleSyntropyWire", () => {
  it("produces a dashed, diamond-ended wire in the source accent, marked once", () => {
    const upd = styleSyntropyWire(arrow("w", "a", "b"), "#b45fd0");
    expect(upd.strokeStyle).toBe("dashed");
    expect(upd.startArrowhead).toBe("diamond");
    expect(upd.endArrowhead).toBe("diamond");
    expect(upd.strokeColor).toBe("#b45fd0");
    expect(upd.customData.syntropyWire).toBe(true);
  });

  it("preserves existing customData when stamping the marker", () => {
    const w = arrow("w", "a", "b", { customData: { foo: 1 } });
    const upd = styleSyntropyWire(w, "#4f9e82");
    expect(upd.customData.foo).toBe(1);
    expect(upd.customData.syntropyWire).toBe(true);
  });
});

describe("computeLinkedAccent", () => {
  it("returns the source accent for a node an arrow points at", () => {
    const byId = new Map([
      ["a", node("a", "complex")],
      ["b", node("b", "calculus")],
    ]);
    const resolve = (id: string) => byId.get(id);
    expect(computeLinkedAccent("b", [arrow("w", "a", "b")], resolve)).toBe(
      "#b45fd0",
    );
  });

  it("returns null when no arrow targets the node", () => {
    const byId = new Map([
      ["a", node("a", "complex")],
      ["b", node("b", "calculus")],
    ]);
    const resolve = (id: string) => byId.get(id);
    expect(
      computeLinkedAccent("b", [arrow("w", "a", "c")], resolve),
    ).toBeNull();
  });

  it("ignores arrows whose source is not a Syntropy node", () => {
    const byId = new Map([
      ["r", { id: "r", customData: {} }],
      ["b", node("b", "calculus")],
    ]);
    const resolve = (id: string) => byId.get(id);
    expect(computeLinkedAccent("b", [arrow("w", "r", "b")], resolve)).toBeNull();
  });
});

describe("stampLinkedAccent", () => {
  it("writes linkedAccent onto the node's syntropyNode customData and preserves the rest", () => {
    const n = node("b", "calculus");
    const upd = stampLinkedAccent(n, "#b45fd0");
    expect(upd.customData.syntropyNode.linkedAccent).toBe("#b45fd0");
    expect(upd.customData.syntropyNode.engineId).toBe("calculus");
    expect(upd.customData.syntropyNode.methodId).toBe("b-m");
    expect(upd.customData.syntropyNode.name).toBe("b");
  });

  it("clears linkedAccent when passed null", () => {
    const n = node("b", "calculus");
    n.customData.syntropyNode.linkedAccent = "#b45fd0";
    const upd = stampLinkedAccent(n, null);
    expect(upd.customData.syntropyNode.linkedAccent).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd canvas && yarn test:app --watch=false syntropyWire`
Expected: FAIL — `Cannot find module '../syntropy/syntropyWire'`.

- [ ] **Step 3: Write the implementation**

```typescript
// canvas/excalidraw-app/syntropy/syntropyWire.ts
import { ENGINE_ACCENTS, type EngineId } from "./engineAccents";

export type SyntropyNodeData = {
  engineId: EngineId;
  methodId: string;
  name: string;
  linkedAccent?: string | null;
};

// Structural slice of an arrow element that the wire helpers read. Real
// ExcalidrawArrowElements satisfy this; tests pass plain objects.
export type WireCandidate = {
  startBinding: { elementId: string } | null;
  endBinding: { elementId: string } | null;
  customData?: { syntropyWire?: boolean; [key: string]: unknown };
};

type NodeLike = { customData?: { syntropyNode?: SyntropyNodeData } };
type ResolveNode = (id: string) => NodeLike | undefined;

const engineIdOf = (
  resolve: ResolveNode,
  id: string | undefined,
): EngineId | null => {
  if (!id) {
    return null;
  }
  const n = resolve(id);
  return n?.customData?.syntropyNode?.engineId ?? null;
};

/**
 * Returns the SOURCE node's engine accent if `arrow` should be auto-styled
 * as a Syntropy wire — i.e. both its start (source) and end (target) bindings
 * resolve to elements carrying `customData.syntropyNode`, and the arrow is
 * not already marked `customData.syntropyWire`. Otherwise null. The marker
 * is what makes the restyle idempotent (a user can still restyle a wire by
 * hand afterward — we never re-force once it's marked).
 */
export const getSyntropyWireStyling = (
  arrow: WireCandidate,
  resolve: ResolveNode,
): string | null => {
  if (arrow.customData?.syntropyWire) {
    return null;
  }
  const src = engineIdOf(resolve, arrow.startBinding?.elementId);
  const dst = engineIdOf(resolve, arrow.endBinding?.elementId);
  if (!src || !dst) {
    return null;
  }
  return ENGINE_ACCENTS[src];
};

/**
 * The exact element-update partial that restyles an arrow as a Syntropy wire:
 * dashed stroke, diamond port markers at both ends, the source engine's
 * accent as the stroke color, and the one-time `syntropyWire` marker.
 * Existing `customData` is preserved.
 */
export const styleSyntropyWire = (
  arrow: WireCandidate,
  accent: string,
): {
  strokeStyle: "dashed";
  startArrowhead: "diamond";
  endArrowhead: "diamond";
  strokeColor: string;
  customData: { syntropyWire: true } & Record<string, unknown>;
} => ({
  strokeStyle: "dashed",
  startArrowhead: "diamond",
  endArrowhead: "diamond",
  strokeColor: accent,
  customData: { ...(arrow.customData ?? {}), syntropyWire: true },
});

/**
 * Returns the SOURCE engine accent a node is linked FROM — the accent of the
 * first arrow whose endBinding is `nodeId` and whose startBinding resolves to
 * a `customData.syntropyNode` element — or null if nothing wires into it.
 * Drives the target node's first-scrub-chip "linked" reaction. Purely visual:
 * no value is actually read from the source node; this reacts to the wire's
 * existence, matching the mockup.
 */
export const computeLinkedAccent = (
  nodeId: string,
  arrows: ReadonlyArray<WireCandidate>,
  resolve: ResolveNode,
): string | null => {
  for (const a of arrows) {
    if (a.endBinding?.elementId !== nodeId) {
      continue;
    }
    const src = engineIdOf(resolve, a.startBinding?.elementId);
    if (src) {
      return ENGINE_ACCENTS[src];
    }
  }
  return null;
};

/**
 * The element-update partial that writes `linkedAccent` onto a node's
 * `customData.syntropyNode`, preserving engineId/methodId/name and any other
 * top-level customData keys. Pass null to clear (when a wire is deleted).
 */
export const stampLinkedAccent = (
  node: NodeLike,
  accent: string | null,
): { customData: { syntropyNode: SyntropyNodeData } } => ({
  customData: {
    ...(node.customData ?? {}),
    syntropyNode: {
      ...(node.customData?.syntropyNode ?? ({} as SyntropyNodeData)),
      linkedAccent: accent,
    },
  },
});
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd canvas && yarn test:app --watch=false syntropyWire`
Expected: PASS (10 tests).

- [ ] **Step 5: Commit**

```bash
git add canvas/excalidraw-app/syntropy/syntropyWire.ts canvas/excalidraw-app/tests/syntropyWire.test.ts
git commit -m "$(cat <<'EOF'
feat(canvas): add Syntropy wire-detection pure helpers

Four pure, Excalidraw-import-free functions that decide which arrows are
Syntropy wires (both ends bound to customData.syntropyNode elements, not yet
marked) and produce the exact element-update partials to restyle them and to
stamp a target node's linkedAccent. Source = startBinding, target =
endBinding; the wire and the target's linked reaction both use the source
node's engine accent, so a wire leaving a Complex Analysis node is purple
into any other engine's node. The syntropyWire marker makes restyling
idempotent — a user can still restyle a wire by hand afterward. Wired into the
onChange handler in the next task.

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Wire the `onChange` pass + the linked scrub-chip reaction

**Files:**
- Modify: `canvas/excalidraw-app/App.tsx` (imports; the `onChange` handler; the `renderEmbeddable` `syntropyNode` type to include `linkedAccent`)
- Modify: `canvas/excalidraw-app/syntropy/SyntropyNode.tsx` (accept `linkedAccent?: string | null`; render the first scrub chip with the `--linked` modifier + linktag when set)

**Interfaces:**
- Consumes: `getSyntropyWireStyling`, `styleSyntropyWire`, `computeLinkedAccent`, `stampLinkedAccent`, `SyntropyNodeData` from Task 2; `isArrowElement`, `newElementWith` from `@excalidraw/element`; `CaptureUpdateAction` from `@excalidraw/excalidraw` (already imported); the existing `onChange(elements, …)` handler and `excalidrawAPI` in scope.
- Produces: on every scene change, arrows wired between two Syntropy nodes are auto-styled (dashed, diamond port markers, source-engine accent) and marked once; the target node's first scrub chip flips to the linked treatment in the source's accent with a `↦ linked` tag, and reverts when the wire is deleted. Restyling uses `CaptureUpdateAction.NEVER` so auto-styling isn't a separate undo step; the marker prevents re-forcing on later ticks.

- [ ] **Step 1: Add the imports in `App.tsx`**

At the existing `@excalidraw/element` import (line 55–56):
```typescript
import { newElementWith } from "@excalidraw/element";
import { isInitializedImageElement } from "@excalidraw/element";
```
replace with:
```typescript
import {
  isArrowElement,
  isInitializedImageElement,
  newElementWith,
} from "@excalidraw/element";
```

Add a new import alongside the other `./syntropy/…` imports (near the existing `SyntropyNode` import):
```typescript
import {
  computeLinkedAccent,
  getSyntropyWireStyling,
  stampLinkedAccent,
  styleSyntropyWire,
} from "./syntropy/syntropyWire";
```

- [ ] **Step 2: Run the wire/linked pass inside `onChange`**

In the `onChange` function (starts around line 688), immediately AFTER the existing `setActiveEngineId(selectedSyntropyEngine ?? null);` line and BEFORE the `if (collabAPI?.isCollaborating())` check, insert:

```typescript
    // Auto-style arrows wired between Syntropy nodes (dashed, diamond port
    // markers, source-engine accent) and mark the target node's first scrub
    // chip as linked to the source engine's accent. Idempotent: once an
    // arrow carries customData.syntropyWire it's never re-forced, so a user
    // can still restyle a wire by hand afterward. CaptureUpdateAction.NEVER
    // so this auto-styling isn't a separate undo step.
    if (excalidrawAPI) {
      const byId = new Map<string, typeof elements[number]>();
      for (const el of elements) {
        byId.set(el.id, el);
      }
      const resolveNode = (id: string) => byId.get(id);
      const arrows = elements.filter(isArrowElement);
      let wireChanged = false;
      const nextElements = elements.map((el) => {
        if (isArrowElement(el)) {
          const accent = getSyntropyWireStyling(el, resolveNode);
          if (accent) {
            wireChanged = true;
            return newElementWith(el, styleSyntropyWire(el, accent));
          }
          return el;
        }
        if (el.customData?.syntropyNode) {
          const linked = computeLinkedAccent(el.id, arrows, resolveNode);
          const cur = el.customData.syntropyNode.linkedAccent ?? null;
          if (linked !== cur) {
            wireChanged = true;
            return newElementWith(el, stampLinkedAccent(el, linked));
          }
        }
        return el;
      });
      if (wireChanged) {
        excalidrawAPI.updateScene({
          elements: nextElements,
          captureUpdate: CaptureUpdateAction.NEVER,
        });
      }
    }
```

Notes for the implementer:
- `el.customData?.syntropyNode` narrows to the node case; `el.customData.syntropyNode.linkedAccent` is the optional field from `SyntropyNodeData`. If TypeScript complains that `Record<string, any>` has no `linkedAccent`, read it as `el.customData.syntropyNode?.linkedAccent ?? null` — the `?.`/`?? null` path needs no cast because `customData` is `Record<string, any>` (any-indexable).
- `resolveNode` returns `typeof elements[number] | undefined`, whose `customData?: Record<string, any>` is assignable to the helper's `NodeLike` (`customData?: { syntropyNode?: SyntropyNodeData }`) because every property of `SyntropyNodeMarker` is optional and `Record<string, any>` is assignable to it. No cast should be needed; if TS flags it, cast the resolver's return: `(id: string) => byId.get(id) as never` is NOT recommended — instead widen the map's value type at construction: `new Map<string, { customData?: Record<string, any> }>(...)` is also not needed. Trust the structural assignability; it holds.
- This pass runs on every `onChange` tick but does work proportional to the element count (one map build + one filter + one linear scan). It only calls `updateScene` when something actually changed, and the second tick is a no-op (markers/stamps already match), so there's no feedback loop.

- [ ] **Step 3: Pass `linkedAccent` through `renderEmbeddable` to `SyntropyNode`**

In the `renderEmbeddable` prop (around line 1043), widen the `syntropyNode` type to include the optional `linkedAccent` field — change:
```tsx
            const syntropyNode = (
              element.customData as
                | {
                    syntropyNode?: {
                      engineId: EngineId;
                      methodId: string;
                      name: string;
                    };
                  }
                | undefined
            )?.syntropyNode;
```
to:
```tsx
            const syntropyNode = (
              element.customData as
                | {
                    syntropyNode?: {
                      engineId: EngineId;
                      methodId: string;
                      name: string;
                      linkedAccent?: string | null;
                    };
                  }
                | undefined
            )?.syntropyNode;
```

`<SyntropyNode {...syntropyNode} />` already spreads every field, so `linkedAccent` flows through unchanged once the component accepts it (next step).

- [ ] **Step 4: Accept `linkedAccent` and render the linked first scrub chip in `SyntropyNode.tsx`**

Change the component signature and first scrub chip. The full updated file body:

```tsx
import "./SyntropyNode.scss";

import { ENGINE_ACCENTS, type EngineId } from "./engineAccents";

type SyntropyNodeProps = {
  engineId: EngineId;
  methodId: string;
  name: string;
  linkedAccent?: string | null;
};

export const SyntropyNode = ({
  engineId,
  name,
  linkedAccent,
}: SyntropyNodeProps) => {
  const accent = ENGINE_ACCENTS[engineId];

  const firstScrubStyle = {
    "--pct": linkedAccent ? "100%" : "50%",
    ...(linkedAccent ? { "--link-accent": linkedAccent } : {}),
  } as React.CSSProperties;
  const firstScrubClass = `SyntropyNode__scrub${
    linkedAccent ? " SyntropyNode__scrub--linked" : ""
  }`;

  return (
    <div
      className="SyntropyNode"
      style={{ "--node-accent": accent } as React.CSSProperties}
    >
      <span
        className="SyntropyNode__crosshair SyntropyNode__crosshair--tl"
        aria-hidden="true"
      />
      <span
        className="SyntropyNode__crosshair SyntropyNode__crosshair--tr"
        aria-hidden="true"
      />
      <span
        className="SyntropyNode__crosshair SyntropyNode__crosshair--bl"
        aria-hidden="true"
      />
      <span
        className="SyntropyNode__crosshair SyntropyNode__crosshair--br"
        aria-hidden="true"
      />
      <div className="SyntropyNode__header">
        <span className="SyntropyNode__dot" />
        <span className="SyntropyNode__title">{name}</span>
      </div>
      <div className="SyntropyNode__body">
        <div className={firstScrubClass} style={firstScrubStyle}>
          {linkedAccent && (
            <span className="SyntropyNode__scrubLinktag">↦ linked</span>
          )}
          <div className="SyntropyNode__scrubFill" />
          <div className="SyntropyNode__scrubRow">
            <span className="SyntropyNode__scrubLabel">input</span>
            <span className="SyntropyNode__scrubValue">—</span>
          </div>
        </div>
        <div
          className="SyntropyNode__scrub"
          style={{ "--pct": "50%" } as React.CSSProperties}
        >
          <div className="SyntropyNode__scrubFill" />
          <div className="SyntropyNode__scrubRow">
            <span className="SyntropyNode__scrubLabel">input</span>
            <span className="SyntropyNode__scrubValue">—</span>
          </div>
        </div>
        <div className="SyntropyNode__output">
          <div className="SyntropyNode__outRow">
            <span className="SyntropyNode__outKey">output</span>
            <span className="SyntropyNode__outVal">—</span>
          </div>
        </div>
      </div>
    </div>
  );
};
```

- [ ] **Step 5: Boot the dev server and verify wiring end to end**

Run (from `canvas/`, background it): `yarn start`, open `http://localhost:3001/`.

Verify (design verification steps 2 & 3), in order:
1. Spawn two nodes from DIFFERENT engines (e.g. a Complex Analysis node and a Calculus node) via the library panel.
2. Select the arrow tool and draw an arrow from the Complex Analysis node to the Calculus node (start binding on the Complex node, end binding on the Calculus node).
3. Expected: the arrow restyles itself to a dashed stroke with diamond markers at both ends, colored purple (#b45fd0, the Complex/source accent) — not a single fixed teal. The target (Calculus) node's FIRST scrub chip flips to the linked treatment: tinted border + fill in the source (purple) accent, with a small `↦ linked` tag top-right; its second scrub chip and output row are unchanged. The source node's scrub chips stay unlinked.
4. Draw a second arrow in the opposite direction (Calculus → Complex). Expected: that arrow is green (#4f9e82, Calculus/source accent), and the Complex node's first scrub chip flips to linked in green.
5. Manually restyle one wire (select it, change its stroke color in the element properties panel to red). Expected: it turns red and STAYS red — on the next `onChange` tick it is NOT force-reset back to the source accent (the `customData.syntropyWire` marker is respected). Confirm by dragging the wire or any node afterward and re-checking the color.
6. Delete a wire (select it, press Delete). Expected: the target node's first scrub chip reverts from the linked treatment to the normal placeholder chip (the `linkedAccent` stamp is cleared on the next `onChange` tick because `computeLinkedAccent` now returns null for it).
7. Reload the page. Expected: surviving wires and nodes persist with their styling and linked state intact (they're real elements + customData, saved by Excalidraw's existing local-storage path).

- [ ] **Step 6: Check the browser console for errors**

Expected: no errors, no React render warnings.

- [ ] **Step 7: Stop the dev server**

- [ ] **Step 8: Commit**

```bash
git add canvas/excalidraw-app/App.tsx canvas/excalidraw-app/syntropy/SyntropyNode.tsx
git commit -m "$(cat <<'EOF'
feat(canvas): auto-style Syntropy wires and react with linked scrub chips

Inside the already-wired onChange handler, on every scene change: arrows
whose start and end both bind to customData.syntropyNode elements are restyled
dashed with diamond port markers in the SOURCE node's engine accent and
stamped customData.syntropyWire (one-time, so a user can still restyle a wire
by hand afterward); the target node's first scrub chip flips to the linked
treatment in the source accent with a ↦ linked tag, and reverts when the wire
is deleted. updateScene uses CaptureUpdateAction.NEVER so auto-styling isn't a
separate undo step, and the pass is idempotent (markers/stamps match on the
second tick → no feedback loop). renderEmbeddable now passes linkedAccent
through to SyntropyNode, which renders the linked first chip.

Verified end to end: wire auto-styles in the source accent, target's first
chip links in the same accent, manual restyle is preserved (marker respected),
deleting a wire unlinks the target, and everything persists across reload.

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Verify annotations track a real SyntropyNode

**Files:** none (verification only — annotations are native Excalidraw text + bound arrow, never exercised against the new node type before).

- [ ] **Step 1: Boot the dev server**

Run (from `canvas/`, background it): `yarn start`, open `http://localhost:3001/`.

- [ ] **Step 2: Spawn a node and add an annotation**

Spawn any node from the library panel. Select the text tool, type a short note (e.g. "result here"), and use the arrow tool to draw an arrow bound to BOTH the text and the SyntropyNode's output row (start on the text, end on the node — Excalidraw's binding snaps the arrow endpoints to the element when you drop on it). This is exactly the mockup's handwritten-callout shape: freehand text + a bound arrow pointing at a node region.

- [ ] **Step 3: Confirm the annotation tracks the node**

Drag the SyntropyNode to a new position. Expected: the annotation's arrow endpoint follows the node (the binding stays attached), and the text stays where it was put (only the arrow's bound end moves with the node). Drag the text — the arrow's other end follows the text. This is unmodified native Excalidraw behavior; this task only confirms it isn't broken for the new embeddable element type.

- [ ] **Step 4: Confirm wires and annotations coexist**

Draw a Syntropy wire (arrow between two nodes) and a separate annotation arrow pointing at one of those nodes. Expected: the wire auto-styles (dashed/diamond/accent) per Task 3, the annotation arrow does NOT get auto-styled (only one of its endpoints is a SyntropyNode, so `getSyntropyWireStyling` returns null for it), and both behave independently on drag.

- [ ] **Step 5: Stop the dev server**

No commit for this task — it's a verification gate confirming native behavior, not a code change. Record the result (pass/fail) in the task's completion notes; if it FAILS (the annotation arrow does NOT track the node, or the annotation arrow gets wrongly auto-styled), stop and investigate before continuing — that would be a real regression against either Excalidraw's binding for embeddables or the Task 3 detection logic.

---

### Task 5: Full regression check

**Files:** none (verification only).

- [ ] **Step 1: Record the baseline**

Run (from `canvas/`): `yarn test:app --watch=false`
Record the passing/failing/skipped counts BEFORE any of this plan's tasks have run on a clean checkout — i.e. if any task is already applied, this is just the after-count. If you want a true baseline, `git stash` any uncommitted plan work first. Expected: 0 failures (the prior node-shell plan left the suite green at 123 files / 1830 passed / 48 skipped — the exact numbers may have drifted; the requirement is 0 failures, plus this plan's new 10 `syntropyWire` tests passing).

- [ ] **Step 2: Run the full suite with this plan's work applied**

Run (from `canvas/`): `yarn test:app --watch=false`
Expected: 0 failures, with the 10 new `syntropyWire` tests (Task 2) passing alongside the existing `engineAccents` tests. The 3 pre-existing tests (`engineAccents`) and all snapshot/interaction tests must still pass.

- [ ] **Step 3: If anything regressed**

Stop and investigate before finishing. Likely failure modes given this plan's changes:
- A snapshot test in `excalidraw-app/tests` that captures `App.tsx`'s rendered props or the `onChange` body — if so, inspect the diff: it should be exactly the new wire/linked pass + the `renderEmbeddable` type widening, nothing else. Only accept the snapshot update (`yarn test:update --watch=false <file>`) once the diff is confirmed to be exactly this plan's change.
- A test that asserts the number of `updateScene` calls inside `onChange` — the new pass only calls `updateScene` when a wire/linked change is detected, which existing tests (which don't create Syntropy nodes or wires) won't trigger. If such a test fails, confirm the new call is gated behind `if (wireChanged)` and the test's scenario doesn't actually create a wire.

No commit for this task — it's a verification gate.

---

### Task 6: Flowing dashes (STRETCH — GO / NO-GO gate, NOT required for approval)

This task is optional. The plan is complete and shippable with Tasks 1–5. Do NOT attempt this task unless the human reviewer explicitly opts in at the execution gate. It is called out separately because it's the one piece with a real, if small, performance cost (a recurring re-render while any wire is on the board).

- [ ] **Step 1: Make the GO / NO-GO decision**

The design spec describes flowing dashes as "AnimationController can drive a periodically-incrementing dash offset for elements carrying customData.syntropyWire." That mechanism is NOT free in this fork: arrow strokes are drawn by roughjs in `packages/element/src/shape.ts` with a baked-in `strokeLineDash` (see `getDashArrayDashed` at line 167), and roughjs has no per-call dash-offset option — so animating the offset requires either:
  - (a) modifying `packages/element/src/shape.ts` (and/or the linear-element render path in `packages/excalidraw/renderer/`) to read a per-element offset and re-generate the dashed stroke each frame, driven by an `AnimationController` animation that bumps the offset on `syntropyWire` elements via `updateScene` — a real change to the fork's renderer, against the spirit of the "no fork internals" constraint, OR
  - (b) drawing an animated dashed overlay on the interactive canvas (where `lineDashOffset` already works, see `packages/excalidraw/renderer/interactiveScene.ts:800`), layered over each wire — complex, and risks double-drawing.

**Default recommendation: NO-GO.** Defer flowing dashes to the later computation phase, where wires will be re-rendered for real data flow anyway and the dash animation can ride that work. The static dashed wires from Task 3 already read correctly per the mockup. If the reviewer says GO, proceed to Step 2; otherwise skip the rest of this task and the plan is done.

- [ ] **Step 2 (only if GO): Implement the dash-offset animation**

Sketch (the implementer fills in against the current renderer at execution time): register an `AnimationController.start("syntropy-wire-flow", …)` animation, started when the `onChange` pass first detects a `syntropyWire` element and cancelled when none remain (`AnimationController.running`/`cancel`, the same pattern as `packages/excalidraw/animatedTrail.ts:95-110`). The animation increments a per-wire offset stored on `customData.syntropyWire.offset` and calls `updateScene({ elements, captureUpdate: CaptureUpdateAction.NEVER })` each frame. Modify `packages/element/src/shape.ts`'s dashed branch to apply `context.lineDashOffset` (or the roughjs-equivalent) from that offset when present. Gate the whole thing behind a `requestAnimationFrame`-throttled, "only while a wire exists" check, and measure the re-render cost on a board with ~20 wires before accepting.

- [ ] **Step 3 (only if GO): Verify and commit**

Boot the dev server, draw a Syntropy wire, confirm the dashes flow along the wire continuously; confirm the animation stops (no continued re-renders) once all wires are deleted (check the performance/raf meter is idle). Then commit with a message noting the renderer change and the perf tradeoff. If the cost is unacceptable on the ~20-wire board, revert this task and leave the static dashed wires — that's the documented fallback.