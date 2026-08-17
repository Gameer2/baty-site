import { getPortSpec } from "./portSpecs/registry";

import type { EngineId } from "./engineAccents";
import type { PortSpec } from "./portSpecs/types";
import type { WireCandidate } from "./syntropyWire";

/** A run-mode node's cached run result, owned by the host (NodeOverlay) and populated when the
 *  node's Run action fires (via useNodeCompute's onRunResult callback). wiring reads this to
 *  propagate a run node's ready output to downstream wired nodes — the synchronous pass result
 *  for a run node is only a pending placeholder, so the real value must come from here. `pending`
 *  is true while the node's own async compute (computeRun) is in flight; `inputs` is the snapshot
 *  the last run used, so wiring can flag `stale` when the current effective inputs differ. */
export type RunStoreEntry = {
  outputs: Record<string, unknown>;
  error?: string;
  pending: boolean;
  inputs: Record<string, unknown>;
};

export type RunStore = Map<string, RunStoreEntry>;

/** Shallow input equality — values are primitives (numbers/strings) carried across a wire or
 *  typed into a scrub well, so `===` per key is exact. A fresh object with the same values reads
 *  as equal. Mirrors useNodeCompute's inputsEqual (kept local here to avoid inverting the
 *  wiring→nodes layer dependency). */
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
 * Real wire config carried on an arrow's customData once a user (or the auto-default in
 * App.tsx) has picked which specific output feeds which specific input. This replaces the old
 * "any arrow between two Syntropy nodes is cosmetically restyled" behavior — an arrow only
 * participates in computation when it carries one of these.
 */
export type SyntropyWireConfig = {
  syntropyWire: true;
  sourceOutputKey: string;
  targetInputKey: string;
};

export type WireConnection = {
  arrowId: string;
  sourceNodeId: string;
  sourceOutputKey: string;
  targetNodeId: string;
  targetInputKey: string;
};

export type ArrowLike = WireCandidate & { id: string };

type NodeLike = { id: string; customData?: unknown };
type ResolveNode = (id: string) => NodeLike | undefined;

type SyntropyNodeDataLike = {
  engineId: EngineId;
  methodId: string;
  inputs?: Record<string, unknown>;
};

/** Reads the {sourceOutputKey, targetInputKey} pair off an arrow's customData, or null if the
 *  arrow hasn't been configured as a real wire yet (an ordinary drawn arrow, or one waiting on
 *  App.tsx's auto-default). Exported for NodeOverlay to read the current selection for its
 *  WireConfigChip and for App.tsx to check whether an arrow needs a default assigned. */
export const readWireConfig = (cd: unknown): SyntropyWireConfig | null =>
  asWireConfig(cd);

const asWireConfig = (cd: unknown): SyntropyWireConfig | null => {
  const c = cd as
    | {
        syntropyWire?: unknown;
        sourceOutputKey?: unknown;
        targetInputKey?: unknown;
      }
    | undefined;
  if (
    !c?.syntropyWire ||
    typeof c.sourceOutputKey !== "string" ||
    typeof c.targetInputKey !== "string"
  ) {
    return null;
  }
  return {
    syntropyWire: true,
    sourceOutputKey: c.sourceOutputKey,
    targetInputKey: c.targetInputKey,
  };
};

const asNodeData = (cd: unknown): SyntropyNodeDataLike | undefined =>
  (cd as { syntropyNode?: SyntropyNodeDataLike } | undefined)?.syntropyNode;

/**
 * Resolves every arrow that carries a real wire config AND whose start/end bindings both
 * resolve to Syntropy nodes. An arrow drawn between two nodes but not yet configured (no
 * sourceOutputKey/targetInputKey) is not a connection yet — it needs a WireConfigChip pick
 * first (or App.tsx's auto-default assignment).
 */
export const extractWireConnections = (
  arrows: ReadonlyArray<ArrowLike>,
  resolve: ResolveNode,
): WireConnection[] => {
  const out: WireConnection[] = [];
  for (const arrow of arrows) {
    const config = asWireConfig(arrow.customData);
    if (!config) {
      continue;
    }
    const sourceId = arrow.startBinding?.elementId;
    const targetId = arrow.endBinding?.elementId;
    if (!sourceId || !targetId) {
      continue;
    }
    if (
      !asNodeData(resolve(sourceId)?.customData) ||
      !asNodeData(resolve(targetId)?.customData)
    ) {
      continue;
    }
    out.push({
      arrowId: arrow.id,
      sourceNodeId: sourceId,
      sourceOutputKey: config.sourceOutputKey,
      targetNodeId: targetId,
      targetInputKey: config.targetInputKey,
    });
  }
  return out;
};

