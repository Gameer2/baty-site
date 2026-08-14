import { beforeEach, describe, expect, it, vi } from "vitest";

import { archetypeFromSpec } from "../syntropy/nodes/dispatch";
import { FOURIER_SERIES_PORT_SPEC } from "../syntropy/portSpecs/fourierSeries";

// Mock the CAS bridge so computeRun is deterministic and offline (no real nerdamer). The spec
// makes two casCalls (fourierSeries for the coefficient arrays, sampleCurve for the f overlay);
// the partial sum S_N is sampled client-side from a0/an/bn.
const { casCallMock } = vi.hoisted(() => ({ casCallMock: vi.fn() }));

vi.mock("../syntropy/cas/casClient", () => ({ casCall: casCallMock }));

const PI = Math.PI;

describe("FOURIER_SERIES_PORT_SPEC", () => {
  beforeEach(() => {
    casCallMock.mockReset();
    casCallMock.mockImplementation(async (op: string) => {
      if (op === "fourierSeries") {
        // f(x) = x on [-pi, pi], full series: a0 = 0, an = 0, bn = 2*(-1)^(n+1)/n.
        return {
          ok: true,
          technique: "fourier-series",
          mode: "full",
          L: PI,
          Llabel: "\\pi",
          N: 8,
          a0: { numeric: 0 },
          an: Array.from({ length: 8 }, () => ({ numeric: 0 })),
          bn: [
            { numeric: 2 },
            { numeric: -1 },
            { numeric: 2 / 3 },
            { numeric: -0.5 },
            { numeric: 0.4 },
            { numeric: -1 / 3 },
            { numeric: 2 / 7 },
            { numeric: -0.25 },
          ],
          seriesLatex: "",
          partialSumLatex: "",
          steps: [],
          verified: true,
        };
      }
      if (op === "sampleCurve") {
        return {
          ok: true,
          points: [
            { x: -PI, y: -PI },
            { x: PI, y: PI },
          ],
          a: -PI,
          b: PI,
        };
      }
      throw new Error(`unexpected op: ${op}`);
    });
  });

  it("identifies the calculus/fourier-series run-mode method", () => {
    expect(FOURIER_SERIES_PORT_SPEC.engineId).toBe("calculus");
    expect(FOURIER_SERIES_PORT_SPEC.methodId).toBe("fourier-series");
    expect(FOURIER_SERIES_PORT_SPEC.executionMode).toBe("run");
    expect(FOURIER_SERIES_PORT_SPEC.pageStoreKey).toBe(
      "engine-lab:calculus-fourier-series",
    );
  });

  it("declares the curve output first so the archetype is real-line", () => {
    expect(FOURIER_SERIES_PORT_SPEC.outputs[0].kind).toBe("curve");
    expect(archetypeFromSpec(FOURIER_SERIES_PORT_SPEC)).toBe("real-line");
  });

  it("compute() is a sync placeholder returning an empty (not-yet-run) result", () => {
    expect(FOURIER_SERIES_PORT_SPEC.compute({ f: "x" }).outputs).toEqual({});
  });

  it("computeRun samples S_N client-side from the coeffs and overlays f via sampleCurve", async () => {
    const result = await FOURIER_SERIES_PORT_SPEC.computeRun?.({
      f: "x",
      L: "pi",
      mode: "full",
      N: 8,
    });
    expect(casCallMock).toHaveBeenCalledWith("fourierSeries", [
      "x",
      "x",
      "pi",
      "full",
      8,
    ]);
    // Full mode ⇒ interval [-L, L] = [-pi, pi].
    expect(casCallMock).toHaveBeenCalledWith("sampleCurve", [
      { mode: "function", expr: "x", variable: "x", a: -PI, b: PI, n: 400 },
    ]);
    expect(result?.error).toBeUndefined();

    const curve = result?.outputs.curve as {
      points: Array<{ x: number; y: number }>;
      samples?: unknown;
    };
    // 400 intervals ⇒ 401 points.
    expect(curve.points).toHaveLength(401);
    // At x = 0 (index 200) every sine term vanishes and a0 = 0, so S_N(0) = 0.
    expect(curve.points[200].y).toBe(0);
    expect(curve.samples).toEqual([
      { x: -PI, y: -PI },
      { x: PI, y: PI },
    ]);
    expect(result?.outputs.a0).toBe(0);
  });

  it("surfaces the engine's failure reason and skips sampling when fourierSeries fails", async () => {
    casCallMock.mockReset();
    casCallMock.mockResolvedValue({
      ok: false,
      reason: "The half-length L must be a positive number or constant.",
    });
    const result = await FOURIER_SERIES_PORT_SPEC.computeRun?.({
      f: "x",
      L: "0",
      mode: "full",
      N: 8,
    });
    expect(result?.outputs).toEqual({});
    expect(result?.error).toBe(
      "The half-length L must be a positive number or constant.",
    );
    expect(casCallMock).toHaveBeenCalledTimes(1);
  });
});
