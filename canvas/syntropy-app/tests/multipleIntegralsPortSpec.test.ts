import { beforeEach, describe, expect, it, vi } from "vitest";

import { archetypeFromSpec } from "../syntropy/nodes/dispatch";
import { MULTIPLE_INTEGRALS_PORT_SPEC } from "../syntropy/portSpecs/multipleIntegrals";

// Mock the CAS bridge so computeRun is deterministic and offline (no real nerdamer). The spec
// reaches casCall through casRunHelpers.runCas, which imports it from ../cas/casClient — mocking
// that module's export replaces it for runCas too.
const { casCallMock } = vi.hoisted(() => ({ casCallMock: vi.fn() }));

vi.mock("../syntropy/cas/casClient", () => ({ casCall: casCallMock }));

describe("MULTIPLE_INTEGRALS_PORT_SPEC", () => {
  beforeEach(() => casCallMock.mockReset());

  it("identifies the calculus/multiple-integrals run-mode method", () => {
    expect(MULTIPLE_INTEGRALS_PORT_SPEC.engineId).toBe("calculus");
    expect(MULTIPLE_INTEGRALS_PORT_SPEC.methodId).toBe("multiple-integrals");
    expect(MULTIPLE_INTEGRALS_PORT_SPEC.executionMode).toBe("run");
    expect(MULTIPLE_INTEGRALS_PORT_SPEC.pageStoreKey).toBe(
      "engine-lab:calculus-multiple-integrals",
    );
  });

  it("declares the value (number) output first so the archetype is scalar", () => {
    expect(MULTIPLE_INTEGRALS_PORT_SPEC.outputs[0].kind).toBe("number");
    expect(archetypeFromSpec(MULTIPLE_INTEGRALS_PORT_SPEC)).toBe("scalar");
  });

  it("compute() is a sync placeholder returning an empty (not-yet-run) result", () => {
    expect(MULTIPLE_INTEGRALS_PORT_SPEC.compute({ f: "x*y" }).outputs).toEqual(
      {},
    );
  });

  it("computeRun calls CAS.multipleIntegral(f, opts) and surfaces the numeric value", async () => {
    casCallMock.mockResolvedValue({
      ok: true,
      technique: "multiple-integral",
      mode: "cartesian",
      value: "1/8",
      numeric: 0.125,
      verified: true,
      steps: [{ rule: "Inner integral", text: "∫ x*y dy = x*y^2/2" }],
    });
    const result = await MULTIPLE_INTEGRALS_PORT_SPEC.computeRun?.({
      f: "x*y",
      mode: "cartesian",
      a: "0",
      b: "1",
      lower: "0",
      upper: "x",
    });
    expect(casCallMock).toHaveBeenCalledWith("multipleIntegral", [
      "x*y",
      { mode: "cartesian", a: "0", b: "1", lower: "0", upper: "x" },
    ]);
    expect(result?.error).toBeUndefined();
    expect(result?.outputs.value).toBe(0.125);
  });

  it("surfaces the engine's failure reason when the op does not succeed", async () => {
    casCallMock.mockResolvedValue({
      ok: false,
      reason: "The lower outer bound must be less than the upper outer bound.",
    });
    const result = await MULTIPLE_INTEGRALS_PORT_SPEC.computeRun?.({
      f: "x*y",
      mode: "cartesian",
      a: "1",
      b: "0",
      lower: "0",
      upper: "x",
    });
    expect(result?.outputs).toEqual({});
    expect(result?.error).toBe(
      "The lower outer bound must be less than the upper outer bound.",
    );
  });
});
