import { describe, expect, it } from "vitest";

import { ALL_PORT_SPECS } from "../syntropy/portSpecs/registry";
import {
  PORT_INPUT_KINDS,
  PORT_OUTPUT_KINDS,
} from "../syntropy/portSpecs/types";

const INPUT_KINDS = new Set(PORT_INPUT_KINDS);
const OUTPUT_KINDS = new Set(PORT_OUTPUT_KINDS);

describe("port spec contract", () => {
  it("every registered spec declares only valid input and output kinds", () => {
    for (const spec of ALL_PORT_SPECS) {
      for (const input of spec.inputs) {
        expect(
          INPUT_KINDS.has(input.kind),
          `${spec.engineId}:${spec.methodId} input "${input.key}" has invalid kind "${input.kind}"`,
        ).toBe(true);
      }
      for (const output of spec.outputs) {
        expect(
          OUTPUT_KINDS.has(output.kind),
          `${spec.engineId}:${spec.methodId} output "${output.key}" has invalid kind "${output.kind}"`,
        ).toBe(true);
      }
    }
  });

  it("the new rich output kinds are declared (trace/curve/matrix/eigenpairs/field/distribution)", () => {
    for (const kind of [
      "trace",
      "curve",
      "matrix",
      "eigenpairs",
      "field",
      "distribution",
    ] as const) {
      expect(OUTPUT_KINDS.has(kind)).toBe(true);
    }
  });

  it("plot2d is no longer a declared kind", () => {
    expect(OUTPUT_KINDS.has("plot2d" as never)).toBe(false);
  });

  it("point is a declared input kind", () => {
    expect(INPUT_KINDS.has("point")).toBe(true);
  });
});
