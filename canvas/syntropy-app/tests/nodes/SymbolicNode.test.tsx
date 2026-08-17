import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { SymbolicNode } from "../../syntropy/nodes/SymbolicNode";

import type {
  ExpressionOutput,
  PortSpec,
} from "../../syntropy/portSpecs/types";
import type { WiredComputeResult } from "../../syntropy/wiring";

const NODE_ID = "s";
const INPUTS = { n: "12" };

/** A self-contained symbolic spec whose compute returns the given expression + a scalar `n`
 *  output with a port dot. relation:"factorization" opts into the structured-form rendering. */
const specFor = (expr: ExpressionOutput): PortSpec => ({
  engineId: "number-theory",
  methodId: "symbolic-fixture",
  inputs: [{ key: "n", label: "n", kind: "expression", default: "12" }],
  outputs: [
    { key: "expr", label: "factorization", kind: "expression" },
    { key: "count", label: "count", kind: "number" },
  ],
  executionMode: "live",
  pagePath: "/math-lab/engines/number-theory/methods/prime-factorisation.html",
  pageStoreKey: "engine-lab:number-theory-symbolic-fixture",
  relation: "factorization",
  compute: () => ({ outputs: { expr, count: 2 } }),
});

const resultFor = (spec: PortSpec): WiredComputeResult => ({
  ...spec.compute(INPUTS),
  wiredInputKeys: new Set(),
  effectiveInputs: INPUTS,
});

const renderNode = (spec: PortSpec, computedResult?: WiredComputeResult) =>
  render(
    <SymbolicNode
      nodeId={NODE_ID}
      spec={spec}
      name="Prime Factorisation"
      accent="#a3623c"
      inputs={INPUTS}
      onInputsChange={() => {}}
      computedResult={computedResult ?? resultFor(spec)}
      onOutputPortPointerDown={() => {}}
    />,
  );

describe("SymbolicNode", () => {
  it("renders a factorization structured form as `n = p^e · …` with superscript exponents", () => {
    const { container } = renderNode(
      specFor({
        display: "12 = 2^2 · 3",
        structured: {
          kind: "factorization",
          factors: [
            { base: "2", exponent: 2 },
            { base: "3", exponent: 1 },
          ],
        },
      }),
    );
    // The expression area is present.
    expect(container.querySelector("[data-syntropy-symbolic]")).toBeTruthy();
    // LHS "12" renders, base "2" and "3" render, exponent "2" renders as a superscript.
    expect(container.textContent).toContain("12");
    expect(container.textContent).toContain("2");
    expect(container.textContent).toContain("3");
    const sup = container.querySelector("[data-syntropy-symbolic] sup");
    expect(sup).toBeTruthy();
    expect(sup?.textContent).toBe("2");
  });

  it("renders a continuedFraction structured form with the period under an overline", () => {
    const { container } = renderNode(
      specFor({
        display: "[1; 2, 2, ...]",
        structured: { kind: "continuedFraction", a0: "1", period: ["2"] },
      }),
    );
    // a0 and the period render inside the expression area.
    expect(container.textContent).toContain("1");
    expect(container.textContent).toContain("2");
    const overline = container.querySelector(".SymbolicNode__exprOverline");
    expect(overline).toBeTruthy();
    expect(overline?.textContent).toBe("2");
  });

  it("renders a congruenceSet structured form with the mod clause", () => {
    const { container } = renderNode(
      specFor({
        display: "x ≡ 2, 5 (mod 6)",
        structured: {
          kind: "congruenceSet",
          modulus: "6",
          solutions: ["2", "5"],
        },
      }),
    );
    expect(container.textContent).toContain("x ≡");
    expect(container.textContent).toContain("2");
    expect(container.textContent).toContain("5");
    expect(container.textContent).toContain("mod");
    expect(container.textContent).toContain("6");
  });

  it("renders the display string as a monospace line when structured is plain/absent", () => {
    const spec = { ...specFor({ display: "2*x^2 + 3" }) };
    // plain: drop the factorization relation so it falls back to the display line.
    const plainSpec: PortSpec = {
      ...spec,
      relation: undefined,
      compute: () => ({
        outputs: {
          expr: { display: "2*x^2 + 3" } as ExpressionOutput,
          count: 2,
        },
      }),
    };
    const { container } = renderNode(plainSpec);
    expect(container.textContent).toContain("2*x^2 + 3");
  });

  it("renders number outputs as scalar stat rows with an output port dot", () => {
    const { container } = renderNode(
      specFor({
        display: "12 = 2^2 · 3",
        structured: {
          kind: "factorization",
          factors: [
            { base: "2", exponent: 2 },
            { base: "3", exponent: 1 },
          ],
        },
      }),
    );
    expect(screen.getByText("count")).toBeTruthy();
    const port = container.querySelector(
      '[data-syntropy-port="output"][data-port-key="count"]',
    );
    expect(port).toBeTruthy();
    expect(port?.getAttribute("data-port-node-id")).toBe(NODE_ID);
  });

  it("reports an output port pointerdown with its key", () => {
    const onDown = vi.fn();
    const spec = specFor({
      display: "12 = 2^2 · 3",
      structured: {
        kind: "factorization",
        factors: [
          { base: "2", exponent: 2 },
          { base: "3", exponent: 1 },
        ],
      },
    });
    const { container } = render(
      <SymbolicNode
        nodeId={NODE_ID}
        spec={spec}
        name="Prime Factorisation"
        accent="#a3623c"
        inputs={INPUTS}
        onInputsChange={() => {}}
        computedResult={resultFor(spec)}
        onOutputPortPointerDown={onDown}
      />,
    );
    const port = container.querySelector(
      '[data-syntropy-port="output"][data-port-key="count"]',
    )!;
    fireEvent.pointerDown(port);
    expect(onDown).toHaveBeenCalledTimes(1);
    expect(onDown.mock.calls[0][0]).toBe("count");
  });

  it("renders a wired input read-only with the upstream value", () => {
    const spec = specFor({
      display: "12 = 2^2 · 3",
      structured: {
        kind: "factorization",
        factors: [
          { base: "2", exponent: 2 },
          { base: "3", exponent: 1 },
        ],
      },
    });
    render(
      <SymbolicNode
        nodeId={NODE_ID}
        spec={spec}
        name="Prime Factorisation"
        accent="#a3623c"
        inputs={INPUTS}
        onInputsChange={() => {}}
        computedResult={{
          ...spec.compute(INPUTS),
          wiredInputKeys: new Set(["n"]),
          effectiveInputs: { n: "360" },
        }}
        onOutputPortPointerDown={() => {}}
      />,
    );
    const well = screen.getByLabelText("n") as HTMLInputElement;
    expect(well.disabled).toBe(true);
    expect(well.value).toBe("360");
  });
});
