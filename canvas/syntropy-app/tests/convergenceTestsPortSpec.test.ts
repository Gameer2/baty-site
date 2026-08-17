import { beforeEach, describe, expect, it, vi } from "vitest";

import { archetypeFromSpec } from "../syntropy/nodes/dispatch";
import { CONVERGENCE_TESTS_PORT_SPEC } from "../syntropy/portSpecs/convergenceTests";

// Mock the CAS bridge so computeRun is deterministic and offline (no real nerdamer). The spec
// makes two casCalls (convergenceTests for the verdict, seriesPartialSums for the trace).
const { casCallMock } = vi.hoisted(() => ({ casCallMock: vi.fn() }));

vi.mock("../syntropy/cas/casClient", () => ({ casCall: casCallMock }));

describe("CONVERGENCE_TESTS_PORT_SPEC", () => {
  beforeEach(() => {
    casCallMock.mockReset();
    casCallMock.mockImplementation(async (op: string) => {
      if (op === "convergenceTests") {
        return {
          ok: true,
          verdict: "converges",
          test: "p-series",
          reason: "p > 1, so the series converges.",
          steps: [],
          verified: true,
        };
      }
      if (op === "seriesPartialSums") {
        return {
          ok: true,
          rows: [
            { n: 1, term: 1, partialSum: 1 },
            { n: 2, term: 0.25, partialSum: 1.25 },
            { n: 3, term: 0.111111, partialSum: 1.361111 },
          ],
        };
      }
      throw new Error(`unexpected op: ${op}`);
    });
  });

  it("identifies the calculus/convergence-tests run-mode method", () => {
    expect(CONVERGENCE_TESTS_PORT_SPEC.engineId).toBe("calculus");
    expect(CONVERGENCE_TESTS_PORT_SPEC.methodId).toBe("convergence-tests");
    expect(CONVERGENCE_TESTS_PORT_SPEC.executionMode).toBe("run");
    expect(CONVERGENCE_TESTS_PORT_SPEC.pageStoreKey).toBe(
      "engine-lab:calculus-convergence-tests",
    );
  });

  it("declares the trace output first so the archetype is trace", () => {
    expect(CONVERGENCE_TESTS_PORT_SPEC.outputs[0].kind).toBe("trace");
    expect(archetypeFromSpec(CONVERGENCE_TESTS_PORT_SPEC)).toBe("trace");
  });

  it("compute() is a sync placeholder returning an empty (not-yet-run) result", () => {
    expect(
      CONVERGENCE_TESTS_PORT_SPEC.compute({ term: "1/n^2" }).outputs,
    ).toEqual({});
  });

  it("computeRun builds the partial-sum trace, verdict, and sum (last partial sum) for a convergent series", async () => {
    const result = await CONVERGENCE_TESTS_PORT_SPEC.computeRun?.({
      term: "1/n^2",
    });
    expect(casCallMock).toHaveBeenCalledWith("convergenceTests", [
      "1/n^2",
      "n",
    ]);
    expect(casCallMock).toHaveBeenCalledWith("seriesPartialSums", [
      { termExpr: "1/n^2", indexVar: "n", count: 40 },
    ]);
    expect(result?.error).toBeUndefined();
    expect(result?.outputs.iterationTrace).toEqual([
      { n: 1, term: 1, partialSum: 1 },
      { n: 2, term: 0.25, partialSum: 1.25 },
      { n: 3, term: 0.111111, partialSum: 1.361111 },
    ]);
    expect(result?.outputs.verdict).toBe("converges (p-series)");
    expect(result?.outputs.sum).toBe(1.361111);
  });

  it("computeRun reports NaN for the sum of a divergent series", async () => {
    casCallMock.mockReset();
    casCallMock.mockImplementation(async (op: string) => {
      if (op === "convergenceTests") {
        return {
          ok: true,
          verdict: "diverges",
          test: "p-series",
          reason: "p <= 1, so the series diverges.",
          steps: [],
          verified: true,
        };
      }
      return {
        ok: true,
        rows: [
          { n: 1, term: 1, partialSum: 1 },
          { n: 2, term: 0.5, partialSum: 1.5 },
        ],
      };
    });
    const result = await CONVERGENCE_TESTS_PORT_SPEC.computeRun?.({
      term: "1/n",
    });
    expect(result?.outputs.verdict).toBe("diverges (p-series)");
    expect(result?.outputs.sum).toBeNaN();
  });

  it("surfaces the engine's failure reason and skips the trace when convergenceTests fails", async () => {
    casCallMock.mockReset();
    casCallMock.mockResolvedValue({
      ok: false,
      reason: "Couldn't parse the series term.",
    });
    const result = await CONVERGENCE_TESTS_PORT_SPEC.computeRun?.({
      term: "garbage(",
    });
    expect(result?.outputs).toEqual({});
    expect(result?.error).toBe("Couldn't parse the series term.");
    expect(casCallMock).toHaveBeenCalledTimes(1);
  });
});
