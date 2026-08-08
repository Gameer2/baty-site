import {
  COLOR_WHITE,
  FRAME_STYLE,
  THEME,
  throttleRAF,
} from "@excalidraw/common";
import { isElementLink, isSyntropyLinkElement } from "@excalidraw/element";
import { createPlaceholderEmbeddableLabel } from "@excalidraw/element";
import { getBoundTextElement } from "@excalidraw/element";
import {
  isEmbeddableElement,
  isIframeLikeElement,
  isTextElement,
} from "@excalidraw/element";
import {
  elementOverlapsWithFrame,
  getTargetFrame,
  shouldApplyFrameClip,
} from "@excalidraw/element";

import { renderElement } from "@excalidraw/element";

import { getElementAbsoluteCoords } from "@excalidraw/element";

import type {
  ElementsMap,
  ExcalidrawFrameLikeElement,
  NonDeletedExcalidrawElement,
} from "@excalidraw/element/types";

import {
  EXTERNAL_LINK_IMG,
  ELEMENT_LINK_IMG,
  getLinkHandleFromCoords,
} from "../components/hyperlink/helpers";

import { bootstrapCanvas, getNormalizedCanvasDimensions } from "./helpers";

import type {
  StaticCanvasRenderConfig,
  StaticSceneRenderConfig,
} from "../scene/types";
import type { StaticCanvasAppState, Zoom } from "../types";

// Three-tier hierarchy, lightest to boldest: `regular` (unit squares) →
// `medium` (every `gridStep` units) → `major` (every `gridStep * 2` units —
// a 2×2 block of medium squares, e.g. 5-unit squares grouped 2×2 into a
// 10-unit block, matching graph-paper convention). Alpha-over-ink rather than
// flat grey hexes — same technique as `DOT_GRID_COLORS` right below, so the
// grid reads as the same family of "ink on paper" texture, and the steps
// between tiers are wide enough to read as three distinct layers rather than
// three shades of the same grey.
const GridLineColor = {
  [THEME.LIGHT]: {
    major: "rgba(0, 0, 0, 0.26)",
    medium: "rgba(0, 0, 0, 0.13)",
    regular: "rgba(0, 0, 0, 0.05)",
  },
  [THEME.DARK]: {
    major: "rgba(255, 255, 255, 0.24)",
    medium: "rgba(255, 255, 255, 0.12)",
    regular: "rgba(255, 255, 255, 0.05)",
  },
} as const;

/** the big/major grid block is this many medium blocks wide — 2×2 medium
 *  blocks per major block, per the graph-paper spec (e.g. 5-unit medium
 *  blocks grouped 2×2 into a 10-unit major block). */
const MAJOR_GRID_STEP_MULTIPLIER = 2;

/** Syntropy Canvas board texture: the approved v6 mockup's `.canvas5` dot field —
    `radial-gradient(rgba(255,255,255,.05) 1px, transparent 1px)` at `24px 24px`. Drawn on the
    static scene canvas rather than as a CSS background because the canvas is painted opaque
    with `viewBackgroundColor`, so anything behind it is invisible — and because drawing it here
    is what makes it scroll and zoom with the board instead of sitting still behind it.

    Deliberately NOT Excalidraw's own grid: that one draws ruled lines, and switching it on also
    switches on element snapping (`isGridModeEnabled` gates both `renderGrid` and
    `getEffectiveGridSize`). This is pure texture with no behavioral side effect. */
const DOT_GRID_SIZE = 24;

const DOT_GRID_COLORS = {
  [THEME.LIGHT]: "rgba(0, 0, 0, 0.06)",
  [THEME.DARK]: "rgba(255, 255, 255, 0.05)",
} as const;

/** GoodNotes-style ruled (notebook) paper: horizontal lines only, no verticals, no
    element snapping. Reuses the grid's color + spacing so it reads as the same family
    of texture, just the lined variant. The left margin rule is the one GoodNotes
    signature we keep — drawn in the Syntropy infrared accent at low opacity, anchored
    to scene x = 0 so it stays put as the page's left edge while you pan. */
const RULED_MARGIN_COLORS = {
  [THEME.LIGHT]: "rgba(237, 109, 64, 0.32)",
  [THEME.DARK]: "rgba(237, 109, 64, 0.28)",
} as const;

