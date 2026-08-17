import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ScalarNode } from "../../syntropy/nodes/ScalarNode";
import { RIEMANN_SUMS_PORT_SPEC } from "../../syntropy/portSpecs/riemannSums";

import type { WiredComputeResult } from "../../syntropy/wiring";

const DEFAULT_INPUTS = { fx: "x", a: 0, b: 2, n: 2 };
const NODE_ID = "test-node";

const computedResultFor = (
  inputs: Record<string, unknown>,
  wiredInputKeys: Set<string> = new Set(),
): WiredComputeResult => ({
  ...RIEMANN_SUMS_PORT_SPEC.compute(inputs),
  wiredInputKeys,
  effectiveInputs: inputs,
});

describe("ScalarNode", () => {
  it("renders one scrub chip per input, seeded from the current values", () => {
    render(
      <ScalarNode
        nodeId={NODE_ID}
        spec={RIEMANN_SUMS_PORT_SPEC}
        name="Riemann Sums"
        accent="#4f9e82"
        inputs={DEFAULT_INPUTS}
        onInputsChange={() => {}}
        computedResult={computedResultFor(DEFAULT_INPUTS)}
        onOutputPortPointerDown={() => {}}
      />,
    );
    expect(screen.getByDisplayValue("x")).toBeTruthy();
    expect(screen.getByDisplayValue("0")).toBeTruthy(); // a (unique — b and n are both 2)
  });

  it("shows the computed result passed in by the caller", () => {
    render(
      <ScalarNode
        nodeId={NODE_ID}
        spec={RIEMANN_SUMS_PORT_SPEC}
        name="Riemann Sums"
        accent="#4f9e82"
        inputs={DEFAULT_INPUTS}
        onInputsChange={() => {}}
        computedResult={computedResultFor(DEFAULT_INPUTS)}
        onOutputPortPointerDown={() => {}}
      />,
    );
    // f(x)=x on [0,2], n=2 midpoint -> total = 2 (matches the port-spec test's known case).
    expect(screen.getByText("2.000")).toBeTruthy();
  });

  it("calls onInputsChange when a scrub chip is edited", () => {
    const onInputsChange = vi.fn();
    render(
      <ScalarNode
        nodeId={NODE_ID}
        spec={RIEMANN_SUMS_PORT_SPEC}
        name="Riemann Sums"
        accent="#4f9e82"
        inputs={DEFAULT_INPUTS}
        onInputsChange={onInputsChange}
        computedResult={computedResultFor(DEFAULT_INPUTS)}
        onOutputPortPointerDown={() => {}}
      />,
    );
    fireEvent.change(screen.getByLabelText("f(x)"), {
      target: { value: "2*x" },
    });
    expect(onInputsChange).toHaveBeenCalledWith({
      ...DEFAULT_INPUTS,
      fx: "2*x",
    });
  });

  it("calls openMethodPage with the current inputs when the portal tab is clicked", () => {
    render(
      <ScalarNode
        nodeId={NODE_ID}
        spec={RIEMANN_SUMS_PORT_SPEC}
        name="Riemann Sums"
        accent="#4f9e82"
        inputs={DEFAULT_INPUTS}
        onInputsChange={() => {}}
        computedResult={computedResultFor(DEFAULT_INPUTS)}
        onOutputPortPointerDown={() => {}}
      />,
    );
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
    fireEvent.click(screen.getByRole("button", { name: /open/i }));
    expect(openSpy).toHaveBeenCalledWith(
      "../../math-lab/engines/calculus/methods/riemann-sums.html",
      "_blank",
    );
    openSpy.mockRestore();
  });

  it("renders a wired input as read-only, showing the upstream value", () => {
    const inputs = { ...DEFAULT_INPUTS, a: 999 };
    const effectiveInputs = { ...DEFAULT_INPUTS, a: 0.5 };
    render(
      <ScalarNode
        nodeId={NODE_ID}
        spec={RIEMANN_SUMS_PORT_SPEC}
        name="Riemann Sums"
        accent="#4f9e82"
        inputs={inputs}
        onInputsChange={() => {}}
        computedResult={{
          ...RIEMANN_SUMS_PORT_SPEC.compute(effectiveInputs),
          wiredInputKeys: new Set(["a"]),
          effectiveInputs,
        }}
        onOutputPortPointerDown={() => {}}
      />,
    );
    const aInput = screen.getByLabelText("a") as HTMLInputElement;
    expect(aInput.value).toBe("0.5");
    expect(aInput.disabled).toBe(true);
  });

  it("renders a draggable output port dot and reports pointerdown with its key", () => {
    const onOutputPortPointerDown = vi.fn();
    const { container } = render(
      <ScalarNode
        nodeId={NODE_ID}
        spec={RIEMANN_SUMS_PORT_SPEC}
        name="Riemann Sums"
        accent="#4f9e82"
        inputs={DEFAULT_INPUTS}
        onInputsChange={() => {}}
        computedResult={computedResultFor(DEFAULT_INPUTS)}
        onOutputPortPointerDown={onOutputPortPointerDown}
      />,
    );
    const outputPort = container.querySelector(
      '[data-syntropy-port="output"][data-port-key="total"]',
    );
    expect(outputPort).toBeTruthy();
    expect(outputPort?.getAttribute("data-port-node-id")).toBe(NODE_ID);
    fireEvent.pointerDown(outputPort!);
    expect(onOutputPortPointerDown).toHaveBeenCalledTimes(1);
    expect(onOutputPortPointerDown.mock.calls[0][0]).toBe("total");
  });

  it("renders an input port dot only for number-kind inputs", () => {
    const { container } = render(
      <ScalarNode
        nodeId={NODE_ID}
        spec={RIEMANN_SUMS_PORT_SPEC}
        name="Riemann Sums"
        accent="#4f9e82"
        inputs={DEFAULT_INPUTS}
        onInputsChange={() => {}}
        computedResult={computedResultFor(DEFAULT_INPUTS)}
        onOutputPortPointerDown={() => {}}
      />,
    );
    // fx is "expression"-kind (not wireable as a target); a/b/n are "number"-kind.
    expect(
      container.querySelector(
        '[data-syntropy-port="input"][data-port-key="fx"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-syntropy-port="input"][data-port-key="a"]',
      ),
    ).toBeTruthy();
  });
});
