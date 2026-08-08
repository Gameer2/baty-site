import { API } from "../../excalidraw/tests/helpers/api";

import { getRenderOpacity } from "../src/renderElement";

describe("getRenderOpacity", () => {
  it("does not dim a freedraw element pending erasure in precision mode", () => {
    const freedraw = API.createElement({ type: "freedraw" });
    const opacity = getRenderOpacity(
      freedraw,
      null,
      new Set([freedraw.id]),
      null,
      1,
      "precision",
    );
    expect(opacity).toBe(1);
  });

  it("does not dim a line element pending erasure in precision mode", () => {
    const line = API.createElement({ type: "line" });
    const opacity = getRenderOpacity(
      line,
      null,
      new Set([line.id]),
      null,
      1,
      "precision",
    );
    expect(opacity).toBe(1);
  });

  it("still dims a freedraw element pending erasure in stroke mode", () => {
    const freedraw = API.createElement({ type: "freedraw" });
    const opacity = getRenderOpacity(
      freedraw,
      null,
      new Set([freedraw.id]),
      null,
      1,
      "stroke",
    );
    expect(opacity).toBeLessThan(1);
  });

  it("still dims a freedraw element pending erasure in clear mode", () => {
    const freedraw = API.createElement({ type: "freedraw" });
    const opacity = getRenderOpacity(
      freedraw,
      null,
      new Set([freedraw.id]),
      null,
      1,
      "clear",
    );
    expect(opacity).toBeLessThan(1);
  });

  it("still dims a non-freedraw/line element (e.g. rectangle) pending erasure in precision mode — it will be deleted whole", () => {
    const rect = API.createElement({ type: "rectangle" });
    const opacity = getRenderOpacity(
      rect,
      null,
      new Set([rect.id]),
      null,
      1,
      "precision",
    );
    expect(opacity).toBeLessThan(1);
  });

  it("does not dim an element not pending erasure at all", () => {
    const freedraw = API.createElement({ type: "freedraw" });
    const opacity = getRenderOpacity(
      freedraw,
      null,
      new Set(),
      null,
      1,
      "stroke",
    );
    expect(opacity).toBe(1);
  });
});
