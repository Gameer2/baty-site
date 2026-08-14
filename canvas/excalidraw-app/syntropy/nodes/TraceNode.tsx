import { useState } from "react";

import { openMethodPage } from "../portalPrefill";

import { NodeShell, PortDot } from "./NodeShell";

import "./TraceNode.scss";

import type { PortInputKind, PortSpec } from "../portSpecs/types";
import type { WiredComputeResult } from "../wiring";

type TraceNodeProps = {
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

/** Format a trace cell. Trace rows are heterogeneous — root-finders carry numbers, the
 *  Euclidean methods carry BigInts, the vector-system methods carry number[] — so this
 *  handles each kind rather than assuming numbers. */
const fmt = (v: unknown): string => {
  if (typeof v === "number") {
    return Number.isFinite(v) ? v.toFixed(4) : "—";
  }
  if (typeof v === "bigint") {
    return v.toString();
  }
  if (Array.isArray(v)) {
    return `[${v.map(fmt).join(", ")}]`;
  }
  if (typeof v === "string") {
    return v;
  }
  return "—";
};

const CONVERGED_ERR = 1e-3;

/** The trace archetype: scrub-chip inputs (expression + numeric wells, same as the scalar
 *  card) and an output that is the method's own iteration sequence — a step table that fills
 *  in as the iteration runs, with the latest row accent-highlighted and a converged row
 *  turning green — plus a small convergence plot of the step error and the scalar summary
 *  (root, error, iteration count) as stat rows. */
export const TraceNode = ({
  nodeId,
  spec,
  name,
  accent,
  inputs,
  onInputsChange,
  computedResult,
  onOutputPortPointerDown,
  readOnly = false,
}: TraceNodeProps) => {
  const { error, wiredInputKeys, effectiveInputs } = computedResult;
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

  const traceOutput = spec.outputs.find((o) => o.kind === "trace");
  const scalarOutputs = spec.outputs.filter(
    (o) => o.kind === "number" || o.kind === "text",
  );

  const rows =
    (traceOutput &&
      (outputs[traceOutput.key] as Record<string, unknown>[] | undefined)) ??
    [];
  // Columns are the union of every row's keys, in first-seen order. Methods push different
  // keys (Newton: n,x,fx,fpx,xNext,err; secant: n,xPrev,xCurr,…; Euclid: n,a,b,q,r) so the
  // table is generic rather than assuming a fixed schema.
  const columns: string[] = [];
  {
    const seen = new Set<string>();
    for (const row of rows) {
      for (const key of Object.keys(row)) {
        if (!seen.has(key)) {
          seen.add(key);
          columns.push(key);
        }
      }
    }
  }
  const lastIdx = rows.length - 1;

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
            className={`TraceNode__scrub${
              isWired ? " TraceNode__scrub--wired" : ""
            }`}
            key={input.key}
          >
            {input.kind === "number" && (
              <PortDot
                role="input"
                nodeId={nodeId}
                portKey={input.key}
                kind="number"
              />
            )}
            <div className="TraceNode__scrubRow">
              <label
                className="TraceNode__scrubLabel"
                htmlFor={`${spec.methodId}-${input.key}`}
              >
                {isWired && (
                  <span
                    className="TraceNode__wireMark"
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
                className="TraceNode__scrubValue"
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

      {!displayError && rows.length > 0 && (
        <div className="TraceNode__tableScroll">
          <table className="TraceNode__table">
            <thead>
              <tr>
                {columns.map((col) => (
                  <th key={col}>{col}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => {
                const err = row.err;
                const converged =
                  typeof err === "number" &&
                  Number.isFinite(err) &&
                  err < CONVERGED_ERR;
                const isLatest = i === lastIdx;
                const rowClass = converged
                  ? "TraceNode__row--converged"
                  : isLatest
                  ? "TraceNode__row--latest"
                  : undefined;
                return (
                  <tr key={i} className={rowClass}>
                    {columns.map((col) => (
                      <td key={col}>{fmt(row[col])}</td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {!displayError && rows.length > 1 && (
        <ConvergencePlot rows={rows} accent={accent} />
      )}

      {!displayError && scalarOutputs.length > 0 && (
        <div className="TraceNode__output">
          {scalarOutputs.map((output) => (
            <div className="TraceNode__outRow" key={output.key}>
              <span className="TraceNode__outKey">{output.label}</span>
              <span className="TraceNode__outVal">
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

/** Inline-SVG plot of the step error vs iteration index — the "fills in as the iteration
 *  runs" convergence trajectory. Only renders for rows that carry a numeric `err` (most
 *  iterative methods; the Euclidean gcd steps have none and so get the table alone). Linear
 *  y-scale in v1; a log scale is a future refinement once err==0 handling is settled. */
const ConvergencePlot = ({
  rows,
  accent,
}: {
  rows: Record<string, unknown>[];
  accent: string;
}) => {
  const VIEW_W = 260;
  const VIEW_H = 70;
  const PAD = 6;
  const points = rows
    .map((r, i) => ({ n: i + 1, err: r.err }))
    .filter(
      (p): p is { n: number; err: number } =>
        typeof p.err === "number" && Number.isFinite(p.err),
    );
  if (points.length < 2) {
    return null;
  }
  const nMin = points[0].n;
  const nMax = points[points.length - 1].n;
  const errMax = Math.max(...points.map((p) => p.err));
  const errMin = Math.min(0, ...points.map((p) => p.err));
  const xSpan = nMax - nMin || 1;
  const ySpan = errMax - errMin || 1;
  const plotW = VIEW_W - PAD * 2;
  const plotH = VIEW_H - PAD * 2;
  const sx = (n: number) => PAD + ((n - nMin) / xSpan) * plotW;
  const sy = (err: number) => PAD + plotH - ((err - errMin) / ySpan) * plotH;
  const baselineY = sy(0);
  const line = points.map((p) => `${sx(p.n)},${sy(p.err)}`).join(" ");

  return (
    <svg
      className="TraceNode__plot"
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      preserveAspectRatio="none"
      role="img"
      aria-label="convergence plot: step error vs iteration"
    >
      <line
        x1={PAD}
        y1={baselineY}
        x2={VIEW_W - PAD}
        y2={baselineY}
        stroke="currentColor"
        strokeOpacity={0.5}
      />
      <polyline
        points={line}
        fill="none"
        stroke={accent}
        strokeWidth={1.5}
        strokeLinejoin="round"
      />
      {points.map((p) => (
        <circle key={p.n} cx={sx(p.n)} cy={sy(p.err)} r={1.6} fill={accent} />
      ))}
    </svg>
  );
};
