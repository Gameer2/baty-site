import { beforeEach, describe, expect, it, vi } from "vitest";

import { archetypeFromSpec } from "../syntropy/nodes/dispatch";
import { VECTOR_CALCULUS_PORT_SPEC } from "../syntropy/portSpecs/vectorCalculus";

// Mock the CAS bridge so computeRun is deterministic and offline (no real nerdamer). The spec
// makes two casCalls (vectorCalculus for the operator result, sampleField for the direction
// field), so the mock dispatches on the op name.
const { casCallMock } = vi.hoisted(() => ({ casCallMock: vi.fn() }));

vi.mock("../syntropy/cas/casClient", () => ({ casCall: casCallMock }));

describe("VECTOR_CALCULUS_PORT_SPEC", () => {
  beforeEach(() => {
    casCallMock.mockReset();
    casCallMock.mockImplementation(async (op: string) => {
      if (op === "vectorCalculus") {
        return {
          ok: true,
          technique: "vector-calculus",
          operation: "divergence-curl",
          P: "-y",
          Q: "x",
          div: { value: "2", numeric: 2, verified: true },
          curl: { value: "0", numeric: 0, verified: true },
          conservative: { ok: false },
          potential: null,
          steps: [],
          verified: true,
        };
      }
      if (op === "sampleField") {
        // Row-major: the y = -3 row first, then the y = 3 row.
        return {
          ok: true,
          grid: [[{ x: -3, y: -3, value: 4.242640687119285 }]],
          vectors: [
            { x: -3, y: -3, dx: 3, dy: -3 },
            { x: 3, y: -3, dx: -3, dy: -3 },
            { x: -3, y: 3, dx: 3, dy: 3 },
            { x: 3, y: 3, dx: -3, dy: 3 },
          ],
          xLo: -3,
          xHi: 3,
          yLo: -3,
          yHi: 3,
          variant: "arrows",
        };
      }
      throw new Error(`unexpected op: ${op}`);
    });
  });

  it("identifies the calculus/vector-calculus run-mode method", () => {
    expect(VECTOR_CALCULUS_PORT_SPEC.engineId).toBe("calculus");
    expect(VECTOR_CALCULUS_PORT_SPEC.methodId).toBe("vector-calculus");
    expect(VECTOR_CALCULUS_PORT_SPEC.executionMode).toBe("run");
    expect(VECTOR_CALCULUS_PORT_SPEC.pageStoreKey).toBe(
      "engine-lab:calculus-vector-calculus",
    );
  });

  it("declares the field output first so the archetype is field", () => {
    expect(VECTOR_CALCULUS_PORT_SPEC.outputs[0].kind).toBe("field");
    expect(archetypeFromSpec(VECTOR_CALCULUS_PORT_SPEC)).toBe("field");
  });

  it("compute() is a sync placeholder returning an empty (not-yet-run) result", () => {
    expect(VECTOR_CALCULUS_PORT_SPEC.compute({}).outputs).toEqual({});
  });

  it("computeRun (divergence-curl) calls the op + sampleField and regroups vectors by row", async () => {
    const result = await VECTOR_CALCULUS_PORT_SPEC.computeRun?.({
      operation: "divergence-curl",
      P: "-y",
      Q: "x",
      x0: -3,
      x1: 3,
      y0: -3,
      y1: 3,
    });
    expect(casCallMock).toHaveBeenCalledWith("vectorCalculus", [
      "divergence-curl",
      { P: "-y", Q: "x" },
      {},
    ]);
    expect(casCallMock).toHaveBeenCalledWith("sampleField", [
      {
        variant: "arrows",
        pExpr: "-y",
        qExpr: "x",
        xLo: -3,
        xHi: 3,
        yLo: -3,
        yHi: 3,
        cols: 20,
        rows: 20,
      },
    ]);
    expect(result?.error).toBeUndefined();
    const field = result?.outputs.field as {
      grid: unknown;
      vectors: unknown[][];
      variant: string;
    };
    expect(field.grid).toEqual([[{ x: -3, y: -3, value: 4.242640687119285 }]]);
    // The flat 4-vector list regroups into 2 rows (one per y-level).
    expect(field.vectors).toHaveLength(2);
    expect(field.vectors[0]).toHaveLength(2);
    expect(field.vectors[1]).toHaveLength(2);
    expect(field.variant).toBe("arrows");
    expect(result?.outputs.result).toContain("div");
    expect(result?.outputs.result).toContain("curl");
  });

  it("computeRun (line-integral) builds a curve spec and a work/flux result", async () => {
    casCallMock.mockReset();
    casCallMock.mockImplementation(async (op: string) => {
      if (op === "vectorCalculus") {
        return {
          ok: true,
          technique: "vector-calculus",
          operation: "line-integral",
          quantities: {
            work: { ok: true, numeric: 0, verified: true },
            flux: { ok: true, numeric: 6.283185307179586, verified: true },
          },
          qOrder: ["work", "flux"],
          steps: [],
          verified: true,
        };
      }
      return {
        ok: true,
        grid: [],
        vectors: [],
        xLo: -3,
        xHi: 3,
        yLo: -3,
        yHi: 3,
        variant: "arrows",
      };
    });
    const result = await VECTOR_CALCULUS_PORT_SPEC.computeRun?.({
      operation: "line-integral",
      P: "-y",
      Q: "x",
      x0: -3,
      x1: 3,
      y0: -3,
      y1: 3,
      curveX: "cos(t)",
      curveY: "sin(t)",
      a: "0",
      b: "2*pi",
    });
    expect(casCallMock).toHaveBeenCalledWith("vectorCalculus", [
      "line-integral",
      { P: "-y", Q: "x", x: "cos(t)", y: "sin(t)", a: "0", b: "2*pi" },
      {},
    ]);
    expect(result?.outputs.result).toContain("work");
    expect(result?.outputs.result).toContain("flux");
  });

  it("surfaces the engine's failure reason and skips sampling when the op fails", async () => {
    casCallMock.mockReset();
    casCallMock.mockResolvedValue({
      ok: false,
      reason: "Need a vector field F = ⟨P(x,y), Q(x,y)⟩.",
    });
    const result = await VECTOR_CALCULUS_PORT_SPEC.computeRun?.({
      operation: "divergence-curl",
      P: "",
      Q: "",
      x0: -3,
      x1: 3,
      y0: -3,
      y1: 3,
    });
    expect(result?.outputs).toEqual({});
    expect(result?.error).toBe("Need a vector field F = ⟨P(x,y), Q(x,y)⟩.");
    expect(casCallMock).toHaveBeenCalledTimes(1);
  });
});
