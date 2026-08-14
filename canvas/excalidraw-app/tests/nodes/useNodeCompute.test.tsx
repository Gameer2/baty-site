import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  useNodeCompute,
  type RunResult,
} from "../../syntropy/nodes/useNodeCompute";

import type { ComputeResult, PortSpec } from "../../syntropy/portSpecs/types";

const NODE_ID = "n";

// A live fixture: compute runs synchronously every render, exactly as the 89 existing specs do.
const LIVE_SPEC: PortSpec = {
  engineId: "calculus",
  methodId: "double-fixture",
  inputs: [{ key: "x", label: "x", kind: "number", default: 1 }],
  outputs: [{ key: "y", label: "2x", kind: "number" }],
  compute: (inputs) => ({ outputs: { y: Number(inputs.x) * 2 } }),
  executionMode: "live",
  pagePath: "/calculus/double-fixture",
  pageStoreKey: "double-fixture-state",
};

// A run fixture: compute is the sync not-yet-run placeholder; computeRun is a deferred promise the
// test controls so it can observe pending → ready → stale transitions precisely.
let resolveRun: (r: ComputeResult) => void = () => {};
const RUN_SPEC: PortSpec = {
  engineId: "calculus",
  methodId: "antiderivative-fixture",
  inputs: [{ key: "x", label: "x", kind: "number", default: 1 }],
  outputs: [{ key: "y", label: "result", kind: "number" }],
  compute: () => ({ outputs: {} }),
  computeRun: () =>
    new Promise<ComputeResult>((res) => {
      resolveRun = res;
    }),
  executionMode: "run",
  pagePath: "/calculus/antiderivative-fixture",
  pageStoreKey: "antiderivative-fixture-state",
};

describe("useNodeCompute — live mode", () => {
  it("computes synchronously every render with no pending/stale state", () => {
    const { result, rerender } = renderHook(
      ({ inputs }: { inputs: Record<string, unknown> }) =>
        useNodeCompute(NODE_ID, LIVE_SPEC, inputs),
      { initialProps: { inputs: { x: 1 } } },
    );
    expect(result.current.outputs).toEqual({ y: 2 });
    expect(result.current.pending).toBe(false);
    expect(result.current.stale).toBe(false);

    rerender({ inputs: { x: 5 } });
    expect(result.current.outputs).toEqual({ y: 10 });
    expect(result.current.pending).toBe(false);
    expect(result.current.stale).toBe(false);
  });

  it("run() is a no-op for live specs (no Run button)", () => {
    const { result } = renderHook(() =>
      useNodeCompute(NODE_ID, LIVE_SPEC, { x: 1 }),
    );
    expect(() => act(() => result.current.run())).not.toThrow();
    // A live run() must not flip pending or clear outputs.
    expect(result.current.pending).toBe(false);
    expect(result.current.outputs).toEqual({ y: 2 });
  });
});

describe("useNodeCompute — run mode", () => {
  it("is stale with empty outputs before the first run, then pending while running, then ready, then stale again after an edit (keeping the last result)", async () => {
    const onRunResult = vi.fn();
    const { result, rerender } = renderHook(
      ({ inputs }: { inputs: Record<string, unknown> }) =>
        useNodeCompute(NODE_ID, RUN_SPEC, inputs, onRunResult),
      { initialProps: { inputs: { x: 1 } } },
    );

    // Before first run: no result yet, stale (inputs never matched a run).
    expect(result.current.outputs).toEqual({});
    expect(result.current.pending).toBe(false);
    expect(result.current.stale).toBe(true);

    // Fire run() — pending goes true; stale suppressed while pending; outputs still empty.
    act(() => {
      result.current.run();
    });
    expect(result.current.pending).toBe(true);
    expect(result.current.stale).toBe(false);
    expect(result.current.outputs).toEqual({});
    expect(onRunResult).not.toHaveBeenCalled();

    // Resolve the async compute — pending clears, outputs land, no longer stale; host is notified.
    await act(async () => {
      resolveRun({ outputs: { y: 42 } });
      // Flush the microtask so the .then setState lands before we read result.
      await Promise.resolve();
    });
    expect(result.current.pending).toBe(false);
    expect(result.current.stale).toBe(false);
    expect(result.current.outputs).toEqual({ y: 42 });
    expect(onRunResult).toHaveBeenCalledTimes(1);
    expect(onRunResult.mock.calls[0][0]).toBe(NODE_ID);
    const reported = onRunResult.mock.calls[0][1] as RunResult;
    expect(reported.outputs).toEqual({ y: 42 });

    // Edit an input — stale goes true, but the last-run result is kept (stable between runs).
    rerender({ inputs: { x: 2 } });
    expect(result.current.stale).toBe(true);
    expect(result.current.pending).toBe(false);
    expect(result.current.outputs).toEqual({ y: 42 });
  });

  it("reports a computeRun rejection as an error result to the host (not a thrown render)", async () => {
    const onRunResult = vi.fn();
    let rejectRun: (e: unknown) => void = () => {};
    const spec: PortSpec = {
      ...RUN_SPEC,
      computeRun: () =>
        new Promise<ComputeResult>((_res, rej) => {
          rejectRun = rej;
        }),
    };
    const { result } = renderHook(() =>
      useNodeCompute(NODE_ID, spec, { x: 1 }, onRunResult),
    );

    act(() => {
      result.current.run();
    });
    expect(result.current.pending).toBe(true);

    await act(async () => {
      rejectRun(new Error("CAS worker died"));
      await Promise.resolve();
    });
    expect(result.current.pending).toBe(false);
    expect(result.current.error).toBe("CAS worker died");
    expect(onRunResult).toHaveBeenCalledTimes(1);
    const reported = onRunResult.mock.calls[0][1] as RunResult;
    expect(reported.error).toBe("CAS worker died");
  });
});
