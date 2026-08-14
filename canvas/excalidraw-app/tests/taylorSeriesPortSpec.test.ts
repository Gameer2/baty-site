import { beforeEach, describe, expect, it, vi } from "vitest";

import { archetypeFromSpec } from "../syntropy/nodes/dispatch";
import { TAYLOR_SERIES_PORT_SPEC } from "../syntropy/portSpecs/taylorSeries";

// Mock the CAS bridge so computeRun is deterministic and offline (no real nerdamer). The spec
// makes two casCalls (taylorSeries for the numeric coeffs, sampleCurve for the f overlay); the
// polynomial itself is sampled client-side from the coeffs.
const { casCallMock } = vi.hoisted(() => ({ casCallMock: vi.fn() }));

vi.mock("../syntropy/cas/casClient", () => ({ casCall: casCallMock }));

describe("TAYLOR_SERIES_PORT_SPEC", () => {
  beforeEach(() => {
    casCallMock.mockReset();
    casCallMock.mockImplementation(async (op: string) => {
      if (op === "taylorSeries") {
        return {
          ok: true,
          degree: 4,
          coeffs: [1, 1, 0.5, 1 / 6, 1 / 24],
          result: "1 + x + x^2/2 + x^3/6 + x^4/24",
          steps: [],
          verified: true,
        };
      }
      if (op === "sampleCurve") {
        return {
          ok: true,
          points: [
            { x: -2, y: 0.1353352832366127 },
            { x: 2, y: 7.38905609893065 },
          ],
          a: -2,
          b: 2,
        };
      }
      throw new Error(`unexpected op: ${op}`);
    });
  });

  it("identifies the calculus/taylor-series run-mode method", () => {
    expect(TAYLOR_SERIES_PORT_SPEC.engineId).toBe("calculus");
    expect(TAYLOR_SERIES_PORT_SPEC.methodId).toBe("taylor-series");
    expect(TAYLOR_SERIES_PORT_SPEC.executionMode).toBe("run");
    expect(TAYLOR_SERIES_PORT_SPEC.pageStoreKey).toBe(
      "engine-lab:calculus-taylor-series",
    );
  });

  it("declares the curve output first so the archetype is real-line", () => {
    expect(TAYLOR_SERIES_PORT_SPEC.outputs[0].kind).toBe("curve");
    expect(archetypeFromSpec(TAYLOR_SERIES_PORT_SPEC)).toBe("real-line");
  });

  it("compute() is a sync placeholder returning an empty (not-yet-run) result", () => {
    expect(TAYLOR_SERIES_PORT_SPEC.compute({ f: "e^x" }).outputs).toEqual({});
  });

  it("computeRun samples the polynomial client-side from coeffs and overlays f via sampleCurve", async () => {
    const result = await TAYLOR_SERIES_PORT_SPEC.computeRun?.({
      f: "e^x",
      center: 0,
      degree: 4,
    });
    expect(casCallMock).toHaveBeenCalledWith("taylorSeries", [
      "e^x",
      "x",
      0,
      4,
    ]);
    // span = max(2, |0|*0.6 + 2) = 2  ⇒  window [-2, 2].
    expect(casCallMock).toHaveBeenCalledWith("sampleCurve", [
      { mode: "function", expr: "e^x", variable: "x", a: -2, b: 2, n: 300 },
    ]);
    expect(result?.error).toBeUndefined();

    const curve = result?.outputs.curve as {
      points: Array<{ x: number; y: number }>;
      samples?: unknown;
    };
    // 300 intervals ⇒ 301 points.
    expect(curve.points).toHaveLength(301);
    // At x = 0 (index 150) the polynomial equals coeffs[0] = 1 (the higher terms vanish).
    expect(curve.points[150]).toEqual({ x: 0, y: 1 });
    // The f overlay is the sampleCurve mock points.
    expect(curve.samples).toEqual([
      { x: -2, y: 0.1353352832366127 },
      { x: 2, y: 7.38905609893065 },
    ]);
    expect(result?.outputs.degree).toBe(4);
  });

  it("surfaces the engine's failure reason and skips sampling when taylorSeries fails", async () => {
    casCallMock.mockReset();
    casCallMock.mockResolvedValue({
      ok: false,
      reason: "Couldn't parse f(x).",
    });
    const result = await TAYLOR_SERIES_PORT_SPEC.computeRun?.({
      f: "garbage(",
      center: 0,
      degree: 4,
    });
    expect(result?.outputs).toEqual({});
    expect(result?.error).toBe("Couldn't parse f(x).");
    expect(casCallMock).toHaveBeenCalledTimes(1);
  });
});
