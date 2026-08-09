import { API } from "@excalidraw/excalidraw/tests/helpers/api";

import type { UIAppState } from "@excalidraw/excalidraw/types";

import { showSelectedShapeActions } from "../src/showSelectedShapeActions";

const baseAppState = {
  viewModeEnabled: false,
  openDialog: null,
  activeTool: { type: "selection" },
  editingTextElement: null,
} as unknown as UIAppState;

const withSelection = (ids: string[]): UIAppState =>
  ({
    ...baseAppState,
    selectedElementIds: Object.fromEntries(ids.map((id) => [id, true])),
  } as unknown as UIAppState);

describe("showSelectedShapeActions", () => {
  it("returns false when only a Syntropy node is selected", () => {
    const node = {
      ...API.createElement({ id: "node1", type: "embeddable" }),
      link: "syntropy://node/calculus/riemann-sums",
    };
    expect(showSelectedShapeActions(withSelection(["node1"]), [node])).toBe(
      false,
    );
  });

  it("returns true when a regular shape is selected alongside a Syntropy node", () => {
    const node = {
      ...API.createElement({ id: "node1", type: "embeddable" }),
      link: "syntropy://node/calculus/riemann-sums",
    };
    const rectangle = API.createElement({ id: "rect1", type: "rectangle" });
    expect(
      showSelectedShapeActions(withSelection(["node1", "rect1"]), [
        node,
        rectangle,
      ]),
    ).toBe(true);
  });

  it("returns true when a regular shape is selected alone", () => {
    const rectangle = API.createElement({ id: "rect1", type: "rectangle" });
    expect(
      showSelectedShapeActions(withSelection(["rect1"]), [rectangle]),
    ).toBe(true);
  });

  it("returns false when nothing is selected and the selection tool is active", () => {
    expect(showSelectedShapeActions(withSelection([]), [])).toBe(false);
  });

  it("returns true while the eraser tool is active, even with no selection", () => {
    const eraserAppState = {
      ...withSelection([]),
      activeTool: { type: "eraser" },
    } as unknown as UIAppState;
    expect(showSelectedShapeActions(eraserAppState, [])).toBe(true);
  });
});
