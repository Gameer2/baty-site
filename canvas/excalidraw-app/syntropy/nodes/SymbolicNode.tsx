import { useState } from "react";

import { openMethodPage } from "../portalPrefill";

import { NodeShell, PortDot } from "./NodeShell";

import "./SymbolicNode.scss";

import type {
  ExpressionOutput,
  PortInputKind,
  PortSpec,
} from "../portSpecs/types";
import type { WiredComputeResult } from "../wiring";

type SymbolicNodeProps = {
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

/** The symbolic archetype: scrub-chip inputs (same as the scalar card) and an output that is the
 *  method's own symbolic form — the factorization / continued-fraction / congruence set / series
 *  the core already computes — rendered as formatted math, plus the scalar summary (factor count,
 *  period length, solution count, …) as stat rows. The `expression` output carries an
 *  `ExpressionOutput` (display string + optional structured form); when `relation:
 *  "factorization"` is set the structured form is rendered with archetype-specific formatting
 *  (superscript exponents, an overlined period, a mod clause), else the display string is shown as
 *  a monospace math line. */
export const SymbolicNode = ({
  nodeId,
  spec,
  name,
  accent,
  inputs,
  onInputsChange,
  computedResult,
  onOutputPortPointerDown,
  readOnly = false,
}: SymbolicNodeProps) => {
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

  const expressionOutput = spec.outputs.find((o) => o.kind === "expression");
  const scalarOutputs = spec.outputs.filter(
    (o) => o.kind === "number" || o.kind === "text",
  );
  const expr =
    (expressionOutput &&
      (outputs[expressionOutput.key] as ExpressionOutput | undefined)) ??
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
            className={`SymbolicNode__scrub${
              isWired ? " SymbolicNode__scrub--wired" : ""
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
            <div className="SymbolicNode__scrubRow">
              <label
                className="SymbolicNode__scrubLabel"
                htmlFor={`${spec.methodId}-${input.key}`}
              >
                {isWired && (
                  <span
                    className="SymbolicNode__wireMark"
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
                className="SymbolicNode__scrubValue"
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

      {!displayError && expr && (
        <div className="SymbolicNode__expr" data-syntropy-symbolic>
          <SymbolicExpression expr={expr} relation={spec.relation} />
        </div>
      )}

      {!displayError && scalarOutputs.length > 0 && (
        <div className="SymbolicNode__output">
          {scalarOutputs.map((output) => (
            <div className="SymbolicNode__outRow" key={output.key}>
              <span className="SymbolicNode__outKey">{output.label}</span>
              <span className="SymbolicNode__outVal">
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

/** Renders the symbolic expression. A `factorization` relation renders the structured form with
 *  archetype-specific formatting (superscript exponents, an overlined continued-fraction period, a
 *  mod clause); anything else falls back to the display string as a monospace math line. */
const SymbolicExpression = ({
  expr,
  relation,
}: {
  expr: ExpressionOutput;
  relation?: "factorization";
}) => {
  const { display, structured } = expr;
  if (
    relation !== "factorization" ||
    !structured ||
    structured.kind === "plain"
  ) {
    return <code className="SymbolicNode__exprLine">{display}</code>;
  }
  if (structured.kind === "factorization") {
    // display carries the LHS ("12 = …"); split it off so the RHS factors render with superscript
    // exponents from the structured form.
    const eqIdx = display.indexOf(" = ");
    const lhs = eqIdx >= 0 ? display.slice(0, eqIdx) : display;
    return (
      <span className="SymbolicNode__exprForm">
        <span className="SymbolicNode__exprLhs">{lhs}</span>
        {" = "}
        {structured.factors.map((f, i) => (
          <span key={i}>
            {i > 0 && <span className="SymbolicNode__exprDot"> · </span>}
            <span className="SymbolicNode__exprBase">{f.base}</span>
            {f.exponent > 1 && (
              <sup className="SymbolicNode__exprExp">{f.exponent}</sup>
            )}
          </span>
        ))}
      </span>
    );
  }
  if (structured.kind === "continuedFraction") {
    return (
      <span className="SymbolicNode__exprForm">
        [<span className="SymbolicNode__exprBase">{structured.a0}</span>;{" "}
        <span className="SymbolicNode__exprOverline">
          {structured.period.join(", ")}
        </span>
        ]
      </span>
    );
  }
  if (structured.kind === "congruenceSet") {
    return (
      <span className="SymbolicNode__exprForm">
        x ≡{" "}
        <span className="SymbolicNode__exprBase">
          {structured.solutions.join(", ")}
        </span>{" "}
        (mod{" "}
        <span className="SymbolicNode__exprBase">{structured.modulus}</span>)
      </span>
    );
  }
  // series (and any other structured kind without a dedicated render) falls back to the display
  // string — the structured series render is deferred until a series method ships.
  return <code className="SymbolicNode__exprLine">{display}</code>;
};
