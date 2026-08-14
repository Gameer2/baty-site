import { NodeStatus } from "./NodeStatus";

/** The run-mode action row: a Run button (only for `executionMode: "run"`) plus the `NodeStatus`
 *  chip. Co-located with `run()` inside each archetype renderer — the renderer's `useNodeCompute`
 *  owns the run trigger and pending/stale state, so the button just calls that `run` directly (no
 *  ref bridge back up to NodeOverlay). Live nodes render only the chip, which `NodeStatus` turns
 *  into nothing (pending/stale are always false for live), so mounting this unconditionally in every
 *  renderer is cheap.
 *
 *  The Run button label stays "Run" whether or not a run is in flight — the `NodeStatus` chip is
 *  the single source of the "running…" / "stale — press Run" affordance, so the label and chip
 *  never fight over the same status text. The button is just disabled while a run is pending. */
export const NodeRunBar = ({
  executionMode,
  run,
  pending,
  stale,
}: {
  executionMode: "live" | "run";
  run: () => void;
  pending: boolean;
  stale: boolean;
}) => (
  <div className="NodeRunBar">
    {executionMode === "run" && (
      <button
        type="button"
        className="NodeRunBar__run"
        onClick={run}
        disabled={pending}
      >
        Run
      </button>
    )}
    <NodeStatus pending={pending} stale={stale} />
  </div>
);
