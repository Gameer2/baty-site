import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { NodeShell, PortDot } from "../../syntropy/nodes/NodeShell";

import type { PortSpec } from "../../syntropy/portSpecs/types";

const SPEC = {
  engineId: "numerical",
  methodId: "x",
  inputs: [],
  outputs: [],
  compute: () => ({ outputs: {} }),
  executionMode: "live",
  pagePath: "/x",
  pageStoreKey: "x",
} as unknown as PortSpec;

describe("NodeShell", () => {
  it("renders the node title and an Open portal that fires onPortalClick", () => {
    const onPortalClick = vi.fn();
    render(
      <NodeShell
        name="Newton"
        accent="#5c939f"
        nodeId="n1"
        spec={SPEC}
        onPortalClick={onPortalClick}
      >
        <p>body</p>
      </NodeShell>,
    );
    expect(screen.getByText("Newton")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /open/i }));
    expect(onPortalClick).toHaveBeenCalledTimes(1);
  });

  it("sets the --node-accent CSS variable on the root", () => {
    const { container } = render(
      <NodeShell
        name="N"
        accent="#abcdef"
        nodeId="n1"
        spec={SPEC}
        onPortalClick={() => {}}
      >
        <p />
      </NodeShell>,
    );
    const root = container.firstChild as HTMLElement;
    expect(root.style.getPropertyValue("--node-accent")).toBe("#abcdef");
  });
});

describe("PortDot", () => {
  it("emits the wiring contract data attributes for an input port", () => {
    const { container } = render(
      <PortDot role="input" nodeId="n1" portKey="x0" kind="number" />,
    );
    const dot = container.querySelector('[data-syntropy-port="input"]');
    expect(dot).toBeTruthy();
    expect(dot?.getAttribute("data-port-node-id")).toBe("n1");
    expect(dot?.getAttribute("data-port-key")).toBe("x0");
  });

  it("reports pointerdown with nothing extra (NodeOverlay owns the drag state machine)", () => {
    const onPointerDown = vi.fn();
    const { container } = render(
      <PortDot
        role="output"
        nodeId="n1"
        portKey="root"
        kind="number"
        onPointerDown={onPointerDown}
      />,
    );
    const dot = container.querySelector('[data-syntropy-port="output"]')!;
    fireEvent.pointerDown(dot);
    expect(onPointerDown).toHaveBeenCalledTimes(1);
  });
});
