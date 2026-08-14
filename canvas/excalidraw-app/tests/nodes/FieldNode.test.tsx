import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { FieldNode } from "../../syntropy/nodes/FieldNode";

import type { FieldOutput, PortSpec } from "../../syntropy/portSpecs/types";
import type { WiredComputeResult } from "../../syntropy/wiring";

const ACCENT = "#4f8fc0";
const NODE_ID = "f";

/** Builds a self-contained field spec whose `field` output is the given FieldOutput and whose
 *  `magnitude` scalar output carries a number with an output port dot. Isolated from the real
 *  spec migrations so the renderer test doesn't depend on migration order. */
const fieldSpec = (field: FieldOutput, magnitude = 1): PortSpec => ({
  engineId: "ode",
  methodId: "field-fixture",
  inputs: [
    { key: "fx", label: "f(x,y)", kind: "expression", default: "-y, x" },
  ],
  outputs: [
    { key: "field", label: "field", kind: "field" },
    { key: "magnitude", label: "max |v|", kind: "number" },
  ],
  executionMode: "live",
  pagePath: "/math-lab/engines/ode/methods/direction-fields.html",
  pageStoreKey: "engine-lab:ode-direction-fields",
  compute: () => ({ outputs: { field, magnitude } }),
});

const resultFor = (spec: PortSpec): WiredComputeResult => ({
  ...spec.compute({ fx: "-y, x" }),
  wiredInputKeys: new Set(),
  effectiveInputs: { fx: "-y, x" },
});

const ARROWS: FieldOutput = {
  // A pure rotation field -y, x over [-1,1]² with a zero vector at the origin (the stagnation
  // point) so the renderer exercises both the shaft path and the zero-vector dot path.
  grid: [
    [
      { x: -1, y: -1, value: 0 },
      { x: 0, y: -1, value: 0 },
      { x: 1, y: -1, value: 0 },
    ],
    [
      { x: -1, y: 0, value: 0 },
      { x: 0, y: 0, value: 0 },
      { x: 1, y: 0, value: 0 },
    ],
    [
      { x: -1, y: 1, value: 0 },
      { x: 0, y: 1, value: 0 },
      { x: 1, y: 1, value: 0 },
    ],
  ],
  vectors: [
    [
      { x: -1, y: -1, dx: 1, dy: 1 },
      { x: 0, y: -1, dx: 1, dy: 0 },
      { x: 1, y: -1, dx: 1, dy: -1 },
    ],
    [
      { x: -1, y: 0, dx: 0, dy: 1 },
      { x: 0, y: 0, dx: 0, dy: 0 },
      { x: 1, y: 0, dx: 0, dy: -1 },
    ],
    [
      { x: -1, y: 1, dx: -1, dy: 1 },
      { x: 0, y: 1, dx: -1, dy: 0 },
      { x: 1, y: 1, dx: -1, dy: -1 },
    ],
  ],
  xLo: -1,
  xHi: 1,
  yLo: -1,
  yHi: 1,
  variant: "arrows",
};

const HEATMAP: FieldOutput = {
  // A 2×2 scalar grid with distinct values so each cell shades a different accent opacity.
  grid: [
    [
      { x: 0, y: 1, value: 0 },
      { x: 1, y: 1, value: 1 },
    ],
    [
      { x: 0, y: 0, value: 2 },
      { x: 1, y: 0, value: 3 },
    ],
  ],
  xLo: 0,
  xHi: 1,
  yLo: 0,
  yHi: 1,
  variant: "heatmap",
};

const CONTOUR: FieldOutput = {
  // A 3×3 grid with a single peak at the center so the marching-squares isolines form closed
  // loops around it at every sampled level.
  grid: [
    [
      { x: 0, y: 2, value: 0 },
      { x: 1, y: 2, value: 0 },
      { x: 2, y: 2, value: 0 },
    ],
    [
      { x: 0, y: 1, value: 0 },
      { x: 1, y: 1, value: 1 },
      { x: 2, y: 1, value: 0 },
    ],
    [
      { x: 0, y: 0, value: 0 },
      { x: 1, y: 0, value: 0 },
      { x: 2, y: 0, value: 0 },
    ],
  ],
  xLo: 0,
  xHi: 2,
  yLo: 0,
  yHi: 2,
  variant: "contour",
};

const DOMAIN_COLOR: FieldOutput = {
  // A 2×2 grid with distinct values so each cell takes a distinct hue.
  grid: [
    [
      { x: 0, y: 1, value: 0 },
      { x: 1, y: 1, value: 1 },
    ],
    [
      { x: 0, y: 0, value: 2 },
      { x: 1, y: 0, value: 3 },
    ],
  ],
  xLo: 0,
  xHi: 1,
  yLo: 0,
  yHi: 1,
  variant: "domainColor",
};

