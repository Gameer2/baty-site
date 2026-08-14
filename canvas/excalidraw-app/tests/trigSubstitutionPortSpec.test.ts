import { beforeEach, describe, expect, it, vi } from "vitest";

import { archetypeFromSpec } from "../syntropy/nodes/dispatch";
import { TRIG_SUBSTITUTION_PORT_SPEC } from "../syntropy/portSpecs/trigSubstitution";

import type { ExpressionOutput } from "../syntropy/portSpecs/types";

const { casCallMock } = vi.hoisted(() => ({ casCallMock: vi.fn() }));

vi.mock("../syntropy/cas/casClient", () => ({ casCall: casCallMock }));

describe("TRIG_SUBSTITUTION_PORT_SPEC", () => {
  beforeEach(() => casCallMock.mockReset());

  it("identifies the calculus/trigonometric-substitution run-mode method", () => {
    expect(TRIG_SUBSTITUTION_PORT_SPEC.engineId).toBe("calculus");
    expect(TRIG_SUBSTITUTION_PORT_SPEC.methodId).toBe(
      "trigonometric-substitution",
    );
    expect(TRIG_SUBSTITUTION_PORT_SPEC.executionMode).toBe("run");
    expect(TRIG_SUBSTITUTION_PORT_SPEC.pageStoreKey).toBe(
      "engine-lab:calculus-trigonometric-substitution",
    );
  });

  it("declares the antiderivative (expression) output first so the archetype is symbolic", () => {
    expect(TRIG_SUBSTITUTION_PORT_SPEC.outputs[0].kind).toBe("expression");
    expect(archetypeFromSpec(TRIG_SUBSTITUTION_PORT_SPEC)).toBe("symbolic");
  });

  it("compute() is a sync placeholder returning an empty (not-yet-run) result", () => {
    expect(
      TRIG_SUBSTITUTION_PORT_SPEC.compute({ f: "sqrt(4-x^2)" }).outputs,
    ).toEqual({});
  });

  it("computeRun calls CAS.trigSubstitution(integrand, variable) and surfaces the result", async () => {
    casCallMock.mockResolvedValue({
      ok: true,
      technique: "trigonometric-substitution",
      substitution: "x = 2 sin θ",
      result: "2*asin((1/2)*x)+sqrt((-1/4)*x^2+1)*x",
      verified: true,
      steps: [{ rule: "Choose the substitution", text: "x = 2 sin θ" }],
    });
    const result = await TRIG_SUBSTITUTION_PORT_SPEC.computeRun?.({
      f: "sqrt(4-x^2)",
      variable: "x",
    });
    expect(casCallMock).toHaveBeenCalledWith("trigSubstitution", [
      "sqrt(4-x^2)",
      "x",
    ]);
    expect(result?.error).toBeUndefined();
    const expr = result?.outputs.antiderivative as ExpressionOutput;
    expect(expr.display).toBe("2*asin((1/2)*x)+sqrt((-1/4)*x^2+1)*x");
    expect(expr.structured).toEqual({ kind: "plain" });
    expect(result?.outputs.steps).toBe("Choose the substitution: x = 2 sin θ");
  });

  it("surfaces the engine's failure reason when the op does not succeed", async () => {
    casCallMock.mockResolvedValue({
      ok: false,
      reason: "No √(a²−x²), √(a²+x²), or √(x²−a²) is present here.",
    });
    const result = await TRIG_SUBSTITUTION_PORT_SPEC.computeRun?.({
      f: "x^2",
      variable: "x",
    });
    expect(result?.outputs).toEqual({});
    expect(result?.error).toBe(
      "No √(a²−x²), √(a²+x²), or √(x²−a²) is present here.",
    );
  });
});
