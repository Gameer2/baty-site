import { useCallback, useState } from "react";

import type { ComputeResult, PortSpec } from "../portSpecs/types";

/** The result a run-mode node reports back to its host (NodeOverlay) so the host's runStore can
 *  propagate the value to downstream wired nodes. Live nodes never report — they recompute every
 *  render and have no cached result to share. */
export type RunResult = {
  outputs: Record<string, unknown>;
  error?: string;
};

export type NodeComputeState = {
  outputs: Record<string, unknown>;
  error?: string;
  pending: boolean;
  stale: boolean;
  /** Triggers a compute for run-mode nodes; a no-op for live nodes (which recompute on every
   *  render and have no Run button). */
  run: () => void;
};

/** Shallow equality on two input records — values are primitives (strings/numbers) carried across
 *  a wire or typed into a scrub well, so `===` per key is exact. A new object with the same values
 *  (the common case — renderers rebuild `effectiveLocalInputs` every render) reads as equal. */
const inputsEqual = (
  a: Record<string, unknown>,
  b: Record<string, unknown>,
): boolean => {
  const ak = Object.keys(a);
  const bk = Object.keys(b);
  if (ak.length !== bk.length) {
    return false;
  }
  for (const k of ak) {
    if (a[k] !== b[k]) {
      return false;
    }
  }
  return true;
};

/**
 * The single hook every archetype renderer uses instead of calling `spec.compute` directly. It
 * unifies the live and run execution modes behind one `{ outputs, error, pending, stale, run }`
 * shape so the per-archetype renderers don't each reimplement async state.
 *
 * - **Live** (`executionMode: "live"` — all 89 existing specs): re-invokes `spec.compute`
 *   synchronously on every render, exactly as the renderers did before. `pending`/`stale` are
 *   always false and `run` is a no-op (live nodes have no Run button).
 * - **Run** (`executionMode: "run"` — the CAS methods): compute is async and triggered explicitly
 *   by `run()`, not on every keystroke. The hook keeps the last-run result across input edits so
 *   the renderer is stable between runs; `stale` goes true when `effectiveInputs` no longer matches
 *   the inputs the last run used; `pending` is true while a run is in flight. When a run resolves
 *   it calls the optional `onRunResult(nodeId, result)` so the host can feed the result to
 *   downstream wired nodes via its runStore (see wiring.ts).
 *
 * `compute` is always synchronous (returns `ComputeResult`); run-mode specs carry an additional
 *   `computeRun: (inputs) => Promise<ComputeResult>` which this hook invokes only when `run()`
 *   fires. The live branch calls `spec.compute` directly (exactly as the renderers did before);
 *   the run branch never touches `compute`, only `computeRun`.
 */
export const useNodeCompute = (
  nodeId: string,
  spec: PortSpec,
  effectiveInputs: Record<string, unknown>,
  onRunResult?: (nodeId: string, result: RunResult) => void,
): NodeComputeState => {
  const isRun = spec.executionMode === "run";

  // Run-mode state. Allocated unconditionally (before the live early-return) so hooks order is
  // stable across renders; live specs simply never use these.
  const [lastResult, setLastResult] = useState<RunResult | null>(null);
  const [lastInputs, setLastInputs] = useState<Record<string, unknown> | null>(
    null,
  );
  const [pending, setPending] = useState(false);

  const run = useCallback(() => {
    if (!isRun) {
      return;
    }
    const runner = spec.computeRun;
    if (!runner) {
      return;
    }
    const snapshot = { ...effectiveInputs };
    setPending(true);
    runner(snapshot)
      .then((r: ComputeResult) => {
        const result: RunResult = { outputs: r.outputs ?? {}, error: r.error };
        setLastResult(result);
        setLastInputs(snapshot);
        setPending(false);
        onRunResult?.(nodeId, result);
      })
      .catch((err: unknown) => {
        const result: RunResult = {
          outputs: {},
          error: err instanceof Error ? err.message : String(err),
        };
        setLastResult(result);
        setLastInputs(snapshot);
        setPending(false);
        onRunResult?.(nodeId, result);
      });
  }, [isRun, nodeId, spec, effectiveInputs, onRunResult]);

  if (!isRun) {
    // Live: synchronous, recomputed each render (the existing behavior).
    const { outputs, error } = spec.compute(effectiveInputs);
    return { outputs, error, pending: false, stale: false, run };
  }

  // Run: stale when inputs drifted from the last-run inputs (or before the first run); the last
  // result is kept across edits so the renderer stays stable until the next Run.
  const stale = pending
    ? false
    : lastInputs === null || !inputsEqual(lastInputs, effectiveInputs);
  return {
    outputs: lastResult?.outputs ?? {},
    error: lastResult?.error,
    pending,
    stale,
    run,
  };
};
