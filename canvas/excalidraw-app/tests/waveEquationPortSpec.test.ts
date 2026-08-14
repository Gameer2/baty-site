import { beforeEach, describe, expect, it, vi } from "vitest";

import { archetypeFromSpec } from "../syntropy/nodes/dispatch";
import { WAVE_EQUATION_PORT_SPEC } from "../syntropy/portSpecs/waveEquation";

// Mock the CAS bridge so computeRun is deterministic and offline. waveField returns a sampled
// heatmap grid (no vectors); the spec maps it through fieldOutputFromResult.
const { casCallMock } = vi.hoisted(() => ({ casCallMock: vi.fn() }));
vi.mock("../syntropy/cas/casClient", () => ({ casCall: casCallMock }));

const PI = Math.PI;

describe("WAVE_EQUATION_PORT_SPEC", () => {
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
      classification: "Hyperbolic PDE (wave equation).",
      generalSolution: "u(x,t) = \\sum (A_n\\cos + B_n\\sin)\\sin(n\\pi x/L)",
    }));
  });

  it("identifies the ode/wave-equation run-mode method", () => {
    expect(WAVE_EQUATION_PORT_SPEC.engineId).toBe("ode");
    expect(WAVE_EQUATION_PORT_SPEC.methodId).toBe("wave-equation");
    expect(WAVE_EQUATION_PORT_SPEC.executionMode).toBe("run");
    expect(WAVE_EQUATION_PORT_SPEC.pageStoreKey).toBe(
      "engine-lab:ode-wave-equation",
    );
  });

  it("declares the field output first so the archetype is field", () => {
    expect(WAVE_EQUATION_PORT_SPEC.outputs[0].kind).toBe("field");
    expect(archetypeFromSpec(WAVE_EQUATION_PORT_SPEC)).toBe("field");
  });

  it("compute() is a sync placeholder returning an empty (not-yet-run) result", () => {
    expect(WAVE_EQUATION_PORT_SPEC.compute({}).outputs).toEqual({});
  });

  it("computeRun calls waveField with f, g and surfaces the field + classification + horizon", async () => {
    const result = await WAVE_EQUATION_PORT_SPEC.computeRun?.({
      L: PI,
      c: 1,
      f: "sin(x)",
      g: "0",
      N: 8,
      T: 1,
    });
    expect(casCallMock).toHaveBeenCalledWith("waveField", [
      { L: PI, c: 1, fxExpr: "sin(x)", gxExpr: "0", N: 8, T: 1 },
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
    expect(result?.outputs.classification).toContain("wave equation");
    expect(result?.outputs.T).toBe(1);
  });

  it("rejects non-positive L/c/T", async () => {
    const result = await WAVE_EQUATION_PORT_SPEC.computeRun?.({
      L: PI,
      c: -1,
      f: "sin(x)",
      g: "0",
      N: 8,
      T: 1,
    });
    expect(result?.error).toBe("L, c and T must be positive numbers.");
    expect(casCallMock).not.toHaveBeenCalled();
  });
});
