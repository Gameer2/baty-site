/** The small status chip a run-mode node shows in its body: "running…" while a compute is in
 *  flight, "stale — press Run" when inputs changed since the last run. Renders nothing for live
 *  nodes (pending/stale are always false) and nothing when a run node is fresh (ready), so it is
 *  cheap to mount unconditionally in every renderer. */
export const NodeStatus = ({
  pending,
  stale,
}: {
  pending: boolean;
  stale: boolean;
}) => {
  if (pending) {
    return <span className="NodeStatus NodeStatus--pending">running…</span>;
  }
  if (stale) {
    return (
      <span className="NodeStatus NodeStatus--stale">stale — press Run</span>
    );
  }
  return null;
};
