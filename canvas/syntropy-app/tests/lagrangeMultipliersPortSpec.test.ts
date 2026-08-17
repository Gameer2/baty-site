import { beforeEach, describe, expect, it, vi } from "vitest";

import { archetypeFromSpec } from "../syntropy/nodes/dispatch";
import { LAGRANGE_MULTIPLIERS_PORT_SPEC } from "../syntropy/portSpecs/lagrangeMultipliers";

// Mock the CAS bridge so computeRun is deterministic and offline (no real nerdamer). The spec
// reaches casCall through casRunHelpers.runCas, which imports it from ../cas/casClient — mocking
// that module's export replaces it for runCas too.
const { casCallMock } = vi.hoisted(() => ({ casCallMock: vi.fn() }));

vi.mock("../syntropy/cas/casClient", () => ({ casCall: casCallMock }));

describe("LAGRANGE_MULTIPLIERS_PORT_SPEC", () => {
  beforeEach(() => casCallMock.mockReset());

  it("identifies the calculus/lagrange-multipliers run-mode method", () => {
    expect(LAGRANGE_MULTIPLIERS_PORT_SPEC.engineId).toBe("calculus");
    expect(LAGRANGE_MULTIPLIERS_PORT_SPEC.methodId).toBe(
      "lagrange-multipliers",
    );
    expect(LAGRANGE_MULTIPLIERS_PORT_SPEC.executionMode).toBe("run");
    expect(LAGRANGE_MULTIPLIERS_PORT_SPEC.pageStoreKey).toBe(
      "engine-lab:calculus-lagrange-multipliers",
    );
  });

  it("declares the optimal (number) output first so the archetype is scalar", () => {
    expect(LAGRANGE_MULTIPLIERS_PORT_SPEC.outputs[0].kind).toBe("number");
    expect(archetypeFromSpec(LAGRANGE_MULTIPLIERS_PORT_SPEC)).toBe("scalar");
  });

  it("compute() is a sync placeholder returning an empty (not-yet-run) result", () => {
    expect(
      LAGRANGE_MULTIPLIERS_PORT_SPEC.compute({ f: "x*y" }).outputs,
    ).toEqual({});
  });

  it("computeRun calls CAS.lagrangeMultipliers(f, g, c, [x,y], {}) and surfaces the max extremum", async () => {
    casCallMock.mockResolvedValue({
      ok: true,
      technique: "lagrange-multipliers",
      points: [
        { x: 0.7071, y: 0.7071, lambda: 0.7071, value: 0.5, label: "max" },
        { x: -0.7071, y: -0.7071, lambda: 0.7071, value: 0.5, label: "max" },
        { x: 0.7071, y: -0.7071, lambda: -0.7071, value: -0.5, label: "min" },
      ],
      max: { x: 0.7071, y: 0.7071, lambda: 0.7071, value: 0.5, label: "max" },
      min: {
        x: 0.7071,
        y: -0.7071,
        lambda: -0.7071,
        value: -0.5,
        label: "min",
      },
      verified: true,
      steps: [{ rule: "Gradients", text: "∇f = ⟨y, x⟩, ∇g = ⟨2x, 2y⟩" }],
    });
    const result = await LAGRANGE_MULTIPLIERS_PORT_SPEC.computeRun?.({
      f: "x*y",
      g: "x^2+y^2",
      c: "1",
    });
    expect(casCallMock).toHaveBeenCalledWith("lagrangeMultipliers", [
      "x*y",
      "x^2+y^2",
      "1",
      ["x", "y"],
      {},
    ]);
    expect(result?.error).toBeUndefined();
    expect(result?.outputs.optimal).toBe(0.5);
    expect(result?.outputs.point).toBe("(0.7071, 0.7071)");
  });

  it("falls back to the min point when no max is reported", async () => {
    casCallMock.mockResolvedValue({
      ok: true,
      points: [{ x: 0, y: 0, lambda: 0, value: -1, label: "min" }],
      max: null,
      min: { x: 0, y: 0, lambda: 0, value: -1, label: "min" },
      verified: true,
      steps: [],
    });
    const result = await LAGRANGE_MULTIPLIERS_PORT_SPEC.computeRun?.({
      f: "x*y",
      g: "x^2+y^2",
      c: "1",
    });
    expect(result?.error).toBeUndefined();
    expect(result?.outputs.optimal).toBe(-1);
    expect(result?.outputs.point).toBe("(0, 0)");
  });

  it("reports an error when the op succeeds but finds no critical point", async () => {
    casCallMock.mockResolvedValue({
      ok: true,
      points: [],
      max: null,
      min: null,
      verified: true,
      steps: [],
    });
    const result = await LAGRANGE_MULTIPLIERS_PORT_SPEC.computeRun?.({
      f: "x*y",
      g: "x^2+y^2",
      c: "1",
    });
    expect(result?.outputs).toEqual({});
    expect(result?.error).toBe("No critical point found on the constraint.");
  });

  it("surfaces the engine's failure reason when the op does not succeed", async () => {
    casCallMock.mockResolvedValue({
      ok: false,
      reason: "The constraint value c must be a number.",
    });
    const result = await LAGRANGE_MULTIPLIERS_PORT_SPEC.computeRun?.({
      f: "x*y",
      g: "x^2+y^2",
      c: "foo",
    });
    expect(result?.outputs).toEqual({});
    expect(result?.error).toBe("The constraint value c must be a number.");
  });
});
