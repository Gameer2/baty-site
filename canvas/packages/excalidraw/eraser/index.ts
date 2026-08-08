import {
  arrayToMap,
  easeOut,
  DEFAULT_ERASER_SIZE,
  THEME,
} from "@excalidraw/common";

import {
  computeBoundTextPosition,
  doBoundsIntersect,
  getBoundTextElement,
  getElementBounds,
  getElementLineSegments,
  getFreedrawOutlineAsSegments,
  getFreedrawOutlinePoints,
  hasBackground,
  intersectElementWithLineSegment,
  isArrowElement,
  isFreeDrawElement,
  isIframeLikeElement,
  isLineElement,
  isPathALoop,
  isPointInElement,
  isTextElement,
} from "@excalidraw/element";
import {
  distanceToLineSegment,
  lineSegment,
  lineSegmentsDistance,
  pointDistance,
  pointFrom,
  polygon,
  polygonIncludesPointNonZero,
} from "@excalidraw/math";

import { getElementsInGroup } from "@excalidraw/element";

import { hasBoundTextElement, isBoundToContainer } from "@excalidraw/element";
import { getBoundTextElementId } from "@excalidraw/element";

import type { Bounds } from "@excalidraw/common";

import type { GlobalPoint, LineSegment } from "@excalidraw/math/types";
import type { ElementsMap, ExcalidrawElement } from "@excalidraw/element/types";

import { AnimatedTrail } from "../animatedTrail";

import { findTouchedOriginalIndices } from "./splitStrokeElement";

import type App from "../components/App";

export class EraserTrail extends AnimatedTrail {
  private elementsToErase: Set<ExcalidrawElement["id"]> = new Set();
  private groupsToErase: Set<ExcalidrawElement["id"]> = new Set();
  // Point indices — always into the element's own, real, unmodified `points` array, never a
  // synthetic/densified one — of freedraw/non-polygon-line elements the eraser circle has
  // actually passed over during the current gesture. Used by "precision" mode (App.tsx's
  // eraseElements) to cut just those points out instead of deleting the whole element. Survives
  // past endPath() (only startPath() clears it) since App.tsx reads it right after endPath().
  private touchedPointIndices: Map<ExcalidrawElement["id"], Set<number>> =
    new Map();

  constructor(app: App) {
    super(app, {
      streamline: 0.2,
      // NOT app.state.currentItemEraserSize here: `App` assigns `eraserTrail = new
      // EraserTrail(this)` as a class field, which (per JS class-field ordering) runs before
      // `this.state = {...}` in App's own constructor — app.state is still undefined at this
      // point. startPath() below re-reads the real value before every stroke, so this initial
      // value is only ever a placeholder.
      size: DEFAULT_ERASER_SIZE,
      keepHead: true,
      sizeMapping: (c) => {
        const DECAY_TIME = 200;
        const DECAY_LENGTH = 10;
        const t = Math.max(
          0,
          1 - (performance.now() - c.pressure) / DECAY_TIME,
        );
        const l =
          (DECAY_LENGTH -
            Math.min(DECAY_LENGTH, c.totalLength - c.currentIndex)) /
          DECAY_LENGTH;

        return Math.min(easeOut(l), easeOut(t));
      },
      fill: () =>
        app.state.theme === THEME.LIGHT
          ? "rgba(0, 0, 0, 0.2)"
          : "rgba(255, 255, 255, 0.2)",
    });
  }

  startPath(x: number, y: number): void {
    this.endPath();
    // Read fresh each stroke rather than once at construction — EraserTrail is a long-lived
    // instance (one per App), so a size change in the eraser's settings panel between strokes
    // needs to apply without recreating the trail.
    this.options.size =
      this.app.state.currentItemEraserSize ?? DEFAULT_ERASER_SIZE;
    super.startPath(x, y);
    this.elementsToErase.clear();
    this.touchedPointIndices.clear();
  }

  private getEraserSizePx(): number {
    return this.app.state.currentItemEraserSize ?? DEFAULT_ERASER_SIZE;
  }

