import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { DistributionNode } from "../../syntropy/nodes/DistributionNode";

import type { PortSpec } from "../../syntropy/portSpecs/types";
import type { WiredComputeResult } from "../../syntropy/wiring";

/** A self-contained distribution spec: a sampled normal-ish pdf over a half-step grid (so the
 *  renderer takes the continuous area path, not the discrete bars) with a [−1, 1] shade region,
 *  plus a scalar `probability` output with an output port dot. Isolated from the real spec
 *  migrations so the renderer test doesn't depend on migration order. */
const DIST_SPEC: PortSpec = {
  engineId: "statistics",
  methodId: "distribution-fixture",
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
        // Half-step x's (non-integer) => continuous area curve; -1 and 1 are sample x's so the
        // shade clips exactly.
        points: [
          { x: -3, pdf: 0.004, cdf: 0.001 },
          { x: -2.5, pdf: 0.018, cdf: 0.006 },
          { x: -2, pdf: 0.054, cdf: 0.023 },
          { x: -1.5, pdf: 0.13, cdf: 0.067 },
          { x: -1, pdf: 0.242, cdf: 0.159 },
          { x: -0.5, pdf: 0.352, cdf: 0.309 },
          { x: 0, pdf: 0.399, cdf: 0.5 },
          { x: 0.5, pdf: 0.352, cdf: 0.691 },
          { x: 1, pdf: 0.242, cdf: 0.841 },
          { x: 1.5, pdf: 0.13, cdf: 0.933 },
          { x: 2, pdf: 0.054, cdf: 0.977 },
          { x: 2.5, pdf: 0.018, cdf: 0.994 },
          { x: 3, pdf: 0.004, cdf: 0.999 },
        ],
        lo: -1,
        hi: 1,
      },
      probability: 0.682,
    },
  }),
};

const INPUTS = { mean: 0, sd: 1, x: 1 };
const NODE_ID = "d";

const resultFor = (): WiredComputeResult => ({
  ...DIST_SPEC.compute(INPUTS),
  wiredInputKeys: new Set(),
  effectiveInputs: INPUTS,
});

describe("DistributionNode", () => {
  it("renders the distribution output as a pdf plot SVG with the shade region in its label", () => {
    const { container } = render(
      <DistributionNode
        nodeId={NODE_ID}
        spec={DIST_SPEC}
        name="Continuous Distributions"
        accent="#c99a3c"
        inputs={INPUTS}
        onInputsChange={() => {}}
        computedResult={resultFor()}
        onOutputPortPointerDown={() => {}}
      />,
    );
    const svg = container.querySelector(
      'svg[aria-label*="distribution"]',
    ) as SVGSVGElement | null;
    expect(svg).toBeTruthy();
    // The shade region [lo, hi] is named in the aria-label so the shaded area is legible to AT.
    expect(svg?.getAttribute("aria-label")).toContain("[-1, 1]");
  });

  it("renders the shaded region as a denser fill path over the faint area", () => {
    const { container } = render(
      <DistributionNode
        nodeId={NODE_ID}
        spec={DIST_SPEC}
        name="Continuous Distributions"
        accent="#c99a3c"
        inputs={INPUTS}
        onInputsChange={() => {}}
        computedResult={resultFor()}
        onOutputPortPointerDown={() => {}}
      />,
    );
    // Continuous render = faint area + denser shade + stroke = at least 2 paths. The shade path
    // is the second; a bare curve would render only the area + stroke, so ≥3 here proves the
    // shade drew.
    const paths = container.querySelectorAll("svg path");
    expect(paths.length).toBeGreaterThanOrEqual(3);
  });

  it("renders number outputs as scalar stat rows with an output port dot", () => {
    const { container } = render(
      <DistributionNode
        nodeId={NODE_ID}
        spec={DIST_SPEC}
        name="Continuous Distributions"
        accent="#c99a3c"
        inputs={INPUTS}
        onInputsChange={() => {}}
        computedResult={resultFor()}
        onOutputPortPointerDown={() => {}}
      />,
    );
    expect(screen.getByText("P(X<=x)")).toBeTruthy();
    const port = container.querySelector(
      '[data-syntropy-port="output"][data-port-key="probability"]',
    );
    expect(port).toBeTruthy();
    expect(port?.getAttribute("data-port-node-id")).toBe(NODE_ID);
  });

  it("reports an output port pointerdown with its key", () => {
    const onDown = vi.fn();
    const { container } = render(
      <DistributionNode
        nodeId={NODE_ID}
        spec={DIST_SPEC}
        name="Continuous Distributions"
        accent="#c99a3c"
        inputs={INPUTS}
        onInputsChange={() => {}}
        computedResult={resultFor()}
        onOutputPortPointerDown={onDown}
      />,
    );
    const port = container.querySelector(
      '[data-syntropy-port="output"][data-port-key="probability"]',
    )!;
    fireEvent.pointerDown(port);
    expect(onDown).toHaveBeenCalledTimes(1);
    expect(onDown.mock.calls[0][0]).toBe("probability");
  });

  it("renders a wired input read-only with the upstream value", () => {
    render(
      <DistributionNode
        nodeId={NODE_ID}
        spec={DIST_SPEC}
        name="Continuous Distributions"
        accent="#c99a3c"
        inputs={INPUTS}
        onInputsChange={() => {}}
        computedResult={{
          ...DIST_SPEC.compute(INPUTS),
          wiredInputKeys: new Set(["sd"]),
          effectiveInputs: { ...INPUTS, sd: 2 },
        }}
        onOutputPortPointerDown={() => {}}
      />,
    );
    const well = screen.getByLabelText("sd") as HTMLInputElement;
    expect(well.disabled).toBe(true);
    expect(well.value).toBe("2");
  });
});
