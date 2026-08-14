import { describe, expect, it } from "vitest";

import { archetypeFromSpec } from "../syntropy/nodes/dispatch";
import { CONTINUED_FRACTIONS_PORT_SPEC } from "../syntropy/portSpecs/continuedFractions";
import { LINEAR_CONGRUENCES_PORT_SPEC } from "../syntropy/portSpecs/linearCongruences";
import { PRIME_FACTORISATION_PORT_SPEC } from "../syntropy/portSpecs/primeFactorisation";
import { ALL_PORT_SPECS } from "../syntropy/portSpecs/registry";
import {
  PORT_INPUT_KINDS,
  PORT_OUTPUT_KINDS,
  type ComputeResult,
  type PortSpec,
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

// A run-mode fixture: `executionMode: "run"`, a sync `compute` placeholder, and the real async
// result in `computeRun` (the CAS-bridge shape the Foundation contract widens to). This is the
// shape the Calculus/Complex/ODE rollouts will give their CAS-backed specs. See
// docs/superpowers/specs/2026-08-14-syntropy-async-run-and-symbolic-design.md §4.
const RUN_FIXTURE: PortSpec = {
  engineId: "calculus",
  methodId: "antiderivative-fixture",
  inputs: [{ key: "f", label: "f(x)", kind: "expression", default: "x^2" }],
  outputs: [
    { key: "e", label: "∫f dx", kind: "expression" },
    { key: "n", label: "terms", kind: "number" },
  ],
  // The sync placeholder a run-mode spec returns before its first Run — the render path and wiring
  // never read a run spec's real result from here (they branch on executionMode), so an empty
  // result is honest: "not run yet."
  compute: (): ComputeResult => ({ outputs: {} }),
  computeRun: async (inputs) => {
    const f = String(inputs.f ?? "x^2");
    return {
      outputs: {
        e: { display: `∫ ${f} dx = (${f.replace(/\^/g, "**")})·x` },
        n: 1,
      },
    };
  },
  executionMode: "run",
  pagePath: "/calculus/antiderivative-fixture",
  pageStoreKey: "antiderivative-fixture-state",
};

describe("run-mode async compute contract", () => {
  it("accepts executionMode 'run' with a sync compute placeholder + async computeRun", () => {
    expect(RUN_FIXTURE.executionMode).toBe("run");
    expect(typeof RUN_FIXTURE.computeRun).toBe("function");
    // The sync placeholder returns an empty (not-yet-run) result.
    expect(RUN_FIXTURE.compute({ f: "x^2" }).outputs).toEqual({});
  });

  it("computeRun returns a Promise resolving to the declared output shapes", async () => {
    const ret = RUN_FIXTURE.computeRun?.({ f: "x^2" });
    expect(ret).toBeInstanceOf(Promise);
    const result = await ret;
    expect(result?.outputs.e).toEqual({
      display: "∫ x^2 dx = (x**2)·x",
    });
    expect(result?.outputs.n).toBe(1);
  });
});
