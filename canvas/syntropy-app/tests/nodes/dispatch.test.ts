import { describe, expect, it } from "vitest";

import { archetypeFromSpec } from "../../syntropy/nodes/dispatch";
import { RIEMANN_SUMS_PORT_SPEC } from "../../syntropy/portSpecs/riemannSums";
import { NEWTON_RAPHSON_PORT_SPEC } from "../../syntropy/portSpecs/newtonRaphson";

import type { PortSpec } from "../../syntropy/portSpecs/types";

const specWith = (kinds: string[]): PortSpec =>
  ({
    engineId: "numerical",
    methodId: "x",
    inputs: [],
    outputs: kinds.map((k, i) => ({
      key: `o${i}`,
      label: `o${i}`,
      kind: k as never,
    })),
    compute: () => ({ outputs: {} }),
    executionMode: "live",
    pagePath: "/x",
    pageStoreKey: "x",
  } as PortSpec);

describe("archetypeFromSpec", () => {
  it("derives trace from a trace output", () => {
    expect(archetypeFromSpec(specWith(["trace", "number"]))).toBe("trace");
  });
  it("derives real-line from a curve output", () => {
    expect(archetypeFromSpec(specWith(["curve"]))).toBe("real-line");
  });
  it("derives matrix from a matrix output", () => {
    expect(archetypeFromSpec(specWith(["matrix"]))).toBe("matrix");
  });
  it("derives matrix from an eigenpairs output", () => {
    expect(archetypeFromSpec(specWith(["eigenpairs"]))).toBe("matrix");
  });
  it("derives field from a field output", () => {
    expect(archetypeFromSpec(specWith(["field"]))).toBe("field");
  });
  it("derives distribution from a distribution output", () => {
    expect(archetypeFromSpec(specWith(["distribution"]))).toBe("distribution");
  });
  it("falls back to scalar when only number/text outputs remain", () => {
    expect(archetypeFromSpec(specWith(["number", "text"]))).toBe("scalar");
  });
  it("falls back to scalar when there are no outputs", () => {
    expect(archetypeFromSpec(specWith([]))).toBe("scalar");
  });
  it("a number output alongside a rich kind still derives the rich archetype", () => {
    expect(archetypeFromSpec(specWith(["number", "trace"]))).toBe("trace");
  });

  it("riemann (curve) is real-line, newton-raphson (trace) is trace", () => {
    expect(archetypeFromSpec(RIEMANN_SUMS_PORT_SPEC)).toBe("real-line");
    // newton-raphson migrated to the trace archetype — its compute() builds the runNewton
    // iteration array and now surfaces it as a `trace` output.
    expect(archetypeFromSpec(NEWTON_RAPHSON_PORT_SPEC)).toBe("trace");
  });
});
