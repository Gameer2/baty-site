# Syntropy Node Archetype Redesign — Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the one-card-fits-all Syntropy node (`SyntropyNodeCard`) with a dispatching shell + archetype bodies, and enrich the port output type system — without changing any node's appearance or behavior.

**Architecture:** Split `SyntropyNodeCard` into `NodeShell` (shared chrome: header, accent, portal, port dots) + `ScalarNode` (the current body, now one archetype) + a dispatcher (`NodeBody`) that `NodeOverlay` renders instead. Enrich `PortOutputKind` (add `trace`/`curve`/`matrix`/`eigenpairs`/`field`/`distribution`; rename `plot2d`→`curve`) and `PortInputKind` (add `point`), and widen wire compatibility to kind-equal. No spec's `compute()` changes; no node looks different. This is the non-regressing prerequisite that unblocks the per-archetype follow-on plans (Trace, Real-line, Matrix grid, Field, Distribution).

**Tech Stack:** TypeScript, React 19, Vitest + @testing-library/react, SCSS. Run from `canvas/` via `yarn test:app` (vitest), `yarn test:typecheck` (tsc), `yarn test:code` (eslint).

**Spec:** `docs/superpowers/specs/2026-08-14-syntropy-node-archetype-redesign-design.md`

## Global Constraints

- One-algorithm-one-file: never reimplement method math in a node — `compute()` bodies stay untouched across this plan.
- Port-dot DOM contract is load-bearing: every port dot must keep `data-syntropy-port` (`"input"`|`"output"`), `data-port-node-id`, `data-port-key`. `NodeOverlay.tsx` queries `[data-syntropy-port]` to measure port screen positions for wiring; dropping any attribute breaks wiring silently.
- `NodeOverlay` owns the drag-to-wire state machine; nodes only report `onOutputPortPointerDown(outputKey, event)`. Do not move wire-drag logic into node components.
- Premium chrome (radial glow, 3px accent spine, fill-sweep portal, glowing half-in/half-out port dots, inputs-as-wells, cubic-bezier easing, mobile 16px guard) already lives in `SyntropyNodeCard.scss` — preserve every value, only move/rename selectors. No crosshair corners (explicitly rejected by the user).
- All 90 registered specs must keep rendering identically. `yarn test:typecheck && yarn test:app --run && yarn test:code` must be green at every commit.

## File Structure

New files (all under `canvas/excalidraw-app/syntropy/nodes/` unless noted):

- `nodes/NodeShell.tsx` — shared chrome: root div with `--node-accent`, header (dot + title + portal), body wrapper, error slot. Plus `PortDot` (the one component that owns the `data-syntropy-port` contract).
- `nodes/NodeShell.scss` — chrome styles moved from `SyntropyNodeCard.scss` (root, `::before` glow, `::after` spine, header, dot, title, portal, body, error, port dot, focus ring, mobile guard).
- `nodes/ScalarNode.tsx` — the current card body as the `scalar` archetype: local-state inputs, `handleInputChange`, wired-input merge, `spec.compute`, scrub chips, plot (`RiemannPlot`), number/text output rows with output port dots.
- `nodes/ScalarNode.scss` — scrub-chip + output-row + plot-wrapper styles moved from `SyntropyNodeCard.scss`.
- `nodes/dispatch.ts` — `Archetype` type, `PORT_OUTPUT_KINDS`-derived `archetypeFromSpec(spec)`, and the `NodeBody` React component that `NodeOverlay` renders (picks the archetype body; v1 routes every archetype to `ScalarNode`).
- `tests/nodes/dispatch.test.tsx` — archetype derivation + `NodeBody` rendering + port-dot contract.
- `tests/nodes/ScalarNode.test.tsx` — the existing `SyntropyNodeCard.test.tsx` assertions, ported.

Modified files:

- `syntropy/portSpecs/types.ts` — enrich `PortOutputKind`/`PortInputKind` (derived from exported runtime arrays).
- `syntropy/portSpecs/registry.ts` — export `ALL_PORT_SPECS` for the contract test.
- `syntropy/portSpecs/riemannSums.ts` — `plot2d`→`curve` on the `rectangles` output.
- `syntropy/nodeGeometry.ts` — `hasPlot` checks `"curve"` not `"plot2d"`.
- `syntropy/wiring.ts` — widen `compatibleTargetInputKeys` to kind-equal; update the `plot2d` comment.
- `syntropy/NodeOverlay.tsx` — render `NodeBody` instead of `SyntropyNodeCard`.
- `syntropy/RiemannPlot.tsx` + new `syntropy/RiemannPlot.scss` — move its styles out of `SyntropyNodeCard.scss`.
- `tests/nodeGeometry.test.ts` — `plot2d`→`curve` in the height-reservation test.
- `tests/wiring.test.ts` — `plot2d`→`curve` in the source-output test.

Deleted files (last task, after nothing imports them):

- `syntropy/SyntropyNodeCard.tsx`, `syntropy/SyntropyNodeCard.scss`, `tests/SyntropyNodeCard.test.tsx`.

## Out of scope (follow-on plans, one per archetype)

These are listed so the foundation's "v1 routes every archetype to ScalarNode" fallback is understood as temporary, not permanent:

- **Trace plan:** `TraceNode.tsx` (step table + trajectory plot), migrate the ~18 root-finder / iterative specs to emit a `trace` output.
- **Real-line plan:** `RealLineNode.tsx` (curve + partition/data overlay), migrate riemann + quadrature + interpolation + least-squares / regression specs to `curve`.
- **Matrix grid plan:** `MatrixNode.tsx` (editable cell grid + factor grids), migrate the ~18 linear-algebra specs to `matrix`/`eigenpairs`.
- **Field plan:** `FieldNode.tsx` (slope field + solution curve), migrate shooting/BVP/linear-transformations; lands the not-yet-registered ODE/PDE methods when their async `run` mode unblocks.
- **Distribution plan:** `DistributionNode.tsx` (pdf/pmf + shaded tail), migrate the 12 statistics specs.
- **Scalar plan:** `ScalarNode.tsx` premium polish + migrate the ~29 number-theory + scalar-output specs' output declarations.

Each follow-on removes the `NodeBody` fallback for its archetype and migrates its specs' `outputs[]`.

---

### Task 1: Enrich the port kind type system + contract test

**Files:**
- Modify: `canvas/excalidraw-app/syntropy/portSpecs/types.ts`
- Modify: `canvas/excalidraw-app/syntropy/portSpecs/registry.ts`
- Modify: `canvas/excalidraw-app/syntropy/portSpecs/riemannSums.ts:40`
- Modify: `canvas/excalidraw-app/syntropy/nodeGeometry.ts:18`
- Modify: `canvas/excalidraw-app/syntropy/wiring.ts:110` (comment only)
- Modify: `canvas/excalidraw-app/tests/nodeGeometry.test.ts:12`
- Modify: `canvas/excalidraw-app/tests/wiring.test.ts:117`
- Test: `canvas/excalidraw-app/tests/portSpecsContract.test.ts`

