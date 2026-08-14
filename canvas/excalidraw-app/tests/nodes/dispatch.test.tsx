import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { NodeBody } from "../../syntropy/nodes/dispatch";
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

// A minimal distribution spec proving the dispatcher routes the distribution archetype to
// DistributionNode before any real spec is migrated (Task 19). Mirrors DistributionNode.test.tsx.
const DISTRIBUTION_FIXTURE: PortSpec = {
  engineId: "statistics",
  methodId: "dispatch-distribution-fixture",
  inputs: [
    { key: "mean", label: "mean", kind: "number", default: 0 },
    { key: "sd", label: "sd", kind: "number", default: 1 },
    { key: "x", label: "x", kind: "number", default: 1 },
  ],
  outputs: [
    { key: "distribution", label: "pdf", kind: "distribution" },
    { key: "probability", label: "P(X<=x)", kind: "number" },
  ],
  executionMode: "live",
  pagePath:
    "/math-lab/engines/statistics/methods/continuous-distributions.html",
  pageStoreKey: "engine-lab:statistics:continuous",
  compute: () => ({
    outputs: {
      distribution: {
        points: [
          { x: -2, pdf: 0.054, cdf: 0.023 },
          { x: -1, pdf: 0.242, cdf: 0.159 },
          { x: 0, pdf: 0.399, cdf: 0.5 },
          { x: 1, pdf: 0.242, cdf: 0.841 },
          { x: 2, pdf: 0.054, cdf: 0.977 },
        ],
        lo: -2,
        hi: 1,
      },
      probability: 0.84,
    },
  }),
};

// A minimal real-line spec proving the dispatcher routes the real-line (curve) archetype to
// RealLineNode before any real spec is migrated (Task 22). Mirrors the fixture in
// RealLineNode.test.tsx.
const CURVE_FIXTURE: PortSpec = {
  engineId: "calculus",
  methodId: "dispatch-real-line-fixture",
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
        fillArea: true,
      },
      total: 3.14,
    },
  }),
};

// A minimal symbolic spec proving the dispatcher routes the symbolic (expression) archetype to
// SymbolicNode. Mirrors SymbolicNode.test.tsx's fixture — isolated from the real number-theory
// migrations so the dispatch test doesn't depend on migration order.
const SYMBOLIC_FIXTURE: PortSpec = {
  engineId: "number-theory",
  methodId: "dispatch-symbolic-fixture",
  inputs: [{ key: "n", label: "n", kind: "expression", default: "12" }],
  outputs: [
    { key: "expr", label: "factorization", kind: "expression" },
    { key: "factorCount", label: "distinct primes", kind: "number" },
  ],
  executionMode: "live",
  pagePath: "/math-lab/engines/number-theory/methods/prime-factorisation.html",
  pageStoreKey: "engine-lab:number-theory-prime-factorisation",
  relation: "factorization",
  compute: () => ({
    outputs: {
      expr: {
        display: "12 = 2^2 · 3",
        structured: {
          kind: "factorization",
          factors: [
            { base: "2", exponent: 2 },
            { base: "3", exponent: 1 },
          ],
        },
      },
      factorCount: 2,
    },
  }),
};