/**
 * Wire compatibility is kind-equal among the wireable kinds: an output of kind K can feed an input
 * of the same kind K, and only if K is one of the kinds that carry a single meaningful value
 * across a wire. Composite kinds (expression/points/coeffs/vector/expressions) and rich display
 * kinds (trace/curve/eigenpairs/text) aren't wireable — there's no single value to hand across, or
 * the result is a visualization rather than a value. This is forward-looking: today only "number"
 * outputs exist on registered specs, but matrix/distribution/field/point outputs land with the
 * per-archetype renderer migrations, and this rule already accepts them.
 */
const WIREABLE_KINDS = new Set([
  "number",
  "matrix",
  "distribution",
  "field",
  "point",
]);

export const compatibleTargetInputKeys = (
  sourceSpec: PortSpec,
  sourceOutputKey: string,
  targetSpec: PortSpec,
): string[] => {
  const output = sourceSpec.outputs.find((o) => o.key === sourceOutputKey);
  if (!output || !WIREABLE_KINDS.has(output.kind)) {
    return [];
  }
  return targetSpec.inputs
    .filter((i) => i.kind === output.kind)
    .map((i) => i.key);
};

export type NodeState = {
  id: string;
  engineId: EngineId;
  methodId: string;
  inputs: Record<string, unknown>;
};

export type WiredComputeResult = {
  outputs: Record<string, unknown>;
  error?: string;
  /** True while a run-mode node's async compute is in flight (or before its first run). Live
   *  nodes are always synchronous, so this is undefined for them. */
  pending?: boolean;
  /** True when a run-mode node's inputs changed since its last run. Undefined for live nodes. */
  stale?: boolean;
  /** Input keys on this node whose value came from an upstream wire, not its own stored inputs
   *  — the node body uses this to render those scrub chips read-only and highlighted. */
  wiredInputKeys: Set<string>;
  /** The actual input values compute() ran with — the node's own stored inputs with any wired
   *  keys overridden by their upstream value. The node body reads a wired chip's displayed
   *  value from here (not from the node's own stored inputs) so it shows what's really flowing
   *  through the wire, not stale local state. */
  effectiveInputs: Record<string, unknown>;
};

/**
 * The real propagation engine: topologically orders nodes by wire dependency (Kahn's
 * algorithm), then computes each node in that order so a downstream node's wired input always
 * sees its upstream node's freshest output — not the stale value that was there when the wire
 * was drawn. Nodes inside a cycle (A feeds B feeds A) never reach zero indegree, so they're
 * left out of `order` and get an explicit "Cycle detected" error result instead of infinite
 * recursion or a stale/undefined read.
 */
