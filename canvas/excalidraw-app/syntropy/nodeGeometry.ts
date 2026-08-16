import type { PortSpec } from "./portSpecs/types";

const PLACEHOLDER_WIDTH = 260;
const PLACEHOLDER_HEIGHT = 200;
const PLOT_RESERVED_HEIGHT = 140;

/**
 * Content-driven initial size, replacing the old fixed 260x200 every node used regardless of
 * content (see docs/superpowers/specs/2026-08-05-syntropy-canvas-board-and-lab-integration-design.md's
 * critique). A node with no port spec yet keeps today's placeholder-shell size unchanged.
 */
export const computeInitialNodeSize = (
  spec: PortSpec | null,
): { width: number; height: number } => {
  if (!spec) {
    return { width: PLACEHOLDER_WIDTH, height: PLACEHOLDER_HEIGHT };
  }
  const hasPlot = spec.outputs.some((o) => o.kind === "curve");
  const inputRowHeight = 40 + 8; // matches .SyntropyNode__scrub height + column gap
  const height =
    72 /* header */ +
    12 * 2 /* body padding */ +
    spec.inputs.length * inputRowHeight +
    (hasPlot ? PLOT_RESERVED_HEIGHT : 0) +
    56; /* output row */
  return { width: PLACEHOLDER_WIDTH, height };
};

export const MIN_NODE_WIDTH = 200;
export const MIN_NODE_HEIGHT = 90;
export const MAX_NODE_WIDTH = 640;
export const MAX_NODE_HEIGHT = 720;

/**
 * Clamp a measured content size into the range a node may auto-grow within — wide enough for a
 * multi-grid matrix factorization or a stack of eigenpairs, capped so one outlier doesn't swallow
 * the canvas (content beyond the cap is still clipped by NodeShell's own `overflow: hidden`, same
 * as today).
 */
export const clampNodeSize = (
  width: number,
  height: number,
): { width: number; height: number } => ({
  width: Math.min(MAX_NODE_WIDTH, Math.max(MIN_NODE_WIDTH, Math.round(width))),
  height: Math.min(
    MAX_NODE_HEIGHT,
    Math.max(MIN_NODE_HEIGHT, Math.round(height)),
  ),
});

type SceneRectLike = { x: number; y: number; width: number; height: number };
type ScreenMappingAppState = {
  scrollX: number;
  scrollY: number;
  zoom: { value: number };
  offsetLeft: number;
  offsetTop: number;
};

type SpawnAppState = ScreenMappingAppState & {
  width: number;
  height: number;
};

/**
 * Viewport (screen) coordinates -> scene coordinates — the exact inverse of
 * `computeNodeScreenRect` / Excalidraw's `sceneCoordsToViewportCoords`. Used to spawn a new node
 * under the center of what the user is actually looking at, instead of at a fixed scene point that
 * may be off-screen the moment they pan or zoom.
 */
export const viewportCoordsToSceneCoords = (
  viewportX: number,
  viewportY: number,
  appState: ScreenMappingAppState,
): { x: number; y: number } => {
  const { scrollX, scrollY, zoom, offsetLeft, offsetTop } = appState;
  return {
    x: (viewportX - offsetLeft) / zoom.value - scrollX,
    y: (viewportY - offsetTop) / zoom.value - scrollY,
  };
};

/**
 * Where a newly added node should land: the scene point under the center of the visible canvas,
 * centered on that point, with a small diagonal fan so consecutive drops don't stack on top of
 * each other (the old `100 + cascade*30` always landed in the same top-left spot). The fan wraps
 * every 5 drops.
 */
export const computeSpawnPoint = (
  appState: SpawnAppState,
  nodeWidth: number,
  nodeHeight: number,
  cascadeIndex: number,
): { x: number; y: number } => {
  const centerX = appState.offsetLeft + appState.width / 2;
  const centerY = appState.offsetTop + appState.height / 2;
  const scene = viewportCoordsToSceneCoords(centerX, centerY, appState);
  const fan = cascadeIndex % 5;
  // Scale the step to the node's own footprint rather than a flat 24px: a fixed step that's
  // small relative to real node sizes (150-700px) leaves a quick run of library adds landing
  // almost fully on top of each other — cards, ports, and inputs from five different nodes all
  // stacked within a few px of one another. Half the larger dimension gives each drop a clean
  // step away from the last; clamped so one huge auto-fit-grown node doesn't send the fan
  // wildly off-screen.
  const step = Math.max(80, Math.min(220, Math.max(nodeWidth, nodeHeight) * 0.5));
  return {
    x: scene.x - nodeWidth / 2 + fan * step,
    y: scene.y - nodeHeight / 2 + fan * step,
  };
};

/**
 * Scene coordinates -> viewport (screen) coordinates for one node, using the same formula as
 * Excalidraw's own sceneCoordsToViewportCoords (packages/common/src/utils.ts) — reimplemented
 * as a narrow, independently testable function rather than importing that one, since it takes a
 * differently-shaped Zoom object than this overlay needs to carry around.
 *
 * Returns the node's NATURAL (unscaled) width/height plus a separate `scale` factor — the
 * caller applies `transform: scale(scale)` with `transform-origin: top left` rather than this
 * function returning pre-scaled dimensions, so the DOM content inside doesn't need to
 * recompute its own internal layout on every zoom tick.
 */
export const computeNodeScreenRect = (
  element: SceneRectLike,
  appState: ScreenMappingAppState,
): {
  left: number;
  top: number;
  width: number;
  height: number;
  scale: number;
} => {
  const { scrollX, scrollY, zoom, offsetLeft, offsetTop } = appState;
  return {
    left: (element.x + scrollX) * zoom.value + offsetLeft,
    top: (element.y + scrollY) * zoom.value + offsetTop,
    width: element.width,
    height: element.height,
    scale: zoom.value,
  };
};
