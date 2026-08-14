import { beforeEach, describe, expect, it, vi } from "vitest";

import { archetypeFromSpec } from "../syntropy/nodes/dispatch";
import { COMPLETE_THE_SQUARE_PORT_SPEC } from "../syntropy/portSpecs/completeTheSquare";

import type { ExpressionOutput } from "../syntropy/portSpecs/types";

const { casCallMock } = vi.hoisted(() => ({ casCallMock: vi.fn() }));

vi.mock("../syntropy/cas/casClient", () => ({ casCall: casCallMock }));

describe("COMPLETE_THE_SQUARE_PORT_SPEC", () => {
  beforeEach(() => casCallMock.mockReset());

  it("identifies the calculus/completing-the-square run-mode method", () => {
    expect(COMPLETE_THE_SQUARE_PORT_SPEC.engineId).toBe("calculus");
    expect(COMPLETE_THE_SQUARE_PORT_SPEC.methodId).toBe(
      "completing-the-square",
    );
    expect(COMPLETE_THE_SQUARE_PORT_SPEC.executionMode).toBe("run");
    expect(COMPLETE_THE_SQUARE_PORT_SPEC.pageStoreKey).toBe(
      "engine-lab:calculus-completing-the-square",
    );
  });

  it("declares the completed form (expression) output first so the archetype is symbolic", () => {
    expect(COMPLETE_THE_SQUARE_PORT_SPEC.outputs[0].kind).toBe("expression");
    expect(archetypeFromSpec(COMPLETE_THE_SQUARE_PORT_SPEC)).toBe("symbolic");
  });

  it("compute() is a sync placeholder returning an empty (not-yet-run) result", () => {
    expect(
      COMPLETE_THE_SQUARE_PORT_SPEC.compute({ f: "1/(x^2+2*x+5)" }).outputs,
    ).toEqual({});
  });

  it("computeRun calls CAS.completeTheSquare(integrand, variable) and surfaces the completed form", async () => {
    casCallMock.mockResolvedValue({
      ok: true,
      technique: "completing the square",
      completedSquare: "(x + 1)^2 + (4)",
      u: "x + 1",
      result: "(1/2)*atan((1/2)*(1+x))",
      verified: true,
      steps: [
        {
          rule: "Complete the square",
          text: "2*x+x^2+5 = (x + 1)^2 + (4)",
        },
      ],
    });
    const result = await COMPLETE_THE_SQUARE_PORT_SPEC.computeRun?.({
      f: "1/(x^2+2*x+5)",
      variable: "x",
    });
    expect(casCallMock).toHaveBeenCalledWith("completeTheSquare", [
      "1/(x^2+2*x+5)",
      "x",
    ]);
    expect(result?.error).toBeUndefined();
    const expr = result?.outputs.completedForm as ExpressionOutput;
    expect(expr.display).toBe("(x + 1)^2 + (4)");
    expect(expr.structured).toEqual({ kind: "plain" });
    expect(result?.outputs.steps).toBe(
      "Complete the square: 2*x+x^2+5 = (x + 1)^2 + (4)",
    );
  });

  it("surfaces the engine's failure reason when the op does not succeed", async () => {
    casCallMock.mockResolvedValue({
      ok: false,
      reason: "Couldn't rewrite the quadratic in completed-square form.",
    });
    const result = await COMPLETE_THE_SQUARE_PORT_SPEC.computeRun?.({
      f: "x",
      variable: "x",
    });
    expect(result?.outputs).toEqual({});
    expect(result?.error).toBe(
      "Couldn't rewrite the quadratic in completed-square form.",
    );
  });
});