**Interfaces:**
- Produces: `PORT_INPUT_KINDS` and `PORT_OUTPUT_KINDS` (readonly const arrays, in `types.ts`); `PortInputKind`/`PortOutputKind` derived from them; `ALL_PORT_SPECS: PortSpec[]` (in `registry.ts`). Later tasks consume `PORT_OUTPUT_KINDS` for dispatch.

- [ ] **Step 1: Write the failing contract test**

Create `canvas/excalidraw-app/tests/portSpecsContract.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { ALL_PORT_SPECS } from "../syntropy/portSpecs/registry";
import {
  PORT_INPUT_KINDS,
  PORT_OUTPUT_KINDS,
} from "../syntropy/portSpecs/types";

const INPUT_KINDS = new Set(PORT_INPUT_KINDS);
const OUTPUT_KINDS = new Set(PORT_OUTPUT_KINDS);

describe("port spec contract", () => {
  it("every registered spec declares only valid input and output kinds", () => {
    for (const spec of ALL_PORT_SPECS) {
      for (const input of spec.inputs) {
        expect(
          INPUT_KINDS.has(input.kind),
          `${spec.engineId}:${spec.methodId} input "${input.key}" has invalid kind "${input.kind}"`,
        ).toBe(true);
      }
      for (const output of spec.outputs) {
        expect(
          OUTPUT_KINDS.has(output.kind),
          `${spec.engineId}:${spec.methodId} output "${output.key}" has invalid kind "${output.kind}"`,
        ).toBe(true);
      }
    }
  });

  it("the new rich output kinds are declared (trace/curve/matrix/eigenpairs/field/distribution)", () => {
    for (const kind of [
      "trace",
      "curve",
      "matrix",
      "eigenpairs",
      "field",
      "distribution",
    ] as const) {
      expect(OUTPUT_KINDS.has(kind)).toBe(true);
    }
  });

  it("plot2d is no longer a declared kind", () => {
    expect(OUTPUT_KINDS.has("plot2d" as never)).toBe(false);
  });

  it("point is a declared input kind", () => {
    expect(INPUT_KINDS.has("point")).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd canvas && yarn test:app --run excalidraw-app/tests/portSpecsContract.test.ts`
Expected: FAIL — `PORT_INPUT_KINDS`/`PORT_OUTPUT_KINDS`/`ALL_PORT_SPECS` not exported; `plot2d` still declared.

- [ ] **Step 3: Enrich the kind unions in types.ts**

Replace the `PortInputKind` and `PortOutputKind` declarations in `canvas/excalidraw-app/syntropy/portSpecs/types.ts` with:

```ts
// Runtime arrays drive both the type union and the dispatch/contract checks. Add a kind here
// and it flows to PortInputKind/PortOutputKind, the dispatch map, and the contract test
// automatically.
export const PORT_INPUT_KINDS = [
  "expression",
  "number",
  // "points"/"coeffs"/"vector" default to (and, once edited via the node's generic text input,
  // always become) a comma/semicolon-delimited string — "0,1;1,3;2,2" for points, "1,-2,3" for
  // coeffs/vector — parsed by each compute() via portSpecs/parseComposite.ts. The default may
  // start as a real number[]/number[][] (nicer to author), which the parser also accepts, but the
  // node always writes back a string after the first edit.
  "points",
  "coeffs",
  "vector",
  "matrix",
  // "expressions": semicolon-separated multi-variable expression strings (x1..xn scope), e.g.
  // "x1^2+x2^2-2;x1-x2" — a system F(x)=0, one equation per node the vector-system methods
  // (Newton's method for systems, Broyden's method) solve for.
  "expressions",
  // "point": a single draggable point on a canvas (a field's initial condition, an ODE's
  // starting state). Wired point→point; not a composite string like "points".
  "point",
] as const;

export type PortInputKind = (typeof PORT_INPUT_KINDS)[number];

export const PORT_OUTPUT_KINDS = [
  "number", // single scalar
  "trace", // iteration rows: { i, point, residual, … }[]
  "curve", // sampled f over [a,b] + optional partition/data overlay (was "plot2d")
  "matrix", // number[][]  (one or more named factors)
  "eigenpairs", // { lambda, vector }[]
  "field", // slope samples + solution path
  "distribution", // { x, pdf, cdf }[] + params
  // "text": a short string result with no numeric meaning (a ciphertext, say) — rendered as-is
  // instead of the node's `.toFixed(3)` number formatting. Kept separate from "number" rather
  // than a display heuristic on the value's type, since a method that legitimately returns
  // digits-as-a-string (e.g. a large BigInt rendered for exact display) still wants text formatting.
  "text",
] as const;

export type PortOutputKind = (typeof PORT_OUTPUT_KINDS)[number];
```

Keep the rest of `types.ts` (`PortInput`, `PortOutput`, `ComputeResult`, `PortSpec`) unchanged.

- [ ] **Step 4: Export ALL_PORT_SPECS from registry.ts**

In `canvas/excalidraw-app/syntropy/portSpecs/registry.ts`, after the `REGISTRY` const, add:

```ts
/** Every registered spec — used by the contract test (tests/portSpecsContract.test.ts) to
 *  validate declared kinds across the whole registry at once. */
export const ALL_PORT_SPECS: PortSpec[] = Object.values(REGISTRY);
```

- [ ] **Step 5: Rename plot2d→curve in the three source sites and two tests**

In `canvas/excalidraw-app/syntropy/portSpecs/riemannSums.ts:40` change:

```ts
    { key: "rectangles", label: "plot", kind: "plot2d" },
```
to:
```ts
    { key: "rectangles", label: "plot", kind: "curve" },
```

In `canvas/excalidraw-app/syntropy/nodeGeometry.ts:18` change:

```ts
  const hasPlot = spec.outputs.some((o) => o.kind === "plot2d");
```
to:
```ts
  const hasPlot = spec.outputs.some((o) => o.kind === "curve");
```

In `canvas/excalidraw-app/syntropy/wiring.ts:110` (the doc comment) change `plot2d outputs aren't wireable` to `curve outputs aren't wireable`.

In `canvas/excalidraw-app/tests/nodeGeometry.test.ts:12` change the test description `"reserves extra height for a spec with a plot2d output"` to `"reserves extra height for a spec with a curve output"`. (Read the file first; if the test body constructs a spec with `kind: "plot2d"`, change that to `"curve"` too.)

In `canvas/excalidraw-app/tests/wiring.test.ts:117` change the test description `"returns nothing for a plot2d source output"` to `"returns nothing for a curve source output"`. The test calls `compatibleTargetInputKeys(RIEMANN_SUMS_PORT_SPEC, "rectangles", …)` — that still works because `rectangles` is now `curve`-kind and (until Task 6) `curve` is not `number`, so the result stays `[]`. No body change needed beyond the description.

