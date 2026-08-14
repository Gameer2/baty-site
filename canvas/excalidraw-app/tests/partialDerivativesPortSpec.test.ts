import { beforeEach, describe, expect, it, vi } from "vitest";

import { archetypeFromSpec } from "../syntropy/nodes/dispatch";
import { PARTIAL_DERIVATIVES_PORT_SPEC } from "../syntropy/portSpecs/partialDerivatives";

// Mock the CAS bridge so computeRun is deterministic and offline (no real nerdamer). The spec
// makes two casCalls (partialDerivatives for f_x/f_y, sampleField for the gradient field).
const { casCallMock } = vi.hoisted(() => ({ casCallMock: vi.fn() }));

vi.mock("../syntropy/cas/casClient", () => ({ casCall: casCallMock }));

describe("PARTIAL_DERIVATIVES_PORT_SPEC", () => {
  beforeEach(() => {
    casCallMock.mockReset();
    casCallMock.mockImplementation(async (op: string) => {
      if (op === "partialDerivatives") {
        return {
          ok: true,
          technique: "partial-derivatives",
          fx: "2*x",
          fy: "2*y",
          gradAtPointNum: [2, 2],
          gradMag: "2*sqrt(2)",
          steps: [],
          verified: true,
        };
      }
      if (op === "sampleField") {
        return {
          ok: true,
          grid: [[{ x: -1, y: -1, value: 2.8284271247461903 }]],
          vectors: [
            { x: -1, y: -1, dx: -2, dy: -2 },
            { x: 3, y: 3, dx: 6, dy: 6 },
          ],
          xLo: -1,
          xHi: 3,
          yLo: -1,
          yHi: 3,
          variant: "arrows",
        };
      }
      throw new Error(`unexpected op: ${op}`);
    });
  });

  it("identifies the calculus/partial-derivatives run-mode method", () => {
    expect(PARTIAL_DERIVATIVES_PORT_SPEC.engineId).toBe("calculus");
    expect(PARTIAL_DERIVATIVES_PORT_SPEC.methodId).toBe("partial-derivatives");
    expect(PARTIAL_DERIVATIVES_PORT_SPEC.executionMode).toBe("run");
    expect(PARTIAL_DERIVATIVES_PORT_SPEC.pageStoreKey).toBe(
      "engine-lab:calculus-partial-derivatives",
    );
  });

  it("declares the field output first so the archetype is field", () => {
    expect(PARTIAL_DERIVATIVES_PORT_SPEC.outputs[0].kind).toBe("field");
    expect(archetypeFromSpec(PARTIAL_DERIVATIVES_PORT_SPEC)).toBe("field");
  });

  it("compute() is a sync placeholder returning an empty (not-yet-run) result", () => {
    expect(
      PARTIAL_DERIVATIVES_PORT_SPEC.compute({ f: "x^2+y^2" }).outputs,
    ).toEqual({});
  });

  it("computeRun calls partialDerivatives then samples the gradient field over a window around the point", async () => {
    const result = await PARTIAL_DERIVATIVES_PORT_SPEC.computeRun?.({
      f: "x^2+y^2",
      a: 1,
      b: 1,
    });
    expect(casCallMock).toHaveBeenCalledWith("partialDerivatives", [
      "x^2+y^2",
      ["x", "y"],
      ["1", "1"],
    ]);
    // Domain = [a-2, a+2] × [b-2, b+2] = [-1, 3] × [-1, 3] (centred on the point (1, 1)).
    expect(casCallMock).toHaveBeenCalledWith("sampleField", [
      {
        variant: "arrows",
        pExpr: "2*x",
        qExpr: "2*y",
        xLo: -1,
        xHi: 3,
        yLo: -1,
        yHi: 3,
        cols: 20,
        rows: 20,
      },
    ]);
    expect(result?.error).toBeUndefined();
    expect(result?.outputs.field).toBeDefined();
    // ‖∇f(1, 1)‖ = ‖⟨2, 2⟩‖ = 2√2.
    expect(result?.outputs.gradient).toBeCloseTo(2 * Math.SQRT2);
  });

  it("surfaces the engine's failure reason and skips sampling when partialDerivatives fails", async () => {
    casCallMock.mockReset();
    casCallMock.mockResolvedValue({
      ok: false,
      reason: "Couldn't parse f(x, y).",
    });
    const result = await PARTIAL_DERIVATIVES_PORT_SPEC.computeRun?.({
      f: "garbage(",
      a: 1,
      b: 1,
    });
    expect(result?.outputs).toEqual({});
    expect(result?.error).toBe("Couldn't parse f(x, y).");
    expect(casCallMock).toHaveBeenCalledTimes(1);
  });
});
