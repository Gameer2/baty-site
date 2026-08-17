import { beforeEach, describe, expect, it, vi } from "vitest";

import { archetypeFromSpec } from "../syntropy/nodes/dispatch";
import { CURVE_SKETCHING_PORT_SPEC } from "../syntropy/portSpecs/curveSketching";

// Mock the CAS bridge so computeRun is deterministic and offline (no real nerdamer). The spec
// makes two casCalls (curveAnalysis for the features, sampleCurve for the display points), so
// the mock dispatches on the op name.
const { casCallMock } = vi.hoisted(() => ({ casCallMock: vi.fn() }));

vi.mock("../syntropy/cas/casClient", () => ({ casCall: casCallMock }));

describe("CURVE_SKETCHING_PORT_SPEC", () => {
  beforeEach(() => {
    casCallMock.mockReset();
    casCallMock.mockImplementation(async (op: string) => {
      if (op === "curveAnalysis") {
        return {
          ok: true,
          criticalPoints: [
            { x: -1, kind: "local max" },
            { x: 1, kind: "local min" },
          ],
          inflectionPoints: [{ x: 0 }],
          monotonic: [],
          concavity: [],
          steps: [],
          verified: true,
        };
      }
      if (op === "sampleCurve") {
        return {
          ok: true,
          points: [
            { x: -3, y: -18 },
            { x: 0, y: 0 },
            { x: 3, y: 18 },
          ],
          a: -3,
          b: 3,
        };
      }
      throw new Error(`unexpected op: ${op}`);
    });
  });

  it("identifies the calculus/curve-sketching run-mode method", () => {
    expect(CURVE_SKETCHING_PORT_SPEC.engineId).toBe("calculus");
    expect(CURVE_SKETCHING_PORT_SPEC.methodId).toBe("curve-sketching");
    expect(CURVE_SKETCHING_PORT_SPEC.executionMode).toBe("run");
    expect(CURVE_SKETCHING_PORT_SPEC.pageStoreKey).toBe(
      "engine-lab:calculus-curve-sketching",
    );
  });

  it("declares the curve output first so the archetype is real-line", () => {
    expect(CURVE_SKETCHING_PORT_SPEC.outputs[0].kind).toBe("curve");
    expect(archetypeFromSpec(CURVE_SKETCHING_PORT_SPEC)).toBe("real-line");
  });

  it("compute() is a sync placeholder returning an empty (not-yet-run) result", () => {
    expect(CURVE_SKETCHING_PORT_SPEC.compute({ f: "x^3-3*x" }).outputs).toEqual(
      {},
    );
  });

  it("computeRun calls curveAnalysis then sampleCurve and builds the curve + features", async () => {
    const result = await CURVE_SKETCHING_PORT_SPEC.computeRun?.({
      f: "x^3-3*x",
      a: -3,
      b: 3,
    });
    expect(casCallMock).toHaveBeenCalledWith("curveAnalysis", [
      "x^3-3*x",
      "x",
      -3,
      3,
    ]);
    expect(casCallMock).toHaveBeenCalledWith("sampleCurve", [
      { mode: "function", expr: "x^3-3*x", variable: "x", a: -3, b: 3, n: 300 },
    ]);
    expect(result?.error).toBeUndefined();
    expect(result?.outputs.curve).toEqual({
      points: [
        { x: -3, y: -18 },
        { x: 0, y: 0 },
        { x: 3, y: 18 },
      ],
    });
    expect(result?.outputs.features).toContain("Critical:");
    expect(result?.outputs.features).toContain("local max");
    expect(result?.outputs.features).toContain("Inflection:");
  });

  it("surfaces the engine's failure reason and skips sampling when curveAnalysis fails", async () => {
    casCallMock.mockReset();
    casCallMock.mockResolvedValue({
      ok: false,
      reason: "Couldn't parse f(x).",
    });
    const result = await CURVE_SKETCHING_PORT_SPEC.computeRun?.({
      f: "garbage(",
      a: -3,
      b: 3,
    });
    expect(result?.outputs).toEqual({});
    expect(result?.error).toBe("Couldn't parse f(x).");
    expect(casCallMock).toHaveBeenCalledTimes(1);
  });
});
