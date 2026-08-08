//
// Engineering / drafting instruments: compass, ruler, protractor, T-square,
// set square, angle bisector.
//
// These are on-canvas instrument overlays (see `engineeringOverlay.ts`), not
// generic shapes: the live instrument is rendered above the scene and
// manipulated directly (drag to move / rotate / draw). This module holds only
// the tool-type registry shared by the toolbar dropdown, the renderer, and the
// pointer dispatch in App.tsx. The overlay geometry, hit-testing, rendering,
// and drawing commit live in `engineeringOverlay.ts`.
//

import { TOOL_TYPE } from "@excalidraw/common";

export const ENGINEERING_TOOL_TYPES = new Set<string>([
  TOOL_TYPE.compass,
  TOOL_TYPE.ruler,
  TOOL_TYPE.protractor,
  TOOL_TYPE.tsquare,
  TOOL_TYPE.setsquare,
  TOOL_TYPE.anglebisector,
]);

/** the six engineering/drafting instrument tool types */
export type EngineeringToolType =
  | "compass"
  | "ruler"
  | "protractor"
  | "tsquare"
  | "setsquare"
  | "anglebisector";

// a type guard (not just a boolean predicate) so the tool-dispatch else-if
// chain narrows `activeTool.type` and the generic fallback stays type-safe
export const isEngineeringTool = (type: string): type is EngineeringToolType =>
  ENGINEERING_TOOL_TYPES.has(type);
