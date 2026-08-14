import { DistributionNode } from "./DistributionNode";
import { MatrixNode } from "./MatrixNode";
import { RealLineNode } from "./RealLineNode";
import { ScalarNode } from "./ScalarNode";
import { TraceNode } from "./TraceNode";

import type { PortSpec } from "../portSpecs/types";
import type { WiredComputeResult } from "../wiring";

/** The six visualization archetypes — see
 *  docs/superpowers/specs/2026-08-14-syntropy-node-archetype-redesign-design.md. */
export type Archetype =
  | "trace"
  | "real-line"
  | "matrix"
  | "field"
  | "distribution"
  | "scalar";

// First rich (non-number, non-text) output kind wins. A spec may carry a `number` summary
// alongside its rich output (LU emits matrix factors AND a number det) — the number must not
// mask the archetype. number/text-only specs are scalar.
const ARCHETYPE_BY_KIND: Record<string, Archetype> = {
  trace: "trace",
  curve: "real-line",
  matrix: "matrix",
  eigenpairs: "matrix",
  field: "field",
  distribution: "distribution",
};

/** Picks a node's archetype from its declared outputs. The dispatcher (`NodeBody`) reads this to
 *  choose the body renderer; v1 routes every archetype to `ScalarNode` until the per-archetype
 *  renderers land in their follow-on plans. */
export const archetypeFromSpec = (spec: PortSpec): Archetype => {
  for (const output of spec.outputs) {
    const arch = ARCHETYPE_BY_KIND[output.kind];
    if (arch) {
      return arch;
    }
  }
  return "scalar";
};

export type NodeBodyProps = {
  nodeId: string;
  spec: PortSpec;
  name: string;
  accent: string;
  inputs: Record<string, unknown>;
  onInputsChange: (next: Record<string, unknown>) => void;
  computedResult: WiredComputeResult;
  onOutputPortPointerDown: (
    outputKey: string,
    event: React.PointerEvent<HTMLSpanElement>,
  ) => void;
  readOnly?: boolean;
};

// The per-archetype renderers land in their follow-on plans. MatrixNode (factor grids,
// eigenpairs, solution vectors), TraceNode (step table + convergence plot), DistributionNode
// (pdf curve + shaded region), and RealLineNode (curve + overlay plot) have shipped. The
// remaining archetype (field) still routes to ScalarNode until its renderer lands; ScalarNode
// renders number/text outputs exactly as the old single card did, so those nodes keep their
// appearance. When a renderer lands, replace the matching branch here with it.
const renderBody = (props: NodeBodyProps) => {
  switch (archetypeFromSpec(props.spec)) {
    case "matrix":
      return <MatrixNode {...props} />;
    case "trace":
      return <TraceNode {...props} />;
    case "distribution":
      return <DistributionNode {...props} />;
    case "real-line":
      return <RealLineNode {...props} />;
    default:
      return <ScalarNode {...props} />;
  }
};

/** The single component NodeOverlay renders for a node. Dispatches on the spec's archetype; v1
 *  routes every archetype to ScalarNode. Props are identical to the old SyntropyNodeCard so
 *  NodeOverlay is a drop-in swap. */
export const NodeBody = (props: NodeBodyProps) => renderBody(props);
