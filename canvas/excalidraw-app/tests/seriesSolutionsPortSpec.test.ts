import { beforeEach, describe, expect, it, vi } from "vitest";

import { archetypeFromSpec } from "../syntropy/nodes/dispatch";
import { SERIES_SOLUTIONS_PORT_SPEC } from "../syntropy/portSpecs/seriesSolutions";

const { casCallMock } = vi.hoisted(() => ({ casCallMock: vi.fn() }));
vi.mock("../syntropy/cas/casClient", () => ({ casCall: casCallMock }));

describe("SERIES_SOLUTIONS_PORT_SPEC", () => {
  beforeEach(() => {
    casCallMock.mockReset();
    casCallMock.mockImplementation(async (_op: string, _args: unknown[]) => ({
      ok: true,
      kind: "ordinary",
      series: "x + (1/3)*x^3 + (2/15)*x^5",
      point: 0,
      verified: true,
    }));
  });

  it("identifies the ode/series-solutions run-mode method", () => {
    expect(SERIES_SOLUTIONS_PORT_SPEC.engineId).toBe("ode");
    expect(SERIES_SOLUTIONS_PORT_SPEC.methodId).toBe("series-solutions");
    expect(SERIES_SOLUTIONS_PORT_SPEC.executionMode).toBe("run");
    expect(SERIES_SOLUTIONS_PORT_SPEC.pageStoreKey).toBe(
      "engine-lab:ode-series-solutions",
    );
  });

  it("declares the expression output first so the archetype is symbolic", () => {
    expect(SERIES_SOLUTIONS_PORT_SPEC.outputs[0].kind).toBe("expression");
    expect(archetypeFromSpec(SERIES_SOLUTIONS_PORT_SPEC)).toBe("symbolic");
  });

  it("compute() is a sync placeholder returning an empty (not-yet-run) result", () => {
    expect(SERIES_SOLUTIONS_PORT_SPEC.compute({}).outputs).toEqual({});
  });

  it("computeRun passes the equation + point + order and surfaces the series", async () => {
    const result = await SERIES_SOLUTIONS_PORT_SPEC.computeRun?.({
      equation: "(1-x^2)y'' - 2xy' + 2y = 0",
      point: 0,
      order: 6,
    });
    expect(casCallMock).toHaveBeenCalledWith("seriesSolutions", [
      "(1-x^2)y'' - 2xy' + 2y = 0",
      0,
      6,
    ]);
    expect(result?.error).toBeUndefined();
    expect((result?.outputs.result as { display: string }).display).toBe(
      "x + (1/3)*x^3 + (2/15)*x^5",
    );
    expect(result?.outputs.kind).toBe("ordinary");
    expect(result?.outputs.verified).toBe(1);
  });

  it("rejects a non-integer term count", async () => {
    const result = await SERIES_SOLUTIONS_PORT_SPEC.computeRun?.({
      equation: "y' = y",
      point: 0,
      order: 2.5,
    });
    expect(result?.error).toBe("The term count must be a positive integer.");
  });
});
