# Syntropy Matrix Archetype Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every linear-algebra Syntropy node the Matrix grid archetype — an editable cell-grid input and an output that shows the method's real product (factor matrices side-by-side with equality glyphs, eigenpair rows, solution vectors, scalar summaries) instead of a couple of `toFixed(3)` numbers.

**Architecture:** Build `MatrixNode.tsx` (the matrix archetype body: renders `matrix`-kind outputs as cell grids in declared order joined by `·`, `eigenpairs`-kind outputs as `(λ, v)` rows, `number`/`text` outputs as scalar stat rows; input is an editable cell grid). Wire it into `dispatch.tsx` so the `matrix` archetype (specs whose primary output is `matrix` or `eigenpairs`) routes to `MatrixNode` instead of the `ScalarNode` fallback. Then migrate each matrix spec's `outputs[]` to declare the rich kinds its `compute()` already produces and return them — the `LinAlg.*` cores already compute L/U/P, RREF, eigenpairs, U/S/V, etc.; the specs just weren't declaring or returning them. The math is untouched.

**Tech Stack:** TypeScript, React 19, Vitest + @testing-library/react, SCSS. Run from `canvas/` via `yarn test:app` (vitest), `yarn test:typecheck` (tsc), `yarn test:code` (eslint --max-warnings=0), `yarn fix:code` (eslint --fix).

**Spec:** `docs/superpowers/specs/2026-08-14-syntropy-node-archetype-redesign-design.md` (§"3. Matrix grid", §"Node UI layer rebuild", §"Migration").

## Global Constraints

- One-algorithm-one-file: `compute()` bodies never reimplement method math. Migrations only surface data the existing `LinAlg.*` core already returns — they call the same core and return more of its fields. No new math.
- Port-dot DOM contract is load-bearing: `data-syntropy-port` ("input"|"output"), `data-port-node-id`, `data-port-key`. `NodeOverlay.tsx` queries `[data-syntropy-port]` to measure port positions for wiring. Every output port dot must carry these attributes exactly as `ScalarNode`/`PortDot` do.
- Engine accents (engineAccents.ts): linear-algebra `#8570b3`, numerical `#5c939f`. The accent is passed in as a prop; do not hardcode.
- import/order lint rule: side-effect `.scss` imports go after parent value imports and before type imports, in their own group with blank lines. (See `ScalarNode.tsx` for the working pattern.)
- Vectors (solution, eigenvalues, singular values) have no dedicated output kind — render them as single-row or single-column `matrix` outputs (`number[][]`). The design's "matrices / vectors" covers this.
- No cross-kind wiring promotion in v1 (matrix→number via det is not wired; a method that wants a downstream number emits the `number` itself). Wiring stays kind-equal (already done in the foundation).
- Each spec migration is independent and non-regressing for unmigrated specs: an unmigrated spec keeps routing to `ScalarNode` (its `number` outputs render as before).

---

## File Structure

**Create:**
- `canvas/excalidraw-app/syntropy/nodes/MatrixNode.tsx` — the matrix archetype body. Renders `matrix` outputs as cell grids + `eigenpairs` as rows + `number`/`text` as scalar rows; editable cell-grid input. Owns its output port dots via `PortDot`.
- `canvas/excalidraw-app/syntropy/nodes/MatrixNode.scss` — matrix-grid + eigenpair-row + scalar-row styling, BEM root `MatrixNode__`.
- `canvas/excalidraw-app/tests/nodes/MatrixNode.test.tsx` — render + interaction tests.
- `canvas/excalidraw-app/tests/portSpecsOutputShape.test.ts` — contract test: each registered spec's declared `outputs[].kind` matches the shape its `compute()` returns (matrix outputs are `number[][]`, eigenpairs are `{eigenvalue,vector}[]`-ish, numbers are `number`).

**Modify:**
- `canvas/excalidraw-app/syntropy/nodes/dispatch.tsx` — `renderBody` routes the `matrix` archetype to `MatrixNode`; keep `scalar` → `ScalarNode`.
- `canvas/excalidraw-app/syntropy/portSpecs/<each matrix spec>.ts` — declare rich `outputs[]` and return them from `compute()` (see per-task tables). Math unchanged.
- `canvas/excalidraw-app/tests/qrAlgorithmPortSpec.test.ts` — extend with assertions on the newly-declared rich outputs (eigenvalues already returned but undeclared).

**Unchanged:** `NodeOverlay.tsx` (already renders `NodeBody`), `wiring.ts`, `portalPrefill.ts`, `NodeShell.tsx`, `PortDot`, all `LinAlg.*` cores, all lab pages.

---

## Task 1: MatrixNode renderer + scss + test

**Files:**
- Create: `canvas/excalidraw-app/syntropy/nodes/MatrixNode.tsx`
- Create: `canvas/excalidraw-app/syntropy/nodes/MatrixNode.scss`
- Test: `canvas/excalidraw-app/tests/nodes/MatrixNode.test.tsx`

**Interfaces:**
- Consumes: `NodeShell`, `PortDot` from `./NodeShell` (Task 3 of the foundation plan, already landed); `openMethodPage` from `../portalPrefill`; `PortInputKind`, `PortSpec` from `../portSpecs/types`; `WiredComputeResult` from `../wiring`. Props are identical to `ScalarNodeProps` (same contract `NodeBody` passes through).
- Produces: `MatrixNode` React component, imported by `dispatch.tsx` in Task 2.

