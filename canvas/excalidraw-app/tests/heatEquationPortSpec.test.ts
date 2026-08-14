import { beforeEach, describe, expect, it, vi } from "vitest";

import { archetypeFromSpec } from "../syntropy/nodes/dispatch";
import { HEAT_EQUATION_PORT_SPEC } from "../syntropy/portSpecs/heatEquation";

// Mock the CAS bridge so computeRun is deterministic and offline. heatField returns a sampled
// heatmap grid (no vectors); the spec maps it through fieldOutputFromResult.
const { casCallMock } = vi.hoisted(() => ({ casCallMock: vi.fn() }));
vi.mock("../syntropy/cas/casClient", () => ({ casCall: casCallMock }));

const PI = Math.PI;

describe("HEAT_EQUATION_PORT_SPEC", () => {
  beforeEach(() => {
    casCallMock.mockReset();
    casCallMock.mockImplementation(async (_op: string) => ({
      ok: true,
      grid: [
        [
          { x: 0, y: 0, value: 0 },
          { x: PI / 2, y: 0, value: 1 },
          { x: PI, y: 0, value: 0 },
        ],
      ],
      xLo: 0,
      xHi: PI,
      yLo: 0,
      yHi: 1,
      variant: "heatmap",
      classification: "Parabolic PDE (heat equation).",
      generalSolution:
        "u(x,t) = \\sum b_n \\sin(n\\pi x/L) e^{-k(n\\pi/L)^2 t}",
      bn: [1, 0, 0, 0],
    }));
  });

  it("identifies the ode/heat-equation run-mode method", () => {
    expect(HEAT_EQUATION_PORT_SPEC.engineId).toBe("ode");
    expect(HEAT_EQUATION_PORT_SPEC.methodId).toBe("heat-equation");
    expect(HEAT_EQUATION_PORT_SPEC.executionMode).toBe("run");
    expect(HEAT_EQUATION_PORT_SPEC.pageStoreKey).toBe(
      "engine-lab:ode-heat-equation",
    );
  });

  it("declares the field output first so the archetype is field", () => {
    expect(HEAT_EQUATION_PORT_SPEC.outputs[0].kind).toBe("field");
    expect(archetypeFromSpec(HEAT_EQUATION_PORT_SPEC)).toBe("field");
  });

  it("compute() is a sync placeholder returning an empty (not-yet-run) result", () => {
    expect(HEAT_EQUATION_PORT_SPEC.compute({}).outputs).toEqual({});
  });

  it("computeRun calls heatField and surfaces the field + classification + horizon", async () => {
    const result = await HEAT_EQUATION_PORT_SPEC.computeRun?.({
      L: PI,
      k: 1,
      f: "sin(x)",
      N: 8,
      T: 1,
    });
    expect(casCallMock).toHaveBeenCalledWith("heatField", [
      { L: PI, k: 1, fxExpr: "sin(x)", N: 8, T: 1 },
    ]);
    expect(result?.error).toBeUndefined();
    const field = result?.outputs.field as {
      grid: unknown[][];
      variant: string;
      xHi: number;
    };
    expect(field.grid[0][1]).toEqual({ x: PI / 2, y: 0, value: 1 });
    expect(field.variant).toBe("heatmap");
    expect(field.xHi).toBe(PI);
    expect(result?.outputs.classification).toContain("heat equation");
    expect(result?.outputs.T).toBe(1);
  });

  it("rejects non-positive L/k/T", async () => {
    const result = await HEAT_EQUATION_PORT_SPEC.computeRun?.({
      L: 0,
      k: 1,
      f: "sin(x)",
      N: 8,
      T: 1,
    });
    expect(result?.error).toBe("L, k and T must be positive numbers.");
    expect(casCallMock).not.toHaveBeenCalled();
  });
});
