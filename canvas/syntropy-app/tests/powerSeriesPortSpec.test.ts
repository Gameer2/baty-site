import { beforeEach, describe, expect, it, vi } from "vitest";

import { archetypeFromSpec } from "../syntropy/nodes/dispatch";
import { POWER_SERIES_PORT_SPEC } from "../syntropy/portSpecs/powerSeries";

// Mock the CAS bridge so computeRun is deterministic and offline (no real nerdamer). The spec
// makes two casCalls (powerSeries for the radius/interval, sampleCurve for the partial-sum
// display), so the mock dispatches on the op name.
const { casCallMock } = vi.hoisted(() => ({ casCallMock: vi.fn() }));

vi.mock("../syntropy/cas/casClient", () => ({ casCall: casCallMock }));

describe("POWER_SERIES_PORT_SPEC", () => {
  beforeEach(() => {
    casCallMock.mockReset();
    casCallMock.mockImplementation(async (op: string) => {
      if (op === "powerSeries") {
        return {
          ok: true,
          radius: 1,
          radiusText: "1",
          interval: "(-1, 1)",
          endpoints: [{ verdict: "diverges" }, { verdict: "diverges" }],
          steps: [],
          verified: true,
        };
      }
      if (op === "sampleCurve") {
        return {
          ok: true,
          points: [
            { x: -1, y: 0.5 },
            { x: 0, y: 0 },
            { x: 1, y: 0.5 },
          ],
          a: -1,
          b: 1,
        };
      }
      throw new Error(`unexpected op: ${op}`);
    });
  });

  it("identifies the calculus/power-series run-mode method", () => {
    expect(POWER_SERIES_PORT_SPEC.engineId).toBe("calculus");
    expect(POWER_SERIES_PORT_SPEC.methodId).toBe("power-series");
    expect(POWER_SERIES_PORT_SPEC.executionMode).toBe("run");
    expect(POWER_SERIES_PORT_SPEC.pageStoreKey).toBe(
      "engine-lab:calculus-power-series",
    );
  });

  it("declares the curve output first so the archetype is real-line", () => {
    expect(POWER_SERIES_PORT_SPEC.outputs[0].kind).toBe("curve");
    expect(archetypeFromSpec(POWER_SERIES_PORT_SPEC)).toBe("real-line");
  });

  it("compute() is a sync placeholder returning an empty (not-yet-run) result", () => {
    expect(POWER_SERIES_PORT_SPEC.compute({ coeffs: "1/n" }).outputs).toEqual(
      {},
    );
  });

  it("computeRun calls powerSeries then sampleCurve (window = convergence interval) and surfaces radius + interval", async () => {
    const result = await POWER_SERIES_PORT_SPEC.computeRun?.({
      coeffs: "1/n",
      center: 0,
    });
    expect(casCallMock).toHaveBeenCalledWith("powerSeries", ["1/n", "x", 0]);
    expect(casCallMock).toHaveBeenCalledWith("sampleCurve", [
      {
        mode: "series",
        coeffsExpr: "1/n",
        indexVar: "n",
        center: 0,
        degree: 30,
        variable: "x",
        a: -1,
        b: 1,
        n: 300,
      },
    ]);
    expect(result?.error).toBeUndefined();
    expect(result?.outputs.curve).toEqual({
      points: [
        { x: -1, y: 0.5 },
        { x: 0, y: 0 },
        { x: 1, y: 0.5 },
      ],
    });
    expect(result?.outputs.radius).toBe(1);
    expect(result?.outputs.interval).toBe("(-1, 1)");
  });

  it("surfaces the engine's failure reason and skips sampling when powerSeries fails", async () => {
    casCallMock.mockReset();
    casCallMock.mockResolvedValue({
      ok: false,
      reason: "Couldn't parse the coefficient expression.",
    });
    const result = await POWER_SERIES_PORT_SPEC.computeRun?.({
      coeffs: "garbage(",
      center: 0,
    });
    expect(result?.outputs).toEqual({});
    expect(result?.error).toBe("Couldn't parse the coefficient expression.");
    expect(casCallMock).toHaveBeenCalledTimes(1);
  });
});
