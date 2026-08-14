import { useState } from "react";

import { RiemannPlot } from "../RiemannPlot";
import { openMethodPage } from "../portalPrefill";

import { NodeShell, PortDot } from "./NodeShell";

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

      {!displayError && plotOutput && (
        <div className="ScalarNode__plot">
          <RiemannPlot
            rectangles={(outputs[plotOutput.key] as never[] | undefined) ?? []}
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
