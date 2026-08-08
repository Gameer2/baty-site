import { pointFrom, pointDistance } from "@excalidraw/math";

import { deepCopyElement } from "@excalidraw/element";

import { bumpVersion } from "@excalidraw/element";

import { randomId } from "@excalidraw/common";

import type { Mutable } from "@excalidraw/common/utility-types";

import type { LocalPoint } from "@excalidraw/math/types";
import type {
  ExcalidrawFreeDrawElement,
  ExcalidrawLinearElement,
} from "@excalidraw/element/types";

export type SplittableStrokeElement =
  | ExcalidrawFreeDrawElement
  | ExcalidrawLinearElement;

// A run shorter than this is dropped rather than kept as its own element — a 1-point leftover
// after erasing is stray dust, not a stroke worth preserving.
const MIN_RUN_POINTS = 2;

/**
 * Finds which of `points`' ORIGINAL indices the eraser touched, per `isTouched`. Never invents
 * new points and never returns anything but real indices into `points` — the returned set is fed
 * straight into getSurvivingRuns/buildStrokePieceFromRun below, so an earlier version of this that
 * inserted interpolated points into the actual cut geometry ended up reshaping every stroke with
 * any segment longer than the eraser's own radius (i.e. most real hand-drawn strokes), not just
 * the part actually erased.
 *
 * The wrinkle `isTouched(points[i])` alone can't handle: a stroke drawn quickly (or a straight
 * 2-point line) can have raw samples spaced much farther apart than a small eraser circle, so a
 * touch landing in the middle of one long segment would test false at both of its endpoints and
 * be missed entirely — the caller (App.tsx's eraseElements) would then find nothing touched and
 * fall back to deleting the whole element. So: any segment longer than `maxSegmentLength` also
 * gets sampled at several interior points. Each touched sample marks only whichever of the
 * segment's two real endpoints it's nearer to — NOT both automatically — so a touch near one edge
 * of a long segment trims that edge without also dragging in, and removing, the far endpoint (and
 * therefore everything past it, since a run only survives while contiguous). Both endpoints only
 * end up marked if touched samples are found on both halves of the segment.
 */
export const findTouchedOriginalIndices = (
  points: SplittableStrokeElement["points"],
  maxSegmentLength: number,
  isTouched: (point: LocalPoint) => boolean,
): Set<number> => {
  const touched = new Set<number>();

  points.forEach((point, index) => {
    if (isTouched(point)) {
      touched.add(index);
    }
  });

  if (maxSegmentLength > 0) {
    for (let i = 1; i < points.length; i++) {
      if (touched.has(i - 1) && touched.has(i)) {
        continue;
      }

      const [x1, y1] = points[i - 1];
      const [x2, y2] = points[i];
      const segmentLength = pointDistance(points[i - 1], points[i]);

      if (segmentLength <= maxSegmentLength) {
        continue;
      }

      const steps = Math.ceil(segmentLength / maxSegmentLength);
      for (let step = 1; step < steps; step++) {
        const t = step / steps;
        const sample = pointFrom<LocalPoint>(
          x1 + (x2 - x1) * t,
          y1 + (y2 - y1) * t,
        );
        if (isTouched(sample)) {
          touched.add(t < 0.5 ? i - 1 : i);
        }
      }
    }
  }

  return touched;
};

/**
 * Splits [0, pointCount) into the contiguous runs of indices NOT in removedIndices — i.e. the
 * pieces of the stroke that survive erasing. Runs shorter than MIN_RUN_POINTS are dropped.
 */
export const getSurvivingRuns = (
  pointCount: number,
  removedIndices: ReadonlySet<number>,
): number[][] => {
  const runs: number[][] = [];
  let current: number[] = [];
  for (let i = 0; i < pointCount; i++) {
    if (removedIndices.has(i)) {
      if (current.length >= MIN_RUN_POINTS) {
        runs.push(current);
      }
      current = [];
    } else {
      current.push(i);
    }
  }
  if (current.length >= MIN_RUN_POINTS) {
    runs.push(current);
  }
  return runs;
};

/**
 * Builds a new, independent stroke element from a contiguous run of an existing element's point
 * indices — re-based to its own x/y origin and width/height, a fresh id, all other styling
 * (color, width, roughness, groupIds, …) carried over unchanged. `pressures` (freedraw only) is
 * sliced in parallel with `points`.
 */
export const buildStrokePieceFromRun = <T extends SplittableStrokeElement>(
  element: T,
  run: number[],
): T => {
  const absPoints = run.map((i): [number, number] => [
    element.x + element.points[i][0],
    element.y + element.points[i][1],
  ]);
  const minX = Math.min(...absPoints.map((p) => p[0]));
  const minY = Math.min(...absPoints.map((p) => p[1]));
  const maxX = Math.max(...absPoints.map((p) => p[0]));
  const maxY = Math.max(...absPoints.map((p) => p[1]));

  const piece = deepCopyElement(element);
  piece.id = randomId();
  piece.x = minX;
  piece.y = minY;
  piece.width = Math.max(1, maxX - minX);
  piece.height = Math.max(1, maxY - minY);
  piece.points = absPoints.map(([x, y]) =>
    pointFrom<LocalPoint>(x - minX, y - minY),
  );

  if (piece.type === "freedraw") {
    const freedrawElement = element as unknown as ExcalidrawFreeDrawElement;
    (piece as unknown as Mutable<ExcalidrawFreeDrawElement>).pressures =
      run.map((i) => freedrawElement.pressures[i]);
  }

  bumpVersion(piece);

  return piece;
};
