import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { RealLineNode } from "../../syntropy/nodes/RealLineNode";

import type { PortSpec } from "../../syntropy/portSpecs/types";
import type { WiredComputeResult } from "../../syntropy/wiring";

/** A self-contained real-line spec exercising every overlay the renderer supports: a sampled
 *  curve over [0, 6], three partition rectangles behind it, two data-point dots on top, a
 *  filled area under the curve, and a scalar `total` output with an output port dot. Isolated
 *  from the real spec migrations so the renderer test doesn't depend on migration order. */
const CURVE_SPEC: PortSpec = {
  engineId: "calculus",
  methodId: "real-line-fixture",
  inputs: [
    { key: "fx", label: "f(x)", kind: "expression", default: "sin(x)+2" },
    { key: "a", label: "a", kind: "number", default: 0 },
    { key: "b", label: "b", kind: "number", default: 6 },
  ],
  outputs: [
    { key: "curve", label: "plot", kind: "curve" },
    { key: "total", label: "total", kind: "number" },
  ],
  executionMode: "live",
  pagePath: "/math-lab/engines/calculus/methods/riemann-sums.html",
  pageStoreKey: "engine-lab:calculus-riemann-sums",
  compute: () => ({
    outputs: {
      curve: {
        points: [
          { x: 0, y: 0.5 },
          { x: 1, y: 0.9 },
          { x: 2, y: 0.1 },
          { x: 3, y: -0.3 },
          { x: 4, y: 0.2 },
          { x: 5, y: 0.8 },
          { x: 6, y: 0.4 },
        ],
        samples: [
          { x: 1, y: 0.9 },
          { x: 5, y: 0.8 },
        ],
        rectangles: [
          { x0: 0, x1: 2, height: 0.5 },
          { x0: 2, x1: 4, height: 0.2 },
          { x0: 4, x1: 6, height: 0.4 },
        ],
        fillArea: true,
      },
      total: 3.14,
    },
  }),
};

const INPUTS = { fx: "sin(x)+2", a: 0, b: 6 };
const NODE_ID = "r";

const resultFor = (): WiredComputeResult => ({
  ...CURVE_SPEC.compute(INPUTS),
  wiredInputKeys: new Set(),
  effectiveInputs: INPUTS,
});

describe("RealLineNode", () => {
  it("renders the curve as an inline SVG plot with the x-range in its aria-label", () => {
    const { container } = render(
      <RealLineNode
        nodeId={NODE_ID}
        spec={CURVE_SPEC}
        name="Riemann Sums"
        accent="#4f9e82"
        inputs={INPUTS}
        onInputsChange={() => {}}
        computedResult={resultFor()}
        onOutputPortPointerDown={() => {}}
      />,
    );
    const svg = container.querySelector(
      'svg[aria-label*="real-line"]',
    ) as SVGSVGElement | null;
    expect(svg).toBeTruthy();
    // The x-range is named in the aria-label so the plot's domain is legible to AT.
    expect(svg?.getAttribute("aria-label")).toContain("curve over [0, 6]");
  });

  it("renders the partition rectangles as bars behind the curve", () => {
    const { container } = render(
      <RealLineNode
        nodeId={NODE_ID}
        spec={CURVE_SPEC}
        name="Riemann Sums"
        accent="#4f9e82"
        inputs={INPUTS}
        onInputsChange={() => {}}
        computedResult={resultFor()}
        onOutputPortPointerDown={() => {}}
      />,
    );
    // The three rectangles render as <rect> bars; the curve is a path and the dots are circles,
    // so the rect count equals the rectangle count.
    const bars = container.querySelectorAll("svg rect");
    expect(bars.length).toBe(3);
  });

  it("renders the data points as dots on top of the curve", () => {
    const { container } = render(
      <RealLineNode
        nodeId={NODE_ID}
        spec={CURVE_SPEC}
        name="Riemann Sums"
        accent="#4f9e82"
        inputs={INPUTS}
        onInputsChange={() => {}}
        computedResult={resultFor()}
        onOutputPortPointerDown={() => {}}
      />,
    );
    const dots = container.querySelectorAll("svg circle");
    expect(dots.length).toBe(2);
  });

  it("fills the area under the curve when fillArea is set", () => {
    const { container } = render(
      <RealLineNode
        nodeId={NODE_ID}
        spec={CURVE_SPEC}
        name="Riemann Sums"
        accent="#4f9e82"
        inputs={INPUTS}
        onInputsChange={() => {}}
        computedResult={resultFor()}
        onOutputPortPointerDown={() => {}}
      />,
    );
    // The filled area is the faint (fill-opacity 0.16) path closed to the baseline; the curve
    // stroke is fill="none", so this selector picks out the area specifically.
    const area = container.querySelector('svg path[fill-opacity="0.16"]');
    expect(area).toBeTruthy();
  });

  it("renders number outputs as scalar stat rows with an output port dot", () => {
    const { container } = render(
      <RealLineNode
        nodeId={NODE_ID}
        spec={CURVE_SPEC}
        name="Riemann Sums"
        accent="#4f9e82"
        inputs={INPUTS}
        onInputsChange={() => {}}
        computedResult={resultFor()}
        onOutputPortPointerDown={() => {}}
      />,
    );
    expect(screen.getByText("total")).toBeTruthy();
    const port = container.querySelector(
      '[data-syntropy-port="output"][data-port-key="total"]',
    );
    expect(port).toBeTruthy();
    expect(port?.getAttribute("data-port-node-id")).toBe(NODE_ID);
  });

  it("reports an output port pointerdown with its key", () => {
    const onDown = vi.fn();
    const { container } = render(
      <RealLineNode
        nodeId={NODE_ID}
        spec={CURVE_SPEC}
        name="Riemann Sums"
        accent="#4f9e82"
        inputs={INPUTS}
        onInputsChange={() => {}}
        computedResult={resultFor()}
        onOutputPortPointerDown={onDown}
      />,
    );
    const port = container.querySelector(
      '[data-syntropy-port="output"][data-port-key="total"]',
    )!;
    fireEvent.pointerDown(port);
    expect(onDown).toHaveBeenCalledTimes(1);
    expect(onDown.mock.calls[0][0]).toBe("total");
  });

  it("renders a wired input read-only with the upstream value", () => {
    render(
      <RealLineNode
        nodeId={NODE_ID}
        spec={CURVE_SPEC}
        name="Riemann Sums"
        accent="#4f9e82"
        inputs={INPUTS}
        onInputsChange={() => {}}
        computedResult={{
          ...CURVE_SPEC.compute(INPUTS),
          wiredInputKeys: new Set(["b"]),
          effectiveInputs: { ...INPUTS, b: 9 },
        }}
        onOutputPortPointerDown={() => {}}
      />,
    );
    const well = screen.getByLabelText("b") as HTMLInputElement;
    expect(well.disabled).toBe(true);
    expect(well.value).toBe("9");
  });
});
