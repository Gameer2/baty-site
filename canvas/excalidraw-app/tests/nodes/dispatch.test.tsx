import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { NodeBody } from "../../syntropy/nodes/dispatch";
import { RIEMANN_SUMS_PORT_SPEC } from "../../syntropy/portSpecs/riemannSums";
import { NEWTON_RAPHSON_PORT_SPEC } from "../../syntropy/portSpecs/newtonRaphson";
import { LU_DECOMPOSITION_PORT_SPEC } from "../../syntropy/portSpecs/luDecomposition";

import type { PortSpec } from "../../syntropy/portSpecs/types";
import type { WiredComputeResult } from "../../syntropy/wiring";

// A minimal trace spec used only to prove the dispatcher routes the trace archetype to
// TraceNode before any real spec is migrated (Task 16). Mirrors the fixture in TraceNode.test.tsx.
const TRACE_FIXTURE: PortSpec = {
  engineId: "numerical",
  methodId: "dispatch-trace-fixture",
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
        { n: 1, x: 1.5, xNext: 1.210526, err: 0.289474 },
        { n: 2, x: 1.210526, xNext: 1.16335, err: 0.047176 },
      ],
      root: 1.16335,
    },
  }),
};

const DEFAULT_RIEMANN = { fx: "x", a: 0, b: 2, n: 2 };
const resultFor = (inputs: Record<string, unknown>): WiredComputeResult => ({
  ...RIEMANN_SUMS_PORT_SPEC.compute(inputs),
  wiredInputKeys: new Set(),
  effectiveInputs: inputs,
});

describe("NodeBody dispatcher", () => {
  it("routes the migrated newton-raphson spec to TraceNode (convergence plot renders)", () => {
    const inputs = { fx: "x^3 - x - 2", x0: 1.5, tol: 0.000001, maxIter: 30 };
    const r: WiredComputeResult = {
      ...NEWTON_RAPHSON_PORT_SPEC.compute(inputs),
      wiredInputKeys: new Set(),
      effectiveInputs: inputs,
    };
    const { container } = render(
      <NodeBody
        nodeId="n"
        spec={NEWTON_RAPHSON_PORT_SPEC}
        name="Newton–Raphson"
        accent="#5c939f"
        inputs={inputs}
        onInputsChange={() => {}}
        computedResult={r}
        onOutputPortPointerDown={() => {}}
      />,
    );
    // newton-raphson now declares a `trace` output, so the dispatcher routes it to TraceNode:
    // the name + f(x) scrub input render as before, plus the convergence plot (err column).
    expect(screen.getByText("Newton–Raphson")).toBeTruthy();
    expect(screen.getByLabelText("f(x)")).toBeTruthy();
    expect(
      container.querySelector('svg[aria-label*="convergence"]'),
    ).toBeTruthy();
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

  it("routes the matrix archetype to MatrixNode (renders the A = L · U factor row)", () => {
    const { container } = render(
      <NodeBody
        nodeId="n"
        spec={LU_DECOMPOSITION_PORT_SPEC}
        name="LU Decomposition"
        accent="#8570b3"
        inputs={{ A: "2,1,1;4,-6,0;-2,7,2" }}
        onInputsChange={() => {}}
        computedResult={{
          ...LU_DECOMPOSITION_PORT_SPEC.compute({ A: "2,1,1;4,-6,0;-2,7,2" }),
          wiredInputKeys: new Set(),
          effectiveInputs: { A: "2,1,1;4,-6,0;-2,7,2" },
        }}
        onOutputPortPointerDown={() => {}}
      />,
    );
    // LU's primary output is a matrix -> archetype "matrix" -> MatrixNode -> "A = L · U".
    expect(container.textContent).toContain("A =");
  });

  it("routes the trace archetype to TraceNode (renders the step table, not the scalar card)", () => {
    const { container } = render(
      <NodeBody
        nodeId="n"
        spec={TRACE_FIXTURE}
        name="Newton–Raphson"
        accent="#5c939f"
        inputs={{ fx: "x^3 - x - 2", x0: 1.5 }}
        onInputsChange={() => {}}
        computedResult={{
          ...TRACE_FIXTURE.compute({ fx: "x^3 - x - 2", x0: 1.5 }),
          wiredInputKeys: new Set(),
          effectiveInputs: { fx: "x^3 - x - 2", x0: 1.5 },
        }}
        onOutputPortPointerDown={() => {}}
      />,
    );
    // TraceNode renders the iteration columns as a step table header; ScalarNode does not.
    expect(screen.getByText("xNext")).toBeTruthy();
    // The scalar `root` output still gets its output port dot under either renderer.
    const out = container.querySelector(
      '[data-syntropy-port="output"][data-port-key="root"]',
    );
    expect(out).toBeTruthy();
  });
});
