import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { TraceNode } from "../../syntropy/nodes/TraceNode";

import type { PortSpec } from "../../syntropy/portSpecs/types";
import type { WiredComputeResult } from "../../syntropy/wiring";

/** A self-contained trace spec: three iteration rows with a numeric `err` column (so the
 *  convergence plot renders) and a scalar `root` output with an output port dot. Isolated
 *  from the real spec migrations so the renderer test doesn't depend on migration order. */
const TRACE_SPEC: PortSpec = {
  engineId: "numerical",
  methodId: "trace-fixture",
  inputs: [
    { key: "fx", label: "f(x)", kind: "expression", default: "x^3 - x - 2" },
    { key: "x0", label: "x0", kind: "number", default: 1.5 },
  ],
  outputs: [
    { key: "steps", label: "iterations", kind: "trace" },
    { key: "root", label: "root", kind: "number" },
  ],
  executionMode: "live",
  pagePath: "/math-lab/engines/numerical/methods/newton-raphson.html",
  pageStoreKey: "engine-lab:numerical-newton-raphson",
  compute: () => ({
    outputs: {
      steps: [
        { n: 1, x: 1.5, fx: 0.875, xNext: 1.210526, err: 0.289474 },
        { n: 2, x: 1.210526, fx: 0.2193, xNext: 1.16335, err: 0.047176 },
        { n: 3, x: 1.16335, fx: 0.0247, xNext: 1.1583, err: 0.00505 },
      ],
      root: 1.1583,
    },
  }),
};

const INPUTS = { fx: "x^3 - x - 2", x0: 1.5 };
const NODE_ID = "t";

const resultFor = (): WiredComputeResult => ({
  ...TRACE_SPEC.compute(INPUTS),
  wiredInputKeys: new Set(),
  effectiveInputs: INPUTS,
});

describe("TraceNode", () => {
  it("renders the trace output as a step table with one column per row key", () => {
    const { container } = render(
      <TraceNode
        nodeId={NODE_ID}
        spec={TRACE_SPEC}
        name="Newton-Raphson"
        accent="#5c939f"
        inputs={INPUTS}
        onInputsChange={() => {}}
        computedResult={resultFor()}
        onOutputPortPointerDown={() => {}}
      />,
    );
    // Column headers come from the iteration row keys (n, x, fx, xNext, err).
    expect(screen.getByText("n")).toBeTruthy();
    expect(screen.getByText("xNext")).toBeTruthy();
    expect(screen.getByText("err")).toBeTruthy();
    // A body cell value from the first row.
    expect(container.textContent).toContain("1.2105");
  });

  it("renders number outputs as scalar stat rows with an output port dot", () => {
    const { container } = render(
      <TraceNode
        nodeId={NODE_ID}
        spec={TRACE_SPEC}
        name="Newton-Raphson"
        accent="#5c939f"
        inputs={INPUTS}
        onInputsChange={() => {}}
        computedResult={resultFor()}
        onOutputPortPointerDown={() => {}}
      />,
    );
    expect(screen.getByText("root")).toBeTruthy();
    const port = container.querySelector(
      '[data-syntropy-port="output"][data-port-key="root"]',
    );
    expect(port).toBeTruthy();
    expect(port?.getAttribute("data-port-node-id")).toBe(NODE_ID);
  });

  it("renders a convergence plot when the trace has a numeric err column", () => {
    const { container } = render(
      <TraceNode
        nodeId={NODE_ID}
        spec={TRACE_SPEC}
        name="Newton-Raphson"
        accent="#5c939f"
        inputs={INPUTS}
        onInputsChange={() => {}}
        computedResult={resultFor()}
        onOutputPortPointerDown={() => {}}
      />,
    );
    // The convergence plot is an inline SVG with an aria-label.
    expect(
      container.querySelector('svg[aria-label*="convergence"]'),
    ).toBeTruthy();
  });

  it("reports an output port pointerdown with its key", () => {
    const onDown = vi.fn();
    const { container } = render(
      <TraceNode
        nodeId={NODE_ID}
        spec={TRACE_SPEC}
        name="Newton-Raphson"
        accent="#5c939f"
        inputs={INPUTS}
        onInputsChange={() => {}}
        computedResult={resultFor()}
        onOutputPortPointerDown={onDown}
      />,
    );
    const port = container.querySelector(
      '[data-syntropy-port="output"][data-port-key="root"]',
    )!;
    fireEvent.pointerDown(port);
    expect(onDown).toHaveBeenCalledTimes(1);
    expect(onDown.mock.calls[0][0]).toBe("root");
  });

  it("renders a wired input read-only with the upstream value", () => {
    render(
      <TraceNode
        nodeId={NODE_ID}
        spec={TRACE_SPEC}
        name="Newton-Raphson"
        accent="#5c939f"
        inputs={INPUTS}
        onInputsChange={() => {}}
        computedResult={{
          ...TRACE_SPEC.compute(INPUTS),
          wiredInputKeys: new Set(["x0"]),
          effectiveInputs: { ...INPUTS, x0: 1.2 },
        }}
        onOutputPortPointerDown={() => {}}
      />,
    );
    const well = screen.getByLabelText("x0") as HTMLInputElement;
    expect(well.disabled).toBe(true);
    expect(well.value).toBe("1.2");
  });
});
