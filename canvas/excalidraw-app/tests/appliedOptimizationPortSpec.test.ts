import { beforeEach, describe, expect, it, vi } from "vitest";

import { archetypeFromSpec } from "../syntropy/nodes/dispatch";
import { APPLIED_OPTIMIZATION_PORT_SPEC } from "../syntropy/portSpecs/appliedOptimization";

// Mock the CAS bridge so computeRun is deterministic and offline (no real nerdamer). The spec
// reaches casCall through casRunHelpers.runCas, which imports it from ../cas/casClient — mocking
// that module's export replaces it for runCas too.
const { casCallMock } = vi.hoisted(() => ({ casCallMock: vi.fn() }));

vi.mock("../syntropy/cas/casClient", () => ({ casCall: casCallMock }));

describe("APPLIED_OPTIMIZATION_PORT_SPEC", () => {
  beforeEach(() => casCallMock.mockReset());

  it("identifies the calculus/applied-optimization run-mode method", () => {
    expect(APPLIED_OPTIMIZATION_PORT_SPEC.engineId).toBe("calculus");
    expect(APPLIED_OPTIMIZATION_PORT_SPEC.methodId).toBe(
      "applied-optimization",
    );
    expect(APPLIED_OPTIMIZATION_PORT_SPEC.executionMode).toBe("run");
    expect(APPLIED_OPTIMIZATION_PORT_SPEC.pageStoreKey).toBe(
      "engine-lab:calculus-applied-optimization",
    );
  });

  it("declares the optimal (number) output first so the archetype is scalar", () => {
    expect(APPLIED_OPTIMIZATION_PORT_SPEC.outputs[0].kind).toBe("number");
    expect(archetypeFromSpec(APPLIED_OPTIMIZATION_PORT_SPEC)).toBe("scalar");
  });

  it("compute() is a sync placeholder returning an empty (not-yet-run) result", () => {
    expect(
      APPLIED_OPTIMIZATION_PORT_SPEC.compute({ f: "x*(20-2*x)^2" }).outputs,
    ).toEqual({});
  });

  it("computeRun calls CAS.appliedOptimization(f, variable, a, b, goal) and surfaces the optimum", async () => {
    casCallMock.mockResolvedValue({
      ok: true,
      goal: "max",
      x: 3.3333333333333335,
      exact: "10/3",
      atEndpoint: false,
      value: 740.7407407407407,
      verified: true,
      steps: [{ rule: "Critical points", text: "f'(x) = 0 at x = 10/3" }],
    });
    const result = await APPLIED_OPTIMIZATION_PORT_SPEC.computeRun?.({
      f: "x*(20-2*x)^2",
      variable: "x",
      a: 0,
      b: 10,
      goal: "max",
    });
    expect(casCallMock).toHaveBeenCalledWith("appliedOptimization", [
      "x*(20-2*x)^2",
      "x",
      0,
      10,
      "max",
    ]);
    expect(result?.error).toBeUndefined();
    expect(result?.outputs.optimal).toBe(740.7407407407407);
    expect(result?.outputs.point).toBe("3.3333333333333335");
  });

  it("surfaces the engine's failure reason when the op does not succeed", async () => {
    casCallMock.mockResolvedValue({
      ok: false,
      reason: "Couldn't evaluate this expression numerically.",
    });
    const result = await APPLIED_OPTIMIZATION_PORT_SPEC.computeRun?.({
      f: "1/(x-5)",
      variable: "x",
      a: 0,
      b: 10,
      goal: "max",
    });
    expect(result?.outputs).toEqual({});
    expect(result?.error).toBe(
      "Couldn't evaluate this expression numerically.",
    );
  });
});
