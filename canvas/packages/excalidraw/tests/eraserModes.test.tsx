import type { ExcalidrawFreeDrawElement } from "@excalidraw/element/types";

import { Excalidraw } from "../index";

import { API } from "./helpers/api";
import { Keyboard, Pointer, UI } from "./helpers/ui";
import { act, render } from "./test-utils";

const { h } = window;
const mouse = new Pointer("mouse");

// Draws a freedraw stroke the same way a hand-drawn line would sample points: many small
// pointer-move steps rather than a single down->up jump, so partial-erase modes have points to
// cut. Straight line from (0, y) to (200, y) sampled every 5px.
// y stays 0 throughout — the jsdom test container is mocked to only 200x100px
// (see render() in ./test-utils), so anything near y=100 falls outside the visible viewport.
const drawSampledFreedrawLine = () => {
  UI.clickTool("freedraw");
  mouse.reset();
  mouse.down(0, 0);
  for (let x = 5; x <= 200; x += 5) {
    mouse.move(5, 0);
  }
  mouse.up();
};

// A stroke that's densely sampled on both sides of one sparse gap — e.g. a real hand-drawn stroke
// where the mouse moved quickly for one moment. Points at x = 0,5,...,45, then a single jump
// straight to x = 145, then x = 150,...,200. The gap (100px) is far wider than a small eraser
// circle, so a touch landing in the middle of it wouldn't be near either of its two real
// endpoints — exactly the case findTouchedOriginalIndices's safety-net sampling exists for.
const drawFreedrawLineWithOneSparseGap = () => {
  UI.clickTool("freedraw");
  mouse.reset();
  mouse.down(0, 0);
  for (let x = 5; x <= 45; x += 5) {
    mouse.move(5, 0);
  }
  mouse.move(100, 0);
  for (let x = 150; x <= 200; x += 5) {
    mouse.move(5, 0);
  }
  mouse.up();
};