  // Only used as a safety-net sampling interval for findTouchedOriginalIndices — bounds how far
  // apart two raw points can be before a touch landing between them risks being missed. Never
  // ends up as an actual point in the stroke's stored geometry.
  private maxSegmentLengthFor(eraserRadius: number): number {
    return Math.max(1, eraserRadius / 2);
  }

  /** Real point indices — into `elementId`'s own `points` array, nothing synthetic — that the
   *  eraser circle has passed over during the current (or just-finished) gesture, or undefined if
   *  none / not applicable. */
  getTouchedPoints(
    elementId: ExcalidrawElement["id"],
  ): Set<number> | undefined {
    return this.touchedPointIndices.get(elementId);
  }

  /** Marks `element`'s points within `eraserRadius` of `point` as touched — for a zero-distance
   *  tap (click with no drag), which never runs addPointToPath/accumulateTouchedPointIndices
   *  since there's no path segment to sweep. Without this, precision taps would find no touched
   *  points and fall back to deleting the whole element, same as stroke mode. */
  markTouchedPointsNear(
    element: ExcalidrawElement,
    point: GlobalPoint,
    eraserRadius: number,
  ): void {
    if (
      !(
        isFreeDrawElement(element) ||
        (isLineElement(element) && !element.polygon)
      )
    ) {
      return;
    }

    const newlyTouched = findTouchedOriginalIndices(
      element.points,
      this.maxSegmentLengthFor(eraserRadius),
      (p) => {
        const globalPoint = pointFrom<GlobalPoint>(
          element.x + p[0],
          element.y + p[1],
        );
        return pointDistance(globalPoint, point) <= eraserRadius;
      },
    );

    if (newlyTouched.size === 0) {
      return;
    }

    let touched = this.touchedPointIndices.get(element.id);
    if (!touched) {
      touched = new Set();
      this.touchedPointIndices.set(element.id, touched);
    }
    for (const index of newlyTouched) {
      touched.add(index);
    }
  }

  addPointToPath(x: number, y: number, restore = false) {
    super.addPointToPath(x, y);

    const elementsToEraser = this.updateElementsToBeErased(restore);

    return elementsToEraser;
  }

  private updateElementsToBeErased(restoreToErase?: boolean) {
    const eraserPath: GlobalPoint[] =
      super
        .getCurrentTrail()
        ?.originalPoints?.map((p) => pointFrom<GlobalPoint>(p[0], p[1])) || [];

    if (eraserPath.length < 2) {
      return [];
    }

    // for efficiency and avoid unnecessary calculations,
    // take only POINTS_ON_TRAIL points to form some number of segments
    const pathSegment = lineSegment<GlobalPoint>(
      eraserPath[eraserPath.length - 1],
      eraserPath[eraserPath.length - 2],
    );

    const candidateElements = this.app.visibleElements.filter(
      (el) => !el.locked,
    );

    const candidateElementsMap = arrayToMap(candidateElements);

    const eraserRadius = this.getEraserSizePx() / 2 / this.app.state.zoom.value;

    for (const element of candidateElements) {
      // restore only if already added to the to-be-erased set
      if (restoreToErase && this.elementsToErase.has(element.id)) {
        const intersects = eraserTest(
          pathSegment,
          element,
          candidateElementsMap,
          this.app.state.zoom.value,
          eraserRadius,
        );

        if (intersects) {
          const shallowestGroupId = element.groupIds.at(-1)!;

          if (this.groupsToErase.has(shallowestGroupId)) {
            const elementsInGroup = getElementsInGroup(
              this.app.scene.getNonDeletedElementsMap(),
              shallowestGroupId,
            );
            for (const elementInGroup of elementsInGroup) {
              this.elementsToErase.delete(elementInGroup.id);
            }
            this.groupsToErase.delete(shallowestGroupId);
          }

          if (isBoundToContainer(element)) {
            this.elementsToErase.delete(element.containerId);
          }

          if (hasBoundTextElement(element)) {
            const boundText = getBoundTextElementId(element);

            if (boundText) {
              this.elementsToErase.delete(boundText);
            }
          }

          this.elementsToErase.delete(element.id);
        }
      } else if (!restoreToErase && !this.elementsToErase.has(element.id)) {
        const intersects = eraserTest(
          pathSegment,
          element,
          candidateElementsMap,
          this.app.state.zoom.value,
          eraserRadius,
        );

        if (intersects) {
          const shallowestGroupId = element.groupIds.at(-1)!;

          if (!this.groupsToErase.has(shallowestGroupId)) {
            const elementsInGroup = getElementsInGroup(
              this.app.scene.getNonDeletedElementsMap(),
              shallowestGroupId,
            );

            for (const elementInGroup of elementsInGroup) {
              this.elementsToErase.add(elementInGroup.id);
            }
            this.groupsToErase.add(shallowestGroupId);
          }

          if (hasBoundTextElement(element)) {
            const boundText = getBoundTextElementId(element);

            if (boundText) {
              this.elementsToErase.add(boundText);
            }
          }

          if (isBoundToContainer(element)) {
            this.elementsToErase.add(element.containerId);
          }

          this.elementsToErase.add(element.id);
        }
      }
    }

    if (this.app.state.currentItemEraserMode !== "stroke") {
      this.accumulateTouchedPointIndices(
        candidateElements,
        candidateElementsMap,
        pathSegment,
        eraserRadius,
      );
    }

    return Array.from(this.elementsToErase);
  }

