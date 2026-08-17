import { beforeEach, describe, expect, it, vi } from "vitest";

import { archetypeFromSpec } from "../syntropy/nodes/dispatch";
import { IMPROPER_INTEGRALS_PORT_SPEC } from "../syntropy/portSpecs/improperIntegrals";

import type { ExpressionOutput } from "../syntropy/portSpecs/types";

const { casCallMock } = vi.hoisted(() => ({ casCallMock: vi.fn() }));

vi.mock("../syntropy/cas/casClient", () => ({ casCall: casCallMock }));

describe("IMPROPER_INTEGRALS_PORT_SPEC", () => {
  beforeEach(() => casCallMock.mockReset());

  it("identifies the calculus/improper-integrals run-mode method", () => {
    expect(IMPROPER_INTEGRALS_PORT_SPEC.engineId).toBe("calculus");
    expect(IMPROPER_INTEGRALS_PORT_SPEC.methodId).toBe("improper-integrals");
    expect(IMPROPER_INTEGRALS_PORT_SPEC.executionMode).toBe("run");
    expect(IMPROPER_INTEGRALS_PORT_SPEC.pageStoreKey).toBe(
      "engine-lab:calculus-improper-integrals",
    );
  });

  it("declares the integral (expression) output first so the archetype is symbolic", () => {
    expect(IMPROPER_INTEGRALS_PORT_SPEC.outputs[0].kind).toBe("expression");
    expect(archetypeFromSpec(IMPROPER_INTEGRALS_PORT_SPEC)).toBe("symbolic");
  });

  it("compute() is a sync placeholder returning an empty (not-yet-run) result", () => {
    expect(
      IMPROPER_INTEGRALS_PORT_SPEC.compute({
        f: "1/x^2",
        a: "1",
        b: "Infinity",
      }).outputs,
    ).toEqual({});
  });

  it("computeRun calls CAS.improperIntegral(f, variable, a, b) and surfaces a convergent value", async () => {
    casCallMock.mockResolvedValue({
      ok: true,
      technique: "improper-integral",
      verdict: "converges",
      value: "1",
      numeric: 1.000000046645918,
    });
    const result = await IMPROPER_INTEGRALS_PORT_SPEC.computeRun?.({
      f: "1/x^2",
      variable: "x",
      a: "1",
      b: "Infinity",
    });
    expect(casCallMock).toHaveBeenCalledWith("improperIntegral", [
      "1/x^2",
      "x",
      "1",
      "Infinity",
    ]);
    expect(result?.error).toBeUndefined();
    expect((result?.outputs.integral as ExpressionOutput).display).toBe("1");
    expect(result?.outputs.value).toBeCloseTo(1.000000046645918);
    expect(result?.outputs.verdict).toBe("converges");
  });

  it("maps a divergent integral to 'Diverges' and omits the numeric value", async () => {
    casCallMock.mockResolvedValue({
      ok: true,
      technique: "improper-integral",
      verdict: "diverges",
      value: null,
      numeric: Infinity,
    });
    const result = await IMPROPER_INTEGRALS_PORT_SPEC.computeRun?.({
      f: "1/x",
      variable: "x",
      a: "1",
      b: "Infinity",
    });
    expect(result?.error).toBeUndefined();
    expect((result?.outputs.integral as ExpressionOutput).display).toBe(
      "Diverges",
    );
    expect(result?.outputs.value).toBeUndefined();
    expect(result?.outputs.verdict).toBe("diverges");
  });

  it("surfaces the engine's failure reason when the op does not succeed", async () => {
    casCallMock.mockResolvedValue({
      ok: false,
      reason: "The lower bound can't be +Infinity.",
    });
    const result = await IMPROPER_INTEGRALS_PORT_SPEC.computeRun?.({
      f: "1/x^2",
      variable: "x",
      a: "Infinity",
      b: "1",
    });
    expect(result?.outputs).toEqual({});
    expect(result?.error).toBe("The lower bound can't be +Infinity.");
  });
});
