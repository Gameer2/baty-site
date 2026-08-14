import { describe, expect, it } from "vitest";

import { archetypeFromSpec } from "../syntropy/nodes/dispatch";
import { CONTINUED_FRACTIONS_PORT_SPEC } from "../syntropy/portSpecs/continuedFractions";
import { LINEAR_CONGRUENCES_PORT_SPEC } from "../syntropy/portSpecs/linearCongruences";
import { PRIME_FACTORISATION_PORT_SPEC } from "../syntropy/portSpecs/primeFactorisation";
import { ALL_PORT_SPECS } from "../syntropy/portSpecs/registry";
import {
  PORT_INPUT_KINDS,
  PORT_OUTPUT_KINDS,
} from "../syntropy/portSpecs/types";

const INPUT_KINDS = new Set(PORT_INPUT_KINDS);
const OUTPUT_KINDS = new Set(PORT_OUTPUT_KINDS);

// The number-theory Symbolic residents — the three synchronous BigInt methods whose full form the
// core already returns, surfaced as an `expression` output declared first so archetypeFromSpec
// routes them to SymbolicNode. See
// docs/superpowers/specs/2026-08-14-syntropy-async-run-and-symbolic-design.md §5.
const SYMBOLIC_RESIDENTS = [
  PRIME_FACTORISATION_PORT_SPEC,
  CONTINUED_FRACTIONS_PORT_SPEC,
  LINEAR_CONGRUENCES_PORT_SPEC,
];

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

  // "expression" is promoted from an input-only kind to also an output kind carrying a symbolic
  // form (the Symbolic archetype — number-theory factorizations, CAS antiderivatives, …). See
  // docs/superpowers/specs/2026-08-14-syntropy-async-run-and-symbolic-design.md §2.
  it("expression is a declared output kind (Symbolic archetype)", () => {
    expect(OUTPUT_KINDS.has("expression")).toBe(true);
  });

  it("point is a declared input kind", () => {
    expect(INPUT_KINDS.has("point")).toBe(true);
  });

  it("the number-theory Symbolic residents declare an expression output first and route to the symbolic archetype", () => {
    for (const spec of SYMBOLIC_RESIDENTS) {
      expect(
        spec.outputs[0].kind,
        `${spec.methodId} should declare its expression output first`,
      ).toBe("expression");
      expect(
        spec.relation,
        `${spec.methodId} should carry relation:"factorization"`,
      ).toBe("factorization");
      expect(
        archetypeFromSpec(spec),
        `${spec.methodId} should resolve to the symbolic archetype`,
      ).toBe("symbolic");
    }
  });
});
