import { beforeEach, describe, expect, it, vi } from "vitest";

import { archetypeFromSpec } from "../syntropy/nodes/dispatch";
import { RELATED_RATES_PORT_SPEC } from "../syntropy/portSpecs/relatedRates";

// Mock the CAS bridge so computeRun is deterministic and offline (no real nerdamer). The spec
// reaches casCall through casRunHelpers.runCas, which imports it from ../cas/casClient — mocking
// that module's export replaces it for runCas too.
const { casCallMock } = vi.hoisted(() => ({ casCallMock: vi.fn() }));

vi.mock("../syntropy/cas/casClient", () => ({ casCall: casCallMock }));

describe("RELATED_RATES_PORT_SPEC", () => {
  beforeEach(() => casCallMock.mockReset());

  it("identifies the calculus/related-rates run-mode method", () => {
    expect(RELATED_RATES_PORT_SPEC.engineId).toBe("calculus");
    expect(RELATED_RATES_PORT_SPEC.methodId).toBe("related-rates");
    expect(RELATED_RATES_PORT_SPEC.executionMode).toBe("run");
    expect(RELATED_RATES_PORT_SPEC.pageStoreKey).toBe(
      "engine-lab:calculus-related-rates",
    );
  });

  it("declares the rate (number) output first so the archetype is scalar", () => {
    expect(RELATED_RATES_PORT_SPEC.outputs[0].kind).toBe("number");
    expect(archetypeFromSpec(RELATED_RATES_PORT_SPEC)).toBe("scalar");
  });

  it("compute() is a sync placeholder returning an empty (not-yet-run) result", () => {
    expect(
      RELATED_RATES_PORT_SPEC.compute({ equation: "x^2+y^2=25" }).outputs,
    ).toEqual({});
  });

  it("computeRun parses the flat inputs and calls CAS.relatedRates(equation, vars, values, knownRates, unknown)", async () => {
    casCallMock.mockResolvedValue({
      ok: true,
      technique: "related-rates",
      unknown: "y",
      result: "-(x*dx/dt)/y",
      numeric: -1.5,
      verified: true,
      steps: [{ rule: "The relationship", text: "x^2 + y^2 = 25" }],
    });
    const result = await RELATED_RATES_PORT_SPEC.computeRun?.({
      equation: "x^2+y^2=25",
      vars: "x, y",
      values: "x = 3, y = 4",
      knownRates: "dx/dt = 2",
      unknown: "y",
    });
    expect(casCallMock).toHaveBeenCalledWith("relatedRates", [
      "x^2+y^2=25",
      ["x", "y"],
      { x: "3", y: "4" },
      { x: "2" },
      "y",
    ]);
    expect(result?.error).toBeUndefined();
    expect(result?.outputs.rate).toBe(-1.5);
    expect(result?.outputs.work).toBe("The relationship: x^2 + y^2 = 25");
  });

  it("surfaces the engine's failure reason when the op does not succeed", async () => {
    casCallMock.mockResolvedValue({
      ok: false,
      reason:
        "The given values don't satisfy the relationship at this instant.",
    });
    const result = await RELATED_RATES_PORT_SPEC.computeRun?.({
      equation: "x^2+y^2=25",
      vars: "x, y",
      values: "x = 1, y = 1",
      knownRates: "dx/dt = 2",
      unknown: "y",
    });
    expect(result?.outputs).toEqual({});
    expect(result?.error).toBe(
      "The given values don't satisfy the relationship at this instant.",
    );
  });
});
