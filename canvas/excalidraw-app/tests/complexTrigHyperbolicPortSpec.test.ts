import { beforeEach, describe, expect, it, vi } from "vitest";

import { archetypeFromSpec } from "../syntropy/nodes/dispatch";
import { COMPLEX_TRIG_HYPERBOLIC_PORT_SPEC } from "../syntropy/portSpecs/complexTrigHyperbolic";

const { casCallMock } = vi.hoisted(() => ({ casCallMock: vi.fn() }));
vi.mock("../syntropy/cas/casClient", () => ({ casCall: casCallMock }));

describe("COMPLEX_TRIG_HYPERBOLIC_PORT_SPEC", () => {
  beforeEach(() => {
    casCallMock.mockReset();
    casCallMock.mockImplementation(async (_op: string, args: unknown[]) => {
      const fn = args[0] as string;
      return {
        ok: true,
        display: `${fn}(1+1i) = 1.2985+0.6350i`,
        value: { re: 1.2985, im: 0.635 },
        abs: 1.4457,
        verified: true,
      };
    });
  });

  it("identifies the complex/complex-trig-hyperbolic run-mode method", () => {
    expect(COMPLEX_TRIG_HYPERBOLIC_PORT_SPEC.engineId).toBe("complex");
    expect(COMPLEX_TRIG_HYPERBOLIC_PORT_SPEC.methodId).toBe(
      "complex-trig-hyperbolic",
    );
    expect(COMPLEX_TRIG_HYPERBOLIC_PORT_SPEC.executionMode).toBe("run");
    expect(COMPLEX_TRIG_HYPERBOLIC_PORT_SPEC.pageStoreKey).toBe(
      "engine-lab:complex-complex-trig-hyperbolic",
    );
  });

  it("declares the expression output first so the archetype is symbolic", () => {
    expect(COMPLEX_TRIG_HYPERBOLIC_PORT_SPEC.outputs[0].kind).toBe(
      "expression",
    );
    expect(archetypeFromSpec(COMPLEX_TRIG_HYPERBOLIC_PORT_SPEC)).toBe(
      "symbolic",
    );
  });

  it("compute() is a sync placeholder returning an empty (not-yet-run) result", () => {
    expect(COMPLEX_TRIG_HYPERBOLIC_PORT_SPEC.compute({}).outputs).toEqual({});
  });

  it("computeRun passes fn + {re, im} and surfaces the value + modulus", async () => {
    const result = await COMPLEX_TRIG_HYPERBOLIC_PORT_SPEC.computeRun?.({
      fn: "sin",
      re: 1,
      im: 1,
    });
    expect(casCallMock).toHaveBeenCalledWith("complexTrigHyperbolic", [
      "sin",
      { re: 1, im: 1 },
    ]);
    expect(result?.error).toBeUndefined();
    expect((result?.outputs.result as { display: string }).display).toBe(
      "sin(1+1i) = 1.2985+0.6350i",
    );
    expect(result?.outputs.abs).toBeCloseTo(1.4457, 3);
  });
});