const strokeDotGrid = (
  context: CanvasRenderingContext2D,
  scrollX: number,
  scrollY: number,
  zoom: Zoom,
  theme: StaticCanvasRenderConfig["theme"],
  width: number,
  height: number,
  /** Spacing in board px. Defaults to the v6 mockup's 24px dot field. */
  size: number = DOT_GRID_SIZE,
  /** Free-picked dot color; falls back to the theme default when unset. */
  colorOverride?: string,
) => {
  // Below this the dots crowd into a haze and cost more than they read — the line grid makes
  // the same call at `actualGridSize < 10`.
  if (size * zoom.value < 10) {
    return;
  }

  const offsetX = (scrollX % size) - size;
  const offsetY = (scrollY % size) - size;
  // The context is already zoom-scaled, so a constant screen-pixel dot needs dividing back out.
  const radius = 1 / zoom.value;

  context.save();
  context.fillStyle = colorOverride || DOT_GRID_COLORS[theme];

  for (let x = offsetX; x < offsetX + width + size * 2; x += size) {
    for (let y = offsetY; y < offsetY + height + size * 2; y += size) {
      context.beginPath();
      context.arc(x, y, radius, 0, Math.PI * 2);
      context.fill();
    }
  }

  context.restore();
};

type GridTier = "regular" | "medium" | "major";

/** Which tier a grid line at board-space `pos` (already snapped to a
 *  `gridSize` step) belongs to: every `gridStep` unit squares is a `medium`
 *  line (bounding a `gridStep`×`gridStep` block — e.g. 25 unit squares at the
 *  default step of 5); every `MAJOR_GRID_STEP_MULTIPLIER` medium blocks is a
 *  `major` line (e.g. 2×2 medium blocks — 100 unit squares — per major
 *  block). Matches real graph-paper's minor/mid/major rule convention. */
const gridLineTier = (
  pos: number,
  origin: number,
  gridSize: number,
  gridStep: number,
): GridTier => {
  if (gridStep <= 1) {
    return "regular";
  }
  const cell = Math.round(pos - origin) / gridSize;
  if (Math.round(cell) % (gridStep * MAJOR_GRID_STEP_MULTIPLIER) === 0) {
    return "major";
  }
  if (Math.round(cell) % gridStep === 0) {
    return "medium";
  }
  return "regular";
};

const strokeGrid = (
  context: CanvasRenderingContext2D,
  /** grid cell pixel size */
  gridSize: number,
  /** setting to 1 disables the medium/major tiers — every line is `regular` */
  gridStep: number,
  scrollX: number,
  scrollY: number,
  zoom: Zoom,
  theme: StaticCanvasRenderConfig["theme"],
  width: number,
  height: number,
  /** Free-picked line color; falls back to the theme's 3-tier palette when unset. */
  colorOverride?: string,
) => {
  const offsetX = (scrollX % gridSize) - gridSize;
  const offsetY = (scrollY % gridSize) - gridSize;

  const actualGridSize = gridSize * zoom.value;

  context.save();

  // Offset rendering by 0.5 to ensure that 1px wide lines are crisp.
  // We only do this when zoomed to 100% because otherwise the offset is
  // fractional, and also visibly offsets the elements.
  // We also do this per-axis, as each axis may already be offset by 0.5.
  if (zoom.value === 1) {
    context.translate(offsetX % 1 ? 0 : 0.5, offsetY % 1 ? 0 : 0.5);
  }

  // dividing by zoom.value converts a target SCREEN-pixel width into scene
  // units, so each tier renders at a constant, clearly-different width no
  // matter the zoom level. All three are solid (no dashing) — real graph
  // paper's finest ruling is still a solid line, just thin and light; a
  // dashed fine grid reads as "not really there" instead of a third tier.
  const tierLineWidth: Record<GridTier, number> = {
    regular: 0.5 / zoom.value,
    medium: 1.25 / zoom.value,
    major: 2.25 / zoom.value,
  };

  // vertical lines
  for (let x = offsetX; x < offsetX + width + gridSize * 2; x += gridSize) {
    const tier = gridLineTier(x, scrollX, gridSize, gridStep);
    // don't render regular lines when zoomed out and they're barely visible
    if (tier === "regular" && actualGridSize < 10) {
      continue;
    }

    context.lineWidth = tierLineWidth[tier];
    context.beginPath();
    context.strokeStyle = colorOverride || GridLineColor[theme][tier];
    context.moveTo(x, offsetY - gridSize);
    context.lineTo(x, Math.ceil(offsetY + height + gridSize * 2));
    context.stroke();
  }

  for (let y = offsetY; y < offsetY + height + gridSize * 2; y += gridSize) {
    const tier = gridLineTier(y, scrollY, gridSize, gridStep);
    if (tier === "regular" && actualGridSize < 10) {
      continue;
    }

    context.lineWidth = tierLineWidth[tier];
    context.beginPath();
    context.strokeStyle = colorOverride || GridLineColor[theme][tier];
    context.moveTo(offsetX - gridSize, y);
    context.lineTo(Math.ceil(offsetX + width + gridSize * 2), y);
    context.stroke();
  }
  context.restore();
};

