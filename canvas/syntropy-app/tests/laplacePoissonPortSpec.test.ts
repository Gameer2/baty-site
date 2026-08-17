import { beforeEach, describe, expect, it, vi } from "vitest";

import { archetypeFromSpec } from "../syntropy/nodes/dispatch";
import { LAPLACE_POISSON_PORT_SPEC } from "../syntropy/portSpecs/laplacePoisson";

// Mock the CAS bridge so computeRun is deterministic and offline. solveLaplacePoisson returns a
// (M+1)×(M+1) heatmap grid (no vectors); the spec maps it through fieldOutputFromResult.
const { casCallMock } = vi.hoisted(() => ({ casCallMock: vi.fn() }));
vi.mock("../syntropy/cas/casClient", () => ({ casCall: casCallMock }));

describe("LAPLACE_POISSON_PORT_SPEC", () => {
  beforeEach(() => {
    casCallMock.mockReset();
    casCallMock.mockImplementation(async (_op: string) => ({
      ok: true,
      grid: [
        [
          { x: 0, y: 0, value: 0 },
          { x: 0.5, y: 0, value: 0.5 },
          { x: 1, y: 0, value: 1 },
        ],
      ],
      xLo: 0,
      xHi: 1,
      yLo: 0,
      yHi: 1,
      variant: "heatmap",
      converged: 1,
      mode: "laplace",
    }));
  });

  it("identifies the ode/laplace-poisson run-mode method", () => {
    expect(LAPLACE_POISSON_PORT_SPEC.engineId).toBe("ode");
    expect(LAPLACE_POISSON_PORT_SPEC.methodId).toBe("laplace-poisson");
    expect(LAPLACE_POISSON_PORT_SPEC.executionMode).toBe("run");
    expect(LAPLACE_POISSON_PORT_SPEC.pageStoreKey).toBe(
      "engine-lab:ode-laplace-poisson",
    );
  });

  it("declares the field output first so the archetype is field", () => {
    expect(LAPLACE_POISSON_PORT_SPEC.outputs[0].kind).toBe("field");
    expect(archetypeFromSpec(LAPLACE_POISSON_PORT_SPEC)).toBe("field");
  });

  it("compute() is a sync placeholder returning an empty (not-yet-run) result", () => {
    expect(LAPLACE_POISSON_PORT_SPEC.compute({}).outputs).toEqual({});
  });

  it("computeRun (laplace) passes the edges and surfaces the field + mode + converged flag", async () => {
    const result = await LAPLACE_POISSON_PORT_SPEC.computeRun?.({
      mode: "laplace",
      a: 1,
      b: 1,
      M: 12,
      bottom: "0",
      top: "1",
      left: "0",
      right: "0",
      source: "-10",
    });
    expect(casCallMock).toHaveBeenCalledWith("solveLaplacePoisson", [
      {
        mode: "laplace",
        a: 1,
        b: 1,
        M: 12,
        bottom: "0",
        top: "1",
        left: "0",
        right: "0",
        source: "-10",
      },
    ]);
    expect(result?.error).toBeUndefined();
    const field = result?.outputs.field as {
      grid: unknown[][];
      variant: string;
      xHi: number;
    };
    expect(field.grid[0][2]).toEqual({ x: 1, y: 0, value: 1 });
    expect(field.variant).toBe("heatmap");
    expect(field.xHi).toBe(1);
    expect(result?.outputs.mode).toBe("laplace");
    expect(result?.outputs.converged).toBe(1);
  });

  it("rejects non-positive a/b", async () => {
    const result = await LAPLACE_POISSON_PORT_SPEC.computeRun?.({
      mode: "poisson",
      a: 0,
      b: 1,
      M: 12,
      source: "-10",
    });
    expect(result?.error).toBe("a and b must be positive numbers.");
    expect(casCallMock).not.toHaveBeenCalled();
  });

  it("surfaces a worker error", async () => {
    casCallMock.mockReset();
    casCallMock.mockResolvedValue({
      ok: false,
      error: "Couldn't parse a boundary.",
    });
    const result = await LAPLACE_POISSON_PORT_SPEC.computeRun?.({
      mode: "laplace",
      a: 1,
      b: 1,
      M: 12,
      bottom: "0",
      top: "1",
      left: "0",
      right: "0",
    });
    expect(result?.error).toBe("Couldn't parse a boundary.");
    expect(result?.outputs).toEqual({});
  });
});
