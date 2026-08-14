import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { NodeBody } from "../../syntropy/nodes/dispatch";
import { RIEMANN_SUMS_PORT_SPEC } from "../../syntropy/portSpecs/riemannSums";
import { NEWTON_RAPHSON_PORT_SPEC } from "../../syntropy/portSpecs/newtonRaphson";

import type { WiredComputeResult } from "../../syntropy/wiring";

const DEFAULT_RIEMANN = { fx: "x", a: 0, b: 2, n: 2 };
const resultFor = (inputs: Record<string, unknown>): WiredComputeResult => ({
  ...RIEMANN_SUMS_PORT_SPEC.compute(inputs),
  wiredInputKeys: new Set(),
  effectiveInputs: inputs,
});

describe("NodeBody dispatcher", () => {
  it("renders the scalar archetype body for a number-only spec (newton-raphson)", () => {
    const r: WiredComputeResult = {
      ...NEWTON_RAPHSON_PORT_SPEC.compute({
        fx: "x^3 - x - 2",
        x0: 1.5,
        tol: 0.000001,
        maxIter: 30,
      }),
      wiredInputKeys: new Set(),
      effectiveInputs: {
        fx: "x^3 - x - 2",
        x0: 1.5,
        tol: 0.000001,
        maxIter: 30,
      },
    };
    render(
      <NodeBody
        nodeId="n"
        spec={NEWTON_RAPHSON_PORT_SPEC}
        name="Newton–Raphson"
        accent="#5c939f"
        inputs={{ fx: "x^3 - x - 2", x0: 1.5, tol: 0.000001, maxIter: 30 }}
        onInputsChange={() => {}}
        computedResult={r}
        onOutputPortPointerDown={() => {}}
      />,
    );
    expect(screen.getByText("Newton–Raphson")).toBeTruthy();
    expect(screen.getByLabelText("f(x)")).toBeTruthy();
  });

  it("renders ScalarNode (v1 fallback) for a curve spec too, preserving port-dot attributes", () => {
    const { container } = render(
      <NodeBody
        nodeId="n"
        spec={RIEMANN_SUMS_PORT_SPEC}
        name="Riemann Sums"
        accent="#4f9e82"
        inputs={DEFAULT_RIEMANN}
        onInputsChange={() => {}}
        computedResult={resultFor(DEFAULT_RIEMANN)}
        onOutputPortPointerDown={() => {}}
      />,
    );
    // curve archetype is "real-line" but no RealLineNode exists yet — v1 falls back to ScalarNode,
    // which still renders the output port dot with the wiring contract attributes intact.
    const out = container.querySelector(
      '[data-syntropy-port="output"][data-port-key="total"]',
    );
    expect(out).toBeTruthy();
    expect(out?.getAttribute("data-port-node-id")).toBe("n");
  });
});
