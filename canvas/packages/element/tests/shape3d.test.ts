import { getShape3DGeometry } from "../src/shape3d";

import type { Shape3DType } from "../src/types";

const SHAPE3D_TYPES: Shape3DType[] = [
  "cube",
  "pyramid",
  "cylinder",
  "cone",
  "sphere",
];

const baseElement = (overrides: {
  shape3DType: Shape3DType;
  rotationX?: number;
  rotationY?: number;
  rotationZ?: number;
  wireframe?: boolean;
}) => ({
  width: 100,
  height: 100,
  rotationX: 0,
  rotationY: 0,
  rotationZ: 0,
  wireframe: false,
  ...overrides,
});

describe("getShape3DGeometry", () => {
  it.each(SHAPE3D_TYPES)(
    "never overflows the element's bounding box for a %s at a generic rotation, and touches its tighter axis",
    (shape3DType) => {
      // rescaleToFit re-normalizes every shape's *current*-rotation
      // silhouette to fit inside the box the user actually drew (see its doc
      // comment) — a rotated cube's diagonal used to visibly overflow that
      // box at every rotation other than (0, 0, 0). The fit is uniform
      // (single scale factor, not independent X/Y), so it's only guaranteed
      // to exactly touch whichever axis is tighter, not both — forcing both
      // would distort the shape's true proportions every frame.
      const { fills, strokes } = getShape3DGeometry(
        baseElement({
          shape3DType,
          rotationX: 25,
          rotationY: 40,
          rotationZ: 10,
        }),
      );
      const allPoints = [
        ...fills.flatMap((f) => f.points),
        ...strokes.flatMap((s) => s.points),
      ];
      expect(allPoints.length).toBeGreaterThan(0);
      const xs = allPoints.map(([x]) => x);
      const ys = allPoints.map(([, y]) => y);
      const minX = Math.min(...xs);
      const maxX = Math.max(...xs);
      const minY = Math.min(...ys);
      const maxY = Math.max(...ys);
      expect(minX).toBeGreaterThanOrEqual(-1e-6);
      expect(maxX).toBeLessThanOrEqual(100 + 1e-6);
      expect(minY).toBeGreaterThanOrEqual(-1e-6);
      expect(maxY).toBeLessThanOrEqual(100 + 1e-6);
      // at least one axis should be touched exactly (the tighter one) —
      // otherwise the shape was needlessly shrunk on both axes
      const touchesX = minX < 1e-6 && maxX > 100 - 1e-6;
      const touchesY = minY < 1e-6 && maxY > 100 - 1e-6;
      expect(touchesX || touchesY).toBe(true);
    },
  );

  it.each(SHAPE3D_TYPES)(
    "exactly touches every edge of the bounding box for a %s at rotation (0, 0, 0)",
    (shape3DType) => {
      // every model's local silhouette spans exactly [-1, 1] on both axes
      // at zero rotation (see the makeFit doc comment) — this is the
      // rotation where rescaleToFit is a no-op, so it doubles as a sanity
      // check on the underlying models themselves.
      const { fills, strokes } = getShape3DGeometry(
        baseElement({ shape3DType, rotationX: 0, rotationY: 0, rotationZ: 0 }),
      );
      const allPoints = [
        ...fills.flatMap((f) => f.points),
        ...strokes.flatMap((s) => s.points),
      ];
      const xs = allPoints.map(([x]) => x);
      const ys = allPoints.map(([, y]) => y);
      expect(Math.min(...xs)).toBeCloseTo(0, 0);
      expect(Math.max(...xs)).toBeCloseTo(100, 0);
      expect(Math.min(...ys)).toBeCloseTo(0, 0);
      expect(Math.max(...ys)).toBeCloseTo(100, 0);
    },
  );

  it.each(SHAPE3D_TYPES)(
    "produces no fills for a %s in wireframe mode, and at least one stroke",
    (shape3DType) => {
      const { fills, strokes } = getShape3DGeometry(
        baseElement({ shape3DType, wireframe: true }),
      );
      expect(fills).toEqual([]);
      expect(strokes.length).toBeGreaterThan(0);
    },
  );

  it.each(["cube", "pyramid"] as const)(
    "culls back-facing faces of a %s (fewer visible faces than total)",
    (shape3DType) => {
      const totalFaces = shape3DType === "cube" ? 6 : 5;
      const { fills } = getShape3DGeometry(
        baseElement({ shape3DType, rotationX: 25, rotationY: 35 }),
      );
      expect(fills.length).toBeGreaterThan(0);
      expect(fills.length).toBeLessThan(totalFaces);
    },
  );

  it("shows exactly 3 faces of a cube at a generic (non edge-on) rotation", () => {
    const { fills } = getShape3DGeometry(
      baseElement({ shape3DType: "cube", rotationX: 25, rotationY: 35 }),
    );
    expect(fills.length).toBe(3);
  });

  it("keeps a sphere's silhouette a rotation-invariant circle inscribed in the box", () => {
    const unrotated = getShape3DGeometry(
      baseElement({ shape3DType: "sphere", rotationX: 0, rotationY: 0 }),
    );
    const rotated = getShape3DGeometry(
      baseElement({ shape3DType: "sphere", rotationX: 77, rotationY: 123 }),
    );
    // silhouette is always strokes[0] (see getSphereGeometry)
    expect(unrotated.strokes[0].points).toEqual(rotated.strokes[0].points);
  });

  it("rotates a sphere's decoration great-circles but not its silhouette", () => {
    const unrotated = getShape3DGeometry(
      baseElement({ shape3DType: "sphere", rotationX: 0, rotationY: 0 }),
    );
    const rotated = getShape3DGeometry(
      baseElement({ shape3DType: "sphere", rotationX: 77, rotationY: 123 }),
    );
    expect(unrotated.strokes[1].points).not.toEqual(rotated.strokes[1].points);
  });

  it("fits a non-square bounding box independently on each axis", () => {
    // zero rotation, where the exact-fit guarantee holds (see makeFit)
    const { fills, strokes } = getShape3DGeometry(
      baseElement({ shape3DType: "cube", rotationX: 0, rotationY: 0 }),
    );
    const wide = getShape3DGeometry({
      shape3DType: "cube",
      width: 300,
      height: 50,
      rotationX: 0,
      rotationY: 0,
      rotationZ: 0,
      wireframe: false,
    });
    const allPoints = [
      ...fills.flatMap((f) => f.points),
      ...strokes.flatMap((s) => s.points),
    ];
    const wideAllPoints = [
      ...wide.fills.flatMap((f) => f.points),
      ...wide.strokes.flatMap((s) => s.points),
    ];
    expect(Math.max(...wideAllPoints.map(([x]) => x))).toBeCloseTo(300, 0);
    expect(Math.max(...wideAllPoints.map(([, y]) => y))).toBeCloseTo(50, 0);
    // sanity: the square version's own bbox is the 100x100 it was fit to
    expect(Math.max(...allPoints.map(([x]) => x))).toBeCloseTo(100, 0);
  });
});
