import { beforeEach, describe, expect, it, vi } from "vitest";

import { archetypeFromSpec } from "../syntropy/nodes/dispatch";
import { VOLUME_OF_REVOLUTION_PORT_SPEC } from "../syntropy/portSpecs/volumeOfRevolution";

// Mock the CAS bridge so computeRun is deterministic and offline (no real nerdamer). The spec
// reaches casCall through casRunHelpers.runCas, which imports it from ../cas/casClient — mocking
// that module's export replaces it for runCas too.
const { casCallMock } = vi.hoisted(() => ({ casCallMock: vi.fn() }));

vi.mock("../syntropy/cas/casClient", () => ({ casCall: casCallMock }));

describe("VOLUME_OF_REVOLUTION_PORT_SPEC", () => {
  beforeEach(() => casCallMock.mockReset());

  it("identifies the calculus/volumes-of-revolution run-mode method", () => {
    expect(VOLUME_OF_REVOLUTION_PORT_SPEC.engineId).toBe("calculus");
    expect(VOLUME_OF_REVOLUTION_PORT_SPEC.methodId).toBe(
      "volumes-of-revolution",
    );
    expect(VOLUME_OF_REVOLUTION_PORT_SPEC.executionMode).toBe("run");
    expect(VOLUME_OF_REVOLUTION_PORT_SPEC.pageStoreKey).toBe(
      "engine-lab:calculus-volumes-of-revolution",
    );
  });

  it("declares the volume (number) output first so the archetype is scalar", () => {
    expect(VOLUME_OF_REVOLUTION_PORT_SPEC.outputs[0].kind).toBe("number");
    expect(archetypeFromSpec(VOLUME_OF_REVOLUTION_PORT_SPEC)).toBe("scalar");
  });

  it("compute() is a sync placeholder returning an empty (not-yet-run) result", () => {
    expect(
      VOLUME_OF_REVOLUTION_PORT_SPEC.compute({ f: "x^2" }).outputs,
    ).toEqual({});
  });

  it("computeRun calls CAS.volumeOfRevolution(f, x, a, b, {method}) for the disk method", async () => {
    casCallMock.mockResolvedValue({
      ok: true,
      technique: "volume-of-revolution",
      method: "disk",
      volume: "8*pi/5",
      numeric: 5.026548245743669,
      verified: true,
      steps: [{ rule: "Disk method", text: "V = π ∫ x^4 dx on [0, 2]" }],
    });
    const result = await VOLUME_OF_REVOLUTION_PORT_SPEC.computeRun?.({
      f: "x^2",
      a: "0",
      b: "2",
      method: "disk",
      inner: "0",
    });
    expect(casCallMock).toHaveBeenCalledWith("volumeOfRevolution", [
      "x^2",
      "x",
      "0",
      "2",
      { method: "disk" },
    ]);
    expect(result?.error).toBeUndefined();
    expect(result?.outputs.volume).toBe(5.026548245743669);
  });

  it("passes the inner curve through opts only for the washer method", async () => {
    casCallMock.mockResolvedValue({
      ok: true,
      technique: "volume-of-revolution",
      method: "washer",
      volume: "pi",
      numeric: 3.141592653589793,
      verified: true,
      steps: [],
    });
    await VOLUME_OF_REVOLUTION_PORT_SPEC.computeRun?.({
      f: "x",
      a: "0",
      b: "1",
      method: "washer",
      inner: "x^2",
    });
    expect(casCallMock).toHaveBeenCalledWith("volumeOfRevolution", [
      "x",
      "x",
      "0",
      "1",
      { method: "washer", inner: "x^2" },
    ]);
  });

  it("surfaces the engine's failure reason when the op does not succeed", async () => {
    casCallMock.mockResolvedValue({
      ok: false,
      reason: "The lower bound a must be less than the upper bound b.",
    });
    const result = await VOLUME_OF_REVOLUTION_PORT_SPEC.computeRun?.({
      f: "x^2",
      a: "2",
      b: "0",
      method: "disk",
      inner: "0",
    });
    expect(result?.outputs).toEqual({});
    expect(result?.error).toBe(
      "The lower bound a must be less than the upper bound b.",
    );
  });
});
