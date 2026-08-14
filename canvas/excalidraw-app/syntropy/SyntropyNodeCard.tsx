import { useState } from "react";

import "./SyntropyNodeCard.scss";

import { RiemannPlot } from "./RiemannPlot";
import { openMethodPage } from "./portalPrefill";

import type { PortInputKind, PortSpec } from "./portSpecs/types";
import type { WiredComputeResult } from "./wiring";

type SyntropyNodeCardProps = {
  nodeId: string;
  spec: PortSpec;
  name: string;
  accent: string;
  inputs: Record<string, unknown>;
  onInputsChange: (next: Record<string, unknown>) => void;
  /** Computed by NodeOverlay's single topological pass over every node + wire (wiring.ts) —
   *  used for wired inputs (which this card never edits directly) and as the starting point
   *  for this card's own local recompute. See localInputs below for why this alone isn't what
   *  drives the input fields' displayed values. */
  computedResult: WiredComputeResult;
  /** Starts a drag-to-connect from this output's port dot — NodeOverlay owns the actual drag
   *  state machine (it has to: a drag can end on a *different* card's input port), this just
   *  reports the pointerdown that begins one. See NodeOverlay.tsx. */
  onOutputPortPointerDown: (
    outputKey: string,
    event: React.PointerEvent<HTMLSpanElement>,
  ) => void;
  /** Presentation-mode mirror view — see NodeOverlay's `readOnly` doc. Only gates input editing
   *  here; wire creation is already gated once at NodeOverlay's `handleOutputPortPointerDown`, so
   *  the port dot itself doesn't need its own readOnly branch. */
  readOnly?: boolean;
};

/**
 * The real, interactive replacement for SyntropyNode's placeholder shell — but ONLY for methods
 * with a port spec (Task 2's registry). Rendered by NodeOverlay (Task 8) in a DOM layer outside
 * Excalidraw's own tree, so — unlike SyntropyNode.tsx, which still renders through
 * renderEmbeddable and is still pointer-events-gated — every control here is clickable and
 * editable without first double-clicking into the node.
 */
export const SyntropyNodeCard = ({
  nodeId,
  spec,
  name,
  accent,
  inputs,
  onInputsChange,
  computedResult,
  onOutputPortPointerDown,
  readOnly = false,
}: SyntropyNodeCardProps) => {
  const { error, wiredInputKeys, effectiveInputs } = computedResult;

  // Editable fields are local state, NOT driven by the `inputs` prop on every keystroke. The
  // `inputs` prop only updates after a round-trip through Excalidraw's scene (onInputsChange ->
  // updateScene -> onChange -> rAF-throttled flushOverlaySync in App.tsx) — up to one animation
  // frame of lag. A controlled input whose value comes from that prop gets its displayed value
  // snapped back to the pre-keystroke state on every re-render that lands before the round trip
  // completes, which drops or mangles fast typing (confirmed: "x^3 - x - 2" -> "x^x^3 - x - 2"
  // typing it at normal speed). Initializing local state once (React re-uses this component
  // instance across renders because NodeOverlay keys its wrapper by the node's element id) and
  // updating it synchronously on every keystroke makes typing instant and lossless regardless of
  // how long the persistence round trip takes; onInputsChange still fires every keystroke so the
  // committed value (and the portal prefill, and undo/redo) stays in sync.
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

  // Recomputed locally from localInputs (merged with any wired values) rather than read off
  // computedResult directly, so the card's own output/plot/error also update on every keystroke
  // instead of lagging a frame behind the scene round trip the same way the input fields used to.
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
    <div
      className="SyntropyNodeCard"
      style={{ "--node-accent": accent } as React.CSSProperties}
    >
      <div className="SyntropyNodeCard__header">
        <span className="SyntropyNodeCard__dot" />
        <span className="SyntropyNodeCard__title">{name}</span>
        <button
          type="button"
          className="SyntropyNodeCard__portal"
          aria-label={`Open ${name} in the lab`}
          onClick={() => openMethodPage(spec, localInputs)}
        >
          Open ↗
        </button>
      </div>
      <div className="SyntropyNodeCard__body">
        {spec.inputs.map((input) => {
          const isWired = wiredInputKeys.has(input.key);
          return (
            <div
              className={`SyntropyNodeCard__scrub${
                isWired ? " SyntropyNodeCard__scrub--wired" : ""
              }`}
              key={input.key}
            >
              {input.kind === "number" && (
                <span
                  className="SyntropyNodeCard__port SyntropyNodeCard__port--input"
                  data-syntropy-port="input"
                  data-port-node-id={nodeId}
                  data-port-key={input.key}
                  aria-hidden="true"
                />
              )}
              <div className="SyntropyNodeCard__scrubRow">
                <label
                  className="SyntropyNodeCard__scrubLabel"
                  htmlFor={`${spec.methodId}-${input.key}`}
                >
                  {isWired && (
                    <span
                      className="SyntropyNodeCard__wireMark"
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
                  className="SyntropyNodeCard__scrubValue"
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

        {displayError && (
          <p className="SyntropyNodeCard__error">{displayError}</p>
        )}

        {!displayError && plotOutput && (
          <div className="SyntropyNodeCard__plot">
            <RiemannPlot
              rectangles={
                (outputs[plotOutput.key] as never[] | undefined) ?? []
              }
              accent={accent}
            />
          </div>
        )}

        {!displayError && (
          <div className="SyntropyNodeCard__output">
            {scalarOutputs.map((output) => (
              <div className="SyntropyNodeCard__outRow" key={output.key}>
                <span className="SyntropyNodeCard__outKey">{output.label}</span>
                <span className="SyntropyNodeCard__outVal">
                  {output.kind === "text"
                    ? String(outputs[output.key] ?? "—")
                    : typeof outputs[output.key] === "number"
                    ? (outputs[output.key] as number).toFixed(3)
                    : "—"}
                </span>
                {/* Wiring a "text" output into another node's numeric input is never valid —
                    wiring.ts's compatibleTargetInputKeys already gates on kind === "number" — so
                    the draggable port dot is only rendered where a wire could actually land. */}
                {output.kind === "number" && (
                  <span
                    className="SyntropyNodeCard__port SyntropyNodeCard__port--output"
                    data-syntropy-port="output"
                    data-port-node-id={nodeId}
                    data-port-key={output.key}
                    onPointerDown={(e) =>
                      onOutputPortPointerDown(output.key, e)
                    }
                    role="button"
                    tabIndex={-1}
                    aria-label={`Drag to wire ${output.label} to another node`}
                  />
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
