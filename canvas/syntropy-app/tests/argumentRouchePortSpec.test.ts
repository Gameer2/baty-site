import { beforeEach, describe, expect, it, vi } from "vitest";

import { archetypeFromSpec } from "../syntropy/nodes/dispatch";
import { ARGUMENT_ROUCHE_PORT_SPEC } from "../syntropy/portSpecs/argumentRouche";

const { casCallMock } = vi.hoisted(() => ({ casCallMock: vi.fn() }));
vi.mock("../syntropy/cas/casClient", () => ({ casCall: casCallMock }));

describe("ARGUMENT_ROUCHE_PORT_SPEC", () => {
  beforeEach(() => {
    casCallMock.mockReset();
    casCallMock.mockImplementation(async (_op: string, args: unknown[]) => {
      const mode = args[3] as string;
      if (mode === "rouche") {
        return {
          ok: true,
          applies: true,
          maxRatio: 0.25,
          nF: 2,
          nG: 2,
          equal: true,
          verified: true,
          reason: "",
          count: 2,
        };
      }
      // argument principle: f = z^2 inside |z| = 2 → N - P = 2.
      return {
        ok: true,
        nMinusP: 2,
        winding: 2,
        logDeriv: { re: 2, im: 0 },
        verified: true,
        count: 2,
      };
    });
  });

  it("identifies the complex/argument-rouche run-mode method", () => {
    expect(ARGUMENT_ROUCHE_PORT_SPEC.engineId).toBe("complex");
    expect(ARGUMENT_ROUCHE_PORT_SPEC.methodId).toBe("argument-rouche");
    expect(ARGUMENT_ROUCHE_PORT_SPEC.executionMode).toBe("run");
    expect(ARGUMENT_ROUCHE_PORT_SPEC.pageStoreKey).toBe(
      "engine-lab:complex-argument-rouche",
    );
  });

  it("declares the number output first so the archetype is scalar", () => {
    expect(ARGUMENT_ROUCHE_PORT_SPEC.outputs[0].kind).toBe("number");
    expect(archetypeFromSpec(ARGUMENT_ROUCHE_PORT_SPEC)).toBe("scalar");
  });

  it("compute() is a sync placeholder returning an empty (not-yet-run) result", () => {
    expect(ARGUMENT_ROUCHE_PORT_SPEC.compute({}).outputs).toEqual({});
  });

  it("computeRun (argument) passes f + g + circle contour + mode and surfaces N−P", async () => {
    const result = await ARGUMENT_ROUCHE_PORT_SPEC.computeRun?.({
      mode: "argument",
      f: "z^2",
      g: "0",
      centerRe: 0,
      centerIm: 0,
      radius: 2,
    });
    expect(casCallMock).toHaveBeenCalledWith("argumentRouche", [
      "z^2",
      "0",
      { type: "circle", center: { re: 0, im: 0 }, radius: 2 },
      "argument",
    ]);
    expect(result?.error).toBeUndefined();
    expect(result?.outputs.count).toBe(2);
    expect(result?.outputs.detail).toContain("N − P: 2");
    expect(result?.outputs.detail).toContain("winding: 2");
  });

  it("computeRun (rouche) surfaces the zero count and the ratio detail", async () => {
    const result = await ARGUMENT_ROUCHE_PORT_SPEC.computeRun?.({
      mode: "rouche",
      f: "z^2",
      g: "1",
      centerRe: 0,
      centerIm: 0,
      radius: 2,
    });
    expect(casCallMock).toHaveBeenCalledWith("argumentRouche", [
      "z^2",
      "1",
      { type: "circle", center: { re: 0, im: 0 }, radius: 2 },
      "rouche",
    ]);
    expect(result?.outputs.count).toBe(2);
    expect(result?.outputs.detail).toContain("applies: true");
    expect(result?.outputs.detail).toContain("zeros of f: 2");
  });

  it("rejects an unknown mode before calling the CAS", async () => {
    const result = await ARGUMENT_ROUCHE_PORT_SPEC.computeRun?.({
      mode: "bogus",
      f: "z^2",
      g: "0",
      centerRe: 0,
      centerIm: 0,
      radius: 2,
    });
    expect(result?.outputs).toEqual({});
    expect(result?.error).toContain('"argument" or "rouche"');
    expect(casCallMock).not.toHaveBeenCalled();
  });
});