const renderField = (spec: PortSpec) =>
  render(
    <FieldNode
      nodeId={NODE_ID}
      spec={spec}
      name="Direction Fields"
      accent={ACCENT}
      inputs={{ fx: "-y, x" }}
      onInputsChange={() => {}}
      computedResult={resultFor(spec)}
      onOutputPortPointerDown={() => {}}
    />,
  );

describe("FieldNode", () => {
  it("arrows: renders vector shafts as <line>s and the stagnation point as a <circle>", () => {
    const { container } = renderField(fieldSpec(ARROWS));
    const svg = container.querySelector('svg[aria-label*="arrows"]');
    expect(svg).toBeTruthy();
    // Eight non-zero vectors render as shaft lines; the origin's zero vector renders as a dot.
    expect(svg?.querySelectorAll("line").length).toBe(8);
    expect(svg?.querySelectorAll("circle").length).toBe(1);
  });

  it("heatmap: renders one shaded <rect> cell per grid point in the accent gradient", () => {
    const { container } = renderField(fieldSpec(HEATMAP));
    const svg = container.querySelector('svg[aria-label*="heatmap"]');
    expect(svg).toBeTruthy();
    // Four cells, each filled with the accent at a value-derived opacity.
    const cells = svg?.querySelectorAll(`rect[fill="${ACCENT}"]`);
    expect(cells?.length).toBe(4);
  });

  it("contour: renders the marching-squares isolines as <path>s", () => {
    const { container } = renderField(fieldSpec(CONTOUR));
    const svg = container.querySelector('svg[aria-label*="contour"]');
    expect(svg).toBeTruthy();
    // The central peak produces at least one isoline path.
    expect(svg?.querySelectorAll("path").length).toBeGreaterThan(0);
  });

  it("domainColor: renders one hue-colored <rect> cell per grid point", () => {
    const { container } = renderField(fieldSpec(DOMAIN_COLOR));
    const svg = container.querySelector('svg[aria-label*="domainColor"]');
    expect(svg).toBeTruthy();
    const rects = Array.from(svg?.querySelectorAll("rect") ?? []);
    // Four cells, each colored by an hsl(...) hue (the domain border is fill="none", excluded).
    const hueCells = rects.filter((r) =>
      (r.getAttribute("fill") ?? "").startsWith("hsl"),
    );
    expect(hueCells.length).toBe(4);
  });

  it("renders the scalar number output as a stat row with an output port dot", () => {
    const { container } = renderField(fieldSpec(ARROWS, 1.414));
    expect(screen.getByText("max |v|")).toBeTruthy();
    const port = container.querySelector(
      '[data-syntropy-port="output"][data-port-key="magnitude"]',
    );
    expect(port).toBeTruthy();
    expect(port?.getAttribute("data-port-node-id")).toBe(NODE_ID);
  });

  it("reports an output port pointerdown with its key", () => {
    const onDown = vi.fn();
    const spec = fieldSpec(ARROWS);
    const { container } = render(
      <FieldNode
        nodeId={NODE_ID}
        spec={spec}
        name="Direction Fields"
        accent={ACCENT}
        inputs={{ fx: "-y, x" }}
        onInputsChange={() => {}}
        computedResult={resultFor(spec)}
        onOutputPortPointerDown={onDown}
      />,
    );
    const port = container.querySelector(
      '[data-syntropy-port="output"][data-port-key="magnitude"]',
    )!;
    fireEvent.pointerDown(port);
    expect(onDown).toHaveBeenCalledTimes(1);
    expect(onDown.mock.calls[0][0]).toBe("magnitude");
  });

  it("renders a wired input read-only with the upstream value", () => {
    const spec = fieldSpec(ARROWS);
    render(
      <FieldNode
        nodeId={NODE_ID}
        spec={spec}
        name="Direction Fields"
        accent={ACCENT}
        inputs={{ fx: "-y, x" }}
        onInputsChange={() => {}}
        computedResult={{
          ...spec.compute({ fx: "-y, x" }),
          wiredInputKeys: new Set(["fx"]),
          effectiveInputs: { fx: "y, -x" },
        }}
        onOutputPortPointerDown={() => {}}
      />,
    );
    const well = screen.getByLabelText("f(x,y)") as HTMLInputElement;
    expect(well.disabled).toBe(true);
    expect(well.value).toBe("y, -x");
  });
});