describe("eraser modes", () => {
  beforeEach(async () => {
    await render(<Excalidraw handleKeyboardGlobally={true} />);
  });

  afterEach(async () => {
    // https://github.com/floating-ui/floating-ui/issues/1908#issuecomment-1301553793
    await act(async () => {});
  });

  it("precision mode splits a dragged-over freedraw stroke instead of deleting it whole", () => {
    drawSampledFreedrawLine();
    const strokeId = h.elements[0].id;

    API.setAppState({ currentItemEraserMode: "precision" });
    UI.clickTool("eraser");

    mouse.reset();
    mouse.down(100, 0);
    mouse.move(10, 0);
    mouse.up();

    expect(h.elements.find((el) => el.id === strokeId)?.isDeleted).toBe(true);
    const survivors = h.elements.filter((el) => !el.isDeleted);
    expect(survivors.length).toBe(2);
  });

  it("precision mode tap (no drag) splits the stroke instead of deleting it whole", () => {
    drawSampledFreedrawLine();
    const strokeId = h.elements[0].id;

    API.setAppState({ currentItemEraserMode: "precision" });
    UI.clickTool("eraser");

    // a tap: down and up at the exact same position, no drag in between
    mouse.reset();
    mouse.down(100, 0);
    mouse.up();

    expect(h.elements.find((el) => el.id === strokeId)?.isDeleted).toBe(true);
    const survivors = h.elements.filter((el) => !el.isDeleted);
    expect(survivors.length).toBe(2);
  });

  it("precision mode catches a touch inside a sparse gap without touching the densely-sampled stroke on either side", () => {
    drawFreedrawLineWithOneSparseGap();
    const strokeId = h.elements[0].id;
    const original = h.elements[0] as ExcalidrawFreeDrawElement;
    const originalAbsolutePoints = original.points.map(
      ([x, y]) => [original.x + x, original.y + y] as const,
    );

    API.setAppState({ currentItemEraserMode: "precision" });
    UI.clickTool("eraser");

    // erase in the middle of the 100px gap (x≈45 to x≈145) — nowhere near either of the two real
    // points bordering it
    mouse.reset();
    mouse.down(95, 0);
    mouse.move(5, 0);
    mouse.up();

    expect(h.elements.find((el) => el.id === strokeId)?.isDeleted).toBe(true);
    const survivors = h.elements.filter(
      (el) => !el.isDeleted,
    ) as ExcalidrawFreeDrawElement[];
    // the gap being erased splits the stroke into exactly the two dense sides
    expect(survivors.length).toBe(2);

    // no reshaping: every surviving point is one of the ORIGINAL points, at its exact original
    // coordinates — never a newly-interpolated one
    const survivingAbsolutePoints = survivors.flatMap((el) =>
      el.points.map(([x, y]) => [el.x + x, el.y + y] as const),
    );
    for (const [sx, sy] of survivingAbsolutePoints) {
      expect(
        originalAbsolutePoints.some(
          ([ox, oy]) => Math.abs(ox - sx) < 0.001 && Math.abs(oy - sy) < 0.001,
        ),
      ).toBe(true);
    }
    // and nothing was dropped from the two dense, untouched sides beyond the gap's own endpoints
    expect(survivingAbsolutePoints.length).toBe(
      originalAbsolutePoints.length - 2,
    );
  });

  it("precision mode touching near one edge of a sparse gap only trims that edge, not the far side of the stroke", () => {
    drawFreedrawLineWithOneSparseGap();
    const strokeId = h.elements[0].id;
    const original = h.elements[0] as ExcalidrawFreeDrawElement;
    const originalPointCount = original.points.length;

    API.setAppState({ currentItemEraserMode: "precision" });
    UI.clickTool("eraser");

    // erase right at the start of the gap (x≈50, just past the x=45 endpoint) — nowhere near the
    // far x=145 endpoint on the other side of the 100px gap. Before the fix, any touch anywhere
    // in an oversized segment removed BOTH of its endpoints, which — chained with how removing an
    // interior point always splits the run either side of it — could look like the eraser "cut in
    // the middle" of a stroke you only touched near one edge.
    mouse.reset();
    mouse.down(50, 0);
    mouse.up();

    expect(h.elements.find((el) => el.id === strokeId)?.isDeleted).toBe(true);
    const survivors = h.elements.filter(
      (el) => !el.isDeleted,
    ) as ExcalidrawFreeDrawElement[];
    const survivingPointCount = survivors.reduce(
      (sum, el) => sum + el.points.length,
      0,
    );

    // only the one near endpoint (x=45) should be gone — the far endpoint (x=145) and everything
    // past it must survive intact, not get swept away along with it
    expect(survivingPointCount).toBe(originalPointCount - 1);
    const maxSurvivingX = Math.max(
      ...survivors.flatMap((el) => el.points.map(([x]) => el.x + x)),
    );
    expect(maxSurvivingX).toBeGreaterThanOrEqual(199);
  });

  it("stroke mode deletes the whole element on any touch", () => {
    drawSampledFreedrawLine();
    const strokeId = h.elements[0].id;

    API.setAppState({ currentItemEraserMode: "stroke" });
    UI.clickTool("eraser");

    mouse.reset();
    mouse.down(100, 0);
    mouse.move(10, 0);
    mouse.up();

    expect(h.elements.find((el) => el.id === strokeId)?.isDeleted).toBe(true);
    const survivors = h.elements.filter((el) => !el.isDeleted);
    expect(survivors.length).toBe(0);
  });

  it("stroke mode tap (no drag) still deletes the whole element", () => {
    drawSampledFreedrawLine();
    const strokeId = h.elements[0].id;

    API.setAppState({ currentItemEraserMode: "stroke" });
    UI.clickTool("eraser");

    mouse.reset();
    mouse.down(100, 0);
    mouse.up();

    expect(h.elements.find((el) => el.id === strokeId)?.isDeleted).toBe(true);
    const survivors = h.elements.filter((el) => !el.isDeleted);
    expect(survivors.length).toBe(0);
  });

  it("clear mode wipes every element on the canvas on the very first touch, even away from any element", () => {
    drawSampledFreedrawLine();
    UI.clickTool("rectangle");
    mouse.reset();
    mouse.down(0, 50);
    mouse.up(20, 20);

    expect(h.elements.filter((el) => !el.isDeleted).length).toBe(2);

    API.setAppState({ currentItemEraserMode: "clear" });
    UI.clickTool("eraser");

    // touch empty space, nowhere near either element
    mouse.reset();
    mouse.down(199, 99);
    mouse.up();

    expect(h.elements.filter((el) => !el.isDeleted).length).toBe(0);
    expect(h.elements.every((el) => el.isDeleted)).toBe(true);
  });

  it("clear mode leaves locked elements alone", () => {
    drawSampledFreedrawLine();
    const strokeId = h.elements[0].id;
    API.updateElement(h.elements[0], { locked: true });

    API.setAppState({ currentItemEraserMode: "clear" });
    UI.clickTool("eraser");

    mouse.reset();
    mouse.down(150, 0);
    mouse.up();

    const stroke = h.elements.find((el) => el.id === strokeId);
    expect(stroke?.isDeleted).toBe(false);
  });

  it("clear mode is undoable", () => {
    drawSampledFreedrawLine();
    const strokeId = h.elements[0].id;

    API.setAppState({ currentItemEraserMode: "clear" });
    UI.clickTool("eraser");

    mouse.reset();
    mouse.down(150, 0);
    mouse.up();

    expect(h.elements.find((el) => el.id === strokeId)?.isDeleted).toBe(true);

    Keyboard.undo();

    expect(h.elements.find((el) => el.id === strokeId)?.isDeleted).toBe(false);
  });
});