- [ ] **Step 6: Run the contract test + the two renamed tests to verify pass**

Run:
```
cd canvas && yarn test:app --run excalidraw-app/tests/portSpecsContract.test.ts excalidraw-app/tests/nodeGeometry.test.ts excalidraw-app/tests/wiring.test.ts
```
Expected: PASS — all 90 specs declare valid kinds; `plot2d` gone; rich kinds + `point` present; riemann now `curve`; height reservation + wiring source tests still green.

- [ ] **Step 7: Typecheck + lint**

Run: `cd canvas && yarn test:typecheck && yarn test:code`
Expected: PASS. (`tsc` will surface any other `plot2d` reference missed in Step 5 — fix them the same way.)

- [ ] **Step 8: Commit**

```bash
cd canvas && git add excalidraw-app/syntropy/portSpecs/types.ts excalidraw-app/syntropy/portSpecs/registry.ts excalidraw-app/syntropy/portSpecs/riemannSums.ts excalidraw-app/syntropy/nodeGeometry.ts excalidraw-app/syntropy/wiring.ts excalidraw-app/tests/nodeGeometry.test.ts excalidraw-app/tests/wiring.test.ts excalidraw-app/tests/portSpecsContract.test.ts
git commit -m "feat(syntropy): enrich port kind type system, rename plot2d→curve

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 2: Archetype dispatch helper + test

**Files:**
- Create: `canvas/excalidraw-app/syntropy/nodes/dispatch.ts`
- Test: `canvas/excalidraw-app/tests/nodes/dispatch.test.ts`

**Interfaces:**
- Consumes: `PortSpec`, `PortOutputKind` from `../portSpecs/types`.
- Produces: `export type Archetype = "trace" | "real-line" | "matrix" | "field" | "distribution" | "scalar";` and `export function archetypeFromSpec(spec: PortSpec): Archetype;`. (`NodeBody` comes in Task 5 — this task is logic only, fully unit-testable without React.)

- [ ] **Step 1: Write the failing test**

Create `canvas/excalidraw-app/tests/nodes/dispatch.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { archetypeFromSpec } from "../../syntropy/nodes/dispatch";
import { RIEMANN_SUMS_PORT_SPEC } from "../../syntropy/portSpecs/riemannSums";
import { NEWTON_RAPHSON_PORT_SPEC } from "../../syntropy/portSpecs/newtonRaphson";

import type { PortSpec } from "../../syntropy/portSpecs/types";

const specWith = (kinds: string[]): PortSpec =>
  ({
    engineId: "numerical",
    methodId: "x",
    inputs: [],
    outputs: kinds.map((k, i) => ({ key: `o${i}`, label: `o${i}`, kind: k as never })),
    compute: () => ({ outputs: {} }),
    executionMode: "live",
    pagePath: "/x",
    pageStoreKey: "x",
  }) as PortSpec;

