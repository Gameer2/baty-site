import { beforeEach, describe, expect, it, vi } from "vitest";

import { archetypeFromSpec } from "../syntropy/nodes/dispatch";
import { SYMPY_CAS_TIMEOUT_MS } from "../syntropy/portSpecs/casRunHelpers";
import { REAL_INTEGRALS_RESIDUES_PORT_SPEC } from "../syntropy/portSpecs/realIntegralsResidues";

const { casCallMock } = vi.hoisted(() => ({ casCallMock: vi.fn() }));
vi.mock("../syntropy/cas/casClient", () => ({ casCall: casCallMock }));

describe("REAL_INTEGRALS_RESIDUES_PORT_SPEC", () => {
  beforeEach(() => {
    casCallMock.mockReset();
    casCallMock.mockImplementation(async (_op: string, args: unknown[]) => {
      const mode = args[1] as string;
      // ∫_{-∞}^{∞} 1/(1+x^2) dx = π ; half = π/2.
      const value = mode === "half" ? Math.PI / 2 : Math.PI;
      return {
        ok: true,
        mode,
        value: { re: value, im: 0 },
        valueExact: mode === "half" ? "pi/2" : "pi",
        poles: ["i"],
        numericCheck: value,
        verified: true,
      };
    });
  });

  it("identifies the complex/real-integrals-residues run-mode method", () => {
    expect(REAL_INTEGRALS_RESIDUES_PORT_SPEC.engineId).toBe("complex");
    expect(REAL_INTEGRALS_RESIDUES_PORT_SPEC.methodId).toBe(
      "real-integrals-residues",
    );
    expect(REAL_INTEGRALS_RESIDUES_PORT_SPEC.executionMode).toBe("run");
    expect(REAL_INTEGRALS_RESIDUES_PORT_SPEC.pageStoreKey).toBe(
      "engine-lab:complex-real-integrals-residues",
    );
  });

  it("declares the number output first so the archetype is scalar", () => {
    expect(REAL_INTEGRALS_RESIDUES_PORT_SPEC.outputs[0].kind).toBe("number");
    expect(archetypeFromSpec(REAL_INTEGRALS_RESIDUES_PORT_SPEC)).toBe("scalar");
  });

  it("compute() is a sync placeholder returning an empty (not-yet-run) result", () => {
    expect(REAL_INTEGRALS_RESIDUES_PORT_SPEC.compute({}).outputs).toEqual({});
  });

  it("computeRun (whole) passes f + mode and surfaces the real value + poles", async () => {
    const result = await REAL_INTEGRALS_RESIDUES_PORT_SPEC.computeRun?.({
      f: "1/(1+x^2)",
      mode: "whole",
    });
    expect(casCallMock).toHaveBeenCalledWith(
      "realIntegralsResidues",
      ["1/(1+x^2)", "whole"],
      SYMPY_CAS_TIMEOUT_MS,
    );
    expect(result?.error).toBeUndefined();
    expect(result?.outputs.value).toBeCloseTo(Math.PI, 6);
    expect(result?.outputs.poles).toBe("i");
  });

  it("computeRun (half) halves the value for ∫_{0}^{∞}", async () => {
    const result = await REAL_INTEGRALS_RESIDUES_PORT_SPEC.computeRun?.({
      f: "1/(1+x^2)",
      mode: "half",
    });
    expect(casCallMock).toHaveBeenCalledWith(
      "realIntegralsResidues",
      ["1/(1+x^2)", "half"],
      SYMPY_CAS_TIMEOUT_MS,
    );
    expect(result?.outputs.value).toBeCloseTo(Math.PI / 2, 6);
  });

  it("rejects an unknown mode before calling the CAS", async () => {
    const result = await REAL_INTEGRALS_RESIDUES_PORT_SPEC.computeRun?.({
      f: "1/(1+x^2)",
      mode: "bogus",
    });
    expect(result?.outputs).toEqual({});
    expect(result?.error).toContain('"whole"');
    expect(casCallMock).not.toHaveBeenCalled();
  });
});
