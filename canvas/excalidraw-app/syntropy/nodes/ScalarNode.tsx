import { useState } from "react";

import { openMethodPage } from "../portalPrefill";

import { NodeShell, PortDot } from "./NodeShell";
import { NodeStatus } from "./NodeStatus";
import { useNodeCompute, type RunResult } from "./useNodeCompute";

import "./ScalarNode.scss";

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
  onRunResult?: (nodeId: string, result: RunResult) => void;
  readOnly?: boolean;
};

/** The scalar archetype: inputs-as-wells + number/text output stat rows. This is the literal
 *  body of the old SyntropyNodeCard, re-homed behind the shared NodeShell + PortDot — behavior
 *  and appearance unchanged. Curve outputs route to RealLineNode, so a spec that reaches here
 *  carries only number/text outputs. */
export const ScalarNode = ({
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
  const {
    outputs,
    error: localError,
    pending,
    stale,
  } = useNodeCompute(nodeId, spec, effectiveLocalInputs, onRunResult);
  // Suppress a stale error while a run is in flight so "running…" is the only status shown.
  const displayError = pending ? undefined : error ?? localError;

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
              <PortDot
                role="input"
                nodeId={nodeId}
                portKey={input.key}
                kind="number"
              />
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

      <NodeStatus pending={pending} stale={stale} />

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
