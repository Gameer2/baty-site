import { type ElementUpdate, newElementWith } from "./mutateElement";

import type { ExcalidrawElement } from "./types";

/** How a set of elements should be arranged around a center point. */
export type LayoutMode = "row" | "column" | "grid" | "stacked";

/**
 * Position `elements` around (`centerX`, `centerY`) according to `mode`.
 *
 * Unlike {@link positionElementsOnGrid} (which always picks a roughly-square
 * grid), this lets the caller choose the arrangement — used by PDF import,
 * where the user decides how the pages spread across the board.
 *
 * - `row` — single horizontal line, vertically centered
 * - `column` — single vertical line, horizontally centered
 * - `grid` — `columns`-wide grid (defaults to a roughly-square count)
 * - `stacked` — every element overlapping at the center point
 *
 * `gap` is in scene units. Each element keeps its own width/height and is only
 * translated; nothing else is mutated.
 */
export const positionElementsInLayout = <TElement extends ExcalidrawElement>(
  elements: TElement[],
  centerX: number,
  centerY: number,
  mode: LayoutMode,
  gap = 50,
  columns?: number,
): TElement[] => {
  if (elements.length === 0) {
    return [];
  }

  const boxes = elements.map((el) => ({
    el,
    w: Math.abs(el.width),
    h: Math.abs(el.height),
  }));

  // returns a new element moved to top-left (x, y)
  const place = (box: typeof boxes[number], x: number, y: number) =>
    newElementWith(box.el, {
      x: box.el.x + (x - box.el.x),
      y: box.el.y + (y - box.el.y),
    } as ElementUpdate<TElement>);

  if (mode === "stacked") {
    return boxes.map((box) =>
      place(box, centerX - box.w / 2, centerY - box.h / 2),
    );
  }

  if (mode === "row") {
    const totalW =
      boxes.reduce((sum, b) => sum + b.w, 0) + gap * (boxes.length - 1);
    let cursorX = centerX - totalW / 2;
    return boxes.map((box) => {
      const placed = place(box, cursorX, centerY - box.h / 2);
      cursorX += box.w + gap;
      return placed;
    });
  }

  if (mode === "column") {
    const totalH =
      boxes.reduce((sum, b) => sum + b.h, 0) + gap * (boxes.length - 1);
    let cursorY = centerY - totalH / 2;
    return boxes.map((box) => {
      const placed = place(box, centerX - box.w / 2, cursorY);
      cursorY += box.h + gap;
      return placed;
    });
  }

  // grid
  const n = boxes.length;
  const cols = Math.max(1, columns ?? Math.ceil(Math.sqrt(n)));
  const rows = Math.ceil(n / cols);

  // group into rows
  const rowGroups: typeof boxes[] = [];
  for (let i = 0; i < n; i += cols) {
    rowGroups.push(boxes.slice(i, i + cols));
  }

  const rowWidths = rowGroups.map(
    (row) => row.reduce((sum, b) => sum + b.w, 0) + gap * (row.length - 1),
  );
  const rowHeights = rowGroups.map((row) =>
    row.reduce((m, b) => Math.max(m, b.h), 0),
  );

  const totalW = Math.max(...rowWidths);
  const totalH = rowHeights.reduce((sum, h) => sum + h, 0) + gap * (rows - 1);

  const startLeft = centerX - totalW / 2;
  let cursorY = centerY - totalH / 2;

  const placed: TElement[] = [];
  rowGroups.forEach((row, r) => {
    const rowWidth = rowWidths[r];
    let cursorX = startLeft + (totalW - rowWidth) / 2; // center each row
    row.forEach((box) => {
      placed.push(place(box, cursorX, cursorY + (rowHeights[r] - box.h) / 2));
      cursorX += box.w + gap;
    });
    cursorY += rowHeights[r] + gap;
  });

  return placed;
};
