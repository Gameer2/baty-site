import { beforeEach, describe, expect, it, vi } from "vitest";

import { archetypeFromSpec } from "../syntropy/nodes/dispatch";
import { VECTORS_IN_SPACE_PORT_SPEC } from "../syntropy/portSpecs/vectorsInSpace";

// Mock the CAS bridge so computeRun is deterministic and offline (no real nerdamer). The op is
// always vectorOps; the return shape (scalar vs vector) depends on the operation argument.
const { casCallMock } = vi.hoisted(() => ({ casCallMock: vi.fn() }));

vi.mock("../syntropy/cas/casClient", () => ({ casCall: casCallMock }));

describe("VECTORS_IN_SPACE_PORT_SPEC", () => {
  beforeEach(() => {
    casCallMock.mockReset();
    casCallMock.mockImplementation(async (_op: string, args: unknown[]) => {
      const operation = args[0] as string;
      if (operation === "cross") {
        return {
          ok: true,
          operation,
          kind: "vector",
          resultVector: ["0", "0", "1"],
          numeric: [0, 0, 1],
          steps: [],
          verified: true,
        };
      }
      // dot, distance, angle, magnitude, projection, unit, tripleProduct → scalar headline.
      return {
        ok: true,
        operation,
        kind: "scalar",
        result: "32",
        numeric: 32,
        steps: [],
        verified: true,
      };
    });
  });

  it("identifies the calculus/vectors-in-space run-mode method", () => {
    expect(VECTORS_IN_SPACE_PORT_SPEC.engineId).toBe("calculus");
    expect(VECTORS_IN_SPACE_PORT_SPEC.methodId).toBe("vectors-in-space");
    expect(VECTORS_IN_SPACE_PORT_SPEC.executionMode).toBe("run");
    expect(VECTORS_IN_SPACE_PORT_SPEC.pageStoreKey).toBe(
      "engine-lab:calculus-vectors-in-space",
    );
  });

  it("declares the magnitude (number) output first so the archetype is scalar", () => {
    expect(VECTORS_IN_SPACE_PORT_SPEC.outputs[0].kind).toBe("number");
    expect(archetypeFromSpec(VECTORS_IN_SPACE_PORT_SPEC)).toBe("scalar");
  });

  it("compute() is a sync placeholder returning an empty (not-yet-run) result", () => {
    expect(VECTORS_IN_SPACE_PORT_SPEC.compute({}).outputs).toEqual({});
  });

  it("computeRun (dot) passes two vector operands and surfaces the scalar result + magnitude", async () => {
    const result = await VECTORS_IN_SPACE_PORT_SPEC.computeRun?.({
      operation: "dot",
      a: "1, 2, 3",
      b: "4, 5, 6",
      w: "0, 0, 0",
    });
    expect(casCallMock).toHaveBeenCalledWith("vectorOps", [
      "dot",
      [
        ["1", "2", "3"],
        ["4", "5", "6"],
      ],
    ]);
    expect(result?.error).toBeUndefined();
    expect(result?.outputs.magnitude).toBe(32);
    expect(result?.outputs.result).toBe("32");
  });

  it("computeRun (cross) surfaces the result vector's magnitude and the vector as text", async () => {
    const result = await VECTORS_IN_SPACE_PORT_SPEC.computeRun?.({
      operation: "cross",
      a: "1, 0, 0",
      b: "0, 1, 0",
      w: "0, 0, 0",
    });
    expect(casCallMock).toHaveBeenCalledWith("vectorOps", [
      "cross",
      [
        ["1", "0", "0"],
        ["0", "1", "0"],
      ],
    ]);
    expect(result?.outputs.magnitude).toBe(1);
    expect(result?.outputs.result).toBe("⟨0, 0, 1⟩");
  });

  it("computeRun (tripleProduct) passes the third vector w through", async () => {
    await VECTORS_IN_SPACE_PORT_SPEC.computeRun?.({
      operation: "tripleProduct",
      a: "1, 2, 3",
      b: "4, 5, 6",
      w: "7, 8, 9",
    });
    expect(casCallMock).toHaveBeenCalledWith("vectorOps", [
      "tripleProduct",
      [
        ["1", "2", "3"],
        ["4", "5", "6"],
        ["7", "8", "9"],
      ],
    ]);
  });

  it("computeRun (magnitude) passes a single vector operand", async () => {
    await VECTORS_IN_SPACE_PORT_SPEC.computeRun?.({
      operation: "magnitude",
      a: "3, 4, 0",
      b: "0, 0, 0",
      w: "0, 0, 0",
    });
    expect(casCallMock).toHaveBeenCalledWith("vectorOps", [
      "magnitude",
      [["3", "4", "0"]],
    ]);
  });

  it("rejects a vector that does not have exactly three components", async () => {
    const result = await VECTORS_IN_SPACE_PORT_SPEC.computeRun?.({
      operation: "dot",
      a: "1, 2",
      b: "4, 5, 6",
      w: "0, 0, 0",
    });
    expect(result?.outputs).toEqual({});
    expect(result?.error).toContain("three components");
    expect(casCallMock).not.toHaveBeenCalled();
  });

  it("surfaces the engine's failure reason when vectorOps does not succeed", async () => {
    casCallMock.mockReset();
    casCallMock.mockResolvedValue({
      ok: false,
      reason: "The cross product failed its perpendicularity/magnitude check.",
    });
    const result = await VECTORS_IN_SPACE_PORT_SPEC.computeRun?.({
      operation: "cross",
      a: "1, 2, 3",
      b: "4, 5, 6",
      w: "0, 0, 0",
    });
    expect(result?.outputs).toEqual({});
    expect(result?.error).toBe(
      "The cross product failed its perpendicularity/magnitude check.",
    );
  });
});
