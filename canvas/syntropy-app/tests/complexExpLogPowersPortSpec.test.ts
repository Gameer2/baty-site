import { beforeEach, describe, expect, it, vi } from "vitest";

import { archetypeFromSpec } from "../syntropy/nodes/dispatch";
import { COMPLEX_EXP_LOG_POWERS_PORT_SPEC } from "../syntropy/portSpecs/complexExpLogPowers";

const { casCallMock } = vi.hoisted(() => ({ casCallMock: vi.fn() }));
vi.mock("../syntropy/cas/casClient", () => ({ casCall: casCallMock }));

describe("COMPLEX_EXP_LOG_POWERS_PORT_SPEC", () => {
  beforeEach(() => {
    casCallMock.mockReset();
    casCallMock.mockImplementation(async (_op: string, args: unknown[]) => {
      const mode = args[0] as string;
      if (mode === "log") {
        return {
          ok: true,
          display: "log(z) = 0.3466+0.7854i",
          principal: "0.3466+0.7854i",
          branches: [
            { k: -2, value: "0.3466-11.781i" },
            { k: -1, value: "0.3466-5.4978i" },
            { k: 0, value: "0.3466+0.7854i" },
            { k: 1, value: "0.3466+7.0686i" },
            { k: 2, value: "0.3466+13.352i" },
          ],
          verified: true,
        };
      }
      // rational / complex mode
      return {
        ok: true,
        display: "z^(2/3) = ...",
        principal: "...",
        branches: [
          { k: 0, value: "..." },
          { k: 1, value: "..." },
          { k: 2, value: "..." },
        ],
        verified: true,
      };
    });
  });

  it("identifies the complex/complex-exp-log-powers run-mode method", () => {
    expect(COMPLEX_EXP_LOG_POWERS_PORT_SPEC.engineId).toBe("complex");
    expect(COMPLEX_EXP_LOG_POWERS_PORT_SPEC.methodId).toBe(
      "complex-exp-log-powers",
    );
    expect(COMPLEX_EXP_LOG_POWERS_PORT_SPEC.executionMode).toBe("run");
    expect(COMPLEX_EXP_LOG_POWERS_PORT_SPEC.pageStoreKey).toBe(
      "engine-lab:complex-complex-exp-log-powers",
    );
  });

  it("declares the expression output first so the archetype is symbolic", () => {
    expect(COMPLEX_EXP_LOG_POWERS_PORT_SPEC.outputs[0].kind).toBe("expression");
    expect(archetypeFromSpec(COMPLEX_EXP_LOG_POWERS_PORT_SPEC)).toBe(
      "symbolic",
    );
  });

  it("compute() is a sync placeholder returning an empty (not-yet-run) result", () => {
    expect(COMPLEX_EXP_LOG_POWERS_PORT_SPEC.compute({}).outputs).toEqual({});
  });

  it("computeRun (log) passes mode + params + z and surfaces the principal + branches", async () => {
    const result = await COMPLEX_EXP_LOG_POWERS_PORT_SPEC.computeRun?.({
      mode: "log",
      re: 1,
      im: 1,
      p: 2,
      q: 3,
      wRe: 0,
      wIm: 1,
    });
    expect(casCallMock).toHaveBeenCalledWith("complexExpLogPowers", [
      "log",
      { p: 2, q: 3, wRe: 0, wIm: 1 },
      { re: 1, im: 1 },
    ]);
    expect(result?.error).toBeUndefined();
    expect((result?.outputs.result as { display: string }).display).toBe(
      "log(z) = 0.3466+0.7854i",
    );
    expect(result?.outputs.branches).toContain("k=0: 0.3466+0.7854i");
    expect(result?.outputs.branches).toContain("k=1: 0.3466+7.0686i");
  });

  it("computeRun (rational) passes the rational mode through", async () => {
    await COMPLEX_EXP_LOG_POWERS_PORT_SPEC.computeRun?.({
      mode: "rational",
      re: 1,
      im: 1,
      p: 2,
      q: 3,
      wRe: 0,
      wIm: 1,
    });
    expect(casCallMock).toHaveBeenCalledWith("complexExpLogPowers", [
      "rational",
      { p: 2, q: 3, wRe: 0, wIm: 1 },
      { re: 1, im: 1 },
    ]);
  });
});
