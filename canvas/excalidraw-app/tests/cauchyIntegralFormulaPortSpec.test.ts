import { beforeEach, describe, expect, it, vi } from "vitest";

import { archetypeFromSpec } from "../syntropy/nodes/dispatch";
import { CAUCHY_INTEGRAL_FORMULA_PORT_SPEC } from "../syntropy/portSpecs/cauchyIntegralFormula";

const { casCallMock } = vi.hoisted(() => ({ casCallMock: vi.fn() }));
vi.mock("../syntropy/cas/casClient", () => ({ casCall: casCallMock }));

describe("CAUCHY_INTEGRAL_FORMULA_PORT_SPEC", () => {
  beforeEach(() => {
    casCallMock.mockReset();
    casCallMock.mockImplementation(async (_op: string, args: unknown[]) => {
      const order = args[2] as number;
      // f^(n)(0) for exp(z) is 1 for every n.
      return {
        ok: true,
        order,
        value: { re: 1, im: 0 },
        numericCheck: { re: 1, im: 0 },
        referenceCheck: { re: 1, im: 0 },
        directCheck: { re: 1, im: 0 },
        verified: true,
      };
    });
  });

  it("identifies the complex/cauchy-integral-formula run-mode method", () => {
    expect(CAUCHY_INTEGRAL_FORMULA_PORT_SPEC.engineId).toBe("complex");
    expect(CAUCHY_INTEGRAL_FORMULA_PORT_SPEC.methodId).toBe(
      "cauchy-integral-formula",
    );
    expect(CAUCHY_INTEGRAL_FORMULA_PORT_SPEC.executionMode).toBe("run");
    expect(CAUCHY_INTEGRAL_FORMULA_PORT_SPEC.pageStoreKey).toBe(
      "engine-lab:complex-cauchy-integral-formula",
    );
  });

  it("declares the text output first so the archetype is scalar", () => {
    expect(CAUCHY_INTEGRAL_FORMULA_PORT_SPEC.outputs[0].kind).toBe("text");
    expect(archetypeFromSpec(CAUCHY_INTEGRAL_FORMULA_PORT_SPEC)).toBe("scalar");
  });

  it("compute() is a sync placeholder returning an empty (not-yet-run) result", () => {
    expect(CAUCHY_INTEGRAL_FORMULA_PORT_SPEC.compute({}).outputs).toEqual({});
  });

  it("computeRun passes f + z0 + order + radius and surfaces the value + verification", async () => {
    const result = await CAUCHY_INTEGRAL_FORMULA_PORT_SPEC.computeRun?.({
      f: "exp(z)",
      z0Re: 0,
      z0Im: 0,
      order: 1,
      radius: 1,
    });
    expect(casCallMock).toHaveBeenCalledWith("cauchyIntegralFormula", [
      "exp(z)",
      { re: 0, im: 0 },
      1,
      1,
    ]);
    expect(result?.error).toBeUndefined();
    expect(result?.outputs.value).toBe("1");
    expect(result?.outputs.order).toBe(1);
    expect(result?.outputs.verified).toBe(1);
  });

  it("rejects a negative derivative order before calling the CAS", async () => {
    const result = await CAUCHY_INTEGRAL_FORMULA_PORT_SPEC.computeRun?.({
      f: "exp(z)",
      z0Re: 0,
      z0Im: 0,
      order: -1,
      radius: 1,
    });
    expect(result?.outputs).toEqual({});
    expect(result?.error).toContain("non-negative integer");
    expect(casCallMock).not.toHaveBeenCalled();
  });
});