const strokeRuledLines = (
  context: CanvasRenderingContext2D,
  /** line spacing px — same value the grid uses */
  gridSize: number,
  scrollX: number,
  scrollY: number,
  zoom: Zoom,
  theme: StaticCanvasRenderConfig["theme"],
  width: number,
  height: number,
  /** Free-picked rule color; falls back to the theme default when unset. */
  colorOverride?: string,
) => {
  const offsetX = (scrollX % gridSize) - gridSize;
  const offsetY = (scrollY % gridSize) - gridSize;

  const actualGridSize = gridSize * zoom.value;
  // Match the grid's density guard: below this the rules crowd into a haze.
  if (actualGridSize < 10) {
    return;
  }

  context.save();
  // Crisp 1px lines at 100% zoom, per the grid's own offset trick.
  if (zoom.value === 1) {
    context.translate(offsetX % 1 ? 0 : 0.5, offsetY % 1 ? 0 : 0.5);
  }

  context.lineWidth = 1 / zoom.value;
  context.strokeStyle = colorOverride || GridLineColor[theme].regular;

  // Horizontal rules only — the lined-paper variant of the grid.
  for (let y = offsetY; y < offsetY + height + gridSize * 2; y += gridSize) {
    context.beginPath();
    context.moveTo(offsetX - gridSize, y);
    context.lineTo(Math.ceil(offsetX + width + gridSize * 2), y);
    context.stroke();
  }

  // Left margin rule: scene x = 0 is at screen x = scrollX (the context is zoom-
  // scaled but not scroll-translated, so scrollX is its screen coordinate). Only
  // draw it when the page's left edge is actually within the visible span.
  const marginX = scrollX;
  if (marginX >= offsetX && marginX <= offsetX + width + gridSize * 2) {
    context.beginPath();
    context.lineWidth = Math.max(1 / zoom.value, 1.5 / zoom.value);
    // Margin follows the chosen rule color when set; otherwise the Syntropy
    // infrared accent — the notebook's red rule.
    context.strokeStyle = colorOverride || RULED_MARGIN_COLORS[theme];
    context.moveTo(marginX, offsetY - gridSize);
    context.lineTo(marginX, Math.ceil(offsetY + height + gridSize * 2));
    context.stroke();
  }

  context.restore();
};

export const frameClip = (
  frame: ExcalidrawFrameLikeElement,
  context: CanvasRenderingContext2D,
  renderConfig: StaticCanvasRenderConfig,
  appState: StaticCanvasAppState,
) => {
  context.translate(frame.x + appState.scrollX, frame.y + appState.scrollY);
  context.beginPath();
  if (context.roundRect) {
    context.roundRect(
      0,
      0,
      frame.width,
      frame.height,
      FRAME_STYLE.radius / appState.zoom.value,
    );
  } else {
    context.rect(0, 0, frame.width, frame.height);
  }
  context.clip();
  context.translate(
    -(frame.x + appState.scrollX),
    -(frame.y + appState.scrollY),
  );
};

type LinkIconCanvas = HTMLCanvasElement & { zoom: number };

const linkIconCanvasCache: {
  regularLink: LinkIconCanvas | null;
  elementLink: LinkIconCanvas | null;
} = {
  regularLink: null,
  elementLink: null,
};

