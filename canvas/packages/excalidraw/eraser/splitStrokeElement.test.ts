import { pointFrom } from "@excalidraw/math";

import type { LocalPoint } from "@excalidraw/math/types";

import { API } from "../tests/helpers/api";

import {
  buildStrokePieceFromRun,
  getSurvivingRuns,
} from "./splitStrokeElement";

describe("getSurvivingRuns", () => {
  it("returns one run spanning everything when nothing is removed", () => {
    expect(getSurvivingRuns(5, new Set())).toEqual([[0, 1, 2, 3, 4]]);
  });

  it("returns no runs when everything is removed", () => {
    expect(getSurvivingRuns(5, new Set([0, 1, 2, 3, 4]))).toEqual([]);
  });

  it("splits into two runs around a removed middle chunk", () => {
    expect(getSurvivingRuns(10, new Set([4, 5, 6]))).toEqual([
      [0, 1, 2, 3],
      [7, 8, 9],
    ]);
  });

  it("drops runs shorter than MIN_RUN_POINTS (a lone surviving point)", () => {
    // index 5 alone survives between two removed regions — too short to keep as its own element
    expect(
      getSurvivingRuns(11, new Set([0, 1, 2, 3, 4, 6, 7, 8, 9, 10])),
    ).toEqual([]);
  });
});

describe("buildStrokePieceFromRun", () => {
  it("rebuilds a freedraw piece re-based to a new origin with a fresh id", () => {
    const original = API.createElement({
      type: "freedraw",
      x: 100,
      y: 200,
      points: [
        pointFrom<LocalPoint>(0, 0),
        pointFrom<LocalPoint>(10, 0),
        pointFrom<LocalPoint>(20, 10),
      ],
    });
    (original as any).pressures = [0.5, 0.6, 0.7];

    const piece = buildStrokePieceFromRun(original as any, [1, 2]);

    expect(piece.id).not.toBe(original.id);
    // absolute points were (110,200) and (120,210) -> new origin (110,200)
    expect(piece.x).toBe(110);
    expect(piece.y).toBe(200);
    expect(piece.points).toEqual([
      pointFrom<LocalPoint>(0, 0),
      pointFrom<LocalPoint>(10, 10),
    ]);
    expect((piece as any).pressures).toEqual([0.6, 0.7]);
    expect(piece.width).toBe(10);
    expect(piece.height).toBe(10);
  });
});