  // Runs independently of the elementsToErase bookkeeping above — that logic skips re-testing an
  // element once it's already marked, but a long stroke keeps needing new points marked as the
  // eraser continues sweeping across it on later frames.
  private accumulateTouchedPointIndices(
    candidateElements: readonly ExcalidrawElement[],
    candidateElementsMap: ElementsMap,
    pathSegment: LineSegment<GlobalPoint>,
    eraserRadius: number,
  ) {
    for (const element of candidateElements) {
      if (
        !(
          isFreeDrawElement(element) ||
          (isLineElement(element) && !element.polygon)
        )
      ) {
        continue;
      }

      if (
        !eraserTest(
          pathSegment,
          element,
          candidateElementsMap,
          this.app.state.zoom.value,
          eraserRadius,
        )
      ) {
        continue;
      }

      const newlyTouched = findTouchedOriginalIndices(
        element.points,
        this.maxSegmentLengthFor(eraserRadius),
        (point) => {
          // Distance from the point to the whole swept segment, not just its trailing tip — a
          // fast/coarse drag (or a synthetic one) can jump several points between frames, and a
          // tip-only check would miss everything the eraser visually passed over in between.
          const globalPoint = pointFrom<GlobalPoint>(
            element.x + point[0],
            element.y + point[1],
          );
          return (
            distanceToLineSegment(globalPoint, pathSegment) <= eraserRadius
          );
        },
      );

      if (newlyTouched.size === 0) {
        continue;
      }

      let touched = this.touchedPointIndices.get(element.id);
      if (!touched) {
        touched = new Set();
        this.touchedPointIndices.set(element.id, touched);
      }
      for (const index of newlyTouched) {
        touched.add(index);
      }
    }
  }

  endPath(): void {
    super.endPath();
    super.clearTrails();
    this.elementsToErase.clear();
    this.groupsToErase.clear();
  }
}

// Like packages/element/src/collision.ts's shouldTestInside, but without its "background must
// not be transparent" requirement — for click/drag hit-testing that gate is correct (you
// shouldn't be able to drag an unfilled rectangle from its empty middle), but for erasing, a
// user scribbling through the middle of an outline-only shape clearly means to erase it. Kept
// local to the eraser rather than changing the shared predicate, which selection/dragging still
// needs unchanged.
export const isErasableFromInside = (element: ExcalidrawElement): boolean => {
  if (element.type === "arrow") {
    return false;
  }

  const isErasableFromInsideShape =
    hasBackground(element.type) ||
    hasBoundTextElement(element) ||
    isIframeLikeElement(element) ||
    isTextElement(element);

  if (element.type === "line" || element.type === "freedraw") {
    return isErasableFromInsideShape && isPathALoop(element.points);
  }

  return isErasableFromInsideShape;
};

