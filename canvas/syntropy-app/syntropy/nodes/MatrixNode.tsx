import { useState } from "react";

import { openMethodPage } from "../portalPrefill";

import { NodeShell, PortDot } from "./NodeShell";
import { NodeRunBar } from "./NodeRunBar";
import { useNodeCompute, type RunStoreEntry } from "./useNodeCompute";

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
  onRunResult?: (nodeId: string, entry: RunStoreEntry) => void;
  readOnly?: boolean;
};

/** Parse a matrix input's current value (string "a,b;c,d" or already number[][]) into
 *  number[][] for the cell grid. Tolerant: returns [] for empty/invalid. */
const toMatrix = (raw: unknown): number[][] => {
  if (Array.isArray(raw)) {
    return raw as number[][];
  }
  if (typeof raw !== "string" || raw.trim() === "") {
    return [];
  }
  return raw.split(";").map((row) => row.split(",").map((c) => Number(c)));
};

const fmt = (n: unknown): string =>
  typeof n === "number" && Number.isFinite(n) ? n.toFixed(3) : "—";

type GridProps = {
  matrix: number[][];
  displayLabel: string;
  /** Base for each cell's aria-label (`${cellIdBase} row R col C`). The input key for
   *  editable grids, the output key for read-only result grids. */
  cellIdBase: string;
  editable: boolean;
  disabled?: boolean;
  onCellChange?: (r: number, c: number, raw: string) => void;
};

const Grid = ({
  matrix,
  displayLabel,
  cellIdBase,
  editable,
  disabled,
  onCellChange,
}: GridProps) => (
  <div className="MatrixNode__grid" data-label={displayLabel}>
    <span className="MatrixNode__gridLabel">{displayLabel}</span>
    <table className="MatrixNode__table">
      <tbody>
        {matrix.map((row, r) => (
          <tr key={r}>
            {row.map((cell, c) => {
              const cellLabel = `${cellIdBase} row ${r + 1} col ${c + 1}`;
              return editable ? (
                <td key={c}>
                  <input
                    aria-label={cellLabel}
                    className="MatrixNode__cellInput"
                    type="number"
                    value={Number.isFinite(cell) ? cell : 0}
                    readOnly={disabled}
                    disabled={disabled}
                    onChange={(e) => onCellChange?.(r, c, e.target.value)}
                  />
                </td>
              ) : (
                <td key={c} className="MatrixNode__cell">
                  {fmt(cell)}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

/** The matrix archetype: editable cell-grid input + factor/eigenpair/scalar outputs.
 *  v1 layout convention: when the spec opts in via `relation: "factorization"`, its matrix
 *  outputs render on one line joined by " · " with an "{inputKey} =" prefix (the "A = L · U"
 *  relation). Any other spec's matrix outputs render as stacked labeled grids — bases, an
 *  RREF, an inverse, a solution vector are not products, so "A = col · row · null" or
 *  "A = A⁻¹" would read wrong. Eigenpairs render as (λ, v) rows; number/text as scalar rows. */
export const MatrixNode = ({
  nodeId,
  spec,
  name,
  accent,
  inputs,
  onInputsChange,
  computedResult,
  onOutputPortPointerDown,
  onRunResult,
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
    const next = {
      ...localInputs,
      [key]: copy.map((row) => row.join(",")).join(";"),
    };
    setLocalInputs(next);
    onInputsChange(next);
  };

  const effectiveLocalInputs = { ...localInputs };
  for (const key of wiredInputKeys) {
    effectiveLocalInputs[key] = effectiveInputs[key];
  }
  const {
    outputs,
    error: localError,
    pending,
    stale,
    run,
  } = useNodeCompute(nodeId, spec, effectiveLocalInputs, onRunResult);
  // Suppress a stale error while a run is in flight so "running…" is the only status shown.
  const displayError = pending ? undefined : error ?? localError;

  const matrixInput = spec.inputs.find((i) => i.kind === "matrix");
  const matrixOutputs = spec.outputs.filter((o) => o.kind === "matrix");
  const eigenpairOutputs = spec.outputs.filter((o) => o.kind === "eigenpairs");
  const scalarOutputs = spec.outputs.filter(
    (o) => o.kind === "number" || o.kind === "text",
  );
  // A genuine factorization: opted-in AND a single matrix input AND 2+ matrix factors.
  // Anything else (bases, RREF, inverse, solution) renders as stacked labeled grids.
  const isFactorization =
    spec.relation === "factorization" &&
    matrixInput !== undefined &&
    matrixOutputs.length >= 2;

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
              <Grid
                matrix={matrix}
                displayLabel={input.label}
                cellIdBase={input.key}
                editable
                disabled={isWired || readOnly}
                onCellChange={(r, c, raw) =>
                  handleCellChange(input.key, matrix, r, c, raw)
                }
              />
            </div>
          );
        }
        // number / expression / vector / other: the ScalarNode-style scrub chip.
        return (
          <div className="MatrixNode__scrub" key={input.key}>
            {input.kind === "number" && (
              <PortDot
                role="input"
                nodeId={nodeId}
                portKey={input.key}
                kind="number"
              />
            )}
            <label
              className="MatrixNode__scrubLabel"
              htmlFor={`${spec.methodId}-${input.key}`}
            >
              {isWired && (
                <span
                  className="MatrixNode__wireMark"
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
              className="MatrixNode__scrubValue"
              type={input.kind === "number" ? "number" : "text"}
              value={String(
                (isWired
                  ? effectiveInputs[input.key]
                  : localInputs[input.key]) ?? "",
              )}
              readOnly={isWired || readOnly}
              disabled={isWired || readOnly}
              onChange={(e) =>
                handleFieldChange(input.key, e.target.value, input.kind)
              }
            />
          </div>
        );
      })}

      {displayError && <p className="MatrixNode__error">{displayError}</p>}

      <NodeRunBar
        executionMode={spec.executionMode}
        run={run}
        pending={pending}
        stale={stale}
      />

      {!displayError && matrixOutputs.length > 0 && (
        <div
          className={
            isFactorization
              ? "MatrixNode__factors"
              : "MatrixNode__factors MatrixNode__factors--stacked"
          }
        >
          {isFactorization && (
            <span className="MatrixNode__relation">{matrixInput!.key} =</span>
          )}
          {matrixOutputs.map((o, i) => (
            <div className="MatrixNode__factor" key={o.key}>
              {isFactorization && i > 0 && (
                <span className="MatrixNode__op">·</span>
              )}
              <Grid
                matrix={(outputs[o.key] as number[][]) ?? []}
                displayLabel={o.label}
                cellIdBase={o.key}
                editable={false}
              />
            </div>
          ))}
        </div>
      )}

      {!displayError &&
        eigenpairOutputs.map((o) => {
          const pairs =
            (outputs[o.key] as
              | { eigenvalue: number; vectors: number[][] }[]
              | undefined) ?? [];
          return (
            <div className="MatrixNode__eigenpairs" key={o.key}>
              {pairs.map((p, i) => (
                <div className="MatrixNode__eigenpair" key={i}>
                  <span className="MatrixNode__lambda">
                    λ = {fmt(p.eigenvalue)}
                  </span>
                  <span className="MatrixNode__evec">
                    {p.vectors
                      .map((v) => `[${v.map((x) => fmt(x)).join(", ")}]`)
                      .join(" ")}
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
