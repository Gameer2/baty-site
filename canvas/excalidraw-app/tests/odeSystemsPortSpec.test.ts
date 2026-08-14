import { beforeEach, describe, expect, it, vi } from "vitest";

import { archetypeFromSpec } from "../syntropy/nodes/dispatch";
import { ODE_SYSTEMS_PORT_SPEC } from "../syntropy/portSpecs/odeSystems";

const { casCallMock } = vi.hoisted(() => ({ casCallMock: vi.fn() }));
vi.mock("../syntropy/cas/casClient", () => ({ casCall: casCallMock }));

describe("ODE_SYSTEMS_PORT_SPEC", () => {
  beforeEach(() => {
    casCallMock.mockReset();
    casCallMock.mockImplementation(async (_op: string, _args: unknown[]) => ({
      ok: true,
      components: ["cos(t)", "-sin(t)"],
      n: 2,
      verified: true,
      stability: "center",
      eigenvalues: ["i", "-i"],
      classification: { type: "center", stability: "stable" },
    }));
  });

  it("identifies the ode/systems run-mode method", () => {
    expect(ODE_SYSTEMS_PORT_SPEC.engineId).toBe("ode");
    expect(ODE_SYSTEMS_PORT_SPEC.methodId).toBe("systems");
    expect(ODE_SYSTEMS_PORT_SPEC.executionMode).toBe("run");
    expect(ODE_SYSTEMS_PORT_SPEC.pageStoreKey).toBe("engine-lab:ode-systems");
  });

  it("declares the expression output first so the archetype is symbolic", () => {
    expect(ODE_SYSTEMS_PORT_SPEC.outputs[0].kind).toBe("expression");
    expect(archetypeFromSpec(ODE_SYSTEMS_PORT_SPEC)).toBe("symbolic");
  });

  it("compute() is a sync placeholder returning an empty (not-yet-run) result", () => {
    expect(ODE_SYSTEMS_PORT_SPEC.compute({}).outputs).toEqual({});
  });

  it("parses the matrix/forcing/ics and joins the component solutions", async () => {
    const result = await ODE_SYSTEMS_PORT_SPEC.computeRun?.({
      A: "0,1;-1,0",
      g: "0;0",
      ics: "1,0",
    });
    expect(casCallMock).toHaveBeenCalledWith("solveOdeSystems", [
      [
        [0, 1],
        [-1, 0],
      ],
      ["0", "0"],
      [1, 0],
    ]);
    expect(result?.error).toBeUndefined();
    expect((result?.outputs.result as { display: string }).display).toBe(
      "x1(t) = cos(t)\nx2(t) = -sin(t)",
    );
    expect(result?.outputs.n).toBe(2);
    expect(result?.outputs.verified).toBe(1);
  });

  it("passes null ics when the IC vector length does not match the matrix size", async () => {
    await ODE_SYSTEMS_PORT_SPEC.computeRun?.({
      A: "0,1;-1,0",
      g: "0;0",
      ics: "1",
    });
    expect(casCallMock).toHaveBeenCalledWith("solveOdeSystems", [
      [
        [0, 1],
        [-1, 0],
      ],
      ["0", "0"],
      null,
    ]);
  });

  it("rejects a non-square matrix", async () => {
    const result = await ODE_SYSTEMS_PORT_SPEC.computeRun?.({
      A: "0,1;1,0;1,1",
      g: "0;0",
      ics: "1,0",
    });
    expect(result?.error).toBe("A must be a square matrix.");
  });
});