const eraserTest = (
  pathSegment: LineSegment<GlobalPoint>,
  element: ExcalidrawElement,
  elementsMap: ElementsMap,
  zoom: number,
  eraserRadius: number,
): boolean => {
  const lastPoint = pathSegment[1];

  // PERF: Do a quick bounds intersection test first because it's cheap
  const threshold =
    (isFreeDrawElement(element) ? 15 : element.strokeWidth / 2) + eraserRadius;
  const segmentBounds = [
    Math.min(pathSegment[0][0], pathSegment[1][0]) - threshold,
    Math.min(pathSegment[0][1], pathSegment[1][1]) - threshold,
    Math.max(pathSegment[0][0], pathSegment[1][0]) + threshold,
    Math.max(pathSegment[0][1], pathSegment[1][1]) + threshold,
  ] as Bounds;
  const origElementBounds = getElementBounds(element, elementsMap);
  const elementBounds: Bounds = [
    origElementBounds[0] - threshold,
    origElementBounds[1] - threshold,
    origElementBounds[2] + threshold,
    origElementBounds[3] + threshold,
  ];

  if (!doBoundsIntersect(segmentBounds, elementBounds)) {
    return false;
  }

  // There are shapes where the inner area should trigger erasing
  // even though the eraser path segment doesn't intersect with or
  // get close to the shape's stroke
  if (
    isErasableFromInside(element) &&
    isPointInElement(lastPoint, element, elementsMap)
  ) {
    return true;
  }

  // Freedraw elements are tested for erasure by measuring the distance
  // of the eraser path and the freedraw shape outline lines to a tolerance
  // which offers a good visual precision at various zoom levels
  if (isFreeDrawElement(element)) {
    const outlinePoints = getFreedrawOutlinePoints(element);
    const strokeSegments = getFreedrawOutlineAsSegments(
      element,
      outlinePoints,
      elementsMap,
    );
    const tolerance = Math.max(2.25, 5 / zoom) + eraserRadius; // NOTE: Visually fine-tuned approximation

    for (const seg of strokeSegments) {
      if (lineSegmentsDistance(seg, pathSegment) <= tolerance) {
        return true;
      }
    }

    const poly = polygon(
      ...(outlinePoints.map(([x, y]) =>
        pointFrom<GlobalPoint>(element.x + x, element.y + y),
      ) as GlobalPoint[]),
    );

    // PERF: Check only one point of the eraser segment. If the eraser segment
    // start is inside the closed freedraw shape, the other point is either also
    // inside or the eraser segment will intersect the shape outline anyway
    if (polygonIncludesPointNonZero(pathSegment[0], poly)) {
      return true;
    }

    return false;
  }

  const boundTextElement = getBoundTextElement(element, elementsMap);

  if (isArrowElement(element) || (isLineElement(element) && !element.polygon)) {
    const tolerance =
      Math.max(element.strokeWidth, (element.strokeWidth * 2) / zoom) +
      eraserRadius;

    // If the eraser movement is so fast that a large distance is covered
    // between the last two points, the distanceToElement miss, so we test
    // agaist each segment of the linear element
    const segments = getElementLineSegments(element, elementsMap);
    for (const seg of segments) {
      if (lineSegmentsDistance(seg, pathSegment) <= tolerance) {
        return true;
      }
    }

    return false;
  }

  return (
    intersectElementWithLineSegment(
      element,
      elementsMap,
      pathSegment,
      eraserRadius,
      true,
    ).length > 0 ||
    (!!boundTextElement &&
      intersectElementWithLineSegment(
        {
          ...boundTextElement,
          ...computeBoundTextPosition(element, boundTextElement, elementsMap),
        },
        elementsMap,
        pathSegment,
        eraserRadius,
        true,
      ).length > 0)
  );
};
