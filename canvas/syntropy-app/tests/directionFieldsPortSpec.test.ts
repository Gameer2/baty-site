import { beforeEach, describe, expect, it, vi } from "vitest";

import { archetypeFromSpec } from "../syntropy/nodes/dispatch";
import { DIRECTION_FIELDS_PORT_SPEC } from "../syntropy/portSpecs/directionFields";

// Mock the CAS bridge so computeRun is deterministic and offline. directionFields reuses the
// shared sampleField op with the direction field dy/dx = f(x,y) reinterpreted as ⟨1, f⟩.
const { casCallMock } = vi.hoisted(() => ({ casCallMock: vi.fn() }));
vi.mock("../syntropy/cas/casClient", () => ({ casCall: casCallMock }));

describe("DIRECTION_FIELDS_PORT_SPEC", () => {
  beforeEach(() => {
    casCallMock.mockReset();
    casCallMock.mockImplementation(async (_op: string) => ({
      ok: true,
      grid: [[{ x: -5, y: -5, value: Math.SQRT2 }]],
      // Row-major flat list: the y = -5 row first, then the y = 5 row.
      vectors: [
        { x: -5, y: -5, dx: 1, dy: -5 },
        { x: 5, y: -5, dx: 1, dy: 5 },
        { x: -5, y: 5, dx: 1, dy: 5 },
        { x: 5, y: 5, dx: 1, dy: -5 },
      ],
      xLo: -5,
      xHi: 5,
      yLo: -5,
      yHi: 5,
      variant: "arrows",
    }));
  });

  it("identifies the ode/direction-fields run-mode method", () => {
    expect(DIRECTION_FIELDS_PORT_SPEC.engineId).toBe("ode");
    expect(DIRECTION_FIELDS_PORT_SPEC.methodId).toBe("direction-fields");
    expect(DIRECTION_FIELDS_PORT_SPEC.executionMode).toBe("run");
    expect(DIRECTION_FIELDS_PORT_SPEC.pageStoreKey).toBe(
      "engine-lab:ode-direction-fields",
    );
  });

  it("declares the field output first so the archetype is field", () => {
    expect(DIRECTION_FIELDS_PORT_SPEC.outputs[0].kind).toBe("field");
    expect(archetypeFromSpec(DIRECTION_FIELDS_PORT_SPEC)).toBe("field");
  });

  it("compute() is a sync placeholder returning an empty (not-yet-run) result", () => {
    expect(DIRECTION_FIELDS_PORT_SPEC.compute({}).outputs).toEqual({});
  });

  it("computeRun calls sampleField with ⟨1, f⟩ and regroups the flat vector list by row", async () => {
    const result = await DIRECTION_FIELDS_PORT_SPEC.computeRun?.({
      f: "x + y",
      x0: -5,
      x1: 5,
      y0: -5,
      y1: 5,
    });
    expect(casCallMock).toHaveBeenCalledWith("sampleField", [
      {
        variant: "arrows",
        pExpr: "1",
        qExpr: "x + y",
        vars: ["x", "y"],
        xLo: -5,
        xHi: 5,
        yLo: -5,
        yHi: 5,
        cols: 17,
        rows: 17,
      },
    ]);
    expect(result?.error).toBeUndefined();
    const field = result?.outputs.field as {
      grid: unknown;
      vectors: unknown[][];
      variant: string;
    };
    expect(field.grid).toEqual([[{ x: -5, y: -5, value: Math.SQRT2 }]]);
    // The flat 4-vector list regroups into 2 rows (one per y-level).
    expect(field.vectors).toHaveLength(2);
    expect(field.vectors[0]).toHaveLength(2);
    expect(field.vectors[1]).toHaveLength(2);
    expect(field.variant).toBe("arrows");
  });

  it("rejects an inverted or non-finite range", async () => {
    const result = await DIRECTION_FIELDS_PORT_SPEC.computeRun?.({
      f: "x",
      x0: 5,
      x1: -5,
      y0: -5,
      y1: 5,
    });
    expect(result?.error).toBe(
      "The x and y ranges must be finite with max > min.",
    );
    expect(casCallMock).not.toHaveBeenCalled();
  });
});
