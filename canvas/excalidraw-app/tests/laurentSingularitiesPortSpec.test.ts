import { beforeEach, describe, expect, it, vi } from "vitest";

import { archetypeFromSpec } from "../syntropy/nodes/dispatch";
import { SYMPY_CAS_TIMEOUT_MS } from "../syntropy/portSpecs/casRunHelpers";
import { LAURENT_SINGULARITIES_PORT_SPEC } from "../syntropy/portSpecs/laurentSingularities";

const { casCallMock } = vi.hoisted(() => ({ casCallMock: vi.fn() }));
vi.mock("../syntropy/cas/casClient", () => ({ casCall: casCallMock }));

describe("LAURENT_SINGULARITIES_PORT_SPEC", () => {
  beforeEach(() => {
    casCallMock.mockReset();
    casCallMock.mockImplementation(async (_op: string, _args: unknown[]) => ({
      ok: true,
      classification: { kind: "pole", order: 1, residue: { re: 0.5, im: 0 } },
      series: "1/(2*(z-1)) + 1/4 + (z-1)/8 + ...",
      verified: true,
    }));
  });

  it("identifies the complex/laurent-singularities run-mode method", () => {
    expect(LAURENT_SINGULARITIES_PORT_SPEC.engineId).toBe("complex");
    expect(LAURENT_SINGULARITIES_PORT_SPEC.methodId).toBe(
      "laurent-singularities",
    );
    expect(LAURENT_SINGULARITIES_PORT_SPEC.executionMode).toBe("run");
    expect(LAURENT_SINGULARITIES_PORT_SPEC.pageStoreKey).toBe(
      "engine-lab:complex-laurent-singularities",
    );
  });

  it("declares the expression output first so the archetype is symbolic", () => {
    expect(LAURENT_SINGULARITIES_PORT_SPEC.outputs[0].kind).toBe("expression");
    expect(archetypeFromSpec(LAURENT_SINGULARITIES_PORT_SPEC)).toBe("symbolic");
  });

  it("compute() is a sync placeholder returning an empty (not-yet-run) result", () => {
    expect(LAURENT_SINGULARITIES_PORT_SPEC.compute({}).outputs).toEqual({});
  });

  it("computeRun passes f + {re, im} + order and surfaces the classification + residue", async () => {
    const result = await LAURENT_SINGULARITIES_PORT_SPEC.computeRun?.({
      f: "1/(z^2-1)",
      pointRe: 1,
      pointIm: 0,
      order: 4,
    });
    expect(casCallMock).toHaveBeenCalledWith(
      "laurentSingularities",
      ["1/(z^2-1)", { re: 1, im: 0 }, 4],
      SYMPY_CAS_TIMEOUT_MS,
    );
    expect(result?.error).toBeUndefined();
    const display = (result?.outputs.result as { display: string }).display;
    expect(display).toContain("pole (order 1)");
    expect(display).toContain("1/(2*(z-1))");
    expect(result?.outputs.residue).toBe("0.5");
  });

  it("rejects a non-numeric point before calling the CAS", async () => {
    const result = await LAURENT_SINGULARITIES_PORT_SPEC.computeRun?.({
      f: "1/(z^2-1)",
      pointRe: Number.NaN,
      pointIm: 0,
      order: 4,
    });
    expect(result?.outputs).toEqual({});
    expect(result?.error).toContain("numbers");
    expect(casCallMock).not.toHaveBeenCalled();
  });
});
