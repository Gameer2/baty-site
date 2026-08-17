import { beforeEach, describe, expect, it, vi } from "vitest";

import { archetypeFromSpec } from "../syntropy/nodes/dispatch";
import { ARC_LENGTH_SURFACE_AREA_PORT_SPEC } from "../syntropy/portSpecs/arcLengthSurfaceArea";

import type { ExpressionOutput } from "../syntropy/portSpecs/types";

const { casCallMock } = vi.hoisted(() => ({ casCallMock: vi.fn() }));

vi.mock("../syntropy/cas/casClient", () => ({ casCall: casCallMock }));

describe("ARC_LENGTH_SURFACE_AREA_PORT_SPEC", () => {
  beforeEach(() => casCallMock.mockReset());

  it("identifies the calculus/arc-length-surface-area run-mode method", () => {
    expect(ARC_LENGTH_SURFACE_AREA_PORT_SPEC.engineId).toBe("calculus");
    expect(ARC_LENGTH_SURFACE_AREA_PORT_SPEC.methodId).toBe(
      "arc-length-surface-area",
    );
    expect(ARC_LENGTH_SURFACE_AREA_PORT_SPEC.executionMode).toBe("run");
    expect(ARC_LENGTH_SURFACE_AREA_PORT_SPEC.pageStoreKey).toBe(
      "engine-lab:calculus-arc-length-surface-area",
    );
  });

  it("declares the setup (expression) output first so the archetype is symbolic", () => {
    expect(ARC_LENGTH_SURFACE_AREA_PORT_SPEC.outputs[0].kind).toBe(
      "expression",
    );
    expect(archetypeFromSpec(ARC_LENGTH_SURFACE_AREA_PORT_SPEC)).toBe(
      "symbolic",
    );
  });

  it("compute() is a sync placeholder returning an empty (not-yet-run) result", () => {
    expect(
      ARC_LENGTH_SURFACE_AREA_PORT_SPEC.compute({
        f: "x^(3/2)",
        a: "0",
        b: "4",
      }).outputs,
    ).toEqual({});
  });

  it("computeRun calls CAS.arcLengthSurfaceArea(f, variable, a, b, { mode }) and surfaces the setup", async () => {
    casCallMock.mockResolvedValue({
      ok: true,
      technique: "arc-length-surface-area",
      mode: "arc-length",
      integrand: "sqrt(1+(3/2*x^(1/2))^2)",
      antideriv: "F(x)",
      value: "sqrt(2)",
      numeric: 1.4142135623730951,
      verified: true,
      steps: [{ rule: "L", text: "L = sqrt(2)" }],
    });
    const result = await ARC_LENGTH_SURFACE_AREA_PORT_SPEC.computeRun?.({
      f: "x^(3/2)",
      variable: "x",
      a: "0",
      b: "4",
      mode: "arc-length",
    });
    expect(casCallMock).toHaveBeenCalledWith("arcLengthSurfaceArea", [
      "x^(3/2)",
      "x",
      "0",
      "4",
      { mode: "arc-length" },
    ]);
    expect(result?.error).toBeUndefined();
    const setup = result?.outputs.setup as ExpressionOutput;
    expect(setup.display).toBe("sqrt(1+(3/2*x^(1/2))^2)");
    expect(setup.structured).toEqual({ kind: "plain" });
    expect(result?.outputs.value).toBeCloseTo(1.4142135623730951);
    expect(result?.outputs.steps).toBe("L: L = sqrt(2)");
  });

  it("surfaces the engine's failure reason when the op does not succeed", async () => {
    casCallMock.mockResolvedValue({
      ok: false,
      reason: "Unknown mode: banana (use arc-length or surface-area).",
    });
    const result = await ARC_LENGTH_SURFACE_AREA_PORT_SPEC.computeRun?.({
      f: "x",
      variable: "x",
      a: "0",
      b: "1",
      mode: "banana",
    });
    expect(result?.outputs).toEqual({});
    expect(result?.error).toBe(
      "Unknown mode: banana (use arc-length or surface-area).",
    );
  });
});
