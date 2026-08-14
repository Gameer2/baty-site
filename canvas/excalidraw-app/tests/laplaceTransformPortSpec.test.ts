import { beforeEach, describe, expect, it, vi } from "vitest";

import { archetypeFromSpec } from "../syntropy/nodes/dispatch";
import { LAPLACE_TRANSFORM_PORT_SPEC } from "../syntropy/portSpecs/laplaceTransform";

const { casCallMock } = vi.hoisted(() => ({ casCallMock: vi.fn() }));
vi.mock("../syntropy/cas/casClient", () => ({ casCall: casCallMock }));

describe("LAPLACE_TRANSFORM_PORT_SPEC", () => {
  beforeEach(() => {
    casCallMock.mockReset();
    casCallMock.mockImplementation(async (_op: string, _args: unknown[]) => ({
      ok: true,
      result: "1/(s^2 + 1)",
      distributional: false,
      verified: true,
    }));
  });

  it("identifies the ode/laplace-transform run-mode method", () => {
    expect(LAPLACE_TRANSFORM_PORT_SPEC.engineId).toBe("ode");
    expect(LAPLACE_TRANSFORM_PORT_SPEC.methodId).toBe("laplace-transform");
    expect(LAPLACE_TRANSFORM_PORT_SPEC.executionMode).toBe("run");
    expect(LAPLACE_TRANSFORM_PORT_SPEC.pageStoreKey).toBe(
      "engine-lab:ode-laplace-transform",
    );
  });

  it("declares the expression output first so the archetype is symbolic", () => {
    expect(LAPLACE_TRANSFORM_PORT_SPEC.outputs[0].kind).toBe("expression");
    expect(archetypeFromSpec(LAPLACE_TRANSFORM_PORT_SPEC)).toBe("symbolic");
  });

  it("compute() is a sync placeholder returning an empty (not-yet-run) result", () => {
    expect(LAPLACE_TRANSFORM_PORT_SPEC.compute({}).outputs).toEqual({});
  });

  it("computeRun passes f and surfaces F(s) + verified flag", async () => {
    const result = await LAPLACE_TRANSFORM_PORT_SPEC.computeRun?.({
      f: "sin(t)",
    });
    expect(casCallMock).toHaveBeenCalledWith("laplaceTransform", ["sin(t)"]);
    expect(result?.error).toBeUndefined();
    expect((result?.outputs.result as { display: string }).display).toBe(
      "1/(s^2 + 1)",
    );
    expect(result?.outputs.verified).toBe(1);
  });

  it("encodes a distributional (Dirac) result as unverified", async () => {
    casCallMock.mockReset();
    casCallMock.mockResolvedValue({
      ok: true,
      result: "1",
      distributional: true,
      verified: false,
    });
    const result = await LAPLACE_TRANSFORM_PORT_SPEC.computeRun?.({
      f: "DiracDelta(t)",
    });
    expect(result?.outputs.verified).toBe(0);
  });
});
