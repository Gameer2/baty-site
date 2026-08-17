import { beforeEach, describe, expect, it, vi } from "vitest";

import { archetypeFromSpec } from "../syntropy/nodes/dispatch";
import { PARTIAL_FRACTIONS_PORT_SPEC } from "../syntropy/portSpecs/partialFractions";

import type { ExpressionOutput } from "../syntropy/portSpecs/types";

const { casCallMock } = vi.hoisted(() => ({ casCallMock: vi.fn() }));

vi.mock("../syntropy/cas/casClient", () => ({ casCall: casCallMock }));

describe("PARTIAL_FRACTIONS_PORT_SPEC", () => {
  beforeEach(() => casCallMock.mockReset());

  it("identifies the calculus/partial-fractions run-mode method", () => {
    expect(PARTIAL_FRACTIONS_PORT_SPEC.engineId).toBe("calculus");
    expect(PARTIAL_FRACTIONS_PORT_SPEC.methodId).toBe("partial-fractions");
    expect(PARTIAL_FRACTIONS_PORT_SPEC.executionMode).toBe("run");
    expect(PARTIAL_FRACTIONS_PORT_SPEC.pageStoreKey).toBe(
      "engine-lab:calculus-partial-fractions",
    );
  });

  it("declares the decomposition (expression) output first so the archetype is symbolic", () => {
    expect(PARTIAL_FRACTIONS_PORT_SPEC.outputs[0].kind).toBe("expression");
    expect(archetypeFromSpec(PARTIAL_FRACTIONS_PORT_SPEC)).toBe("symbolic");
  });

  it("compute() is a sync placeholder returning an empty (not-yet-run) result", () => {
    expect(
      PARTIAL_FRACTIONS_PORT_SPEC.compute({ f: "1/(x^2-1)" }).outputs,
    ).toEqual({});
  });

  it("computeRun calls CAS.partialFractions(integrand, variable) and surfaces the decomposition", async () => {
    casCallMock.mockResolvedValue({
      ok: true,
      technique: "partial-fractions",
      decomposition: "(-1/2)*(1+x)^(-1)+(1/2)*(-1+x)^(-1)",
      result: "(-1/2)*log(1+x)+(1/2)*log(-1+x)",
      verified: true,
      steps: [
        { rule: "Factor the denominator", text: "-1+x^2 = (-1+x)*(1+x)" },
      ],
    });
    const result = await PARTIAL_FRACTIONS_PORT_SPEC.computeRun?.({
      f: "1/(x^2-1)",
      variable: "x",
    });
    expect(casCallMock).toHaveBeenCalledWith("partialFractions", [
      "1/(x^2-1)",
      "x",
    ]);
    expect(result?.error).toBeUndefined();
    const expr = result?.outputs.decomposition as ExpressionOutput;
    expect(expr.display).toBe("(-1/2)*(1+x)^(-1)+(1/2)*(-1+x)^(-1)");
    expect(expr.structured).toEqual({ kind: "plain" });
    expect(result?.outputs.steps).toBe(
      "Factor the denominator: -1+x^2 = (-1+x)*(1+x)",
    );
  });

  it("surfaces the engine's failure reason when the op does not succeed", async () => {
    casCallMock.mockResolvedValue({
      ok: false,
      reason: "This integrand is not a single quotient.",
    });
    const result = await PARTIAL_FRACTIONS_PORT_SPEC.computeRun?.({
      f: "sin(x)",
      variable: "x",
    });
    expect(result?.outputs).toEqual({});
    expect(result?.error).toBe("This integrand is not a single quotient.");
  });
});
