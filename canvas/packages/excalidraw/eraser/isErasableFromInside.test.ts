import { pointFrom } from "@excalidraw/math";

import type { LocalPoint } from "@excalidraw/math";

import { API } from "../tests/helpers/api";

import { isErasableFromInside } from "./index";

describe("isErasableFromInside", () => {
  it("is erasable from inside for a filled rectangle", () => {
    const el = API.createElement({
      type: "rectangle",
      backgroundColor: "#ffec99",
    });
    expect(isErasableFromInside(el)).toBe(true);
  });

  it("is erasable from inside for an UNFILLED rectangle (the reported gap)", () => {
    const el = API.createElement({
      type: "rectangle",
      backgroundColor: "transparent",
    });
    expect(isErasableFromInside(el)).toBe(true);
  });

  it("is erasable from inside for an unfilled ellipse and diamond", () => {
    expect(
      isErasableFromInside(
        API.createElement({ type: "ellipse", backgroundColor: "transparent" }),
      ),
    ).toBe(true);
    expect(
      isErasableFromInside(
        API.createElement({ type: "diamond", backgroundColor: "transparent" }),
      ),
    ).toBe(true);
  });

  it("is never erasable from inside for an arrow", () => {
    expect(
      isErasableFromInside(
        API.createElement({ type: "arrow", backgroundColor: "#ffec99" }),
      ),
    ).toBe(false);
  });

  it("is erasable from inside for text", () => {
    expect(isErasableFromInside(API.createElement({ type: "text" }))).toBe(
      true,
    );
  });

  it("requires a closed loop for an unfilled line/freedraw", () => {
    const openLine = API.createElement({
      type: "line",
      backgroundColor: "transparent",
      points: [
        pointFrom<LocalPoint>(0, 0),
        pointFrom<LocalPoint>(10, 0),
        pointFrom<LocalPoint>(10, 10),
      ],
    });
    expect(isErasableFromInside(openLine)).toBe(false);

    const closedLine = API.createElement({
      type: "line",
      backgroundColor: "transparent",
      points: [
        pointFrom<LocalPoint>(0, 0),
        pointFrom<LocalPoint>(10, 0),
        pointFrom<LocalPoint>(10, 10),
        pointFrom<LocalPoint>(0, 0),
      ],
    });
    expect(isErasableFromInside(closedLine)).toBe(true);
  });
});
