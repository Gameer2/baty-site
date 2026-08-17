import { beforeEach, describe, expect, it, vi } from "vitest";

import { archetypeFromSpec } from "../syntropy/nodes/dispatch";
import { INTEGRATION_BY_PARTS_PORT_SPEC } from "../syntropy/portSpecs/integrationByParts";

import type { ExpressionOutput } from "../syntropy/portSpecs/types";

const { casCallMock } = vi.hoisted(() => ({ casCallMock: vi.fn() }));

vi.mock("../syntropy/cas/casClient", () => ({ casCall: casCallMock }));

describe("INTEGRATION_BY_PARTS_PORT_SPEC", () => {
  beforeEach(() => casCallMock.mockReset());

  it("identifies the calculus/integration-by-parts run-mode method", () => {
    expect(INTEGRATION_BY_PARTS_PORT_SPEC.engineId).toBe("calculus");
    expect(INTEGRATION_BY_PARTS_PORT_SPEC.methodId).toBe(
      "integration-by-parts",
    );
    expect(INTEGRATION_BY_PARTS_PORT_SPEC.executionMode).toBe("run");
    expect(INTEGRATION_BY_PARTS_PORT_SPEC.pageStoreKey).toBe(
      "engine-lab:calculus-integration-by-parts",
    );
  });

  it("declares the antiderivative (expression) output first so the archetype is symbolic", () => {
    expect(INTEGRATION_BY_PARTS_PORT_SPEC.outputs[0].kind).toBe("expression");
    expect(archetypeFromSpec(INTEGRATION_BY_PARTS_PORT_SPEC)).toBe("symbolic");
  });

  it("compute() is a sync placeholder returning an empty (not-yet-run) result", () => {
    expect(
      INTEGRATION_BY_PARTS_PORT_SPEC.compute({ f: "x*e^x" }).outputs,
    ).toEqual({});
  });

  it("computeRun calls CAS.integrationByParts(integrand, variable) and surfaces the result", async () => {
    casCallMock.mockResolvedValue({
      ok: true,
      technique: "integration-by-parts",
      u: "x",
      dv: "e^x dx",
      result: "-e^x+e^x*x",
      verified: true,
      steps: [{ rule: "Choose u and dv", text: "u = x,  dv = e^x dx" }],
    });
    const result = await INTEGRATION_BY_PARTS_PORT_SPEC.computeRun?.({
      f: "x*e^x",
      variable: "x",
    });
    expect(casCallMock).toHaveBeenCalledWith("integrationByParts", [
      "x*e^x",
      "x",
    ]);
    expect(result?.error).toBeUndefined();
    const expr = result?.outputs.antiderivative as ExpressionOutput;
    expect(expr.display).toBe("-e^x+e^x*x");
    expect(expr.structured).toEqual({ kind: "plain" });
    expect(result?.outputs.steps).toBe("Choose u and dv: u = x,  dv = e^x dx");
  });

  it("surfaces the engine's failure reason when the op does not succeed", async () => {
    casCallMock.mockResolvedValue({
      ok: false,
      reason: "This integrand doesn't depend on x.",
    });
    const result = await INTEGRATION_BY_PARTS_PORT_SPEC.computeRun?.({
      f: "5",
      variable: "x",
    });
    expect(result?.outputs).toEqual({});
    expect(result?.error).toBe("This integrand doesn't depend on x.");
  });
});
