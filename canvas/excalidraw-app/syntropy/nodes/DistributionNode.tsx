import { useState } from "react";

import { openMethodPage } from "../portalPrefill";

import { NodeShell, PortDot } from "./NodeShell";
import { NodeRunBar } from "./NodeRunBar";
import { useNodeCompute, type RunStoreEntry } from "./useNodeCompute";

import "./DistributionNode.scss";

import type {
  DistributionOutput,
  PortInputKind,
  PortSpec,
} from "../portSpecs/types";
import type { WiredComputeResult } from "../wiring";

type DistributionNodeProps = {
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

/** The distribution archetype: scrub-chip inputs (parameters + the shaded point, same as the
 *  scalar card) and an output that is the method's own pdf/pmf curve — a small inline-SVG plot of
 *  the sampled density with the relevant region `[lo, hi]` shaded (a lower tail `P(X ≤ x)` for the
 *  pdf/pmf methods, the central interval for a confidence interval) — plus the scalar summary
 *  (probability, cdf, variance, interval bounds) as stat rows. */
export const DistributionNode = ({
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
}: DistributionNodeProps) => {
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
    run,
  } = useNodeCompute(nodeId, spec, effectiveLocalInputs, onRunResult);
  // Suppress a stale error while a run is in flight so "running…" is the only status shown.
  const displayError = pending ? undefined : error ?? localError;

  const distributionOutput = spec.outputs.find(
    (o) => o.kind === "distribution",
  );
  const scalarOutputs = spec.outputs.filter(
    (o) => o.kind === "number" || o.kind === "text",
  );
  const dist =
    (distributionOutput &&
      (outputs[distributionOutput.key] as DistributionOutput | undefined)) ??
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
            className={`DistributionNode__scrub${
              isWired ? " DistributionNode__scrub--wired" : ""
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
            <div className="DistributionNode__scrubRow">
              <label
                className="DistributionNode__scrubLabel"
                htmlFor={`${spec.methodId}-${input.key}`}
              >
                {isWired && (
                  <span
                    className="DistributionNode__wireMark"
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
                className="DistributionNode__scrubValue"
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

      <NodeRunBar
        executionMode={spec.executionMode}
        run={run}
        pending={pending}
        stale={stale}
      />

      {!displayError && dist && (
        <DistributionPlot dist={dist} accent={accent} />
      )}

      {!displayError && scalarOutputs.length > 0 && (
        <div className="DistributionNode__output">
          {scalarOutputs.map((output) => (
            <div className="DistributionNode__outRow" key={output.key}>
              <span className="DistributionNode__outKey">{output.label}</span>
              <span className="DistributionNode__outVal">
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

/** Inline-SVG plot of the sampled pdf/pmf curve with the `[lo, hi]` region shaded. Integer-spaced
 *  sample x's (a binomial pmf over 0..n) render as bars; otherwise the curve renders as a filled
 *  area. compute() guarantees `lo` and `hi` are themselves sample x's, so the shade clips to exact
 *  sample points — no interpolation needed. */
const DistributionPlot = ({
  dist,
  accent,
}: {
  dist: DistributionOutput;
  accent: string;
}) => {
  const VIEW_W = 260;
  const VIEW_H = 80;
  const PAD_X = 8;
  const PAD_Y = 8;
  const points = dist.points;
  if (points.length < 2) {
    return null;
  }
  const xMin = points[0].x;
  const xMax = points[points.length - 1].x;
  const yMax = Math.max(...points.map((p) => p.pdf), 1e-9);
  const plotW = VIEW_W - PAD_X * 2;
  const plotH = VIEW_H - PAD_Y * 2;
  const baselineY = VIEW_H - PAD_Y;
  const xSpan = xMax - xMin || 1;
  const sx = (x: number) => PAD_X + ((x - xMin) / xSpan) * plotW;
  const sy = (pdf: number) => baselineY - (pdf / yMax) * plotH;

  // Integer-spaced sample x's => a discrete pmf, drawn as bars (binomial over 0..n). The bar width
  // is a fraction of the inter-sample spacing so adjacent bars don't touch edge-to-edge.
  const isDiscrete = points.every((p) => Number.isInteger(p.x));
  const inShade = (x: number) => x >= dist.lo && x <= dist.hi;

  const baseline = (
    <line
      x1={PAD_X}
      y1={baselineY}
      x2={VIEW_W - PAD_X}
      y2={baselineY}
      stroke="currentColor"
      strokeOpacity={0.5}
    />
  );

  let body: React.ReactNode;
  if (isDiscrete) {
    const spacing = points.length > 1 ? sx(points[1].x) - sx(points[0].x) : 0;
    const barW = Math.max(spacing * 0.7, 1);
    body = points.map((p) => {
      const shaded = inShade(p.x);
      const h = baselineY - sy(p.pdf);
      return (
        <rect
          key={p.x}
          x={sx(p.x) - barW / 2}
          y={baselineY - h}
          width={barW}
          height={Math.max(h, 0)}
          fill={accent}
          fillOpacity={shaded ? 0.55 : 0.18}
        />
      );
    });
  } else {
    // Continuous pdf: a filled area under the whole curve (faint) plus a denser fill over the
    // shaded sub-region. Both close down to the baseline.
    const areaPath = [
      `M ${sx(points[0].x)},${baselineY}`,
      ...points.map((p) => `L ${sx(p.x)},${sy(p.pdf)}`),
      `L ${sx(points[points.length - 1].x)},${baselineY}`,
      "Z",
    ].join(" ");
    const shadePts = points.filter((p) => inShade(p.x));
    const shadePath =
      shadePts.length > 0
        ? [
            `M ${sx(shadePts[0].x)},${baselineY}`,
            ...shadePts.map((p) => `L ${sx(p.x)},${sy(p.pdf)}`),
            `L ${sx(shadePts[shadePts.length - 1].x)},${baselineY}`,
            "Z",
          ].join(" ")
        : "";
    body = (
      <>
        <path d={areaPath} fill={accent} fillOpacity={0.14} stroke="none" />
        {shadePath && (
          <path d={shadePath} fill={accent} fillOpacity={0.4} stroke="none" />
        )}
        <path
          d={points
            .map((p, i) => `${i === 0 ? "M" : "L"} ${sx(p.x)},${sy(p.pdf)}`)
            .join(" ")}
          fill="none"
          stroke={accent}
          strokeWidth={1.5}
          strokeLinejoin="round"
        />
      </>
    );
  }

  return (
    <svg
      className="DistributionNode__plot"
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={`distribution plot: pdf shaded over [${dist.lo}, ${dist.hi}]`}
    >
      {baseline}
      {body}
    </svg>
  );
};