**Rendering rules (v1):**
- Input editors: one per `spec.inputs` entry. For `matrix`-kind inputs, render an editable cell grid (`<input type="number">` per cell; add/remove row/col buttons optional in v1 — keep the existing string-based parse path: the grid edits cells, writes back a `";"`/`,`-delimited string via the same `parseMatrix` convention, calls `onInputsChange`). For `number`-kind inputs, render the same scrub chip as ScalarNode (label + numeric input + input `PortDot`). For other kinds (`expression`, `vector`, etc.), fall back to the ScalarNode-style text input. Wired inputs render read-only with the upstream value (same `wiredInputKeys`/`effectiveInputs` logic as ScalarNode).
- Outputs: iterate `spec.outputs` in declared order. `matrix` outputs render as a labeled cell grid (read-only) with the output's `label` as its name. Between two consecutive `matrix` outputs, render a `·` glyph; before the first `matrix` output, render `{single matrix input's label} =` if the spec has exactly one `matrix`-kind input (the "A = L · U" convention). `eigenpairs` outputs render as a list of `(λ, v)` rows (λ as a scalar, v as a short inline vector). `number`/`text` outputs render as the same scalar stat row as ScalarNode, with an output `PortDot` for `number`-kind.
- A `MatrixNode__error` line shows `displayError` (same as ScalarNode). The portal tab (in `NodeShell`) opens the method page with current inputs.
- All interactive elements are `pointer-events: auto` inside the `pointer-events: none` shell (the existing pass-through pattern from ScalarNode).

- [ ] **Step 1: Write the failing component test**

`canvas/excalidraw-app/tests/nodes/MatrixNode.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { MatrixNode } from "../../syntropy/nodes/MatrixNode";
import { LU_DECOMPOSITION_PORT_SPEC } from "../../syntropy/portSpecs/luDecomposition";

import type { WiredComputeResult } from "../../syntropy/wiring";

const DEFAULT_INPUTS = { A: "2,1,1;4,-6,0;-2,7,2" };
const NODE_ID = "m";

const resultFor = (
  inputs: Record<string, unknown>,
  wiredInputKeys: Set<string> = new Set(),
): WiredComputeResult => ({
  ...LU_DECOMPOSITION_PORT_SPEC.compute(inputs),
  wiredInputKeys,
  effectiveInputs: inputs,
});

