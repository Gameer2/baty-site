import { beforeEach, describe, expect, it, vi } from "vitest";

import { archetypeFromSpec } from "../syntropy/nodes/dispatch";
import { U_SUBSTITUTION_PORT_SPEC } from "../syntropy/portSpecs/uSubstitution";

import type { ExpressionOutput } from "../syntropy/portSpecs/types";

// Mock the CAS bridge so computeRun is deterministic and offline (no real nerdamer). The spec
// reaches casCall through casRunHelpers.runCas, which imports it from ../cas/casClient — mocking
// that module's export replaces it for runCas too.
const { casCallMock } = vi.hoisted(() => ({ casCallMock: vi.fn() }));

vi.mock("../syntropy/cas/casClient", () => ({ casCall: casCallMock }));

describe("U_SUBSTITUTION_PORT_SPEC", () => {
  beforeEach(() => casCallMock.mockReset());

  it("identifies the calculus/u-substitution run-mode method", () => {
    expect(U_SUBSTITUTION_PORT_SPEC.engineId).toBe("calculus");
    expect(U_SUBSTITUTION_PORT_SPEC.methodId).toBe("u-substitution");
    expect(U_SUBSTITUTION_PORT_SPEC.executionMode).toBe("run");
    expect(U_SUBSTITUTION_PORT_SPEC.pageStoreKey).toBe(
      "engine-lab:calculus-u-substitution",
    );
  });

  it("declares the antiderivative (expression) output first so the archetype is symbolic", () => {
    expect(U_SUBSTITUTION_PORT_SPEC.outputs[0].kind).toBe("expression");
    expect(archetypeFromSpec(U_SUBSTITUTION_PORT_SPEC)).toBe("symbolic");
  });

  it("compute() is a sync placeholder returning an empty (not-yet-run) result", () => {
    expect(
      U_SUBSTITUTION_PORT_SPEC.compute({ f: "x*sin(x^2)" }).outputs,
    ).toEqual({});
  });

  it("computeRun calls CAS.uSubstitution(integrand, variable) and surfaces the result", async () => {
    casCallMock.mockResolvedValue({
      ok: true,
      technique: "u-substitution",
      u: "x^2",
      result: "(-1/2)*cos(x^2)",
      verified: true,
      steps: [
        { rule: "Choose the substitution", text: "u = x^2,  du = 2*x dx" },
      ],
    });
    const result = await U_SUBSTITUTION_PORT_SPEC.computeRun?.({
      f: "x*sin(x^2)",
      variable: "x",
    });
    expect(casCallMock).toHaveBeenCalledWith("uSubstitution", [
      "x*sin(x^2)",
      "x",
    ]);
    expect(result?.error).toBeUndefined();
    const expr = result?.outputs.antiderivative as ExpressionOutput;
    expect(expr.display).toBe("(-1/2)*cos(x^2)");
    expect(expr.structured).toEqual({ kind: "plain" });
    expect(result?.outputs.steps).toBe(
      "Choose the substitution: u = x^2,  du = 2*x dx",
    );
  });

  it("surfaces the engine's failure reason when the op does not succeed", async () => {
    casCallMock.mockResolvedValue({
      ok: false,
      reason: "No substitution cleared the integrand.",
    });
    const result = await U_SUBSTITUTION_PORT_SPEC.computeRun?.({
      f: "e^(x^2)",
      variable: "x",
    });
    expect(result?.outputs).toEqual({});
    expect(result?.error).toBe("No substitution cleared the integrand.");
  });
});
