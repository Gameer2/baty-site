import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { MatrixNode } from "../../syntropy/nodes/MatrixNode";
import { LU_DECOMPOSITION_PORT_SPEC } from "../../syntropy/portSpecs/luDecomposition";

import type { WiredComputeResult } from "../../syntropy/wiring";

const DEFAULT_INPUTS = { A: "2,1,1;4,-6,0;-2,7,2" };
const NODE_ID = "m";

const resultFor = (
  inputs: Record<string, unknown>,
  wiredInputKeys: Set<string> = new Set(),
): WiredComputeResult => ({
  ...LU_DECOMPOSITION_PORT_SPEC.compute(inputs),
  wiredInputKeys,
  effectiveInputs: inputs,
});

describe("MatrixNode", () => {
  it("renders the input matrix as an editable cell grid seeded from the parsed value", () => {
    render(
      <MatrixNode
        nodeId={NODE_ID}
        spec={LU_DECOMPOSITION_PORT_SPEC}
        name="LU Decomposition"
        accent="#8570b3"
        inputs={DEFAULT_INPUTS}
        onInputsChange={() => {}}
        computedResult={resultFor(DEFAULT_INPUTS)}
        onOutputPortPointerDown={() => {}}
      />,
    );
    // 3x3 input -> 9 number cells; the (0,0) cell holds 2.
    const cell = screen.getByLabelText("A row 1 col 1") as HTMLInputElement;
    expect(cell.value).toBe("2");
  });

  // The "renders L/U factor grids with the A = L · U convention" test lives in Task 3,
  // alongside the LU spec migration that declares L and U as matrix outputs.

  it("renders number outputs as scalar stat rows with an output port dot", () => {
    const { container } = render(
      <MatrixNode
        nodeId={NODE_ID}
        spec={LU_DECOMPOSITION_PORT_SPEC}
        name="LU Decomposition"
        accent="#8570b3"
        inputs={DEFAULT_INPUTS}
        onInputsChange={() => {}}
        computedResult={resultFor(DEFAULT_INPUTS)}
        onOutputPortPointerDown={() => {}}
      />,
    );
    expect(screen.getByText("det(A)")).toBeTruthy();
    const port = container.querySelector(
      '[data-syntropy-port="output"][data-port-key="det"]',
    );
    expect(port).toBeTruthy();
    expect(port?.getAttribute("data-port-node-id")).toBe(NODE_ID);
  });

  it("reports an output port pointerdown with its key", () => {
    const onDown = vi.fn();
    const { container } = render(
      <MatrixNode
        nodeId={NODE_ID}
        spec={LU_DECOMPOSITION_PORT_SPEC}
        name="LU Decomposition"
        accent="#8570b3"
        inputs={DEFAULT_INPUTS}
        onInputsChange={() => {}}
        computedResult={resultFor(DEFAULT_INPUTS)}
        onOutputPortPointerDown={onDown}
      />,
    );
    const port = container.querySelector(
      '[data-syntropy-port="output"][data-port-key="det"]',
    )!;
    fireEvent.pointerDown(port);
    expect(onDown).toHaveBeenCalledTimes(1);
    expect(onDown.mock.calls[0][0]).toBe("det");
  });

  it("renders a wired input read-only with the upstream value", () => {
    render(
      <MatrixNode
        nodeId={NODE_ID}
        spec={LU_DECOMPOSITION_PORT_SPEC}
        name="LU Decomposition"
        accent="#8570b3"
        inputs={DEFAULT_INPUTS}
        onInputsChange={() => {}}
        computedResult={resultFor(DEFAULT_INPUTS, new Set(["A"]))}
        onOutputPortPointerDown={() => {}}
      />,
    );
    const cell = screen.getByLabelText("A row 1 col 1") as HTMLInputElement;
    expect(cell.disabled).toBe(true);
  });
});
