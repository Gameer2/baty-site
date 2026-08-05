import { describe, expect, it } from "vitest";

import {
  computeInitialNodeSize,
  computeNodeScreenRect,
  computeSpawnPoint,
  viewportCoordsToSceneCoords,
} from "../syntropy/nodeGeometry";
import { RIEMANN_SUMS_PORT_SPEC } from "../syntropy/portSpecs/riemannSums";

describe("computeInitialNodeSize", () => {
  it("reserves extra height for a spec with a plot2d output", () => {
    const size = computeInitialNodeSize(RIEMANN_SUMS_PORT_SPEC);
    expect(size.width).toBe(260);
    // 4 inputs + a plot output should be taller than the old fixed 200px shell.
    expect(size.height).toBeGreaterThan(200);
  });

  it("falls back to the placeholder shell size when there is no spec", () => {
    const size = computeInitialNodeSize(null);
    expect(size).toEqual({ width: 260, height: 200 });
  });
});

describe("computeNodeScreenRect", () => {
  it("maps scene coordinates to screen coordinates at 100% zoom with no scroll", () => {
    const rect = computeNodeScreenRect(
      { x: 100, y: 50, width: 260, height: 200 },
      {
        scrollX: 0,
        scrollY: 0,
        zoom: { value: 1 },
        offsetLeft: 240,
        offsetTop: 0,
      },
    );
    expect(rect).toEqual({
      left: 340,
      top: 50,
      width: 260,
      height: 200,
      scale: 1,
    });
  });

  it("accounts for scroll and zoom", () => {
    const rect = computeNodeScreenRect(
      { x: 0, y: 0, width: 260, height: 200 },
      {
        scrollX: 50,
        scrollY: 20,
        zoom: { value: 2 },
        offsetLeft: 0,
        offsetTop: 0,
      },
    );
    // (x + scrollX) * zoom = (0 + 50) * 2 = 100
    expect(rect.left).toBe(100);
    expect(rect.top).toBe(40);
    expect(rect.scale).toBe(2);
    // Natural width/height are returned un-scaled; the caller applies `transform: scale()`.
    expect(rect.width).toBe(260);
    expect(rect.height).toBe(200);
  });
});

describe("viewportCoordsToSceneCoords", () => {
  it("is the exact inverse of computeNodeScreenRect", () => {
    const appState = {
      scrollX: 50,
      scrollY: 20,
      zoom: { value: 2 },
      offsetLeft: 240,
      offsetTop: 0,
    };
    const rect = computeNodeScreenRect(
      { x: 100, y: 50, width: 260, height: 200 },
      appState,
    );
    // The rect's top-left is a viewport point; converting it back must yield the original scene x/y.
    const scene = viewportCoordsToSceneCoords(rect.left, rect.top, appState);
    expect(scene.x).toBeCloseTo(100, 6);
    expect(scene.y).toBeCloseTo(50, 6);
  });
});

describe("computeSpawnPoint", () => {
  const baseAppState = {
    scrollX: 0,
    scrollY: 0,
    zoom: { value: 1 },
    offsetLeft: 300, // panel takes the left 300px
    offsetTop: 0,
    width: 1000,
    height: 800,
  };

  it("centers the node on the visible canvas, not a fixed top-left spot", () => {
    const { x, y } = computeSpawnPoint(baseAppState, 260, 200, 0);
    // Viewport center = offsetLeft + width/2 = 300 + 500 = 800; scene x = (800 - 300)/1 - 0 = 500.
    // Node centered on that point: 500 - 260/2 = 370.
    expect(x).toBe(370);
    // Viewport center y = 0 + 800/2 = 400; scene y = 400; centered: 400 - 200/2 = 300.
    expect(y).toBe(300);
  });

  it("fans consecutive drops so they don't stack on the same spot", () => {
    const first = computeSpawnPoint(baseAppState, 260, 200, 0);
    const second = computeSpawnPoint(baseAppState, 260, 200, 1);
    expect(second.x).toBe(first.x + 24);
    expect(second.y).toBe(first.y + 24);
  });

  it("wraps the fan every 5 drops", () => {
    const a = computeSpawnPoint(baseAppState, 260, 200, 0);
    const b = computeSpawnPoint(baseAppState, 260, 200, 5);
    expect(b).toEqual(a);
  });
});