// A minimal field spec proving the dispatcher routes the field archetype to FieldNode before any
// real spec is migrated (Task 5). Mirrors FieldNode.test.tsx's fixture — a 3×3 arrows grid over
// [-1, 1] × [-1, 1] plus a scalar `magnitude` output.
const FIELD_FIXTURE: PortSpec = {
  engineId: "ode",
  methodId: "dispatch-field-fixture",
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
  compute: () => ({
    outputs: {
      field: {
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
      },
      magnitude: 1.414,
    },
  }),
};

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

  it("routes the real-line archetype to RealLineNode (renders the curve plot, not the scalar card)", () => {
    const { container } = render(
      <NodeBody
        nodeId="n"
        spec={CURVE_FIXTURE}
        name="Riemann Sums"
        accent="#4f9e82"
        inputs={{ fx: "sin(x)+2", a: 0, b: 6 }}
        onInputsChange={() => {}}
        computedResult={{
          ...CURVE_FIXTURE.compute({ fx: "sin(x)+2", a: 0, b: 6 }),
          wiredInputKeys: new Set(),
          effectiveInputs: { fx: "sin(x)+2", a: 0, b: 6 },
        }}
        onOutputPortPointerDown={() => {}}
      />,
    );
    // RealLineNode renders the curve as an inline SVG; ScalarNode does not.
    expect(
      container.querySelector('svg[aria-label*="real-line"]'),
    ).toBeTruthy();
    // The scalar `total` output still gets its output port dot under either renderer.
    expect(
      container.querySelector(
        '[data-syntropy-port="output"][data-port-key="total"]',
      ),
    ).toBeTruthy();
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

  it("routes the distribution archetype to DistributionNode (renders the pdf plot, not the scalar card)", () => {
    const { container } = render(
      <NodeBody
        nodeId="n"
        spec={DISTRIBUTION_FIXTURE}
        name="Continuous Distributions"
        accent="#c99a3c"
        inputs={{ mean: 0, sd: 1, x: 1 }}
        onInputsChange={() => {}}
        computedResult={{
          ...DISTRIBUTION_FIXTURE.compute({ mean: 0, sd: 1, x: 1 }),
          wiredInputKeys: new Set(),
          effectiveInputs: { mean: 0, sd: 1, x: 1 },
        }}
        onOutputPortPointerDown={() => {}}
      />,
    );
    // DistributionNode renders the pdf curve as an inline SVG; ScalarNode does not.
    expect(
      container.querySelector('svg[aria-label*="distribution"]'),
    ).toBeTruthy();
    // The scalar `probability` output still gets its output port dot under either renderer.
    expect(
      container.querySelector(
        '[data-syntropy-port="output"][data-port-key="probability"]',
      ),
    ).toBeTruthy();
  });

  it("routes the symbolic archetype to SymbolicNode (renders the expression, not the scalar card)", () => {
    const { container } = render(
      <NodeBody
        nodeId="n"
        spec={SYMBOLIC_FIXTURE}
        name="Prime Factorisation"
        accent="#a3623c"
        inputs={{ n: "12" }}
        onInputsChange={() => {}}
        computedResult={{
          ...SYMBOLIC_FIXTURE.compute({ n: "12" }),
          wiredInputKeys: new Set(),
          effectiveInputs: { n: "12" },
        }}
        onOutputPortPointerDown={() => {}}
      />,
    );
    // SymbolicNode renders the expression area; ScalarNode does not.
    expect(container.querySelector("[data-syntropy-symbolic]")).toBeTruthy();
    // The scalar `factorCount` output still gets its output port dot under either renderer.
    expect(
      container.querySelector(
        '[data-syntropy-port="output"][data-port-key="factorCount"]',
      ),
    ).toBeTruthy();
  });

  it("routes the field archetype to FieldNode (renders the field plot, not the scalar card)", () => {
    const { container } = render(
      <NodeBody
        nodeId="n"
        spec={FIELD_FIXTURE}
        name="Direction Fields"
        accent="#4f8fc0"
        inputs={{ fx: "-y, x" }}
        onInputsChange={() => {}}
        computedResult={{
          ...FIELD_FIXTURE.compute({ fx: "-y, x" }),
          wiredInputKeys: new Set(),
          effectiveInputs: { fx: "-y, x" },
        }}
        onOutputPortPointerDown={() => {}}
      />,
    );
    // FieldNode renders the field as an inline SVG; ScalarNode does not.
    expect(container.querySelector('svg[aria-label*="field"]')).toBeTruthy();
    // The scalar `magnitude` output still gets its output port dot under either renderer.
    expect(
      container.querySelector(
        '[data-syntropy-port="output"][data-port-key="magnitude"]',
      ),
    ).toBeTruthy();
  });
});
