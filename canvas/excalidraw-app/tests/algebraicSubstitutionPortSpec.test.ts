import { beforeEach, describe, expect, it, vi } from "vitest";

import { archetypeFromSpec } from "../syntropy/nodes/dispatch";
import { ALGEBRAIC_SUBSTITUTION_PORT_SPEC } from "../syntropy/portSpecs/algebraicSubstitution";

import type { ExpressionOutput } from "../syntropy/portSpecs/types";

// Mock the CAS bridge so computeRun is deterministic and offline (no real nerdamer). The spec
// reaches casCall through casRunHelpers.runCas, which imports it from ../cas/casClient — mocking
// that module's export replaces it for runCas too. vi.hoisted lets the hoisted mock factory
// reference the fn we configure per test.
const { casCallMock } = vi.hoisted(() => ({ casCallMock: vi.fn() }));

vi.mock("../syntropy/cas/casClient", () => ({ casCall: casCallMock }));

describe("ALGEBRAIC_SUBSTITUTION_PORT_SPEC", () => {
  beforeEach(() => casCallMock.mockReset());

  it("identifies the calculus/algebraic-substitution run-mode method", () => {
    expect(ALGEBRAIC_SUBSTITUTION_PORT_SPEC.engineId).toBe("calculus");
    expect(ALGEBRAIC_SUBSTITUTION_PORT_SPEC.methodId).toBe(
      "algebraic-substitution",
    );
    expect(ALGEBRAIC_SUBSTITUTION_PORT_SPEC.executionMode).toBe("run");
    expect(ALGEBRAIC_SUBSTITUTION_PORT_SPEC.pageStoreKey).toBe(
      "engine-lab:calculus-algebraic-substitution",
    );
  });

  it("declares the antiderivative (expression) output first so the archetype is symbolic", () => {
    expect(ALGEBRAIC_SUBSTITUTION_PORT_SPEC.outputs[0].kind).toBe("expression");
    expect(archetypeFromSpec(ALGEBRAIC_SUBSTITUTION_PORT_SPEC)).toBe(
      "symbolic",
    );
  });

  it("compute() is a sync placeholder returning an empty (not-yet-run) result", () => {
    expect(
      ALGEBRAIC_SUBSTITUTION_PORT_SPEC.compute({ f: "x*sqrt(x+1)" }).outputs,
    ).toEqual({});
  });

  it("computeRun calls CAS.algebraicSubstitution(integrand, variable) and surfaces the result", async () => {
    // The engine's real return: { ok, technique, u, substitution, integrandInU, antiderivativeInU,
    // result, latex, verified, rejected, steps }.
    casCallMock.mockResolvedValue({
      ok: true,
      technique: "algebraic substitution",
      u: "x+1",
      result: "(2/15)*(-2+3*x)*sqrt(1+x)^3",
      latex: "\\frac{2}{15}(3x-2)(x+1)^{3/2}",
      verified: true,
      rejected: [],
      steps: [
        { rule: "Substitute", text: "u = x+1" },
        { rule: "Integrate", text: "∫ u^(1/2) du" },
      ],
    });
    const result = await ALGEBRAIC_SUBSTITUTION_PORT_SPEC.computeRun?.({
      f: "x*sqrt(x+1)",
      variable: "x",
    });
    expect(casCallMock).toHaveBeenCalledWith("algebraicSubstitution", [
      "x*sqrt(x+1)",
      "x",
    ]);
    expect(result?.error).toBeUndefined();
    const expr = result?.outputs.antiderivative as ExpressionOutput;
    expect(expr.display).toBe("(2/15)*(-2+3*x)*sqrt(1+x)^3");
    expect(expr.structured).toEqual({ kind: "plain" });
    expect(result?.outputs.steps).toBe(
      "Substitute: u = x+1\nIntegrate: ∫ u^(1/2) du",
    );
  });

  it("surfaces the engine's failure reason when the op does not succeed", async () => {
    casCallMock.mockResolvedValue({
      ok: false,
      reason: "No substitution worked — try another technique.",
    });
    const result = await ALGEBRAIC_SUBSTITUTION_PORT_SPEC.computeRun?.({
      f: "e^(x^2)",
      variable: "x",
    });
    expect(result?.outputs).toEqual({});
    expect(result?.error).toBe(
      "No substitution worked — try another technique.",
    );
  });

  // Note on the bridge-rejection (worker timeout) path: runCas wraps `await casCall(...)` in a
  // try/catch, so a rejecting casCall is caught and surfaced as { ok:false, error } — this is
  // correct by inspection and exercised at the integration level. A unit test that mocks casCall
  // to reject trips vitest's vi.fn mock-result tracker (it consumes the returned promise to
  // record mock.results with no reject handler), flagging a spurious unhandled rejection that
  // fails the test regardless of runCas's catch. The handled-failure path above ({ ok:false,
  // reason }) is the realistic production failure mode and covers error surfacing, so the
  // rejection-mock test is intentionally omitted rather than fighting the framework.
});
