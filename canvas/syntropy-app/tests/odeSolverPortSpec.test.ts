import { beforeEach, describe, expect, it, vi } from "vitest";

import { archetypeFromSpec } from "../syntropy/nodes/dispatch";
import { SYMPY_CAS_TIMEOUT_MS } from "../syntropy/portSpecs/casRunHelpers";
import { ODE_SOLVER_PORT_SPEC } from "../syntropy/portSpecs/odeSolver";

const { casCallMock } = vi.hoisted(() => ({ casCallMock: vi.fn() }));
vi.mock("../syntropy/cas/casClient", () => ({ casCall: casCallMock }));

describe("ODE_SOLVER_PORT_SPEC", () => {
  beforeEach(() => {
    casCallMock.mockReset();
    casCallMock.mockImplementation(async (_op: string, _args: unknown[]) => ({
      ok: true,
      result: "sin(x)",
      classification: "nth order linear constant coefficient",
      order: 2,
      verified: true,
    }));
  });

  it("identifies the ode/ode-solver run-mode method", () => {
    expect(ODE_SOLVER_PORT_SPEC.engineId).toBe("ode");
    expect(ODE_SOLVER_PORT_SPEC.methodId).toBe("ode-solver");
    expect(ODE_SOLVER_PORT_SPEC.executionMode).toBe("run");
    expect(ODE_SOLVER_PORT_SPEC.pageStoreKey).toBe("engine-lab:ode-ode-solver");
  });

  it("declares the expression output first so the archetype is symbolic", () => {
    expect(ODE_SOLVER_PORT_SPEC.outputs[0].kind).toBe("expression");
    expect(archetypeFromSpec(ODE_SOLVER_PORT_SPEC)).toBe("symbolic");
  });

  it("compute() is a sync placeholder returning an empty (not-yet-run) result", () => {
    expect(ODE_SOLVER_PORT_SPEC.compute({}).outputs).toEqual({});
  });

  it("computeRun passes the equation + {x0, derivValues} and surfaces the solution + flags", async () => {
    const result = await ODE_SOLVER_PORT_SPEC.computeRun?.({
      equation: "y'' + y = 0",
      x0: 0,
      y0: 0,
      yp0: 1,
    });
    expect(casCallMock).toHaveBeenCalledWith(
      "solveOde",
      ["y'' + y = 0", { x0: 0, derivValues: [0, 1] }],
      SYMPY_CAS_TIMEOUT_MS,
    );
    expect(result?.error).toBeUndefined();
    expect((result?.outputs.result as { display: string }).display).toBe(
      "sin(x)",
    );
    expect(result?.outputs.classification).toBe(
      "nth order linear constant coefficient",
    );
    expect(result?.outputs.order).toBe(2);
    expect(result?.outputs.verified).toBe(1);
  });

  it("surfaces a worker error", async () => {
    casCallMock.mockReset();
    casCallMock.mockResolvedValue({ ok: false, error: "SymPy timed out." });
    const result = await ODE_SOLVER_PORT_SPEC.computeRun?.({
      equation: "y'' + y = 0",
      x0: 0,
      y0: 0,
      yp0: 1,
    });
    expect(result?.error).toBe("SymPy timed out.");
    expect(result?.outputs).toEqual({});
  });
});