const renderLinkIcon = (
  element: NonDeletedExcalidrawElement,
  context: CanvasRenderingContext2D,
  appState: StaticCanvasAppState,
  elementsMap: ElementsMap,
) => {
  if (
    element.link &&
    !isSyntropyLinkElement(element) &&
    !appState.selectedElementIds[element.id]
  ) {
    const [x1, y1, x2, y2] = getElementAbsoluteCoords(element, elementsMap);
    const [x, y, width, height] = getLinkHandleFromCoords(
      [x1, y1, x2, y2],
      element.angle,
      appState,
    );
    const centerX = x + width / 2;
    const centerY = y + height / 2;
    context.save();
    context.translate(appState.scrollX + centerX, appState.scrollY + centerY);
    context.rotate(element.angle);

    const canvasKey = isElementLink(element.link)
      ? "elementLink"
      : "regularLink";

    let linkCanvas = linkIconCanvasCache[canvasKey];

    if (!linkCanvas || linkCanvas.zoom !== appState.zoom.value) {
      linkCanvas = Object.assign(document.createElement("canvas"), {
        zoom: appState.zoom.value,
      });
      linkCanvas.width = width * window.devicePixelRatio * appState.zoom.value;
      linkCanvas.height =
        height * window.devicePixelRatio * appState.zoom.value;
      linkIconCanvasCache[canvasKey] = linkCanvas;

      const linkCanvasCacheContext = linkCanvas.getContext("2d")!;
      linkCanvasCacheContext.scale(
        window.devicePixelRatio * appState.zoom.value,
        window.devicePixelRatio * appState.zoom.value,
      );

      // Seed a sane default so a corrupted color (silently rejected by the
      // canvas) falls back to white instead of a stale fillStyle.
      linkCanvasCacheContext.fillStyle = COLOR_WHITE;
      linkCanvasCacheContext.fillStyle =
        appState.viewBackgroundColor || COLOR_WHITE;

      linkCanvasCacheContext.fillRect(0, 0, width, height);

      if (canvasKey === "elementLink") {
        linkCanvasCacheContext.drawImage(ELEMENT_LINK_IMG, 0, 0, width, height);
      } else {
        linkCanvasCacheContext.drawImage(
          EXTERNAL_LINK_IMG,
          0,
          0,
          width,
          height,
        );
      }

      linkCanvasCacheContext.restore();
    }
    context.globalAlpha = element.opacity / 100;
    context.drawImage(linkCanvas, x - centerX, y - centerY, width, height);
    context.restore();
  }
};
const _renderStaticScene = ({
  canvas,
  rc,
  elementsMap,
  allElementsMap,
  visibleElements,
  scale,
  appState,
  renderConfig,
}: StaticSceneRenderConfig) => {
  if (canvas === null) {
    return;
  }

  const {
    renderGrid = true,
    renderDotGrid = false,
    renderRuled = false,
    isExporting,
  } = renderConfig;

  const [normalizedWidth, normalizedHeight] = getNormalizedCanvasDimensions(
    canvas,
    scale,
  );

  const context = bootstrapCanvas({
    canvas,
    scale,
    normalizedWidth,
    normalizedHeight,
    theme: appState.theme,
    isExporting,
    viewBackgroundColor: appState.viewBackgroundColor,
    // A free-picked paper color paints literally; otherwise the dark-mode
    // filter keeps the default board dark in dark theme.
    bypassDarkFilter: appState.paperBgOverride === true,
  });

  // Apply zoom
  context.scale(appState.zoom.value, appState.zoom.value);

  // Board texture. Only when the ruled grid is off, so the two never stack.
  if (renderDotGrid && !renderGrid) {
    strokeDotGrid(
      context,
      appState.scrollX,
      appState.scrollY,
      appState.zoom,
      renderConfig.theme,
      normalizedWidth / appState.zoom.value,
      normalizedHeight / appState.zoom.value,
      // Dots follow the paper spacing (gridSize) + free-picked color.
      appState.gridSize,
      appState.paperColor || undefined,
    );
  }

  // GoodNotes-style ruled (lined) paper. Mutually exclusive with the grid and dots —
  // the paper picker only sets one texture at a time.
  if (renderRuled && !renderGrid && !renderDotGrid) {
    strokeRuledLines(
      context,
      appState.gridSize,
      appState.scrollX,
      appState.scrollY,
      appState.zoom,
      renderConfig.theme,
      normalizedWidth / appState.zoom.value,
      normalizedHeight / appState.zoom.value,
      appState.paperColor || undefined,
    );
  }

  // Grid
  if (renderGrid) {
    strokeGrid(
      context,
      appState.gridSize,
      appState.gridStep,
      appState.scrollX,
      appState.scrollY,
      appState.zoom,
      renderConfig.theme,
      normalizedWidth / appState.zoom.value,
      normalizedHeight / appState.zoom.value,
      appState.paperColor || undefined,
    );
  }

  const groupsToBeAddedToFrame = new Set<string>();

  visibleElements.forEach((element) => {
    if (
      element.groupIds.length > 0 &&
      appState.frameToHighlight &&
      appState.selectedElementIds[element.id] &&
      (elementOverlapsWithFrame(
        element,
        appState.frameToHighlight,
        elementsMap,
      ) ||
        element.groupIds.find((groupId) => groupsToBeAddedToFrame.has(groupId)))
    ) {
      element.groupIds.forEach((groupId) =>
        groupsToBeAddedToFrame.add(groupId),
      );
    }
  });

  const inFrameGroupsMap = new Map<string, boolean>();

  // Paint visible elements
  visibleElements
    .filter((el) => !isIframeLikeElement(el))
    .forEach((element) => {
      try {
        const frameId = element.frameId || appState.frameToHighlight?.id;

        if (
          isTextElement(element) &&
          element.containerId &&
          elementsMap.has(element.containerId)
        ) {
          // will be rendered with the container
          return;
        }

        context.save();

        if (
          frameId &&
          appState.frameRendering.enabled &&
          appState.frameRendering.clip
        ) {
          const frame = getTargetFrame(element, elementsMap, appState);
          if (
            frame &&
            shouldApplyFrameClip(
              element,
              frame,
              appState,
              elementsMap,
              inFrameGroupsMap,
            )
          ) {
            frameClip(frame, context, renderConfig, appState);
          }
          renderElement(
            element,
            elementsMap,
            allElementsMap,
            rc,
            context,
            renderConfig,
            appState,
          );
        } else {
          renderElement(
            element,
            elementsMap,
            allElementsMap,
            rc,
            context,
            renderConfig,
            appState,
          );
        }

        const boundTextElement = getBoundTextElement(element, elementsMap);
        if (boundTextElement) {
          renderElement(
            boundTextElement,
            elementsMap,
            allElementsMap,
            rc,
            context,
            renderConfig,
            appState,
          );
        }

        context.restore();

        if (!isExporting && renderConfig.renderLinks !== false) {
          renderLinkIcon(element, context, appState, elementsMap);
        }
      } catch (error: any) {
        console.error(
          error,
          element.id,
          element.x,
          element.y,
          element.width,
          element.height,
        );
      }
    });

  // render embeddables on top
  visibleElements
    .filter((el) => isIframeLikeElement(el))
    .forEach((element) => {
      try {
        const render = () => {
          renderElement(
            element,
            elementsMap,
            allElementsMap,
            rc,
            context,
            renderConfig,
            appState,
          );

          if (
            isIframeLikeElement(element) &&
            (isExporting ||
              (isEmbeddableElement(element) &&
                renderConfig.embedsValidationStatus.get(element.id) !==
                  true)) &&
            element.width &&
            element.height
          ) {
            const label = createPlaceholderEmbeddableLabel(element);
            renderElement(
              label,
              elementsMap,
              allElementsMap,
              rc,
              context,
              renderConfig,
              appState,
            );
          }
          if (!isExporting && renderConfig.renderLinks !== false) {
            renderLinkIcon(element, context, appState, elementsMap);
          }
        };
        // - when exporting the whole canvas, we DO NOT apply clipping
        // - when we are exporting a particular frame, apply clipping
        //   if the containing frame is not selected, apply clipping
        const frameId = element.frameId || appState.frameToHighlight?.id;

        if (
          frameId &&
          appState.frameRendering.enabled &&
          appState.frameRendering.clip
        ) {
          context.save();

          const frame = getTargetFrame(element, elementsMap, appState);

          if (
            frame &&
            shouldApplyFrameClip(
              element,
              frame,
              appState,
              elementsMap,
              inFrameGroupsMap,
            )
          ) {
            frameClip(frame, context, renderConfig, appState);
          }
          render();
          context.restore();
        } else {
          render();
        }
      } catch (error: any) {
        console.error(error);
      }
    });

  // render pending nodes for flowcharts
  renderConfig.pendingFlowchartNodes?.forEach((element) => {
    try {
      renderElement(
        element,
        elementsMap,
        allElementsMap,
        rc,
        context,
        renderConfig,
        appState,
      );
    } catch (error) {
      console.error(error);
    }
  });
};

/** throttled to animation framerate */
export const renderStaticSceneThrottled = throttleRAF(
  (config: StaticSceneRenderConfig) => {
    _renderStaticScene(config);
  },
);

/**
 * Static scene is the non-ui canvas where we render elements.
 */
export const renderStaticScene = (
  renderConfig: StaticSceneRenderConfig,
  throttle?: boolean,
) => {
  if (throttle) {
    renderStaticSceneThrottled(renderConfig);
    return;
  }

  _renderStaticScene(renderConfig);
};
