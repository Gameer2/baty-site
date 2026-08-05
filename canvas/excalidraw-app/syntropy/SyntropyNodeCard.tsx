import { useMemo } from "react";

import "./SyntropyNodeCard.scss";

import { RiemannPlot } from "./RiemannPlot";
import { openMethodPage } from "./portalPrefill";

import type { PortSpec } from "./portSpecs/types";

type SyntropyNodeCardProps = {
  spec: PortSpec;
  name: string;
  accent: string;
  inputs: Record<string, unknown>;
  onInputsChange: (next: Record<string, unknown>) => void;
};

/**
 * The real, interactive replacement for SyntropyNode's placeholder shell — but ONLY for methods
 * with a port spec (Task 2's registry). Rendered by NodeOverlay (Task 8) in a DOM layer outside
 * Excalidraw's own tree, so — unlike SyntropyNode.tsx, which still renders through
 * renderEmbeddable and is still pointer-events-gated — every control here is clickable and
 * editable without first double-clicking into the node.
 */
export const SyntropyNodeCard = ({
  spec,
  name,
  accent,
  inputs,
  onInputsChange,
}: SyntropyNodeCardProps) => {
  const result = useMemo(() => spec.compute(inputs), [spec, inputs]);

  const handleInputChange = (
    key: string,
    rawValue: string,
    kind: "expression" | "number",
  ) => {
    const value = kind === "number" ? Number(rawValue) : rawValue;
    onInputsChange({ ...inputs, [key]: value });
  };

  const plotOutput = spec.outputs.find((o) => o.kind === "plot2d");
  const numberOutputs = spec.outputs.filter((o) => o.kind === "number");

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
          onClick={() => openMethodPage(spec, inputs)}
        >
          Open ↗
        </button>
      </div>
      <div className="SyntropyNodeCard__body">
        {spec.inputs.map((input) => (
          <div className="SyntropyNodeCard__scrub" key={input.key}>
            <div className="SyntropyNodeCard__scrubRow">
              <label
                className="SyntropyNodeCard__scrubLabel"
                htmlFor={`${spec.methodId}-${input.key}`}
              >
                {input.label}
              </label>
              <input
                id={`${spec.methodId}-${input.key}`}
                aria-label={input.label}
                className="SyntropyNodeCard__scrubValue"
                type={input.kind === "number" ? "number" : "text"}
                value={String(inputs[input.key] ?? "")}
                onChange={(e) =>
                  handleInputChange(input.key, e.target.value, input.kind)
                }
              />
            </div>
          </div>
        ))}

        {result.error && (
          <p className="SyntropyNodeCard__error">{result.error}</p>
        )}

        {!result.error && plotOutput && (
          <div className="SyntropyNodeCard__plot">
            <RiemannPlot
              rectangles={
                (result.outputs[plotOutput.key] as never[] | undefined) ?? []
              }
              accent={accent}
            />
          </div>
        )}

        {!result.error && (
          <div className="SyntropyNodeCard__output">
            {numberOutputs.map((output) => (
              <div className="SyntropyNodeCard__outRow" key={output.key}>
                <span className="SyntropyNodeCard__outKey">{output.label}</span>
                <span className="SyntropyNodeCard__outVal">
                  {typeof result.outputs[output.key] === "number"
                    ? (result.outputs[output.key] as number).toFixed(3)
                    : "—"}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
