import { beforeEach, describe, expect, it, vi } from "vitest";

import { archetypeFromSpec } from "../syntropy/nodes/dispatch";
import { PARAMETRIC_AND_POLAR_PORT_SPEC } from "../syntropy/portSpecs/parametricAndPolar";

// Mock the CAS bridge so computeRun is deterministic and offline (no real nerdamer). The spec
// makes two casCalls (parametricAndPolar for the area bundle, sampleCurve for the display
// points), so the mock dispatches on the op name.
const { casCallMock } = vi.hoisted(() => ({ casCallMock: vi.fn() }));

vi.mock("../syntropy/cas/casClient", () => ({ casCall: casCallMock }));

describe("PARAMETRIC_AND_POLAR_PORT_SPEC", () => {
  beforeEach(() => {
    casCallMock.mockReset();
    casCallMock.mockImplementation(async (op: string) => {
      if (op === "parametricAndPolar") {
        return {
          ok: true,
          technique: "parametric-polar",
          mode: "parametric",
          quantities: {
            slope: { ok: true, numeric: 0, latex: "", verified: true },
            arcLength: { ok: true, numeric: 6.283185307179586, verified: true },
            area: { ok: true, numeric: Math.PI, latex: "\\pi", verified: true },
          },
          qOrder: ["slope", "arcLength", "area"],
          latex: "\\pi",
          steps: [],
          verified: true,
        };
      }
      if (op === "sampleCurve") {
        return {
          ok: true,
          points: [
            { x: 1, y: 0 },
            { x: 0, y: 1 },
          ],
          a: 0,
          b: 6.283185307179586,
        };
      }
      throw new Error(`unexpected op: ${op}`);
    });
  });

  it("identifies the calculus/parametric-and-polar run-mode method", () => {
    expect(PARAMETRIC_AND_POLAR_PORT_SPEC.engineId).toBe("calculus");
    expect(PARAMETRIC_AND_POLAR_PORT_SPEC.methodId).toBe(
      "parametric-and-polar",
    );
    expect(PARAMETRIC_AND_POLAR_PORT_SPEC.executionMode).toBe("run");
    expect(PARAMETRIC_AND_POLAR_PORT_SPEC.pageStoreKey).toBe(
      "engine-lab:calculus-parametric-and-polar",
    );
  });

  it("declares the curve output first so the archetype is real-line", () => {
    expect(PARAMETRIC_AND_POLAR_PORT_SPEC.outputs[0].kind).toBe("curve");
    expect(archetypeFromSpec(PARAMETRIC_AND_POLAR_PORT_SPEC)).toBe("real-line");
  });

  it("compute() is a sync placeholder returning an empty (not-yet-run) result", () => {
    expect(PARAMETRIC_AND_POLAR_PORT_SPEC.compute({}).outputs).toEqual({});
  });

  it("computeRun (parametric) calls the op + sampleCurve and surfaces the curve + area", async () => {
    const result = await PARAMETRIC_AND_POLAR_PORT_SPEC.computeRun?.({
      mode: "parametric",
      x: "cos(t)",
      y: "sin(t)",
      r: "1",
      a: 0,
      b: 6.283185307179586,
    });
    expect(casCallMock).toHaveBeenCalledWith("parametricAndPolar", [
      "parametric",
      { x: "cos(t)", y: "sin(t)", a: "0", b: "6.283185307179586" },
      {},
    ]);
    expect(casCallMock).toHaveBeenCalledWith("sampleCurve", [
      {
        mode: "parametric",
        xExpr: "cos(t)",
        yExpr: "sin(t)",
        variable: "t",
        a: 0,
        b: 6.283185307179586,
        n: 400,
      },
    ]);
    expect(result?.error).toBeUndefined();
    expect(result?.outputs.curve).toEqual({
      points: [
        { x: 1, y: 0 },
        { x: 0, y: 1 },
      ],
    });
    expect(result?.outputs.area).toBeCloseTo(Math.PI);
  });

  it("computeRun (polar) builds a polar sample config and a polar spec", async () => {
    await PARAMETRIC_AND_POLAR_PORT_SPEC.computeRun?.({
      mode: "polar",
      x: "cos(t)",
      y: "sin(t)",
      r: "1",
      a: 0,
      b: 6.283185307179586,
    });
    expect(casCallMock).toHaveBeenCalledWith("parametricAndPolar", [
      "polar",
      { r: "1", a: "0", b: "6.283185307179586" },
      {},
    ]);
    expect(casCallMock).toHaveBeenCalledWith("sampleCurve", [
      {
        mode: "polar",
        rExpr: "1",
        variable: "t",
        a: 0,
        b: 6.283185307179586,
        n: 400,
      },
    ]);
  });

  it("surfaces the engine's failure reason and skips sampling when the op fails", async () => {
    casCallMock.mockReset();
    casCallMock.mockResolvedValue({
      ok: false,
      reason: "Parametric mode needs x(t) and y(t).",
    });
    const result = await PARAMETRIC_AND_POLAR_PORT_SPEC.computeRun?.({
      mode: "parametric",
      x: "",
      y: "",
      r: "1",
      a: 0,
      b: 6.283185307179586,
    });
    expect(result?.outputs).toEqual({});
    expect(result?.error).toBe("Parametric mode needs x(t) and y(t).");
    expect(casCallMock).toHaveBeenCalledTimes(1);
  });
});
