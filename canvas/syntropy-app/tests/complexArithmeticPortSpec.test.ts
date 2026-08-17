import { beforeEach, describe, expect, it, vi } from "vitest";

import { archetypeFromSpec } from "../syntropy/nodes/dispatch";
import { COMPLEX_ARITHMETIC_PORT_SPEC } from "../syntropy/portSpecs/complexArithmetic";

const { casCallMock } = vi.hoisted(() => ({ casCallMock: vi.fn() }));
vi.mock("../syntropy/cas/casClient", () => ({ casCall: casCallMock }));

describe("COMPLEX_ARITHMETIC_PORT_SPEC", () => {
  beforeEach(() => {
    casCallMock.mockReset();
    casCallMock.mockImplementation(async (_op: string, args: unknown[]) => {
      const z = args[0] as { re: number; im: number };
      const n = args[1] as number;
      return {
        ok: true,
        display: `z = ${z.re}+${z.im}i = 1.4142·e^{i·0.7854}`,
        forms: "cartesian: 1+1i; polar: 1.4142 ∠ 0.7854",
        power: `z^${n} = -2+2i`,
        roots: ["1.12+0.29i", "-0.29+1.12i", "-0.83-0.83i"],
        verified: true,
      };
    });
  });

  it("identifies the complex/complex-arithmetic run-mode method", () => {
    expect(COMPLEX_ARITHMETIC_PORT_SPEC.engineId).toBe("complex");
    expect(COMPLEX_ARITHMETIC_PORT_SPEC.methodId).toBe("complex-arithmetic");
    expect(COMPLEX_ARITHMETIC_PORT_SPEC.executionMode).toBe("run");
    expect(COMPLEX_ARITHMETIC_PORT_SPEC.pageStoreKey).toBe(
      "engine-lab:complex-complex-arithmetic",
    );
  });

  it("declares the expression output first so the archetype is symbolic", () => {
    expect(COMPLEX_ARITHMETIC_PORT_SPEC.outputs[0].kind).toBe("expression");
    expect(archetypeFromSpec(COMPLEX_ARITHMETIC_PORT_SPEC)).toBe("symbolic");
  });

  it("compute() is a sync placeholder returning an empty (not-yet-run) result", () => {
    expect(COMPLEX_ARITHMETIC_PORT_SPEC.compute({}).outputs).toEqual({});
  });

  it("computeRun passes {re, im} and n, and surfaces the polar form + roots", async () => {
    const result = await COMPLEX_ARITHMETIC_PORT_SPEC.computeRun?.({
      re: 1,
      im: 1,
      n: 3,
    });
    expect(casCallMock).toHaveBeenCalledWith("complexArithmetic", [
      { re: 1, im: 1 },
      3,
    ]);
    expect(result?.error).toBeUndefined();
    expect((result?.outputs.result as { display: string }).display).toContain(
      "1.4142·e^{i·",
    );
    expect(result?.outputs.forms).toContain("z^3 = -2+2i");
    expect(result?.outputs.forms).toContain("3 roots:");
  });

  it("rejects a non-positive n before calling the CAS", async () => {
    const result = await COMPLEX_ARITHMETIC_PORT_SPEC.computeRun?.({
      re: 1,
      im: 1,
      n: 0,
    });
    expect(result?.outputs).toEqual({});
    expect(result?.error).toContain("positive integer");
    expect(casCallMock).not.toHaveBeenCalled();
  });

  it("surfaces the engine's failure reason when the op does not succeed", async () => {
    casCallMock.mockReset();
    casCallMock.mockResolvedValue({
      ok: false,
      reason: "z needs numeric Re and Im parts.",
    });
    const result = await COMPLEX_ARITHMETIC_PORT_SPEC.computeRun?.({
      re: 1,
      im: 1,
      n: 3,
    });
    expect(result?.outputs).toEqual({});
    expect(result?.error).toBe("z needs numeric Re and Im parts.");
  });
});
