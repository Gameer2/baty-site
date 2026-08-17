// Syntropy Canvas: nodes carry a content-driven minimum size on `customData.syntropyNode`
// (stamped at creation from nodeGeometry.ts's computeInitialNodeSize — see
// syntropy-app/syntropy/createSyntropyNode.ts). The NodeOverlay DOM card's size tracks the
// element's raw width/height 1:1 (nodeGeometry.ts's computeNodeScreenRect), and its rows/chart
// have fixed heights that don't reflow — so resizing the underlying element below that minimum
// clips or visually collapses the card. resizeElements.ts reads this generically (no import of
// anything Syntropy-specific) to clamp resize the same way it already clamps a bound text
// element's minimum width/height.
export const getSyntropyMinSize = (element: {
  customData?: unknown;
}): { minWidth: number; minHeight: number } | null => {
  const nodeData = (
    element.customData as
      | { syntropyNode?: { minWidth?: number; minHeight?: number } }
      | undefined
  )?.syntropyNode;

  if (
    typeof nodeData?.minWidth !== "number" ||
    typeof nodeData?.minHeight !== "number"
  ) {
    return null;
  }

  return { minWidth: nodeData.minWidth, minHeight: nodeData.minHeight };
};