describe("archetypeFromSpec", () => {
  it("derives trace from a trace output", () => {
    expect(archetypeFromSpec(specWith(["trace", "number"]))).toBe("trace");
  });
  it("derives real-line from a curve output", () => {
    expect(archetypeFromSpec(specWith(["curve"]))).toBe("real-line");
  });
  it("derives matrix from a matrix output", () => {
    expect(archetypeFromSpec(specWith(["matrix"]))).toBe("matrix");
  });
  it("derives matrix from an eigenpairs output", () => {
    expect(archetypeFromSpec(specWith(["eigenpairs"]))).toBe("matrix");
  });
  it("derives field from a field output", () => {
    expect(archetypeFromSpec(specWith(["field"]))).toBe("field");
  });
  it("derives distribution from a distribution output", () => {
    expect(archetypeFromSpec(specWith(["distribution"]))).toBe("distribution");
  });
  it("falls back to scalar when only number/text outputs remain", () => {
    expect(archetypeFromSpec(specWith(["number", "text"]))).toBe("scalar");
  });
  it("falls back to scalar when there are no outputs", () => {
    expect(archetypeFromSpec(specWith([]))).toBe("scalar");
  });
  it("a number output alongside a rich kind still derives the rich archetype", () => {
    expect(archetypeFromSpec(specWith(["number", "trace"]))).toBe("trace");
  });

  it("riemann (curve) is real-line, newton-raphson (number-only) is scalar", () => {
    expect(archetypeFromSpec(RIEMANN_SUMS_PORT_SPEC)).toBe("real-line");
    expect(archetypeFromSpec(NEWTON_RAPHSON_PORT_SPEC)).toBe("scalar");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd canvas && yarn test:app --run excalidraw-app/tests/nodes/dispatch.test.ts`
Expected: FAIL — `archetypeFromSpec` not defined.

- [ ] **Step 3: Implement dispatch.ts**

Create `canvas/excalidraw-app/syntropy/nodes/dispatch.ts`:

```ts
import type { PortSpec } from "../portSpecs/types";

/** The six visualization archetypes — see
 *  docs/superpowers/specs/2026-08-14-syntropy-node-archetype-redesign-design.md. */
export type Archetype =
  | "trace"
  | "real-line"
  | "matrix"
  | "field"
  | "distribution"
  | "scalar";

// First rich (non-number, non-text) output kind wins. A spec may carry a `number` summary
// alongside its rich output (LU emits matrix factors AND a number det) — the number must not
// mask the archetype. number/text-only specs are scalar.
const ARCHETYPE_BY_KIND: Record<string, Archetype> = {
  trace: "trace",
  curve: "real-line",
  matrix: "matrix",
  eigenpairs: "matrix",
  field: "field",
  distribution: "distribution",
};

/** Picks a node's archetype from its declared outputs. The dispatcher (`NodeBody`) reads this to
 *  choose the body renderer; v1 routes every archetype to `ScalarNode` until the per-archetype
 *  renderers land in their follow-on plans. */
export const archetypeFromSpec = (spec: PortSpec): Archetype => {
  for (const output of spec.outputs) {
    const arch = ARCHETYPE_BY_KIND[output.kind];
    if (arch) {
      return arch;
    }
  }
  return "scalar";
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd canvas && yarn test:app --run excalidraw-app/tests/nodes/dispatch.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd canvas && git add excalidraw-app/syntropy/nodes/dispatch.ts excalidraw-app/tests/nodes/dispatch.test.ts
git commit -m "feat(syntropy): add archetypeFromSpec dispatch helper

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 3: NodeShell (shared chrome + PortDot) + styles + test

**Files:**
- Create: `canvas/excalidraw-app/syntropy/nodes/NodeShell.tsx`
- Create: `canvas/excalidraw-app/syntropy/nodes/NodeShell.scss`
- Test: `canvas/excalidraw-app/tests/nodes/NodeShell.test.tsx`

**Interfaces:**
- Produces: `NodeShell` (props: `name`, `accent`, `nodeId`, `spec`, `onPortalClick`, `children`, `className?`) and `PortDot` (props: `role: "input"|"output"`, `nodeId`, `portKey`, `kind`, `onPointerDown?`, `className?`). `PortDot` is what every archetype uses to render a port dot so the `data-syntropy-port` contract is owned in one place.

- [ ] **Step 1: Write the failing test**

Create `canvas/excalidraw-app/tests/nodes/NodeShell.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { NodeShell, PortDot } from "../../syntropy/nodes/NodeShell";

import type { PortSpec } from "../../syntropy/portSpecs/types";

const SPEC = {
  engineId: "numerical",
  methodId: "x",
  inputs: [],
  outputs: [],
  compute: () => ({ outputs: {} }),
  executionMode: "live",
  pagePath: "/x",
  pageStoreKey: "x",
} as unknown as PortSpec;

describe("NodeShell", () => {
  it("renders the node title and an Open portal that fires onPortalClick", () => {
    const onPortalClick = vi.fn();
    render(
      <NodeShell name="Newton" accent="#5c939f" nodeId="n1" spec={SPEC} onPortalClick={onPortalClick}>
        <p>body</p>
      </NodeShell>,
    );
    expect(screen.getByText("Newton")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /open/i }));
    expect(onPortalClick).toHaveBeenCalledTimes(1);
  });

  it("sets the --node-accent CSS variable on the root", () => {
    const { container } = render(
      <NodeShell name="N" accent="#abcdef" nodeId="n1" spec={SPEC} onPortalClick={() => {}}>
        <p />
      </NodeShell>,
    );
    const root = container.firstChild as HTMLElement;
    expect(root.style.getPropertyValue("--node-accent")).toBe("#abcdef");
  });
});

describe("PortDot", () => {
  it("emits the wiring contract data attributes for an input port", () => {
    const { container } = render(
      <PortDot role="input" nodeId="n1" portKey="x0" kind="number" />,
    );
    const dot = container.querySelector('[data-syntropy-port="input"]');
    expect(dot).toBeTruthy();
    expect(dot?.getAttribute("data-port-node-id")).toBe("n1");
    expect(dot?.getAttribute("data-port-key")).toBe("x0");
  });

  it("reports pointerdown with nothing extra (NodeOverlay owns the drag state machine)", () => {
    const onPointerDown = vi.fn();
    const { container } = render(
      <PortDot
        role="output"
        nodeId="n1"
        portKey="root"
        kind="number"
        onPointerDown={onPointerDown}
      />,
    );
    const dot = container.querySelector('[data-syntropy-port="output"]')!;
    fireEvent.pointerDown(dot);
    expect(onPointerDown).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd canvas && yarn test:app --run excalidraw-app/tests/nodes/NodeShell.test.tsx`
Expected: FAIL — `NodeShell`/`PortDot` not exported.

- [ ] **Step 3: Move the chrome SCSS into NodeShell.scss**

Read `canvas/excalidraw-app/syntropy/SyntropyNodeCard.scss` in full. Move these selectors (renaming the BEM root `SyntropyNodeCard__` → `NodeShell__`) into a new `canvas/excalidraw-app/syntropy/nodes/NodeShell.scss`, keeping every declaration value unchanged:

- `.SyntropyNodeCard` (root + `--node-accent`, `::before` radial glow, `::after` accent spine, hover/border, pointer-events, box-shadow, transition) → `.NodeShell`
- `.SyntropyNodeCard__header` → `.NodeShell__header`
- `.SyntropyNodeCard__dot` → `.NodeShell__dot`
- `.SyntropyNodeCard__title` → `.NodeShell__title`
- `.SyntropyNodeCard__portal` (+ `::before` fill-sweep, `:hover`) → `.NodeShell__portal`
- `.SyntropyNodeCard__body` → `.NodeShell__body`
- `.SyntropyNodeCard__error` → `.NodeShell__error`
- `.SyntropyNodeCard__port` / `--input` / `--output` / `:hover` / focus → `.NodeShell__port` / `--input` / `--output` / `:hover` (the shared port-dot look)
- any mobile 16px-font guard that scopes the whole card

Leave the scrub-chip, output-row, and plot-wrapper selectors in `SyntropyNodeCard.scss` for now (Task 4 moves them). Do not delete `SyntropyNodeCard.scss` yet.

- [ ] **Step 4: Implement NodeShell.tsx**

Create `canvas/excalidraw-app/syntropy/nodes/NodeShell.tsx`:

```tsx
import "./NodeShell.scss";

import type { PortOutputKind, PortSpec } from "../portSpecs/types";

type NodeShellProps = {
  name: string;
  accent: string;
  nodeId: string;
  spec: PortSpec;
  onPortalClick: () => void;
  children: React.ReactNode;
  className?: string;
};

/** Shared chrome for every archetype: header (engine dot + title + portal), body wrapper, error
 *  slot. The premium shell (radial glow, accent spine, fill-sweep portal) lives in NodeShell.scss
 *  — moved verbatim from SyntropyNodeCard.scss. No crosshair corners (explicitly rejected). */
export const NodeShell = ({
  name,
  accent,
  nodeId,
  spec,
  onPortalClick,
  children,
  className,
}: NodeShellProps) => (
  <div
    className={`NodeShell${className ? ` ${className}` : ""}`}
    style={{ "--node-accent": accent } as React.CSSProperties}
    data-node-id={nodeId}
  >
    <div className="NodeShell__header">
      <span className="NodeShell__dot" />
      <span className="NodeShell__title">{name}</span>
      <button
        type="button"
        className="NodeShell__portal"
        aria-label={`Open ${name} in the lab`}
        onClick={onPortalClick}
      >
        Open ↗
      </button>
    </div>
    <div className="NodeShell__body">{children}</div>
  </div>
);

type PortDotProps = {
  role: "input" | "output";
  nodeId: string;
  portKey: string;
  kind: PortOutputKind;
  onPointerDown?: (event: React.PointerEvent<HTMLSpanElement>) => void;
  className?: string;
};

/** The one component that owns the wiring DOM contract. `NodeOverlay.tsx` queries
 *  `[data-syntropy-port]` and reads `data-port-node-id` / `data-port-key` to measure port screen
 *  positions and resolve drag-to-wire drops — every archetype renders its port dots through
 *  this so the contract can't drift. */
export const PortDot = ({
  role,
  nodeId,
  portKey,
  onPointerDown,
  className,
}: PortDotProps) => (
  <span
    className={`NodeShell__port NodeShell__port--${role}${className ? ` ${className}` : ""}`}
    data-syntropy-port={role}
    data-port-node-id={nodeId}
    data-port-key={portKey}
    onPointerDown={onPointerDown}
    role={role === "output" ? "button" : undefined}
    tabIndex={role === "output" ? -1 : undefined}
    aria-hidden={role === "input" ? true : undefined}
    aria-label={
      role === "output" ? `Drag to wire ${portKey} to another node` : undefined
    }
  />
);
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd canvas && yarn test:app --run excalidraw-app/tests/nodes/NodeShell.test.tsx`
Expected: PASS.

- [ ] **Step 6: Typecheck + lint**

Run: `cd canvas && yarn test:typecheck && yarn test:code`
Expected: PASS. (The old `SyntropyNodeCard.scss` still has the scrub/output selectors — fine, unused-but-present SCSS doesn't fail tsc; eslint doesn't lint scss.)

- [ ] **Step 7: Commit**

```bash
cd canvas && git add excalidraw-app/syntropy/nodes/NodeShell.tsx excalidraw-app/syntropy/nodes/NodeShell.scss excalidraw-app/tests/nodes/NodeShell.test.tsx
git commit -m "feat(syntropy): extract NodeShell chrome + PortDot from SyntropyNodeCard

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 4: ScalarNode (the body, as the scalar archetype) + styles + test

**Files:**
- Create: `canvas/excalidraw-app/syntropy/nodes/ScalarNode.tsx`
- Create: `canvas/excalidraw-app/syntropy/nodes/ScalarNode.scss`
- Create: `canvas/excalidraw-app/syntropy/RiemannPlot.scss` (move RiemannPlot styles out of `SyntropyNodeCard.scss`)
- Modify: `canvas/excalidraw-app/syntropy/RiemannPlot.tsx` (import the new scss)
- Test: `canvas/excalidraw-app/tests/nodes/ScalarNode.test.tsx`

**Interfaces:**
- Consumes: `NodeShell`, `PortDot` from `./NodeShell`; `RiemannPlot` from `../RiemannPlot`; `openMethodPage` from `../portalPrefill`; `WiredComputeResult` from `../wiring`; `PortInputKind`, `PortSpec` from `../portSpecs/types`.
- Produces: `ScalarNode` (props identical to the current `SyntropyNodeCard`: `nodeId`, `spec`, `name`, `accent`, `inputs`, `onInputsChange`, `computedResult`, `onOutputPortPointerDown`, `readOnly?`). This is the prop signature `NodeBody` (Task 5) and `NodeOverlay` will pass through.

- [ ] **Step 1: Write the failing test (port of SyntropyNodeCard.test.tsx)**

Create `canvas/excalidraw-app/tests/nodes/ScalarNode.test.tsx` — identical assertions to `canvas/excalidraw-app/tests/SyntropyNodeCard.test.tsx`, but importing `ScalarNode` instead of `SyntropyNodeCard` and using the new class names where the assertions touch them. Concretely, copy `SyntropyNodeCard.test.tsx` and make these changes:

- `import { SyntropyNodeCard } from "../syntropy/SyntropyNodeCard";` → `import { ScalarNode } from "../../syntropy/nodes/ScalarNode";`
- Every `<SyntropyNodeCard … />` JSX → `<ScalarNode … />`.
- The `getByRole("button", { name: /open/i })` portal assertion and `getByDisplayValue` / `getByLabelText` / `getByText` queries are unchanged (they target accessible names + values, not class names).
- The `container.querySelector('[data-syntropy-port="output"][data-port-key="total"]')` and `'[data-syntropy-port="input"][data-port-key="…"]'` queries are unchanged — `PortDot` emits the same data attributes.
- Keep `RIEMANN_SUMS_PORT_SPEC` and `WiredComputeResult` imports (paths adjusted to `../../syntropy/...`).

The seven cases to carry over: renders one scrub chip per input seeded from current values; shows the computed result; calls `onInputsChange` on edit; calls `openMethodPage` (via `window.open` spy) on portal click; renders a wired input read-only showing the upstream value; renders a draggable output port dot and reports pointerdown with its key; renders an input port dot only for number-kind inputs.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd canvas && yarn test:app --run excalidraw-app/tests/nodes/ScalarNode.test.tsx`
Expected: FAIL — `ScalarNode` not defined.

- [ ] **Step 3: Move the body SCSS**

From `canvas/excalidraw-app/syntropy/SyntropyNodeCard.scss`, move (renaming `SyntropyNodeCard__` → `ScalarNode__`, values unchanged) into `canvas/excalidraw-app/syntropy/nodes/ScalarNode.scss`:
- `.SyntropyNodeCard__scrub` / `--wired` / `scrubRow` / `scrubLabel` / `scrubValue` / `wireMark` → `.ScalarNode__scrub` etc.
- `.SyntropyNodeCard__output` / `outRow` / `outKey` / `outVal` → `.ScalarNode__output` etc.
- `.SyntropyNodeCard__plot` → `.ScalarNode__plot`

Move the RiemannPlot-specific selectors (`.RiemannPlot`, `.RiemannPlot__empty`, and any `.SyntropyNodeCard__plot .RiemannPlot` compound) into a new `canvas/excalidraw-app/syntropy/RiemannPlot.scss`.

In `canvas/excalidraw-app/syntropy/RiemannPlot.tsx`, add `import "./RiemannPlot.scss";` at the top (the component itself is unchanged).

After these moves, `SyntropyNodeCard.scss` should be empty (or only contain duplicated selectors that were already moved in Task 3) — leave it for the delete in Task 7.

- [ ] **Step 4: Implement ScalarNode.tsx**

Create `canvas/excalidraw-app/syntropy/nodes/ScalarNode.tsx` — this is the body of the current `SyntropyNodeCard.tsx` (lines 43–220), re-homed behind `NodeShell` + `PortDot`, with the `plot2d` look-up changed to `curve`:

```tsx
import { useState } from "react";

import "./ScalarNode.scss";

import { RiemannPlot } from "../RiemannPlot";
import { openMethodPage } from "../portalPrefill";
import { NodeShell, PortDot } from "./NodeShell";

import type { PortInputKind, PortSpec } from "../portSpecs/types";
import type { WiredComputeResult } from "../wiring";

type ScalarNodeProps = {
  nodeId: string;
  spec: PortSpec;
  name: string;
  accent: string;
  inputs: Record<string, unknown>;
  onInputsChange: (next: Record<string, unknown>) => void;
  computedResult: WiredComputeResult;
  onOutputPortPointerDown: (
    outputKey: string,
    event: React.PointerEvent<HTMLSpanElement>,
  ) => void;
  readOnly?: boolean;
};

/** The scalar archetype: inputs-as-wells + a plot (curve output, via RiemannPlot) + number/text
 *  output stat rows. This is the literal body of the old SyntropyNodeCard, re-homed behind the
 *  shared NodeShell + PortDot — behavior and appearance unchanged. v1 routes EVERY archetype
 *  here until the per-archetype renderers land in their follow-on plans. */
export const ScalarNode = ({
  nodeId,
  spec,
  name,
  accent,
  inputs,
  onInputsChange,
  computedResult,
  onOutputPortPointerDown,
  readOnly = false,
}: ScalarNodeProps) => {
  const { error, wiredInputKeys, effectiveInputs } = computedResult;

  // See SyntropyNodeCard.tsx's localInputs comment (carried verbatim): editable fields are local
  // state, not driven by the `inputs` prop on every keystroke, to avoid the scene round-trip
  // snapping the displayed value back mid-keystroke.
  const [localInputs, setLocalInputs] =
    useState<Record<string, unknown>>(inputs);

  const handleInputChange = (
    key: string,
    rawValue: string,
    kind: PortInputKind,
  ) => {
    const value = kind === "number" ? Number(rawValue) : rawValue;
    const next = { ...localInputs, [key]: value };
    setLocalInputs(next);
    onInputsChange(next);
  };

  const effectiveLocalInputs = { ...localInputs };
  for (const key of wiredInputKeys) {
    effectiveLocalInputs[key] = effectiveInputs[key];
  }
  const { outputs, error: localError } = spec.compute(effectiveLocalInputs);
  const displayError = error ?? localError;

  const plotOutput = spec.outputs.find((o) => o.kind === "curve");
  const scalarOutputs = spec.outputs.filter(
    (o) => o.kind === "number" || o.kind === "text",
  );

  return (
    <NodeShell
      name={name}
      accent={accent}
      nodeId={nodeId}
      spec={spec}
      onPortalClick={() => openMethodPage(spec, localInputs)}
    >
      {spec.inputs.map((input) => {
        const isWired = wiredInputKeys.has(input.key);
        return (
          <div
            className={`ScalarNode__scrub${
              isWired ? " ScalarNode__scrub--wired" : ""
            }`}
            key={input.key}
          >
            {input.kind === "number" && (
              <PortDot role="input" nodeId={nodeId} portKey={input.key} kind="number" />
            )}
            <div className="ScalarNode__scrubRow">
              <label
                className="ScalarNode__scrubLabel"
                htmlFor={`${spec.methodId}-${input.key}`}
              >
                {isWired && (
                  <span
                    className="ScalarNode__wireMark"
                    aria-label="Value comes from a wire"
                    title="Value comes from a wire"
                  >
                    ↦
                  </span>
                )}
                {input.label}
              </label>
              <input
                id={`${spec.methodId}-${input.key}`}
                aria-label={input.label}
                className="ScalarNode__scrubValue"
                type={input.kind === "number" ? "number" : "text"}
                value={String(
                  (isWired
                    ? effectiveInputs[input.key]
                    : localInputs[input.key]) ?? "",
                )}
                readOnly={isWired || readOnly}
                disabled={isWired || readOnly}
                onChange={(e) =>
                  handleInputChange(input.key, e.target.value, input.kind)
                }
              />
            </div>
          </div>
        );
      })}

      {displayError && <p className="NodeShell__error">{displayError}</p>}

      {!displayError && plotOutput && (
        <div className="ScalarNode__plot">
          <RiemannPlot
            rectangles={
              (outputs[plotOutput.key] as never[] | undefined) ?? []
            }
            accent={accent}
          />
        </div>
      )}

      {!displayError && (
        <div className="ScalarNode__output">
          {scalarOutputs.map((output) => (
            <div className="ScalarNode__outRow" key={output.key}>
              <span className="ScalarNode__outKey">{output.label}</span>
              <span className="ScalarNode__outVal">
                {output.kind === "text"
                  ? String(outputs[output.key] ?? "—")
                  : typeof outputs[output.key] === "number"
                  ? (outputs[output.key] as number).toFixed(3)
                  : "—"}
              </span>
              {output.kind === "number" && (
                <PortDot
                  role="output"
                  nodeId={nodeId}
                  portKey={output.key}
                  kind="number"
                  onPointerDown={(e) => onOutputPortPointerDown(output.key, e)}
                />
              )}
            </div>
          ))}
        </div>
      )}
    </NodeShell>
  );
};
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd canvas && yarn test:app --run excalidraw-app/tests/nodes/ScalarNode.test.tsx`
Expected: PASS — all seven ported assertions green (the `2.000` Riemann total, the `window.open` portal path `../../math-lab/engines/calculus/methods/riemann-sums.html`, wired-input read-only, output port pointerdown, number-only input port).

- [ ] **Step 6: Typecheck + lint**

Run: `cd canvas && yarn test:typecheck && yarn test:code`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
cd canvas && git add excalidraw-app/syntropy/nodes/ScalarNode.tsx excalidraw-app/syntropy/nodes/ScalarNode.scss excalidraw-app/syntropy/RiemannPlot.scss excalidraw-app/syntropy/RiemannPlot.tsx excalidraw-app/tests/nodes/ScalarNode.test.tsx
git commit -m "feat(syntropy): extract ScalarNode body from SyntropyNodeCard

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 5: NodeBody dispatcher + rewire NodeOverlay + test

**Files:**
- Modify: `canvas/excalidraw-app/syntropy/nodes/dispatch.ts` (add `NodeBody`)
- Modify: `canvas/excalidraw-app/syntropy/NodeOverlay.tsx:9,319-332`
- Test: `canvas/excalidraw-app/tests/nodes/dispatch.test.tsx`

**Interfaces:**
- Produces: `NodeBody` (props identical to `SyntropyNodeCard`: `nodeId`, `spec`, `name`, `accent`, `inputs`, `onInputsChange`, `computedResult`, `onOutputPortPointerDown`, `readOnly?`). `NodeOverlay` renders `<NodeBody …/>` where it rendered `<SyntropyNodeCard …/>`.

- [ ] **Step 1: Write the failing test**

Create `canvas/excalidraw-app/tests/nodes/dispatch.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { NodeBody } from "../../syntropy/nodes/dispatch";
import { RIEMANN_SUMS_PORT_SPEC } from "../../syntropy/portSpecs/riemannSums";
import { NEWTON_RAPHSON_PORT_SPEC } from "../../syntropy/portSpecs/newtonRaphson";

import type { WiredComputeResult } from "../../syntropy/wiring";

const DEFAULT_RIEMANN = { fx: "x", a: 0, b: 2, n: 2 };
const resultFor = (inputs: Record<string, unknown>): WiredComputeResult => ({
  ...RIEMANN_SUMS_PORT_SPEC.compute(inputs),
  wiredInputKeys: new Set(),
  effectiveInputs: inputs,
});

describe("NodeBody dispatcher", () => {
  it("renders the scalar archetype body for a number-only spec (newton-raphson)", () => {
    const r: WiredComputeResult = {
      ...NEWTON_RAPHSON_PORT_SPEC.compute({
        fx: "x^3 - x - 2",
        x0: 1.5,
        tol: 0.000001,
        maxIter: 30,
      }),
      wiredInputKeys: new Set(),
      effectiveInputs: { fx: "x^3 - x - 2", x0: 1.5, tol: 0.000001, maxIter: 30 },
    };
    render(
      <NodeBody
        nodeId="n"
        spec={NEWTON_RAPHSON_PORT_SPEC}
        name="Newton–Raphson"
        accent="#5c939f"
        inputs={{ fx: "x^3 - x - 2", x0: 1.5, tol: 0.000001, maxIter: 30 }}
        onInputsChange={() => {}}
        computedResult={r}
        onOutputPortPointerDown={() => {}}
      />,
    );
    expect(screen.getByText("Newton–Raphson")).toBeTruthy();
    expect(screen.getByLabelText("f(x)")).toBeTruthy();
  });

  it("renders ScalarNode (v1 fallback) for a curve spec too, preserving port-dot attributes", () => {
    const { container } = render(
      <NodeBody
        nodeId="n"
        spec={RIEMANN_SUMS_PORT_SPEC}
        name="Riemann Sums"
        accent="#4f9e82"
        inputs={DEFAULT_RIEMANN}
        onInputsChange={() => {}}
        computedResult={resultFor(DEFAULT_RIEMANN)}
        onOutputPortPointerDown={() => {}}
      />,
    );
    // curve archetype is "real-line" but no RealLineNode exists yet — v1 falls back to ScalarNode,
    // which still renders the output port dot with the wiring contract attributes intact.
    const out = container.querySelector(
      '[data-syntropy-port="output"][data-port-key="total"]',
    );
    expect(out).toBeTruthy();
    expect(out?.getAttribute("data-port-node-id")).toBe("n");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd canvas && yarn test:app --run excalidraw-app/tests/nodes/dispatch.test.tsx`
Expected: FAIL — `NodeBody` not exported.

- [ ] **Step 3: Add NodeBody to dispatch.ts**

Append to `canvas/excalidraw-app/syntropy/nodes/dispatch.ts`:

```ts
import { ScalarNode } from "./ScalarNode";

import type { PortSpec } from "../portSpecs/types";
import type { WiredComputeResult } from "../wiring";

// The per-archetype renderers (TraceNode, RealLineNode, MatrixNode, FieldNode,
// DistributionNode) land in their follow-on plans. Until then every archetype routes to
// ScalarNode — which renders number/text/curve outputs exactly as the old single card did, so no
// node changes appearance. When a renderer lands, replace the matching `case` below with it.
const renderBody = (
  archetype: Archetype,
  props: NodeBodyProps,
) => <ScalarNode {...props} />;

export type NodeBodyProps = {
  nodeId: string;
  spec: PortSpec;
  name: string;
  accent: string;
  inputs: Record<string, unknown>;
  onInputsChange: (next: Record<string, unknown>) => void;
  computedResult: WiredComputeResult;
  onOutputPortPointerDown: (
    outputKey: string,
    event: React.PointerEvent<HTMLSpanElement>,
  ) => void;
  readOnly?: boolean;
};

/** The single component NodeOverlay renders for a node. Dispatches on the spec's archetype; v1
 *  routes every archetype to ScalarNode. Props are identical to the old SyntropyNodeCard so
 *  NodeOverlay is a drop-in swap. */
export const NodeBody = (props: NodeBodyProps) => {
  const archetype = archetypeFromSpec(props.spec);
  return renderBody(archetype, props);
};
```

(Note: `Archetype` is already exported from Task 2; `ScalarNode` from Task 4. The `renderBody` indirection is the single seam each follow-on plan widens — replacing the fallback for its archetype with its real renderer.)

- [ ] **Step 4: Rewire NodeOverlay to NodeBody**

In `canvas/excalidraw-app/syntropy/NodeOverlay.tsx`:

- Line 9: `import { SyntropyNodeCard } from "./SyntropyNodeCard";` → `import { NodeBody } from "./nodes/dispatch";`
- Lines 319–332: replace the `<SyntropyNodeCard … />` JSX with `<NodeBody … />`, keeping every prop identical (`nodeId`, `spec`, `name`, `accent`, `inputs`, `onInputsChange`, `computedResult`, `onOutputPortPointerDown`, `readOnly`). The `else` branch (`<SyntropyNode …/>` placeholder for spec-less nodes) is unchanged.

- [ ] **Step 5: Run the dispatcher test + the full app test suite**

Run:
```
cd canvas && yarn test:app --run excalidraw-app/tests/nodes/dispatch.test.tsx excalidraw-app/tests/nodes/ScalarNode.test.tsx excalidraw-app/tests/SyntropyNodeCard.test.tsx
```
Expected: dispatcher + ScalarNode PASS. `SyntropyNodeCard.test.tsx` FAILS now (the old card is still imported by that test but `NodeOverlay` no longer uses it) — that's expected; Task 7 deletes it. Do not commit green-on-old-card; the old test is removed in Task 7.

Actually: keep this commit gated on the NEW tests passing + typecheck. Run:
```
cd canvas && yarn test:typecheck && yarn test:app --run excalidraw-app/tests/nodes
```
Expected: PASS (the `tests/nodes/` directory: dispatch + NodeShell + ScalarNode all green).

- [ ] **Step 6: Commit**

```bash
cd canvas && git add excalidraw-app/syntropy/nodes/dispatch.ts excalidraw-app/syntropy/NodeOverlay.tsx excalidraw-app/tests/nodes/dispatch.test.tsx
git commit -m "feat(syntropy): dispatch nodes via NodeBody, rewire NodeOverlay

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 6: Widen wire compatibility to kind-equal

**Files:**
- Modify: `canvas/excalidraw-app/syntropy/wiring.ts:113-123`
- Modify: `canvas/excalidraw-app/tests/wiring.test.ts`

**Interfaces:**
- Consumes: `PortSpec` (unchanged shape).
- Produces: `compatibleTargetInputKeys(sourceSpec, sourceOutputKey, targetSpec): string[]` — now kind-equal for the wireable kinds `{number, matrix, distribution, field, point}`; `number→number` behavior identical to today (the only kind any current spec wires).

- [ ] **Step 1: Write the failing tests**

Add to `canvas/excalidraw-app/tests/wiring.test.ts`, inside the existing `describe("compatibleTargetInputKeys", …)` block (after the existing three cases):

```ts
  it("lists every matrix-kind input on the target for a matrix-kind source output", () => {
    const matrixSource = {
      engineId: "linear-algebra",
      methodId: "lu",
      inputs: [
        { key: "B", label: "B", kind: "matrix", default: "" },
        { key: "x0", label: "x0", kind: "number", default: 0 },
      ],
      outputs: [{ key: "U", label: "U", kind: "matrix" }],
      compute: () => ({ outputs: {} }),
      executionMode: "live",
      pagePath: "/x",
      pageStoreKey: "x",
    } as never;
    const keys = compatibleTargetInputKeys(matrixSource, "U", matrixSource);
    expect(keys).toEqual(["B"]);
  });

  it("returns nothing when source and target kinds differ (number → matrix)", () => {
    const matrixTarget = {
      engineId: "linear-algebra",
      methodId: "lu",
      inputs: [{ key: "B", label: "B", kind: "matrix", default: "" }],
      outputs: [{ key: "U", label: "U", kind: "matrix" }],
      compute: () => ({ outputs: {} }),
      executionMode: "live",
      pagePath: "/x",
      pageStoreKey: "x",
    } as never;
    const keys = compatibleTargetInputKeys(
      BISECTION_PORT_SPEC,
      "root",
      matrixTarget,
    );
    expect(keys).toEqual([]);
  });

  it("never treats a composite (expression) input as a wire target", () => {
    // riemann's fx is "expression" — even a number source must not list it.
    const keys = compatibleTargetInputKeys(
      BISECTION_PORT_SPEC,
      "root",
      RIEMANN_SUMS_PORT_SPEC,
    );
    expect(keys).not.toContain("fx");
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd canvas && yarn test:app --run excalidraw-app/tests/wiring.test.ts`
Expected: the matrix→matrix case FAILS (current impl only allows `number`); the others pass or fail depending on current behavior.

- [ ] **Step 3: Widen compatibleTargetInputKeys**

Replace `canvas/excalidraw-app/syntropy/wiring.ts:108-123` (the `v1 compatibility rule` doc comment + `compatibleTargetInputKeys`) with:

```ts
/**
 * Wire compatibility: a source output can feed a target input only when they share a kind AND
 * that kind is one of the wireable kinds — a single well-defined value crosses the wire. Composite
 * input kinds (expression/points/coeffs/vector/expressions) and rich visual outputs
 * (trace/curve/eigenpairs) aren't wireable: there's no single meaningful value to hand across.
 * `number → number` (the only kind any current spec wires) behaves identically to before.
 */
const WIREABLE_KINDS = new Set(["number", "matrix", "distribution", "field", "point"]);

export const compatibleTargetInputKeys = (
  sourceSpec: PortSpec,
  sourceOutputKey: string,
  targetSpec: PortSpec,
): string[] => {
  const output = sourceSpec.outputs.find((o) => o.key === sourceOutputKey);
  if (!output || !WIREABLE_KINDS.has(output.kind)) {
    return [];
  }
  return targetSpec.inputs
    .filter((i) => i.kind === output.kind && WIREABLE_KINDS.has(i.kind))
    .map((i) => i.key);
};
```

- [ ] **Step 4: Run the full wiring suite to verify pass**

Run: `cd canvas && yarn test:app --run excalidraw-app/tests/wiring.test.ts`
Expected: PASS — `number→number` lists `["x0","tol","maxIter"]` (existing case unchanged); `curve` source returns `[]` (riemann's `rectangles` is `curve`, not wireable); matrix→matrix lists `["B"]`; number→matrix `[]`; expression never a target.

- [ ] **Step 5: Typecheck + lint**

Run: `cd canvas && yarn test:typecheck && yarn test:code`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
cd canvas && git add excalidraw-app/syntropy/wiring.ts excalidraw-app/tests/wiring.test.ts
git commit -m "feat(syntropy): widen wire compatibility to kind-equal matching

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 7: Delete the old single-card layer + full green run

**Files:**
- Delete: `canvas/excalidraw-app/syntropy/SyntropyNodeCard.tsx`
- Delete: `canvas/excalidraw-app/syntropy/SyntropyNodeCard.scss`
- Delete: `canvas/excalidraw-app/tests/SyntropyNodeCard.test.tsx`
- Verify: nothing else imports the deleted files.

**Interfaces:** none (pure deletion + verification).

- [ ] **Step 1: Confirm nothing imports the old card**

Run: `cd canvas && grep -rn "SyntropyNodeCard" --include="*.ts" --include="*.tsx" excalidraw-app | grep -v node_modules`
Expected: only the three files about to be deleted (and possibly the test). If any other file imports `SyntropyNodeCard`, rewire it to `NodeBody` first (it should only be `NodeOverlay`, already done in Task 5).

- [ ] **Step 2: Delete the three files**

```bash
cd canvas && git rm excalidraw-app/syntropy/SyntropyNodeCard.tsx excalidraw-app/syntropy/SyntropyNodeCard.scss excalidraw-app/tests/SyntropyNodeCard.test.tsx
```

- [ ] **Step 3: Full typecheck + test + lint**

Run:
```
cd canvas && yarn test:typecheck && yarn test:app --run && yarn test:code
```
Expected: ALL GREEN — tsc clean; every vitest suite passes (nodes/dispatch, nodes/NodeShell, nodes/ScalarNode, wiring, nodeGeometry, portSpecsContract, and all untouched suites); eslint clean.

- [ ] **Step 4: Commit**

```bash
cd canvas && git add -A && git commit -m "refactor(syntropy): remove the old single-card SyntropyNodeCard layer

The dispatcher (NodeBody) + NodeShell + ScalarNode fully replace it; no node
changes appearance. The per-archetype renderers land in follow-on plans.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Self-review notes (run after writing, fix inline)

**Spec coverage:** the spec's "Output type system" → Task 1. "Input kinds" (`point`) → Task 1. "Wiring model" (kind-equal) → Task 6. "Node UI layer rebuild" (NodeShell + dispatcher + ScalarNode, NodeOverlay rewired) → Tasks 3–5. "What stays untouched" (compute bodies, portalPrefill, wiring engine, engineAccents, lab pages) → honored: no `compute()` is edited. "Migration" → the foundation is the "land the type union + dispatcher + NodeShell + ScalarNode first" slice from the spec's migration section; the per-archetype spec migrations are the listed follow-on plans. The `plot2d→curve` rename is the one spec edit, matching the spec's union (no `plot2d`).

**Placeholders:** none — every step has real code or an exact rename/move instruction referencing real line numbers read from the repo.

**Type consistency:** `NodeBodyProps` (Task 5) matches the `SyntropyNodeCardProps`/`ScalarNodeProps` prop signature exactly (verified against `SyntropyNodeCard.tsx:11-34`). `PortDot` props (`role`/`nodeId`/`portKey`/`kind`/`onPointerDown`) used consistently by `ScalarNode` and tested by `NodeShell.test.tsx`. `Archetype` and `archetypeFromSpec` defined in Task 2, consumed in Task 5. `PORT_OUTPUT_KINDS`/`PORT_INPUT_KINDS`/`ALL_PORT_SPECS` defined in Task 1, consumed by the contract test and (kinds) available for follow-on renderers.

## Execution handoff

Plan complete and saved to `docs/superpowers/plans/2026-08-14-syntropy-node-archetype-foundation.md`. Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — I execute tasks in this session using executing-plans, batch execution with checkpoints for review.

Which approach?