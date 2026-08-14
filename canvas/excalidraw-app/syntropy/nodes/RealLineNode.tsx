import { useState } from "react";

import { openMethodPage } from "../portalPrefill";

import { NodeShell, PortDot } from "./NodeShell";
import { NodeStatus } from "./NodeStatus";
import { useNodeCompute, type RunResult } from "./useNodeCompute";

import "./RealLineNode.scss";

import type { CurveOutput, PortInputKind, PortSpec } from "../portSpecs/types";
import type { WiredComputeResult } from "../wiring";

type RealLineNodeProps = {
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

/** The real-line archetype: scrub-chip inputs (expression + numeric wells, same as the scalar
 *  card) and an output that is the method's own curve over an interval — a small inline-SVG plot
 *  of the sampled curve with the method's overlay drawn on it: partition rectangles (quadrature),
 *  data-point dots (interpolation), or a fitted line through a scatter (regression), plus an
 *  optional filled area under the curve (the integrand's signed region for quadrature). The
 *  running summary (total, value, slope, r²) lives below as scalar stat rows. */
export const RealLineNode = ({
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
}: RealLineNodeProps) => {
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

  const curveOutput = spec.outputs.find((o) => o.kind === "curve");
  const scalarOutputs = spec.outputs.filter(
    (o) => o.kind === "number" || o.kind === "text",
  );
  const curve =
    (curveOutput && (outputs[curveOutput.key] as CurveOutput | undefined)) ??
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
            className={`RealLineNode__scrub${
              isWired ? " RealLineNode__scrub--wired" : ""
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
            <div className="RealLineNode__scrubRow">
              <label
                className="RealLineNode__scrubLabel"
                htmlFor={`${spec.methodId}-${input.key}`}
              >
                {isWired && (
                  <span
                    className="RealLineNode__wireMark"
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
                className="RealLineNode__scrubValue"
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

      {!displayError && curve && <RealLinePlot curve={curve} accent={accent} />}

      {!displayError && scalarOutputs.length > 0 && (
        <div className="RealLineNode__output">
          {scalarOutputs.map((output) => (
            <div className="RealLineNode__outRow" key={output.key}>
              <span className="RealLineNode__outKey">{output.label}</span>
              <span className="RealLineNode__outVal">
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

/** Inline-SVG plot of the real-line curve and its overlays — a generalization of RiemannPlot:
 *  the sampled curve stroked over its x-range, an optional filled area under it (quadrature's
 *  signed integral region), optional partition rectangles (Riemann panels / adaptive leaves)
 *  drawn as bars behind the curve, and optional data-point dots (interpolation nodes / a
 *  regression scatter) on top of it. The y-axis spans the curve, the rectangle heights, and the
 *  data points together so every overlay stays in frame. */
const RealLinePlot = ({
  curve,
  accent,
}: {
  curve: CurveOutput;
  accent: string;
}) => {
  const VIEW_W = 260;
  const VIEW_H = 100;
  const PAD = 6;
  const { points, samples, rectangles, fillArea } = curve;
  if (points.length < 2) {
    return null;
  }

  const xs = points.map((p) => p.x);
  let xMin = Math.min(...xs);
  let xMax = Math.max(...xs);
  if (samples) {
    for (const s of samples) {
      xMin = Math.min(xMin, s.x);
      xMax = Math.max(xMax, s.x);
    }
  }
  if (rectangles) {
    for (const r of rectangles) {
      xMin = Math.min(xMin, r.x0);
      xMax = Math.max(xMax, r.x1);
    }
  }

  const ys = points.map((p) => p.y);
  let yMax = Math.max(0, ...ys);
  let yMin = Math.min(0, ...ys);
  if (rectangles) {
    for (const r of rectangles) {
      yMax = Math.max(yMax, r.height);
      yMin = Math.min(yMin, r.height);
    }
  }
  if (samples) {
    for (const s of samples) {
      yMax = Math.max(yMax, s.y);
      yMin = Math.min(yMin, s.y);
    }
  }

  const xSpan = xMax - xMin || 1;
  const ySpan = yMax - yMin || 1;
  const plotW = VIEW_W - PAD * 2;
  const plotH = VIEW_H - PAD * 2;
  const sx = (x: number) => PAD + ((x - xMin) / xSpan) * plotW;
  const sy = (y: number) => PAD + plotH - ((y - yMin) / ySpan) * plotH;
  const baselineY = sy(0);

  // Partition rectangles sit behind the curve (the method's overlay), each bar drawn from the
  // baseline up to its height — the Riemann-panel / adaptive-leaf treatment from RiemannPlot.
  const bars = rectangles?.map((r, i) => {
    const x = sx(r.x0);
    const width = Math.max(0, sx(r.x1) - sx(r.x0));
    const top = Math.min(baselineY, sy(r.height));
    const height = Math.abs(sy(r.height) - baselineY);
    return (
      <rect
        key={`r${i}`}
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
  });

  // The filled area under the curve (quadrature's signed integral region), closed down to the
  // baseline. Drawn before the curve stroke so the stroke reads on top.
  const areaPath =
    fillArea &&
    [
      `M ${sx(points[0].x)},${baselineY}`,
      ...points.map((p) => `L ${sx(p.x)},${sy(p.y)}`),
      `L ${sx(points[points.length - 1].x)},${baselineY}`,
      "Z",
    ].join(" ");

  const curvePath = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${sx(p.x)},${sy(p.y)}`)
    .join(" ");

  // Data points sit on top of the curve — the interpolation nodes or the regression scatter.
  const dots = samples?.map((s, i) => (
    <circle
      key={`s${i}`}
      cx={sx(s.x)}
      cy={sy(s.y)}
      r={2.6}
      fill={accent}
      stroke="var(--island-bg-color)"
      strokeWidth={0.8}
    />
  ));

  return (
    <svg
      className="RealLineNode__plot"
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={`real-line plot: curve over [${xMin}, ${xMax}]`}
    >
      <line
        x1={PAD}
        y1={baselineY}
        x2={VIEW_W - PAD}
        y2={baselineY}
        stroke="currentColor"
        strokeOpacity={0.5}
      />
      {bars}
      {areaPath && (
        <path d={areaPath} fill={accent} fillOpacity={0.16} stroke="none" />
      )}
      <path
        d={curvePath}
        fill="none"
        stroke={accent}
        strokeWidth={1.5}
        strokeLinejoin="round"
      />
      {dots}
    </svg>
  );
};