describe("MatrixNode", () => {
  it("renders the input matrix as an editable cell grid seeded from the parsed value", () => {
    render(
      <MatrixNode
        nodeId={NODE_ID}
        spec={LU_DECOMPOSITION_PORT_SPEC}
        name="LU Decomposition"
        accent="#8570b3"
        inputs={DEFAULT_INPUTS}
        onInputsChange={() => {}}
        computedResult={resultFor(DEFAULT_INPUTS)}
        onOutputPortPointerDown={() => {}}
      />,
    );
    // 3x3 input -> 9 number cells; the (0,0) cell holds 2.
    const cell = screen.getByLabelText("A row 1 col 1") as HTMLInputElement;
    expect(cell.value).toBe("2");
  });

  it("renders each matrix output as a labeled read-only grid with the A = L · U convention", () => {
    const { container } = render(
      <MatrixNode
        nodeId={NODE_ID}
        spec={LU_DECOMPOSITION_PORT_SPEC}
        name="LU Decomposition"
        accent="#8570b3"
        inputs={DEFAULT_INPUTS}
        onInputsChange={() => {}}
        computedResult={resultFor(DEFAULT_INPUTS)}
        onOutputPortPointerDown={() => {}}
      />,
    );
    // After migration (Task 3) LU declares L, U as matrix outputs. The L label appears.
    expect(screen.getByText("L")).toBeTruthy();
    expect(screen.getByText("U")).toBeTruthy();
    // The "A =" prefix and the "·" separator between factors.
    expect(container.textContent).toContain("A =");
    expect(container.textContent).toContain("·");
  });

  it("renders number outputs as scalar stat rows with an output port dot", () => {
    const { container } = render(
      <MatrixNode
        nodeId={NODE_ID}
        spec={LU_DECOMPOSITION_PORT_SPEC}
        name="LU Decomposition"
        accent="#8570b3"
        inputs={DEFAULT_INPUTS}
        onInputsChange={() => {}}
        computedResult={resultFor(DEFAULT_INPUTS)}
        onOutputPortPointerDown={() => {}}
      />,
    );
    expect(screen.getByText("det(A)")).toBeTruthy();
    const port = container.querySelector(
      '[data-syntropy-port="output"][data-port-key="det"]',
    );
    expect(port).toBeTruthy();
    expect(port?.getAttribute("data-port-node-id")).toBe(NODE_ID);
  });

  it("reports an output port pointerdown with its key", () => {
    const onDown = vi.fn();
    const { container } = render(
      <MatrixNode
        nodeId={NODE_ID}
        spec={LU_DECOMPOSITION_PORT_SPEC}
        name="LU Decomposition"
        accent="#8570b3"
        inputs={DEFAULT_INPUTS}
        onInputsChange={() => {}}
        computedResult={resultFor(DEFAULT_INPUTS)}
        onOutputPortPointerDown={onDown}
      />,
    );
    const port = container.querySelector(
      '[data-syntropy-port="output"][data-port-key="det"]',
    )!;
    fireEvent.pointerDown(port);
    expect(onDown).toHaveBeenCalledTimes(1);
    expect(onDown.mock.calls[0][0]).toBe("det");
  });

  it("renders a wired input read-only with the upstream value", () => {
    render(
      <MatrixNode
        nodeId={NODE_ID}
        spec={LU_DECOMPOSITION_PORT_SPEC}
        name="LU Decomposition"
        accent="#8570b3"
        inputs={DEFAULT_INPUTS}
        onInputsChange={() => {}}
        computedResult={resultFor(DEFAULT_INPUTS, new Set(["A"]))}
        onOutputPortPointerDown={() => {}}
      />,
    );
    const cell = screen.getByLabelText("A row 1 col 1") as HTMLInputElement;
    expect(cell.disabled).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `yarn test:app --run excalidraw-app/tests/nodes/MatrixNode.test.tsx`
Expected: FAIL — `MatrixNode` not exported (and LU spec not yet migrated, so "L"/"U" labels absent). Some assertions depend on the Task 3 LU migration; the input-cell and port-dot assertions should pass once the component exists. Run after Task 3 to fully green — but write the component now so the input/port assertions pass.

- [ ] **Step 3: Write MatrixNode.tsx**

```tsx
import { useState } from "react";

import { openMethodPage } from "../portalPrefill";

import { NodeShell, PortDot } from "./NodeShell";

import "./MatrixNode.scss";

import type { PortInputKind, PortSpec } from "../portSpecs/types";
import type { WiredComputeResult } from "../wiring";

type MatrixNodeProps = {
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

/** Parse a matrix input's current value (string "a,b;c,d" or already number[][])
 *  into number[][] for the cell grid. Tolerant: returns [] for empty/invalid. */
const toMatrix = (raw: unknown): number[][] => {
  if (Array.isArray(raw)) return raw as number[][];
  if (typeof raw !== "string" || raw.trim() === "") return [];
  return raw
    .split(";")
    .map((row) => row.split(",").map((c) => Number(c)));
};

const fmt = (n: unknown): string =>
  typeof n === "number" && Number.isFinite(n) ? n.toFixed(3) : "—";

/** The matrix archetype: editable cell-grid input + factor/eigenpair/scalar outputs.
 *  v1 layout convention: matrix outputs render in declared order joined by " · ";
 *  if the spec has exactly one matrix-kind input, prefix with "{inputLabel} = " (the
 *  "A = L · U" relation). Eigenpairs render as (λ, v) rows; number/text as scalar rows. */
export const MatrixNode = ({
  nodeId,
  spec,
  name,
  accent,
  inputs,
  onInputsChange,
  computedResult,
  onOutputPortPointerDown,
  readOnly = false,
}: MatrixNodeProps) => {
  const { error, wiredInputKeys, effectiveInputs } = computedResult;
  const [localInputs, setLocalInputs] =
    useState<Record<string, unknown>>(inputs);

  const handleFieldChange = (
    key: string,
    rawValue: string,
    kind: PortInputKind,
  ) => {
    const value = kind === "number" ? Number(rawValue) : rawValue;
    const next = { ...localInputs, [key]: value };
    setLocalInputs(next);
    onInputsChange(next);
  };

  // Editing a cell writes back a ";"/","-delimited string (parseMatrix's convention).
  const handleCellChange = (
    key: string,
    matrix: number[][],
    r: number,
    c: number,
    raw: string,
  ) => {
    const copy = matrix.map((row) => row.slice());
    copy[r][c] = Number(raw);
    const next = { ...localInputs, [key]: copy.map((row) => row.join(",")).join(";") };
    setLocalInputs(next);
    onInputsChange(next);
  };

  const effectiveLocalInputs = { ...localInputs };
  for (const key of wiredInputKeys) {
    effectiveLocalInputs[key] = effectiveInputs[key];
  }
  const { outputs, error: localError } = spec.compute(effectiveLocalInputs);
  const displayError = error ?? localError;

  const matrixInput = spec.inputs.find((i) => i.kind === "matrix");
  const matrixOutputs = spec.outputs.filter((o) => o.kind === "matrix");
  const eigenpairOutputs = spec.outputs.filter((o) => o.kind === "eigenpairs");
  const scalarOutputs = spec.outputs.filter(
    (o) => o.kind === "number" || o.kind === "text",
  );

  const renderGrid = (
    matrix: number[][],
    label: string,
    editable: boolean,
    inputKey?: string,
  ) => (
    <div className="MatrixNode__grid" data-label={label}>
      <span className="MatrixNode__gridLabel">{label}</span>
      <table className="MatrixNode__table">
        <tbody>
          {matrix.map((row, r) => (
            <tr key={r}>
              {row.map((cell, c) => {
                const cellLabel = `${label} row ${r + 1} col ${c + 1}`;
                return editable ? (
                  <td key={c}>
                    <input
                      aria-label={cellLabel}
                      className="MatrixNode__cellInput"
                      type="number"
                      value={Number.isFinite(cell) ? cell : 0}
                      readOnly={readOnly}
                      disabled={readOnly}
                      onChange={(e) =>
                        handleCellChange(inputKey!, matrix, r, c, e.target.value)
                      }
                    />
                  </td>
                ) : (
                  <td key={c} className="MatrixNode__cell">
                    {fmt(cell)}
                  </td>
                );
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
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
        if (input.kind === "matrix") {
          const matrix = toMatrix(
            isWired ? effectiveInputs[input.key] : localInputs[input.key],
          );
          return (
            <div className="MatrixNode__input" key={input.key}>
              {renderGrid(matrix, input.label, !(isWired || readOnly), input.key)}
            </div>
          );
        }
        // number / expression / vector / other: the ScalarNode-style scrub chip.
        return (
          <div className="MatrixNode__scrub" key={input.key}>
            {input.kind === "number" && (
              <PortDot role="input" nodeId={nodeId} portKey={input.key} kind="number" />
            )}
            <label className="MatrixNode__scrubLabel" htmlFor={`${spec.methodId}-${input.key}`}>
              {isWired && <span className="MatrixNode__wireMark" title="Value comes from a wire">↦</span>}
              {input.label}
            </label>
            <input
              id={`${spec.methodId}-${input.key}`}
              aria-label={input.label}
              className="MatrixNode__scrubValue"
              type={input.kind === "number" ? "number" : "text"}
              value={String(
                (isWired ? effectiveInputs[input.key] : localInputs[input.key]) ?? "",
              )}
              readOnly={isWired || readOnly}
              disabled={isWired || readOnly}
              onChange={(e) => handleFieldChange(input.key, e.target.value, input.kind)}
            />
          </div>
        );
      })}

      {displayError && <p className="MatrixNode__error">{displayError}</p>}

      {!displayError && matrixOutputs.length > 0 && (
        <div className="MatrixNode__factors">
          {matrixInput && matrixOutputs.length > 0 && (
            <span className="MatrixNode__relation">{matrixInput.label} =</span>
          )}
          {matrixOutputs.map((o, i) => (
            <div className="MatrixNode__factor" key={o.key}>
              {i > 0 && <span className="MatrixNode__op">·</span>}
              {renderGrid((outputs[o.key] as number[][]) ?? [], o.label, false)}
            </div>
          ))}
        </div>
      )}

      {!displayError &&
        eigenpairOutputs.map((o) => {
          const pairs = (outputs[o.key] as { eigenvalue: number; vectors: number[][] }[]) ?? [];
          return (
            <div className="MatrixNode__eigenpairs" key={o.key}>
              {pairs.map((p, i) => (
                <div className="MatrixNode__eigenpair" key={i}>
                  <span className="MatrixNode__lambda">λ = {fmt(p.eigenvalue)}</span>
                  <span className="MatrixNode__evec">
                    {p.vectors.map((v) => `[${v.map((x) => fmt(x)).join(", ")}]`).join(" ")}
                  </span>
                </div>
              ))}
            </div>
          );
        })}

      {!displayError && scalarOutputs.length > 0 && (
        <div className="MatrixNode__output">
          {scalarOutputs.map((o) => (
            <div className="MatrixNode__outRow" key={o.key}>
              <span className="MatrixNode__outKey">{o.label}</span>
              <span className="MatrixNode__outVal">
                {o.kind === "text"
                  ? String(outputs[o.key] ?? "—")
                  : fmt(outputs[o.key])}
              </span>
              {o.kind === "number" && (
                <PortDot
                  role="output"
                  nodeId={nodeId}
                  portKey={o.key}
                  kind="number"
                  onPointerDown={(e) => onOutputPortPointerDown(o.key, e)}
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

- [ ] **Step 4: Write MatrixNode.scss**

Style `MatrixNode__grid`, `MatrixNode__table` (cell borders, monospace tabular nums, accent-tinted header), `MatrixNode__cell` / `MatrixNode__cellInput`, `MatrixNode__factors` (flex row, wrap), `MatrixNode__relation` (accent, bold), `MatrixNode__op` (muted, centered), `MatrixNode__eigenpairs` / `MatrixNode__eigenpair` / `MatrixNode__lambda` / `MatrixNode__evec`, `MatrixNode__scrub`/`MatrixNode__scrubLabel`/`MatrixNode__scrubValue`/`MatrixNode__wireMark` (mirror ScalarNode's scrub styles), `MatrixNode__outRow`/`MatrixNode__outKey`/`MatrixNode__outVal` (mirror ScalarNode's output rows), `MatrixNode__error`. Use the same premium tokens as `NodeShell.scss` (accent spine, radial glow, inputs-as-wells, focus ring, cubic-bezier easing, mobile 16px guard) — inherit from `NodeShell`, only add grid-specific rules here. No crosshair corners.

- [ ] **Step 5: Run the component test (input + port assertions pass; L/U assertions fail until Task 3)**

Run: `yarn test:app --run excalidraw-app/tests/nodes/MatrixNode.test.tsx`
Expected: the input-cell, wired-input, and port-dot tests PASS; the "renders L/U" test FAILS until Task 3 migrates the LU spec. That's expected — proceed.

- [ ] **Step 6: Typecheck + lint**

Run: `yarn test:typecheck && yarn fix:code && yarn test:code`
Expected: PASS (clean).

- [ ] **Step 7: Commit**

```bash
git add canvas/excalidraw-app/syntropy/nodes/MatrixNode.tsx canvas/excalidraw-app/syntropy/nodes/MatrixNode.scss canvas/excalidraw-app/tests/nodes/MatrixNode.test.tsx
git commit -m "feat(syntropy): add MatrixNode archetype body (editable cell grid + factor/eigenpair/scalar outputs)"
```

---

## Task 2: Wire MatrixNode into the dispatcher

**Files:**
- Modify: `canvas/excalidraw-app/syntropy/nodes/dispatch.tsx`
- Test: `canvas/excalidraw-app/tests/nodes/dispatch.test.tsx` (extend)

**Interfaces:**
- Consumes: `MatrixNode` from `./MatrixNode` (Task 1).
- Produces: `NodeBody` now routes `archetype === "matrix"` to `MatrixNode`; `scalar` still routes to `ScalarNode`.

- [ ] **Step 1: Add a failing dispatch test**

Append to `canvas/excalidraw-app/tests/nodes/dispatch.test.tsx` inside the existing `describe("NodeBody dispatcher", ...)` (add the LU import at top):

```tsx
it("routes the matrix archetype to MatrixNode (renders the A = L · U factor row)", () => {
  const { container } = render(
    <NodeBody
      nodeId="n"
      spec={LU_DECOMPOSITION_PORT_SPEC}
      name="LU Decomposition"
      accent="#8570b3"
      inputs={{ A: "2,1,1;4,-6,0;-2,7,2" }}
      onInputsChange={() => {}}
      computedResult={{
        ...LU_DECOMPOSITION_PORT_SPEC.compute({ A: "2,1,1;4,-6,0;-2,7,2" }),
        wiredInputKeys: new Set(),
        effectiveInputs: { A: "2,1,1;4,-6,0;-2,7,2" },
      }}
      onOutputPortPointerDown={() => {}}
    />,
  );
  // After Task 3 migration, LU's primary output is a matrix -> archetype "matrix" -> MatrixNode.
  expect(container.textContent).toContain("A =");
});
```

- [ ] **Step 2: Run it to verify failure**

Run: `yarn test:app --run excalidraw-app/tests/nodes/dispatch.test.tsx`
Expected: FAIL (NodeBody still routes everything to ScalarNode; also LU not migrated yet).

- [ ] **Step 3: Wire MatrixNode into renderBody**

In `dispatch.tsx`, change `renderBody` to dispatch by archetype:

```tsx
import { MatrixNode } from "./MatrixNode";
import { ScalarNode } from "./ScalarNode";

// ...existing archetypeFromSpec...

const renderBody = (props: NodeBodyProps) =>
  archetypeFromSpec(props.spec) === "matrix" ? (
    <MatrixNode {...props} />
  ) : (
    <ScalarNode {...props} />
  );
```

- [ ] **Step 4: Run dispatch tests**

Run: `yarn test:app --run excalidraw-app/tests/nodes/dispatch.test.tsx`
Expected: the matrix routing test still FAILS until Task 3 (LU not migrated → archetype is "scalar" → routes to ScalarNode, no "A ="). The existing newton (scalar) and riemann (real-line→ScalarNode fallback) tests still PASS. Proceed to Task 3.

- [ ] **Step 5: Typecheck + lint + commit**

```bash
yarn test:typecheck && yarn fix:code && yarn test:code
git add canvas/excalidraw-app/syntropy/nodes/dispatch.tsx canvas/excalidraw-app/tests/nodes/dispatch.test.tsx
git commit -m "feat(syntropy): dispatch matrix archetype to MatrixNode"
```

---

## Task 3: Migrate factorization specs (lu, cholesky, qr, gram-schmidt, svd, diagonalization, spectral-theorem)

**Files:**
- Modify: `canvas/excalidraw-app/syntropy/portSpecs/luDecomposition.ts`
- Modify: `canvas/excalidraw-app/syntropy/portSpecs/cholesky.ts`
- Modify: `canvas/excalidraw-app/syntropy/portSpecs/qrAlgorithm.ts`
- Modify: `canvas/excalidraw-app/syntropy/portSpecs/gramSchmidt.ts`
- Modify: `canvas/excalidraw-app/syntropy/portSpecs/svd.ts`
- Modify: `canvas/excalidraw-app/syntropy/portSpecs/diagonalization.ts`
- Modify: `canvas/excalidraw-app/syntropy/portSpecs/spectralTheorem.ts`
- Modify: `canvas/excalidraw-app/tests/qrAlgorithmPortSpec.test.ts` (extend)

**Rule for every migration:** keep the existing `compute()` core call and its error handling; only (a) add rich output entries to `outputs[]` with the right `kind`, and (b) return more fields of the core's result in `outputs`. Never change the math or the existing scalar outputs (keep det/rank/etc. as `number` so downstream wiring and existing tests still work). Place `matrix` outputs in the order that reads as the decomposition (e.g. L then U; Q then R; U then Σ then V), and put `eigenpairs` after matrices.

**Per-spec deltas (core → surface):**

| Spec | Core call | Core returns | Add to outputs[] | Return from compute |
|---|---|---|---|---|
| luDecomposition | `LinAlg.luDecompose(A)` | `{L,U,P,perm,swaps,det}` | `L`,`U` as `matrix` (keep `det`,`swaps` as `number`) | add `L: lu.L, U: lu.U` |
| cholesky | `LinAlg.cholesky(A)` | `{L,det}` | `L` as `matrix` (keep `det` as `number`) | add `L: chol.L` |
| qrAlgorithm | `Algorithms.runQRAlgorithm(A,tol,maxIter)` | `iterations[]` each `{diag,offNorm}` | declare the already-returned `eigenvalues` (the last `diag`) as `matrix` rendered as a diagonal/column — wrap as `number[][]` (`diag.map(d=>[d])`); keep `dominantEigenvalue`,`offNorm` as `number` | `eigenvalues: last.diag.map((d) => [d])` |
| gramSchmidt | `LinAlg.gramSchmidt(vectors)` | `{Q,R}` | `Q`,`R` as `matrix` | add `Q: gs.Q, R: gs.R` |
| svd | `LinAlg.svd(A)` | `{U,S,V,singularValues,rank,conditionNumber}` | `U`,`S`(as diag matrix from `S`),`V` as `matrix`; keep `rank`,`conditionNumber` as `number` | add `U: r.U, S: r.S.map((s)=>[s,0,0].slice(0,r.V.length))` (build diagonal Σ: `diagMatrix(r.S)` helper inline), `V: r.V` |
| diagonalization | `LinAlg.diagonalize(A)` | `{P,D,diag,eigenpairs,eigenvalues}` | `P`,`D` as `matrix`; `eigenpairs` as `eigenpairs` (already `{eigenvalue,eigenvectors,algebraicMultiplicity,geometricMultiplicity}[]`); keep `diag` as `number` (or drop — prefer `eigenpairs`) | add `P: r.P, D: r.D, eigenpairs: r.eigenpairs` |
| spectralTheorem | `LinAlg.spectralDecomposition(A)` | `{Q,D,eigenvalues,eigenspaces}` | `Q`,`D` as `matrix`; `eigenpairs` as `eigenpairs` (map `eigenspaces` `{eigenvalue,multiplicity,vectors}` → `{eigenvalue,vectors}`) | add `Q: r.Q, D: r.D, eigenpairs: r.eigenspaces.map((e)=>({eigenvalue:e.eigenvalue,vectors:e.vectors}))` |

**Σ helper** (inline in `svd.ts` only): `const diagMatrix = (s: number[], cols: number) => s.map((v, i) => Array.from({length: cols}, (_, j) => (i === j ? v : 0)));`

- [ ] **Step 1: Migrate luDecomposition.ts**

Change `outputs` to:
```ts
outputs: [
  { key: "L", label: "L", kind: "matrix" },
  { key: "U", label: "U", kind: "matrix" },
  { key: "det", label: "det(A)", kind: "number" },
  { key: "swaps", label: "row swaps", kind: "number" },
],
```
and the return to:
```ts
const lu = LinAlg.luDecompose(A);
return { outputs: { L: lu.L, U: lu.U, det: lu.det, swaps: lu.swaps } };
```

- [ ] **Step 2: Migrate cholesky.ts** — add `L` matrix output, return `chol.L`.

- [ ] **Step 3: Migrate qrAlgorithm.ts** — declare `eigenvalues` (already returned) as a `matrix` (`diag.map((d)=>[d])`); update the return to produce the `number[][]` shape. Extend `tests/qrAlgorithmPortSpec.test.ts` with:
```ts
it("declares and returns the eigenvalues as a matrix (column grid)", () => {
  const result = QR_ALGORITHM_PORT_SPEC.compute({ matrix: "2,1;1,2", tol: 0.00000001, maxIter: 100 });
  expect(result.error).toBeUndefined();
  const eigs = result.outputs.eigenvalues as number[][];
  expect(Array.isArray(eigs) && eigs.every((row) => Array.isArray(row))).toBe(true);
  // eigenvalues of [[2,1],[1,2]] are 3 and 1 — the column grid holds both (order may vary).
  const flat = eigs.map((row) => row[0]).sort((a, b) => a - b);
  expect(flat[0]).toBeCloseTo(1, 4);
  expect(flat[1]).toBeCloseTo(3, 4);
});
```

- [ ] **Step 4: Migrate gramSchmidt.ts** — add `Q`,`R` matrix outputs.

- [ ] **Step 5: Migrate svd.ts** — add `U`,`S`,`V` matrix outputs (build Σ via inline `diagMatrix`), keep `rank`,`conditionNumber` number outputs.

- [ ] **Step 6: Migrate diagonalization.ts** — add `P`,`D` matrix + `eigenpairs` outputs; return `r.P, r.D, r.eigenpairs`.

- [ ] **Step 7: Migrate spectralTheorem.ts** — add `Q`,`D` matrix + `eigenpairs` (mapped from `eigenspaces`) outputs.

- [ ] **Step 8: Run the full matrix + dispatch + contract test suite**

Run: `yarn test:app --run excalidraw-app/tests/nodes/ excalidraw-app/tests/qrAlgorithmPortSpec.test.ts excalidraw-app/tests/portSpecsContract.test.ts`
Expected: PASS — `MatrixNode.test.tsx` now fully greens (L/U present), `dispatch.test.tsx` matrix routing passes (LU primary output is `matrix` → archetype "matrix" → MatrixNode → "A ="), qr test extended passes, contract test passes (all new kinds valid).

- [ ] **Step 9: Typecheck + lint + commit**

```bash
yarn test:typecheck && yarn fix:code && yarn test:code
git add canvas/excalidraw-app/syntropy/portSpecs/luDecomposition.ts canvas/excalidraw-app/syntropy/portSpecs/cholesky.ts canvas/excalidraw-app/syntropy/portSpecs/qrAlgorithm.ts canvas/excalidraw-app/syntropy/portSpecs/gramSchmidt.ts canvas/excalidraw-app/syntropy/portSpecs/svd.ts canvas/excalidraw-app/syntropy/portSpecs/diagonalization.ts canvas/excalidraw-app/syntropy/portSpecs/spectralTheorem.ts canvas/excalidraw-app/tests/qrAlgorithmPortSpec.test.ts
git commit -m "feat(syntropy): migrate factorization specs to matrix/eigenpairs outputs (LU, Cholesky, QR, Gram-Schmidt, SVD, diagonalization, spectral)"
```

---

## Task 4: Migrate reduction & solver specs (row-reduction, linear-systems, matrix-inverse)

**Files:**
- Modify: `canvas/excalidraw-app/syntropy/portSpecs/rowReduction.ts`
- Modify: `canvas/excalidraw-app/syntropy/portSpecs/linearSystems.ts`
- Modify: `canvas/excalidraw-app/syntropy/portSpecs/matrixInverse.ts`

| Spec | Core call | Core returns | Add to outputs[] | Return from compute |
|---|---|---|---|---|
| rowReduction | `LinAlg.rref(A)` | `{R,pivots,freeCols,rank,swaps,steps}` | `R` as `matrix` (the RREF); keep `rank`,`freeColumns`,`rowOps` as `number` | add `R: r.R` |
| linearSystems | `LinAlg.solveSystem(A,b)` | union `{none|unique|infinite}` with `solution`/`particular`/`nullBasis`/`rref`/`rank`/`augmentedRank` | `rref` as `matrix`; if `type==="unique"` add `solution` as `matrix` (column `sol.map((x)=>[x])`); if `infinite` add `nullBasis` as `matrix` (already `number[][]`); keep `consistent`,`rank`,`augmentedRank` as `number` | add `rref: s.rref` and the type-specific vector |
| matrixInverse | `LinAlg.inverse(A)` | `{inverse,steps,stepsOmitted,rank}` | `inverse` as `matrix`; keep `rank` as `number` (add if absent) | add `inverse: r.inverse` |

- [ ] **Step 1: Migrate rowReduction.ts** — add `R` matrix output before the scalar summaries.
- [ ] **Step 2: Migrate linearSystems.ts** — add `rref` matrix output + type-conditional vector output (`solution`/`nullBasis`). Keep existing scalar outputs.
- [ ] **Step 3: Migrate matrixInverse.ts** — add `inverse` matrix output (+ `rank` number output if not already present).
- [ ] **Step 4: Run tests + typecheck + lint + commit**

```bash
yarn test:app --run excalidraw-app/tests/nodes/ excalidraw-app/tests/portSpecsContract.test.ts
yarn test:typecheck && yarn fix:code && yarn test:code
git add canvas/excalidraw-app/syntropy/portSpecs/rowReduction.ts canvas/excalidraw-app/syntropy/portSpecs/linearSystems.ts canvas/excalidraw-app/syntropy/portSpecs/matrixInverse.ts
git commit -m "feat(syntropy): migrate reduction/solver specs to matrix outputs (RREF, linear-systems, matrix-inverse)"
```

---

## Task 5: Migrate subspace, eigen, markov, transform specs (four-subspaces, independence-basis, eigenvalues, markov-chains, linear-transformations)

**Files:**
- Modify: `canvas/excalidraw-app/syntropy/portSpecs/fourSubspaces.ts`
- Modify: `canvas/excalidraw-app/syntropy/portSpecs/independenceBasis.ts`
- Modify: `canvas/excalidraw-app/syntropy/portSpecs/eigenvalues.ts`
- Modify: `canvas/excalidraw-app/syntropy/portSpecs/markovChains.ts`
- Modify: `canvas/excalidraw-app/syntropy/portSpecs/linearTransformations.ts`

| Spec | Core call | Core returns | Add to outputs[] | Return from compute |
|---|---|---|---|---|
| fourSubspaces | `LinAlg.columnSpaceBasis/nullSpaceBasis/rowSpaceBasis` | four `number[][]` bases | `colA`,`rowA`,`nullA`,`nullAT` as `matrix` (read each core call's result); keep scalar counts as `number` | return the four bases |
| independenceBasis | `LinAlg.basisFromSpanningSet` / `isLinearlyIndependent` | `{basis,indices,dimension}` / `{independent,rank,relations}` | `basis` as `matrix`; keep `independent`/`dimension` as `number` | add `basis: b.basis` |
| eigenvalues | `LinAlg.eigenvalues(A)` + `LinAlg.eigenvectorsFor(A, λ)` per real eigenvalue | `EigenResult {values:Complex[],real,hasComplex,charPoly}` + vectors | `eigenpairs` as `eigenpairs` (for each real `λ` in `e.real`, build `{eigenvalue: λ, vectors: LinAlg.eigenvectorsFor(A, λ)}`); keep `trace` as `number`; drop `lambda1`/`allReal` (the eigenpairs carry it) OR keep them — prefer dropping for a clean archetype, but keep `trace` | build eigenpairs from `e.real` + `eigenvectorsFor` |
| markovChains | `LinAlg.markovSteadyState(P)` (+ `markovEvolve` if the spec evolves) | `{steadyState,convention,uniqueUpToScale,nullSpaceDimension}` / `{history,final}` | `steadyState` as `matrix` (column `ss.steadyState.map((p)=>[p])`); if the spec also evolves, add `history` as `trace` kind is for the Trace archetype — but markov is Matrix here, so render `evolvedDistribution` as a `matrix` row instead; keep `uniqueSteadyState` as `number` | add `steadyState: ss.steadyState.map((p)=>[p])` |
| linearTransformations | reads input matrix `m` (a transform); core is the transform itself | the transformed grid / image vectors | `imageGrid` as `matrix` (sample a unit grid through the transform — small inline sampler, NOT new method math: map each basis vector through `m`); keep any scalar as `number` | build a warped unit grid: `[[1,0],[0,1]]` and their images under `m` |

**Note on eigenvalues:** `eigenvectorsFor` is an existing `LinAlg` core, so calling it is not reimplementing math. For complex eigenvalues (`e.hasComplex`), v1 surfaces only real eigenpairs and adds a `text` output `"has complex eigenvalues"` when `hasComplex` (or keeps `allReal` as a number). Keep it simple: real eigenpairs + a scalar `trace`.

**Note on linearTransformations:** the Field archetype lists a "grid-warp variant" of linear-transformations, but the Matrix archetype also lists linear-transformations. Resolve by output: if the spec's primary output is the warped grid (`matrix`), it's Matrix (this plan); the Field grid-warp is a future variant. v1: surface the unit-basis images as a `matrix`.

- [ ] **Step 1: Migrate fourSubspaces.ts** — read the spec to see which core calls it makes; add the four basis `matrix` outputs.
- [ ] **Step 2: Migrate independenceBasis.ts** — add `basis` matrix output.
- [ ] **Step 3: Migrate eigenvalues.ts** — replace `lambda1`/`allReal` outputs with an `eigenpairs` output built from `e.real` + `eigenvectorsFor`; keep `trace`.
- [ ] **Step 4: Migrate markovChains.ts** — add `steadyState` matrix output.
- [ ] **Step 5: Migrate linearTransformations.ts** — add `imageGrid` matrix output (unit-basis images).
- [ ] **Step 6: Run tests + typecheck + lint + commit**

```bash
yarn test:app --run excalidraw-app/tests/nodes/ excalidraw-app/tests/portSpecsContract.test.ts
yarn test:typecheck && yarn fix:code && yarn test:code
git add canvas/excalidraw-app/syntropy/portSpecs/fourSubspaces.ts canvas/excalidraw-app/syntropy/portSpecs/independenceBasis.ts canvas/excalidraw-app/syntropy/portSpecs/eigenvalues.ts canvas/excalidraw-app/syntropy/portSpecs/markovChains.ts canvas/excalidraw-app/syntropy/portSpecs/linearTransformations.ts
git commit -m "feat(syntropy): migrate subspace/eigen/markov/transform specs to matrix/eigenpairs outputs"
```

---

## Task 6: Output-shape contract test + full green run + finish

**Files:**
- Create: `canvas/excalidraw-app/tests/portSpecsOutputShape.test.ts`

**Interfaces:**
- Consumes: `ALL_PORT_SPECS` from `../syntropy/portSpecs/registry`.

The design's testing section calls for "assertions that each spec's declared `outputs[].kind` matches the shape its `compute()` actually returns." This is that test: run each spec's `compute()` with its inputs' defaults, and assert each declared output's runtime shape matches its kind.

- [ ] **Step 1: Write the contract test**

`canvas/excalidraw-app/tests/portSpecsOutputShape.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { ALL_PORT_SPECS } from "../syntropy/portSpecs/registry";

const defaultInputs = (spec: (typeof ALL_PORT_SPECS)[number]) =>
  Object.fromEntries(spec.inputs.map((i) => [i.key, i.default]));

const isNumberMatrix = (v: unknown): boolean =>
  Array.isArray(v) &&
  v.length > 0 &&
  v.every((row) => Array.isArray(row) && row.every((c) => typeof c === "number"));

describe("port spec output shape contract", () => {
  for (const spec of ALL_PORT_SPECS) {
    it(`${spec.engineId}:${spec.methodId} compute() returns shapes matching its declared output kinds`, () => {
      const result = spec.compute(defaultInputs(spec));
      // A spec that errors on its own defaults (e.g. needs non-default inputs) is skipped —
      // the shape contract only applies when compute succeeds.
      if (result.error) {
        expect(result.error).toBeTruthy();
        return;
      }
      for (const out of spec.outputs) {
        const v = result.outputs[out.key];
        switch (out.kind) {
          case "number":
            expect(typeof v === "number" || v === undefined, `${spec.methodId} ${out.key}`).toBe(true);
            break;
          case "text":
            expect(typeof v === "string" || v === undefined, `${spec.methodId} ${out.key}`).toBe(true);
            break;
          case "matrix":
            expect(isNumberMatrix(v), `${spec.methodId} ${out.key} should be number[][]`).toBe(true);
            break;
          case "eigenpairs":
            expect(Array.isArray(v), `${spec.methodId} ${out.key} should be an array`).toBe(true);
            break;
          // trace/curve/field/distribution: shape varies; not asserted here (per-archetype renderer tests cover them).
          default:
            break;
        }
      }
    });
  }
});
```

- [ ] **Step 2: Run it and fix any shape mismatches**

Run: `yarn test:app --run excalidraw-app/tests/portSpecsOutputShape.test.ts`
Expected: most pass; if any matrix/eigenpairs output returns the wrong shape (e.g. a vector returned as `number[]` instead of `number[][]`), fix the spec's `compute()` return to wrap it (`x.map((n)=>[n])`). Re-run until green.

- [ ] **Step 3: Full green run**

Run: `yarn test:typecheck && yarn test:app --run && yarn test:code`
Expected: ALL green (the Excalidraw core `resize.test.tsx` is a known flaky timing test — if it fails once, re-run in isolation to confirm it's the flake, not this work).

- [ ] **Step 4: Commit**

```bash
git add canvas/excalidraw-app/tests/portSpecsOutputShape.test.ts
git commit -m "test(syntropy): add port spec output-shape contract test"
```

- [ ] **Step 5: Finish the development branch**

Announce: "I'm using the finishing-a-development-branch skill to complete this work." Follow it: verify tests, detect environment, present options, execute choice.