import { beforeEach, describe, expect, it, vi } from "vitest";

import { archetypeFromSpec } from "../syntropy/nodes/dispatch";
import { LIMITS_PORT_SPEC } from "../syntropy/portSpecs/limits";

import type { ExpressionOutput } from "../syntropy/portSpecs/types";

const { casCallMock } = vi.hoisted(() => ({ casCallMock: vi.fn() }));

vi.mock("../syntropy/cas/casClient", () => ({ casCall: casCallMock }));

describe("LIMITS_PORT_SPEC", () => {
  beforeEach(() => casCallMock.mockReset());

  it("identifies the calculus/limits run-mode method", () => {
    expect(LIMITS_PORT_SPEC.engineId).toBe("calculus");
    expect(LIMITS_PORT_SPEC.methodId).toBe("limits");
    expect(LIMITS_PORT_SPEC.executionMode).toBe("run");
    expect(LIMITS_PORT_SPEC.pageStoreKey).toBe("engine-lab:calculus-limits");
  });

  it("declares the limit (expression) output first so the archetype is symbolic", () => {
    expect(LIMITS_PORT_SPEC.outputs[0].kind).toBe("expression");
    expect(archetypeFromSpec(LIMITS_PORT_SPEC)).toBe("symbolic");
  });

  it("compute() is a sync placeholder returning an empty (not-yet-run) result", () => {
    expect(
      LIMITS_PORT_SPEC.compute({ f: "sin(x)/x", at: "0" }).outputs,
    ).toEqual({});
  });

  it("computeRun calls CAS.limit(expr, variable, at) and surfaces a finite value", async () => {
    casCallMock.mockResolvedValue({
      ok: true,
      kind: "finite",
      value: "1",
      latex: "1",
      verified: true,
      steps: [{ rule: "The limit", text: "lim x->0 of sin(x)/x" }],
    });
    const result = await LIMITS_PORT_SPEC.computeRun?.({
      f: "sin(x)/x",
      variable: "x",
      at: "0",
    });
    expect(casCallMock).toHaveBeenCalledWith("limit", ["sin(x)/x", "x", "0"]);
    expect(result?.error).toBeUndefined();
    const expr = result?.outputs.limit as ExpressionOutput;
    expect(expr.display).toBe("1");
    expect(expr.structured).toEqual({ kind: "plain" });
    expect(result?.outputs.steps).toBe("The limit: lim x->0 of sin(x)/x");
  });

  it("maps an infinite limit to ∞ rather than an error", async () => {
    casCallMock.mockResolvedValue({
      ok: true,
      kind: "infinite",
      value: "Infinity",
      verified: true,
      steps: [],
    });
    const result = await LIMITS_PORT_SPEC.computeRun?.({
      f: "1/x",
      variable: "x",
      at: "0",
    });
    expect(result?.error).toBeUndefined();
    expect((result?.outputs.limit as ExpressionOutput).display).toBe("∞");
  });

  it("maps a -∞ limit to -∞", async () => {
    casCallMock.mockResolvedValue({
      ok: true,
      kind: "infinite",
      value: "-Infinity",
      verified: true,
      steps: [],
    });
    const result = await LIMITS_PORT_SPEC.computeRun?.({
      f: "-1/x",
      variable: "x",
      at: "0",
    });
    expect((result?.outputs.limit as ExpressionOutput).display).toBe("-∞");
  });

  it("maps a does-not-exist limit to a display string, not an error", async () => {
    casCallMock.mockResolvedValue({
      ok: true,
      kind: "dne",
      value: null,
      verified: true,
      steps: [],
    });
    const result = await LIMITS_PORT_SPEC.computeRun?.({
      f: "sin(1/x)",
      variable: "x",
      at: "0",
    });
    expect(result?.error).toBeUndefined();
    expect((result?.outputs.limit as ExpressionOutput).display).toBe(
      "Does not exist",
    );
  });

  it("surfaces the engine's failure reason when the op does not succeed", async () => {
    casCallMock.mockResolvedValue({
      ok: false,
      reason: "Couldn't evaluate this expression numerically.",
    });
    const result = await LIMITS_PORT_SPEC.computeRun?.({
      f: "??",
      variable: "x",
      at: "0",
    });
    expect(result?.outputs).toEqual({});
    expect(result?.error).toBe(
      "Couldn't evaluate this expression numerically.",
    );
  });
});
