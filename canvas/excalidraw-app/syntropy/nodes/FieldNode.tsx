import { useState } from "react";

import { openMethodPage } from "../portalPrefill";

import { NodeShell, PortDot } from "./NodeShell";
import { NodeStatus } from "./NodeStatus";
import { useNodeCompute, type RunResult } from "./useNodeCompute";

import "./FieldNode.scss";

import type { FieldOutput, PortInputKind, PortSpec } from "../portSpecs/types";
import type { WiredComputeResult } from "../wiring";

type FieldNodeProps = {
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
  onRunResult?: (nodeId: string, result: RunResult) => void;
  readOnly?: boolean;
};

/** The field archetype: scrub-chip inputs (same as the scalar/real-line cards) and an output
 *  that is the method's own 2D field over a rectangular domain — a small inline-SVG plot whose
 *  style is picked by the `FieldOutput.variant`: direction-field `arrows`, a `heatmap` of a
 *  scalar grid, `contour` isolines of a scalar grid, or `domainColor` hue coloring of a grid. The
 *  running summary (a zero count, a residue, a steady-state value) lives below as scalar stat
 *  rows. Field was the one archetype left routing to ScalarNode after the six-archetype redesign;
 *  this renderer replaces that fallback. */
export const FieldNode = ({
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
}: FieldNodeProps) => {
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
  const {
    outputs,
    error: localError,
    pending,
    stale,
  } = useNodeCompute(nodeId, spec, effectiveLocalInputs, onRunResult);
  // Suppress a stale error while a run is in flight so "running…" is the only status shown.
  const displayError = pending ? undefined : error ?? localError;

  const fieldOutput = spec.outputs.find((o) => o.kind === "field");
  const scalarOutputs = spec.outputs.filter(
    (o) => o.kind === "number" || o.kind === "text",
  );
  const field =
    (fieldOutput && (outputs[fieldOutput.key] as FieldOutput | undefined)) ??
    undefined;

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
            className={`FieldNode__scrub${
              isWired ? " FieldNode__scrub--wired" : ""
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
            <div className="FieldNode__scrubRow">
              <label
                className="FieldNode__scrubLabel"
                htmlFor={`${spec.methodId}-${input.key}`}
              >
                {isWired && (
                  <span
                    className="FieldNode__wireMark"
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
                className="FieldNode__scrubValue"
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

      <NodeStatus pending={pending} stale={stale} />

      {!displayError && field && <FieldPlot field={field} accent={accent} />}

      {!displayError && scalarOutputs.length > 0 && (
        <div className="FieldNode__output">
          {scalarOutputs.map((output) => (
            <div className="FieldNode__outRow" key={output.key}>
              <span className="FieldNode__outKey">{output.label}</span>
              <span className="FieldNode__outVal">
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

/** Linear interpolation of the position where the field value crosses `level` along the edge
 *  between two grid points (used by the contour marching-squares pass). */
const edgeCrossing = (
  a: { x: number; y: number; value: number },
  b: { x: number; y: number; value: number },
  level: number,
): { x: number; y: number } => {
  const t = (level - a.value) / (b.value - a.value || 1e-12);
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
};

/** Marching-squares pass: for one contour `level`, walks every cell of the scalar grid and emits
 *  the line segments where the field crosses the level. Saddles (4 edge crossings) split into two
 *  segments. Returns segments in data coordinates (caller maps them to the viewbox). */
const contourSegments = (
  grid: { x: number; y: number; value: number }[][],
  level: number,
): [{ x: number; y: number }, { x: number; y: number }][] => {
  const segs: [{ x: number; y: number }, { x: number; y: number }][] = [];
  const rows = grid.length;
  if (rows < 2) {
    return segs;
  }
  const cols = grid[0].length;
  if (cols < 2) {
    return segs;
  }
  for (let r = 0; r < rows - 1; r++) {
    for (let c = 0; c < cols - 1; c++) {
      const tl = grid[r][c];
      const tr = grid[r][c + 1];
      const br = grid[r + 1][c + 1];
      const bl = grid[r + 1][c];
      // Edges in a fixed order so saddle pairing is deterministic.
      const edges = [
        { a: tl, b: tr }, // top
        { a: tr, b: br }, // right
        { a: bl, b: br }, // bottom (left → right)
        { a: tl, b: bl }, // left
      ];
      // An edge is crossed when one endpoint is inside the level and the other is not.
      const inside = (v: number) => v > level;
      const crossings = edges
        .filter((e) => inside(e.a.value) !== inside(e.b.value))
        .map((e) => edgeCrossing(e.a, e.b, level));
      if (crossings.length === 2) {
        segs.push([crossings[0], crossings[1]]);
      } else if (crossings.length === 4) {
        // Saddle: pair (top, right) and (bottom, left) — one of the two consistent resolutions.
        segs.push([crossings[0], crossings[1]]);
        segs.push([crossings[2], crossings[3]]);
      }
    }
  }
  return segs;
};

/** Inline-SVG plot of the 2D field over its domain, picked by `variant`: direction-field `arrows`
 *  (vector shafts + heads), `heatmap` (scalar-grid cells shaded by value in the accent gradient),
 *  `contour` (marching-squares isolines of the scalar grid), and `domainColor` (scalar-grid cells
 *  colored by hue derived from value). The domain `[xLo, xHi] × [yLo, yHi]` maps to the viewbox
 *  with y pointing up. */
const FieldPlot = ({
  field,
  accent,
}: {
  field: FieldOutput;
  accent: string;
}) => {
  const VIEW_W = 260;
  const VIEW_H = 180;
  const PAD = 6;
  const { grid, vectors, xLo, xHi, yLo, yHi, variant } = field;
  if (grid.length === 0 || grid[0].length === 0) {
    return null;
  }

  const rows = grid.length;
  const cols = grid[0].length;
  const xSpan = xHi - xLo || 1;
  const ySpan = yHi - yLo || 1;
  const plotW = VIEW_W - PAD * 2;
  const plotH = VIEW_H - PAD * 2;
  const sx = (x: number) => PAD + ((x - xLo) / xSpan) * plotW;
  const sy = (y: number) => PAD + plotH - ((y - yLo) / ySpan) * plotH;

  const cellW = plotW / cols;
  const cellH = plotH / rows;

  const allValues = grid.flatMap((row) => row.map((p) => p.value));
  const vMin = Math.min(...allValues);
  const vMax = Math.max(...allValues);
  const vSpan = vMax - vMin || 1;

  let body: React.ReactNode = null;

  if (variant === "arrows") {
    const vecs = vectors ?? [];
    const shaftLen = Math.min(cellW, cellH) * 0.5;
    const nodes: React.ReactNode[] = [];
    let k = 0;
    for (const row of vecs) {
      for (const v of row) {
        const x0 = sx(v.x);
        const y0 = sy(v.y);
        const mag = Math.hypot(v.dx, v.dy);
        if (mag === 0) {
          // A zero vector renders as a dot so the field's stagnation point is still visible.
          nodes.push(
            <circle key={`z${k++}`} cx={x0} cy={y0} r={1.4} fill={accent} />,
          );
          continue;
        }
        const ux = v.dx / mag;
        const uy = v.dy / mag;
        const x1 = x0 + ux * shaftLen;
        // Data y is up; viewbox y is down — so a positive dy points up (smaller viewbox y).
        const y1 = y0 - uy * shaftLen;
        const ang = Math.atan2(y1 - y0, x1 - x0);
        const head = 3.2;
        nodes.push(
          <g key={`a${k++}`}>
            <line
              x1={x0}
              y1={y0}
              x2={x1}
              y2={y1}
              stroke={accent}
              strokeWidth={1.1}
              strokeLinecap="round"
            />
            <polygon
              points={`${x1},${y1} ${x1 - head * Math.cos(ang - 0.5)},${
                y1 - head * Math.sin(ang - 0.5)
              } ${x1 - head * Math.cos(ang + 0.5)},${
                y1 - head * Math.sin(ang + 0.5)
              }`}
              fill={accent}
            />
          </g>,
        );
      }
    }
    body = nodes;
  } else if (variant === "heatmap") {
    body = grid.flatMap((row, r) =>
      row.map((p, c) => {
        const opacity = 0.12 + ((p.value - vMin) / vSpan) * 0.78;
        return (
          <rect
            key={`h${r}-${c}`}
            x={sx(p.x) - cellW / 2}
            y={sy(p.y) - cellH / 2}
            width={cellW}
            height={cellH}
            fill={accent}
            fillOpacity={opacity}
          />
        );
      }),
    );
  } else if (variant === "domainColor") {
    body = grid.flatMap((row, r) =>
      row.map((p, c) => {
        // Hue cycles through the value range so distinct levels read as distinct colors.
        const hue = ((p.value - vMin) / vSpan) * 300;
        return (
          <rect
            key={`d${r}-${c}`}
            x={sx(p.x) - cellW / 2}
            y={sy(p.y) - cellH / 2}
            width={cellW}
            height={cellH}
            fill={`hsl(${hue}, 70%, 55%)`}
          />
        );
      }),
    );
  } else {
    // contour: a handful of evenly spaced isolines across the value range.
    const levels = [0.2, 0.4, 0.6, 0.8].map((f) => vMin + f * vSpan);
    body = levels.map((level, li) => {
      const segs = contourSegments(grid, level);
      if (segs.length === 0) {
        return null;
      }
      const d = segs
        .flatMap(([a, b]) => [
          `M ${sx(a.x)},${sy(a.y)}`,
          `L ${sx(b.x)},${sy(b.y)}`,
        ])
        .join(" ");
      return (
        <path
          key={`c${li}`}
          d={d}
          fill="none"
          stroke={accent}
          strokeWidth={0.9}
          strokeOpacity={0.85}
        />
      );
    });
  }

  return (
    <svg
      className="FieldNode__plot"
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={`field plot: ${variant} over [${xLo}, ${xHi}] × [${yLo}, ${yHi}]`}
    >
      <rect
        x={PAD}
        y={PAD}
        width={plotW}
        height={plotH}
        fill="none"
        stroke="currentColor"
        strokeOpacity={0.4}
      />
      {body}
    </svg>
  );
};
