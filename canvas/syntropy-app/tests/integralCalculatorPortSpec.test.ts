import { beforeEach, describe, expect, it, vi } from "vitest";

import { archetypeFromSpec } from "../syntropy/nodes/dispatch";
import { INTEGRAL_CALCULATOR_PORT_SPEC } from "../syntropy/portSpecs/integralCalculator";

import type { ExpressionOutput } from "../syntropy/portSpecs/types";

const { casCallMock } = vi.hoisted(() => ({ casCallMock: vi.fn() }));

vi.mock("../syntropy/cas/casClient", () => ({ casCall: casCallMock }));

describe("INTEGRAL_CALCULATOR_PORT_SPEC", () => {
  beforeEach(() => casCallMock.mockReset());

  it("identifies the calculus/integral-calculator run-mode method", () => {
    expect(INTEGRAL_CALCULATOR_PORT_SPEC.engineId).toBe("calculus");
    expect(INTEGRAL_CALCULATOR_PORT_SPEC.methodId).toBe("integral-calculator");
    expect(INTEGRAL_CALCULATOR_PORT_SPEC.executionMode).toBe("run");
    expect(INTEGRAL_CALCULATOR_PORT_SPEC.pageStoreKey).toBe(
      "engine-lab:calculus-integral-calculator",
    );
  });

  it("declares the antiderivative (expression) output first so the archetype is symbolic", () => {
    expect(INTEGRAL_CALCULATOR_PORT_SPEC.outputs[0].kind).toBe("expression");
    expect(archetypeFromSpec(INTEGRAL_CALCULATOR_PORT_SPEC)).toBe("symbolic");
  });

  it("declares no numeric value output (the bridge op is indefinite-only)", () => {
    expect(INTEGRAL_CALCULATOR_PORT_SPEC.outputs).toHaveLength(1);
    expect(INTEGRAL_CALCULATOR_PORT_SPEC.outputs[0].key).toBe("antiderivative");
  });

  it("compute() is a sync placeholder returning an empty (not-yet-run) result", () => {
    expect(
      INTEGRAL_CALCULATOR_PORT_SPEC.compute({ f: "1/(x^3-2)" }).outputs,
    ).toEqual({});
  });

  it("computeRun calls CAS.autoIntegrate(expr, variable) and surfaces the antiderivative", async () => {
    casCallMock.mockResolvedValue({
      ok: true,
      technique: "rational integration (kernel)",
      result: "(1/3)*x^3",
      verified: true,
    });
    const result = await INTEGRAL_CALCULATOR_PORT_SPEC.computeRun?.({
      f: "x^2",
      variable: "x",
    });
    expect(casCallMock).toHaveBeenCalledWith("autoIntegrate", ["x^2", "x"]);
    expect(result?.error).toBeUndefined();
    const expr = result?.outputs.antiderivative as ExpressionOutput;
    expect(expr.display).toBe("(1/3)*x^3");
    expect(expr.structured).toEqual({ kind: "plain" });
    expect(result?.outputs.value).toBeUndefined();
  });

  it("surfaces the engine's failure reason when the op does not succeed", async () => {
    casCallMock.mockResolvedValue({
      ok: false,
      reason: "The kernel refused this rational function.",
    });
    const result = await INTEGRAL_CALCULATOR_PORT_SPEC.computeRun?.({
      f: "tan(x)",
      variable: "x",
    });
    expect(result?.outputs).toEqual({});
    expect(result?.error).toBe("The kernel refused this rational function.");
  });
});