export const computeWiredResults = (
  nodes: ReadonlyArray<NodeState>,
  connections: ReadonlyArray<WireConnection>,
  runStore?: RunStore,
  /** Resolves a node to its PortSpec. Defaults to the real registry; tests inject a fake so they
   *  can exercise run-mode propagation without registering a real run spec (which would break the
   *  output-shape contract test that iterates ALL_PORT_SPECS). */
  resolveSpec: (
    engineId: EngineId,
    methodId: string,
  ) => PortSpec | undefined = (engineId, methodId) =>
    getPortSpec(engineId, methodId) ?? undefined,
): Map<string, WiredComputeResult> => {
  const nodeById = new Map(nodes.map((n) => [n.id, n]));

  const incoming = new Map<string, WireConnection[]>();
  const outEdges = new Map<string, Set<string>>();
  const indegree = new Map<string, number>();
  for (const n of nodes) {
    outEdges.set(n.id, new Set());
    indegree.set(n.id, 0);
  }
  for (const c of connections) {
    if (!nodeById.has(c.sourceNodeId) || !nodeById.has(c.targetNodeId)) {
      continue;
    }
    if (!incoming.has(c.targetNodeId)) {
      incoming.set(c.targetNodeId, []);
    }
    incoming.get(c.targetNodeId)!.push(c);

    const edgeSet = outEdges.get(c.sourceNodeId)!;
    if (!edgeSet.has(c.targetNodeId)) {
      edgeSet.add(c.targetNodeId);
      indegree.set(c.targetNodeId, (indegree.get(c.targetNodeId) ?? 0) + 1);
    }
  }

  const queue: string[] = [];
  for (const [id, deg] of indegree) {
    if (deg === 0) {
      queue.push(id);
    }
  }
  const order: string[] = [];
  const remaining = new Map(indegree);
  while (queue.length > 0) {
    const id = queue.shift()!;
    order.push(id);
    for (const next of outEdges.get(id) ?? []) {
      const nextDeg = (remaining.get(next) ?? 0) - 1;
      remaining.set(next, nextDeg);
      if (nextDeg === 0) {
        queue.push(next);
      }
    }
  }
  const orderedIds = new Set(order);
  const cyclic = nodes.map((n) => n.id).filter((id) => !orderedIds.has(id));

  const results = new Map<string, WiredComputeResult>();

  for (const id of order) {
    const node = nodeById.get(id)!;
    const spec = resolveSpec(node.engineId, node.methodId);
    if (!spec) {
      results.set(id, {
        outputs: {},
        wiredInputKeys: new Set(),
        effectiveInputs: node.inputs,
      });
      continue;
    }
    const effectiveInputs: Record<string, unknown> = { ...node.inputs };
    const wiredInputKeys = new Set<string>();
    let waitingOnUpstream = false;
    for (const c of incoming.get(id) ?? []) {
      const targetHasInput = spec.inputs.some(
        (i) => i.key === c.targetInputKey,
      );
      if (!targetHasInput) {
        continue;
      }
      // The upstream's value: a run-mode upstream's ready result lives in runStore (its pass
      // result here is just a pending placeholder); a live upstream's result is in `results`.
      // Prefer a ready runStore entry, fall back to the synchronous pass result.
      const upstreamPass = results.get(c.sourceNodeId);
      const upstreamRun = runStore?.get(c.sourceNodeId);
      const upstreamOutputs =
        upstreamRun && !upstreamRun.pending
          ? upstreamRun.outputs
          : upstreamPass?.outputs ?? {};
      const upstreamNode = nodeById.get(c.sourceNodeId);
      const upstreamSpec =
        upstreamNode &&
        resolveSpec(upstreamNode.engineId, upstreamNode.methodId);
      const upstreamIsRun = upstreamSpec?.executionMode === "run";
      const upstreamReady = upstreamIsRun
        ? upstreamRun != null && !upstreamRun.pending
        : upstreamPass != null && !upstreamPass.error;
      if (!upstreamReady) {
        waitingOnUpstream = true;
      }
      if (upstreamPass && !upstreamPass.error) {
        effectiveInputs[c.targetInputKey] = upstreamOutputs[c.sourceOutputKey];
        wiredInputKeys.add(c.targetInputKey);
      }
    }
    if (spec.executionMode === "run") {
      // A run node's real result lives in runStore; wiring never invokes computeRun (the render
      // path is synchronous). Flag state so the host knows what to show: pending while waiting on
      // an upstream that isn't ready or while the node's own run is in flight; stale once the
      // inputs are present but don't match the last run's snapshot; ready otherwise. The node's own
      // renderer also tracks this via useNodeCompute — these flags are the propagation layer's
      // view (and feed downstream effectiveInputs).
      const ownRun = runStore?.get(id);
      let pending: boolean;
      let stale: boolean;
      let outputs: Record<string, unknown>;
      if (waitingOnUpstream) {
        pending = true;
        stale = false;
        outputs = ownRun?.outputs ?? {};
      } else if (ownRun == null) {
        pending = false;
        stale = true;
        outputs = {};
      } else if (ownRun.pending) {
        pending = true;
        stale = false;
        outputs = ownRun.outputs;
      } else if (!inputsEqual(ownRun.inputs, effectiveInputs)) {
        pending = false;
        stale = true;
        outputs = ownRun.outputs;
      } else {
        pending = false;
        stale = false;
        outputs = ownRun.outputs;
      }
      results.set(id, {
        outputs,
        pending,
        stale,
        wiredInputKeys,
        effectiveInputs,
      });
      continue;
    }
    const raw = spec.compute(effectiveInputs);
    results.set(id, { ...raw, wiredInputKeys, effectiveInputs });
  }

  for (const id of cyclic) {
    results.set(id, {
      outputs: {},
      error: "Cycle detected in wiring — this node depends on its own output.",
      wiredInputKeys: new Set(),
      effectiveInputs: nodeById.get(id)?.inputs ?? {},
    });
  }

  return results;
};
