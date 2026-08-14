import { beforeEach, describe, expect, it, vi } from "vitest";

import { archetypeFromSpec } from "../syntropy/nodes/dispatch";
import { CAUCHY_RIEMANN_PORT_SPEC } from "../syntropy/portSpecs/cauchyRiemann";

const { casCallMock } = vi.hoisted(() => ({ casCallMock: vi.fn() }));
vi.mock("../syntropy/cas/casClient", () => ({ casCall: casCallMock }));

describe("CAUCHY_RIEMANN_PORT_SPEC", () => {
  beforeEach(() => {
    casCallMock.mockReset();
    casCallMock.mockImplementation(async (_op: string, _args: unknown[]) => ({
      ok: true,
      u: "exp(x)*cos(y)",
      v: "exp(x)*sin(y)",
      verdict: "analytic",
      satisfiesAtPoint: true,
      neighborhoodOk: true,
      verified: true,
      steps: [
        {
          rule: "Split f(z) into real and imaginary parts",
          text: "u = exp(x)cos(y)",
        },
        { rule: "Partial derivatives", text: "u_x = exp(x)cos(y)" },
      ],
    }));
  });

  it("identifies the complex/cauchy-riemann run-mode method", () => {
    expect(CAUCHY_RIEMANN_PORT_SPEC.engineId).toBe("complex");
    expect(CAUCHY_RIEMANN_PORT_SPEC.methodId).toBe("cauchy-riemann");
    expect(CAUCHY_RIEMANN_PORT_SPEC.executionMode).toBe("run");
    expect(CAUCHY_RIEMANN_PORT_SPEC.pageStoreKey).toBe(
      "engine-lab:complex-cauchy-riemann",
    );
  });

  it("declares the expression output first so the archetype is symbolic", () => {
    expect(CAUCHY_RIEMANN_PORT_SPEC.outputs[0].kind).toBe("expression");
    expect(archetypeFromSpec(CAUCHY_RIEMANN_PORT_SPEC)).toBe("symbolic");
  });

  it("compute() is a sync placeholder returning an empty (not-yet-run) result", () => {
    expect(CAUCHY_RIEMANN_PORT_SPEC.compute({}).outputs).toEqual({});
  });

  it("computeRun passes f + [x, y] and surfaces the verdict + 1/0 flag + steps", async () => {
    const result = await CAUCHY_RIEMANN_PORT_SPEC.computeRun?.({
      f: "exp(z)",
      x: 0,
      y: 0,
    });
    expect(casCallMock).toHaveBeenCalledWith("cauchyRiemann", [
      "exp(z)",
      [0, 0],
    ]);
    expect(result?.error).toBeUndefined();
    expect((result?.outputs.result as { display: string }).display).toBe(
      "analytic",
    );
    expect(result?.outputs.satisfied).toBe(1);
    expect(result?.outputs.steps).toContain(
      "Split f(z) into real and imaginary parts",
    );
  });

  it("encodes a non-analytic verdict as satisfied = 0", async () => {
    casCallMock.mockReset();
    casCallMock.mockResolvedValue({
      ok: true,
      verdict: "not-analytic-at-point",
      satisfiesAtPoint: false,
      steps: [],
    });
    const result = await CAUCHY_RIEMANN_PORT_SPEC.computeRun?.({
      f: "conj(z)",
      x: 0,
      y: 0,
    });
    expect((result?.outputs.result as { display: string }).display).toBe(
      "not-analytic-at-point",
    );
    expect(result?.outputs.satisfied).toBe(0);
  });
});
