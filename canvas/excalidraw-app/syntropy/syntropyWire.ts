import { ENGINE_ACCENTS, type EngineId } from "./engineAccents";

export type SyntropyNodeData = {
  engineId: EngineId;
  methodId: string;
  name: string;
  linkedAccent?: string | null;
  /** Current input values, present only for methods with a port spec (Task 2's registry). Lives
   *  here — not in component state — so it persists, undoes, and exports with the element. */
  inputs?: Record<string, unknown>;
};

// Structural slice of an arrow element that the wire helpers read. Real
// ExcalidrawArrowElements satisfy this; tests pass plain objects.
export type WireCandidate = {
  startBinding: { elementId: string } | null;
  endBinding: { elementId: string } | null;
  customData?: { syntropyWire?: boolean; [key: string]: unknown };
};

// Accepts both real Excalidraw elements (customData?: Record<string, any>)
// and plain test mock objects (customData?: { syntropyNode?: ... }) — both
// are assignable to customData?: unknown. Narrowing happens in asNodeData.
type NodeLike = { customData?: unknown };
type ResolveNode = (id: string) => NodeLike | undefined;

const asNodeData = (cd: unknown): SyntropyNodeData | undefined =>
  (cd as { syntropyNode?: SyntropyNodeData } | undefined)?.syntropyNode;

const engineIdOf = (
  resolve: ResolveNode,
  id: string | undefined,
): EngineId | null => {
  if (!id) {
    return null;
  }
  return asNodeData(resolve(id)?.customData)?.engineId ?? null;
};

/**
 * Returns the SOURCE node's engine accent if `arrow` should be auto-styled
 * as a Syntropy wire — i.e. both its start (source) and end (target) bindings
 * resolve to elements carrying `customData.syntropyNode`, and the arrow is
 * not already marked `customData.syntropyWire`. Otherwise null. The marker
 * is what makes the restyle idempotent (a user can still restyle a wire by
 * hand afterward — we never re-force once it's marked).
 */
export const getSyntropyWireStyling = (
  arrow: WireCandidate,
  resolve: ResolveNode,
): string | null => {
  if (arrow.customData?.syntropyWire) {
    return null;
  }
  const src = engineIdOf(resolve, arrow.startBinding?.elementId);
  const dst = engineIdOf(resolve, arrow.endBinding?.elementId);
  if (!src || !dst) {
    return null;
  }
  return ENGINE_ACCENTS[src];
};

/**
 * The exact element-update partial that restyles an arrow as a Syntropy wire:
 * dashed stroke, diamond port markers at both ends, the source engine's
 * accent as the stroke color, and the one-time `syntropyWire` marker.
 * Existing `customData` is preserved.
 */
export const styleSyntropyWire = (
  arrow: WireCandidate,
  accent: string,
): {
  strokeStyle: "dashed";
  startArrowhead: "diamond";
  endArrowhead: "diamond";
  strokeColor: string;
  customData: { syntropyWire: true } & Record<string, unknown>;
} => ({
  strokeStyle: "dashed",
  startArrowhead: "diamond",
  endArrowhead: "diamond",
  strokeColor: accent,
  customData: { ...(arrow.customData ?? {}), syntropyWire: true },
});

/**
 * Returns the SOURCE engine accent a node is linked FROM — the accent of the
 * first arrow whose endBinding is `nodeId` and whose startBinding resolves to
 * a `customData.syntropyNode` element — or null if nothing wires into it.
 * Drives the target node's first-scrub-chip "linked" reaction. Purely visual:
 * no value is actually read from the source node; this reacts to the wire's
 * existence, matching the mockup.
 */
export const computeLinkedAccent = (
  nodeId: string,
  arrows: ReadonlyArray<WireCandidate>,
  resolve: ResolveNode,
): string | null => {
  for (const a of arrows) {
    if (a.endBinding?.elementId !== nodeId) {
      continue;
    }
    const src = engineIdOf(resolve, a.startBinding?.elementId);
    if (src) {
      return ENGINE_ACCENTS[src];
    }
  }
  return null;
};

/**
 * The element-update partial that writes `linkedAccent` onto a node's
 * `customData.syntropyNode`, preserving engineId/methodId/name and any other
 * top-level customData keys. Pass null to clear (when a wire is deleted).
 */
export const stampLinkedAccent = (
  node: NodeLike,
  accent: string | null,
): { customData: { syntropyNode: SyntropyNodeData } } => ({
  customData: {
    ...((node.customData as Record<string, unknown> | undefined) ?? {}),
    syntropyNode: {
      ...(asNodeData(node.customData) ?? ({} as SyntropyNodeData)),
      linkedAccent: accent,
    },
  },
});
