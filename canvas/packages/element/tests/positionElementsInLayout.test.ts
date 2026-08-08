import { positionElementsInLayout } from "../src/positionElementsInLayout";

import type { ExcalidrawElement } from "../src/types";

/** minimal element stand-in — positionElementsInLayout only reads x/y/w/h */
const el = (id: string, x: number, y: number, w: number, h: number) =>
  ({ id, x, y, width: w, height: h } as unknown as ExcalidrawElement);

const dims = (e: ExcalidrawElement) => ({
  x: e.x,
  y: e.y,
  w: e.width,
  h: e.height,
});

describe("positionElementsInLayout", () => {
  it("returns [] for empty input", () => {
    expect(positionElementsInLayout([], 0, 0, "grid")).toEqual([]);
  });

  it("stacks every element overlapping at the center", () => {
    const els = [el("a", 0, 0, 100, 50), el("b", 999, 999, 40, 80)];
    const out = positionElementsInLayout(els, 1000, 1000, "stacked", 0);
    // each centered on (1000, 1000): top-left = center - w/2, center - h/2
    expect(dims(out[0])).toEqual({ x: 950, y: 975, w: 100, h: 50 });
    expect(dims(out[1])).toEqual({ x: 980, y: 960, w: 40, h: 80 });
  });

  it("lays elements out in a single horizontal row, centered", () => {
    const els = [el("a", 0, 0, 100, 50), el("b", 0, 0, 100, 50)];
    const out = positionElementsInLayout(els, 0, 0, "row", 20);
    // total width = 100 + 20 + 100 = 220, starts at -110
    expect(dims(out[0])).toEqual({ x: -110, y: -25, w: 100, h: 50 });
    expect(dims(out[1])).toEqual({ x: 10, y: -25, w: 100, h: 50 });
  });

  it("lays elements out in a single vertical column, centered", () => {
    const els = [el("a", 0, 0, 50, 100), el("b", 0, 0, 50, 100)];
    const out = positionElementsInLayout(els, 0, 0, "column", 20);
    // total height = 100 + 20 + 100 = 220, starts at -110
    expect(dims(out[0])).toEqual({ x: -25, y: -110, w: 50, h: 100 });
    expect(dims(out[1])).toEqual({ x: -25, y: 10, w: 50, h: 100 });
  });

  it("lays elements out in a grid with the requested column count", () => {
    const els = [
      el("a", 0, 0, 100, 100),
      el("b", 0, 0, 100, 100),
      el("c", 0, 0, 100, 100),
      el("d", 0, 0, 100, 100),
    ];
    const out = positionElementsInLayout(els, 0, 0, "grid", 10, 2);
    // 2x2 grid of 100x100 with 10px gap: total 210x210, top-left (-105,-105)
    // row 0: a at (-105,-105), b at (5,-105)
    // row 1: c at (-105,5),  d at (5,5)
    expect(dims(out[0])).toEqual({ x: -105, y: -105, w: 100, h: 100 });
    expect(dims(out[1])).toEqual({ x: 5, y: -105, w: 100, h: 100 });
    expect(dims(out[2])).toEqual({ x: -105, y: 5, w: 100, h: 100 });
    expect(dims(out[3])).toEqual({ x: 5, y: 5, w: 100, h: 100 });
  });

  it("preserves element identity/order and only translates", () => {
    const els = [el("a", 5, 5, 100, 100), el("b", 50, 50, 100, 100)];
    const out = positionElementsInLayout(els, 0, 0, "row", 0);
    expect(out.map((e) => e.id)).toEqual(["a", "b"]);
    // widths/heights untouched
    expect(out[0].width).toBe(100);
    expect(out[0].height).toBe(100);
  });
});
