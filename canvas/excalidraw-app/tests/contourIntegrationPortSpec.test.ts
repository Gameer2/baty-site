import { beforeEach, describe, expect, it, vi } from "vitest";

import { archetypeFromSpec } from "../syntropy/nodes/dispatch";
import { CONTOUR_INTEGRATION_PORT_SPEC } from "../syntropy/portSpecs/contourIntegration";

const { casCallMock } = vi.hoisted(() => ({ casCallMock: vi.fn() }));
vi.mock("../syntropy/cas/casClient", () => ({ casCall: casCallMock }));

describe("CONTOUR_INTEGRATION_PORT_SPEC", () => {
  beforeEach(() => {
    casCallMock.mockReset();
    casCallMock.mockImplementation(async (_op: string, _args: unknown[]) => ({
      ok: true,
      insideSingularities: [
        { location: { re: 0, im: 0 }, residue: { re: 1, im: 0 } },
      ],
      allSingularities: [
        { location: { re: 0, im: 0 }, residue: { re: 1, im: 0 } },
      ],
      value: { re: 0, im: 6.2832 },
      numericCheck: { re: 0, im: 6.2832 },
      verified: true,
    }));
  });

  it("identifies the complex/contour-integration run-mode method", () => {
    expect(CONTOUR_INTEGRATION_PORT_SPEC.engineId).toBe("complex");
    expect(CONTOUR_INTEGRATION_PORT_SPEC.methodId).toBe("contour-integration");
    expect(CONTOUR_INTEGRATION_PORT_SPEC.executionMode).toBe("run");
    expect(CONTOUR_INTEGRATION_PORT_SPEC.pageStoreKey).toBe(
      "engine-lab:complex-contour-integration",
    );
  });

  it("declares the text output first so the archetype is scalar", () => {
    expect(CONTOUR_INTEGRATION_PORT_SPEC.outputs[0].kind).toBe("text");
    expect(archetypeFromSpec(CONTOUR_INTEGRATION_PORT_SPEC)).toBe("scalar");
  });

  it("compute() is a sync placeholder returning an empty (not-yet-run) result", () => {
    expect(CONTOUR_INTEGRATION_PORT_SPEC.compute({}).outputs).toEqual({});
  });

  it("computeRun passes f + circle contour and surfaces the complex value + poles", async () => {
    const result = await CONTOUR_INTEGRATION_PORT_SPEC.computeRun?.({
      f: "1/z",
      centerRe: 0,
      centerIm: 0,
      radius: 2,
    });
    expect(casCallMock).toHaveBeenCalledWith("contourIntegration", [
      "1/z",
      { type: "circle", center: { re: 0, im: 0 }, radius: 2 },
    ]);
    expect(result?.error).toBeUndefined();
    expect(result?.outputs.value).toBe("6.2832i");
    expect(result?.outputs.residues).toContain("0 → residue 1");
  });

  it("rejects a non-positive radius before calling the CAS", async () => {
    const result = await CONTOUR_INTEGRATION_PORT_SPEC.computeRun?.({
      f: "1/z",
      centerRe: 0,
      centerIm: 0,
      radius: 0,
    });
    expect(result?.outputs).toEqual({});
    expect(result?.error).toContain("positive number");
    expect(casCallMock).not.toHaveBeenCalled();
  });

  it("surfaces a singularity-on-contour refusal as the error", async () => {
    casCallMock.mockReset();
    casCallMock.mockResolvedValue({
      ok: false,
      reason:
        "A singularity of f(z) lies exactly on the given contour — the residue theorem doesn't apply here.",
    });
    const result = await CONTOUR_INTEGRATION_PORT_SPEC.computeRun?.({
      f: "1/z",
      centerRe: 0,
      centerIm: 0,
      radius: 2,
    });
    expect(result?.outputs).toEqual({});
    expect(result?.error).toContain("residue theorem doesn't apply");
  });
});
