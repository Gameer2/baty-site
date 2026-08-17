import type { EngineId } from "./engineAccents";

export type SyntropyNodeData = {
  engineId: EngineId;
  methodId: string;
  name: string;
  linkedAccent?: string | null;
  /** Current input values, present only for methods with a port spec (Task 2's registry). Lives
   *  here — not in component state — so it persists, undoes, and exports with the element. */
  inputs?: Record<string, unknown>;
  /** Content-driven minimum size (nodeGeometry.ts's computeInitialNodeSize output at creation
   *  time) — packages/element/src/resizeElements.ts reads this generically to stop a drag-resize
   *  from shrinking the node below what its fixed-height rows/chart need, which otherwise clips
   *  or visually collapses the NodeOverlay card (its DOM size tracks the element's raw
   *  width/height 1:1 — see nodeGeometry.ts's computeNodeScreenRect). */
  minWidth?: number;
  minHeight?: number;
};

// Structural slice of an arrow element the real wiring engine (wiring.ts) reads. Real
// ExcalidrawArrowElements satisfy this; tests pass plain objects.
export type WireCandidate = {
  startBinding: { elementId: string } | null;
  endBinding: { elementId: string } | null;
  customData?: { syntropyWire?: boolean; [key: string]: unknown };
};
