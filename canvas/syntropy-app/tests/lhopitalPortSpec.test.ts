import { beforeEach, describe, expect, it, vi } from "vitest";

import { archetypeFromSpec } from "../syntropy/nodes/dispatch";
import { LHOPITAL_PORT_SPEC } from "../syntropy/portSpecs/lhopital";

import type { ExpressionOutput } from "../syntropy/portSpecs/types";

const { casCallMock } = vi.hoisted(() => ({ casCallMock: vi.fn() }));

vi.mock("../syntropy/cas/casClient", () => ({ casCall: casCallMock }));

describe("LHOPITAL_PORT_SPEC", () => {
  beforeEach(() => casCallMock.mockReset());

  it("identifies the calculus/lhopital run-mode method", () => {
    expect(LHOPITAL_PORT_SPEC.engineId).toBe("calculus");
    expect(LHOPITAL_PORT_SPEC.methodId).toBe("lhopital");
    expect(LHOPITAL_PORT_SPEC.executionMode).toBe("run");
    expect(LHOPITAL_PORT_SPEC.pageStoreKey).toBe(
      "engine-lab:calculus-lhopital",
    );
  });

  it("declares the limit (expression) output first so the archetype is symbolic", () => {
    expect(LHOPITAL_PORT_SPEC.outputs[0].kind).toBe("expression");
    expect(archetypeFromSpec(LHOPITAL_PORT_SPEC)).toBe("symbolic");
  });

  it("compute() is a sync placeholder returning an empty (not-yet-run) result", () => {
    expect(
      LHOPITAL_PORT_SPEC.compute({ f: "sin(x)/x", at: "0" }).outputs,
    ).toEqual({});
  });

  it("computeRun calls CAS.lhopital(expr, variable, at) and surfaces the reduction", async () => {
    casCallMock.mockResolvedValue({
      ok: true,
      kind: "finite",
      value: "1",
      latex: "1",
      verified: true,
      steps: [
        {
          rule: "L'Hôpital's Rule",
          text: "differentiate top and bottom: (cos(x)) / (1)",
        },
      ],
    });
    const result = await LHOPITAL_PORT_SPEC.computeRun?.({
      f: "sin(x)/x",
      variable: "x",
      at: "0",
    });
    expect(casCallMock).toHaveBeenCalledWith("lhopital", [
      "sin(x)/x",
      "x",
      "0",
    ]);
    expect(result?.error).toBeUndefined();
    const expr = result?.outputs.limit as ExpressionOutput;
    expect(expr.display).toBe("1");
    expect(expr.structured).toEqual({ kind: "plain" });
    expect(result?.outputs.steps).toBe(
      "L'Hôpital's Rule: differentiate top and bottom: (cos(x)) / (1)",
    );
  });

  it("maps an infinite L'Hôpital limit to ∞, not an error", async () => {
    casCallMock.mockResolvedValue({
      ok: true,
      kind: "infinite",
      value: "Infinity",
      verified: true,
      steps: [],
    });
    const result = await LHOPITAL_PORT_SPEC.computeRun?.({
      f: "1/x",
      variable: "x",
      at: "0",
    });
    expect(result?.error).toBeUndefined();
    expect((result?.outputs.limit as ExpressionOutput).display).toBe("∞");
  });

  it("surfaces the engine's failure reason when the op does not succeed", async () => {
    casCallMock.mockResolvedValue({
      ok: false,
      reason: "This expression isn't a quotient f(x)/g(x).",
    });
    const result = await LHOPITAL_PORT_SPEC.computeRun?.({
      f: "x",
      variable: "x",
      at: "0",
    });
    expect(result?.outputs).toEqual({});
    expect(result?.error).toBe("This expression isn't a quotient f(x)/g(x).");
  });
});
