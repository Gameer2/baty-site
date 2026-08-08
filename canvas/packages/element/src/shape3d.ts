import { pointFrom } from "@excalidraw/math";

import type { LocalPoint } from "@excalidraw/math";

import type { ExcalidrawShape3DElement, Shape3DType } from "./types";

/**
 * 3D primitives (cube/pyramid/cylinder/cone/sphere) projected onto the 2D
 * canvas.
 *
 * The model: each shape is defined by plain vertices in a unit local space
 * ([-1, 1] on every axis, X-right/Y-down/Z-toward-viewer). Vertices are
 * rotated by the element's rotationX/Y/Z (degrees), projected with a simple
 * orthographic drop-Z, then mapped from that fixed [-1, 1] reference onto
 * [0, width] x [0, height] (see `makeFit`) — so resizing and the existing 2D
 * `angle` rotation keep working unmodified, the same "local point list"
 * contract every other shape (see getPolygonPoints) hands to
 * shape.ts/collision/etc.
 *
 * Flat-faced solids (cube, pyramid) get real back-face culling via each
 * face's rotated normal. Curved solids (cylinder, cone, sphere) can't be
 * culled that way, so they're approximated instead: a tilted ring's front
 * and back halves project to the *same* 2D curve under drop-Z (there's no
 * depth left to tell them apart), which means layering "bottom ring fill →
 * straight-sided body fill → top ring fill" already produces the classic
 * hand-drawn-cylinder look for free, with no explicit hidden-line removal
 * needed.
 */

type Vec3 = readonly [number, number, number];

const degToRad = (deg: number) => (deg * Math.PI) / 180;

const dot3 = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

const normalize3 = ([x, y, z]: Vec3): Vec3 => {
  const len = Math.sqrt(x * x + y * y + z * z) || 1;
  return [x / len, y / len, z / len];
};

// fixed light direction (upper-front-right, in the same X-right/Y-down/
// Z-toward-viewer space as everything else in this file) used to fake
// directional lighting across a shape's faces — without this every face
// renders in the exact same flat color and the shape reads as a single
// undifferentiated blob instead of something three-dimensional.
const LIGHT_DIR = normalize3([0.45, -0.65, 0.6]);

// max lightness swing (percentage points, see colors.ts's shadeColor) a face
// can receive from the fixed light above; kept small so faces stay
// recognizably "the same color", just shaded, rather than looking tinted
const SHADE_RANGE = 14;

/** rotatedNormal need not be unit length — this normalizes before the dot
 *  product so faces with differently-scaled model normals (e.g. the pyramid's)
 *  shade consistently relative to one another. */
const shadeForNormal = (rotatedNormal: Vec3): number =>
  dot3(normalize3(rotatedNormal), LIGHT_DIR) * SHADE_RANGE;

const rotateVec3 = (
  [x, y, z]: Vec3,
  rotationXDeg: number,
  rotationYDeg: number,
  rotationZDeg: number,
): Vec3 => {
  const rx = degToRad(rotationXDeg);
  const ry = degToRad(rotationYDeg);
  const rz = degToRad(rotationZDeg);

  // rotate around X
  let cos = Math.cos(rx);
  let sin = Math.sin(rx);
  let x1 = x;
  let y1 = y * cos - z * sin;
  let z1 = y * sin + z * cos;

  // rotate around Y
  cos = Math.cos(ry);
  sin = Math.sin(ry);
  const x2 = x1 * cos + z1 * sin;
  const y2 = y1;
  const z2 = -x1 * sin + z1 * cos;

  // rotate around Z
  cos = Math.cos(rz);
  sin = Math.sin(rz);
  const x3 = x2 * cos - y2 * sin;
  const y3 = x2 * sin + y2 * cos;
  const z3 = z2;

  x1 = x3;
  y1 = y3;
  z1 = z3;

  return [x1, y1, z1];
};

// -----------------------------------------------------------------------------
// flat-faced polyhedra (cube, pyramid)
// -----------------------------------------------------------------------------

type PolyhedronFace = {
  indices: number[];
  /** outward-facing normal in local space (need not be unit length) */
  normal: Vec3;
};

type PolyhedronModel = {
  vertices: Vec3[];
  faces: PolyhedronFace[];
};

const CUBE_MODEL: PolyhedronModel = {
  vertices: [
    [-1, -1, -1],
    [1, -1, -1],
    [1, 1, -1],
    [-1, 1, -1],
    [-1, -1, 1],
    [1, -1, 1],
    [1, 1, 1],
    [-1, 1, 1],
  ],
  faces: [
    { indices: [4, 5, 6, 7], normal: [0, 0, 1] }, // front
    { indices: [1, 0, 3, 2], normal: [0, 0, -1] }, // back
    { indices: [1, 2, 6, 5], normal: [1, 0, 0] }, // right
    { indices: [0, 4, 7, 3], normal: [-1, 0, 0] }, // left
    { indices: [3, 7, 6, 2], normal: [0, 1, 0] }, // bottom
    { indices: [0, 1, 5, 4], normal: [0, -1, 0] }, // top
  ],
};

const PYRAMID_MODEL: PolyhedronModel = {
  vertices: [
    [-1, 1, -1],
    [1, 1, -1],
    [1, 1, 1],
    [-1, 1, 1],
    [0, -1, 0], // apex
  ],
  faces: [
    { indices: [0, 3, 2, 1], normal: [0, 1, 0] }, // base
    { indices: [0, 1, 4], normal: [0, -2, -4] }, // back
    { indices: [1, 2, 4], normal: [4, -2, 0] }, // right
    { indices: [2, 3, 4], normal: [0, -2, 4] }, // front
    { indices: [3, 0, 4], normal: [-4, -2, 0] }, // left
  ],
};

const edgeKey = (a: number, b: number) => (a < b ? `${a}_${b}` : `${b}_${a}`);

/** deduped undirected edges (as index pairs) from a set of face loops */
const edgesFromFaces = (faces: PolyhedronFace[]): [number, number][] => {
  const seen = new Set<string>();
  const edges: [number, number][] = [];
  for (const face of faces) {
    const n = face.indices.length;
    for (let i = 0; i < n; i++) {
      const a = face.indices[i];
      const b = face.indices[(i + 1) % n];
      const key = edgeKey(a, b);
      if (!seen.has(key)) {
        seen.add(key);
        edges.push([a, b]);
      }
    }
  }
  return edges;
};

// -----------------------------------------------------------------------------
// mapping local model space into the element's [0, width] x [0, height]
// -----------------------------------------------------------------------------

type Fit = (p: readonly [number, number]) => LocalPoint;

/**
 * Every model above is built in local space so that its silhouette at
 * rotation (0, 0, 0) spans exactly [-1, 1] on both axes — verified for
 * cube/pyramid/cylinder/cone/sphere. That fixed reference, not the *current*
 * rotation's projected extent, is what width/height maps onto: a rotated
 * shape's silhouette naturally shrinks or changes proportions (a cylinder
 * viewed end-on reads as a circle, not a tall cylinder), and re-normalizing
 * to always fill the box on every frame would erase exactly that
 * foreshortening — stretching the shape back out and making it look
 * distorted rather than merely rotated. Fixed-scale fitting also means
 * (unlike a dynamic per-frame fit) the map is a pure function of
 * width/height alone, independent of the rotation or shape.
 */
const makeFit = (width: number, height: number): Fit => {
  return ([x, y]) =>
    pointFrom<LocalPoint>(((x + 1) / 2) * width, ((y + 1) / 2) * height);
};

export type Shape3DPolyline = {
  points: LocalPoint[];
  closed: boolean;
  /** true for a ring/arc traced through sampled points (render as a smooth
   *  spline) vs. a genuinely straight-edged line (render as-is) */
  curved: boolean;
};

export type Shape3DFill = {
  points: LocalPoint[];
  curved: boolean;
  /** lightness delta (percentage points, see shadeForNormal) faking this
   *  face's angle to the fixed light — 0/undefined renders at the element's
   *  plain background color. */
  shade?: number;
};

export type Shape3DGeometry = {
  /** filled regions (point loops), already in back-to-front draw order */
  fills: Shape3DFill[];
  /** stroked outlines, drawn after fills */
  strokes: Shape3DPolyline[];
};

type Shape3DElementLike = Pick<
  ExcalidrawShape3DElement,
  | "width"
  | "height"
  | "shape3DType"
  | "rotationX"
  | "rotationY"
  | "rotationZ"
  | "wireframe"
>;

const getPolyhedronGeometry = (
  model: PolyhedronModel,
  element: Shape3DElementLike,
): Shape3DGeometry => {
  const { width, height, rotationX, rotationY, rotationZ, wireframe } = element;

  const rotatedVerts = model.vertices.map((v) =>
    rotateVec3(v, rotationX, rotationY, rotationZ),
  );
  const projected = rotatedVerts.map(
    ([x, y]) => [x, y] as readonly [number, number],
  );
  const fit = makeFit(width, height);

  const visibleFaces = model.faces
    .map((face) => ({
      face,
      rotatedNormal: rotateVec3(
        face.normal,
        rotationX,
        rotationY,
        rotationZ,
      ),
    }))
    .filter(({ rotatedNormal }) => rotatedNormal[2] > 0);

  const fills: Shape3DFill[] = wireframe
    ? []
    : visibleFaces.map(({ face, rotatedNormal }) => ({
        points: face.indices.map((i) => fit(projected[i])),
        curved: false,
        shade: shadeForNormal(rotatedNormal),
      }));

  const edgeFaces = wireframe
    ? model.faces
    : visibleFaces.map(({ face }) => face);
  const strokes: Shape3DPolyline[] = edgesFromFaces(edgeFaces).map(
    ([a, b]) => ({
      points: [fit(projected[a]), fit(projected[b])],
      closed: false,
      curved: false,
    }),
  );

  return { fills, strokes };
};

// -----------------------------------------------------------------------------
// curved solids (cylinder, cone, sphere)
// -----------------------------------------------------------------------------

// high enough that the straight-edged polygon approximation reads as a
// genuine circle/ellipse rather than a faceted polygon (rough.js has no
// stable way to draw a smooth *closed* spline through sampled points — its
// `curve` primitive overshoots badly on tight or near-degenerate loops, see
// the git history of this file — so more, smaller straight segments is the
// correct fix instead)
const RING_SEGMENTS = 72;

const makeRing = (y: number, radius: number): Vec3[] => {
  const points: Vec3[] = [];
  for (let i = 0; i < RING_SEGMENTS; i++) {
    const theta = (i / RING_SEGMENTS) * Math.PI * 2;
    points.push([Math.cos(theta) * radius, y, Math.sin(theta) * radius]);
  }
  return points;
};

/** index of the min/max-x point within a projected ring */
const ringExtremeXIndices = (
  ring2D: readonly (readonly [number, number])[],
): { leftIdx: number; rightIdx: number } => {
  let leftIdx = 0;
  let rightIdx = 0;
  for (let i = 1; i < ring2D.length; i++) {
    if (ring2D[i][0] < ring2D[leftIdx][0]) {
      leftIdx = i;
    }
    if (ring2D[i][0] > ring2D[rightIdx][0]) {
      rightIdx = i;
    }
  }
  return { leftIdx, rightIdx };
};

/**
 * The two ring points that are the true tangent points as seen from an
 * external point `p` — i.e. the points where a line from `p` grazes the
 * ring's silhouette without crossing it, found by checking which ring point
 * has every *other* ring point on a single side of the line through it and
 * `p`. This is what a cone's side edges have to touch: "leftmost/rightmost
 * by screen X" (see ringExtremeXIndices) is only ever correct when the
 * apex sits directly above the ring's center in screen space (rotationZ = 0
 * and no X/Y combination that tilts it) — at any other rotation those two
 * points stop being tangent to the ellipse, so the straight side edges drawn
 * to them visibly don't touch the curve anymore and the cone reads as a
 * flat triangle dropped onto a disconnected circle instead of one solid.
 * O(n^2) over 72 ring points is trivial (a few thousand ops), and this only
 * runs on geometry rebuild, not per animation frame.
 */
const ringTangentsFromPoint = (
  ring2D: readonly (readonly [number, number])[],
  p: readonly [number, number],
): { leftIdx: number; rightIdx: number } => {
  const n = ring2D.length;
  let leftIdx = 0;
  let rightIdx = 0;
  for (let i = 0; i < n; i++) {
    const dx = ring2D[i][0] - p[0];
    const dy = ring2D[i][1] - p[1];
    let hasPositiveCross = false;
    let hasNegativeCross = false;
    for (let j = 0; j < n; j++) {
      if (j === i) {
        continue;
      }
      const qx = ring2D[j][0] - p[0];
      const qy = ring2D[j][1] - p[1];
      const cross = dx * qy - dy * qx;
      if (cross > 1e-9) {
        hasPositiveCross = true;
      } else if (cross < -1e-9) {
        hasNegativeCross = true;
      }
    }
    // every other ring point falls on one side only => i is a tangent point
    if (!hasNegativeCross) {
      rightIdx = i;
    }
    if (!hasPositiveCross) {
      leftIdx = i;
    }
  }
  return { leftIdx, rightIdx };
};

/**
 * The two arcs of a ring between `fromIdx` and `toIdx`; returns whichever
 * has the larger average (screen-down) Y — i.e. the arc that visually dips
 * *below* the tangent chord, which is the sliver of the ring that peeks out
 * from under a solid-filled cylinder/cone body.
 */
const lowerArcBetween = (
  ring2D: readonly (readonly [number, number])[],
  fromIdx: number,
  toIdx: number,
): (readonly [number, number])[] => {
  const n = ring2D.length;
  const forward: (readonly [number, number])[] = [];
  for (let i = fromIdx; ; i = (i + 1) % n) {
    forward.push(ring2D[i]);
    if (i === toIdx) {
      break;
    }
  }
  const backward: (readonly [number, number])[] = [];
  for (let i = fromIdx; ; i = (i - 1 + n) % n) {
    backward.push(ring2D[i]);
    if (i === toIdx) {
      break;
    }
  }
  const avgY = (arc: (readonly [number, number])[]) =>
    arc.reduce((sum, [, y]) => sum + y, 0) / arc.length;
  return avgY(forward) >= avgY(backward) ? forward : backward;
};

const getCylinderGeometry = (element: Shape3DElementLike): Shape3DGeometry => {
  const { width, height, rotationX, rotationY, rotationZ, wireframe } = element;

  const topRing3D = makeRing(-1, 1).map((v) =>
    rotateVec3(v, rotationX, rotationY, rotationZ),
  );
  const bottomRing3D = makeRing(1, 1).map((v) =>
    rotateVec3(v, rotationX, rotationY, rotationZ),
  );

  const topRing2D = topRing3D.map(
    ([x, y]) => [x, y] as readonly [number, number],
  );
  const bottomRing2D = bottomRing3D.map(
    ([x, y]) => [x, y] as readonly [number, number],
  );

  const fit = makeFit(width, height);

  const top = ringExtremeXIndices(topRing2D);
  const bottom = ringExtremeXIndices(bottomRing2D);

  const topFit = topRing2D.map(fit);
  const bottomFit = bottomRing2D.map(fit);

  // caps' own outward normals, rotated the same as the rings themselves —
  // gives the two end caps a believably different shade from each other and
  // from the body instead of everything sharing one flat color
  const topNormal = rotateVec3([0, -1, 0], rotationX, rotationY, rotationZ);
  const bottomNormal = rotateVec3([0, 1, 0], rotationX, rotationY, rotationZ);

  const fills: Shape3DFill[] = wireframe
    ? []
    : [
        { points: bottomFit, curved: true, shade: shadeForNormal(bottomNormal) },
        {
          points: [
            topFit[top.leftIdx],
            topFit[top.rightIdx],
            bottomFit[bottom.rightIdx],
            bottomFit[bottom.leftIdx],
          ],
          curved: false,
        },
        { points: topFit, curved: true, shade: shadeForNormal(topNormal) },
      ];

  const sideLines: Shape3DPolyline[] = [
    {
      points: [topFit[top.leftIdx], bottomFit[bottom.leftIdx]],
      closed: false,
      curved: false,
    },
    {
      points: [topFit[top.rightIdx], bottomFit[bottom.rightIdx]],
      closed: false,
      curved: false,
    },
  ];

  const strokes: Shape3DPolyline[] = wireframe
    ? [
        { points: topFit, closed: true, curved: true },
        { points: bottomFit, closed: true, curved: true },
        ...sideLines,
      ]
    : [
        { points: topFit, closed: true, curved: true },
        {
          points: lowerArcBetween(
            bottomRing2D,
            bottom.leftIdx,
            bottom.rightIdx,
          ).map(fit),
          closed: false,
          curved: true,
        },
        ...sideLines,
      ];

  return { fills, strokes };
};

const getConeGeometry = (element: Shape3DElementLike): Shape3DGeometry => {
  const { width, height, rotationX, rotationY, rotationZ, wireframe } = element;

  const baseRing3D = makeRing(1, 1).map((v) =>
    rotateVec3(v, rotationX, rotationY, rotationZ),
  );
  const apex3D = rotateVec3([0, -1, 0], rotationX, rotationY, rotationZ);

  const baseRing2D = baseRing3D.map(
    ([x, y]) => [x, y] as readonly [number, number],
  );
  const apex2D = [apex3D[0], apex3D[1]] as readonly [number, number];

  const fit = makeFit(width, height);

  const { leftIdx, rightIdx } = ringTangentsFromPoint(baseRing2D, apex2D);
  const baseFit = baseRing2D.map(fit);
  const apexFit = fit(apex2D);

  const baseNormal = rotateVec3([0, 1, 0], rotationX, rotationY, rotationZ);

  const fills: Shape3DFill[] = wireframe
    ? []
    : [
        { points: baseFit, curved: true, shade: shadeForNormal(baseNormal) },
        {
          points: [apexFit, baseFit[leftIdx], baseFit[rightIdx]],
          curved: false,
        },
      ];

  const sideLines: Shape3DPolyline[] = [
    { points: [apexFit, baseFit[leftIdx]], closed: false, curved: false },
    { points: [apexFit, baseFit[rightIdx]], closed: false, curved: false },
  ];

  const strokes: Shape3DPolyline[] = wireframe
    ? [{ points: baseFit, closed: true, curved: true }, ...sideLines]
    : [
        {
          points: lowerArcBetween(baseRing2D, leftIdx, rightIdx).map(fit),
          closed: false,
          curved: true,
        },
        ...sideLines,
      ];

  return { fills, strokes };
};

const getSphereGeometry = (element: Shape3DElementLike): Shape3DGeometry => {
  const { width, height, rotationX, rotationY, rotationZ, wireframe } = element;

  // a sphere's silhouette is rotation-invariant under orthographic
  // projection, so the outline never rotates — only the decoration rings do.
  // It has to be a ring in the XY (view) plane: a ring in any plane that
  // includes the depth axis (like makeRing's XZ rings) collapses to a line
  // once Z is dropped.
  const silhouette3D: Vec3[] = [];
  for (let i = 0; i < RING_SEGMENTS; i++) {
    const theta = (i / RING_SEGMENTS) * Math.PI * 2;
    silhouette3D.push([Math.cos(theta), Math.sin(theta), 0]);
  }
  const equator3D = makeRing(0, 1).map((v) =>
    rotateVec3(v, rotationX, rotationY, rotationZ),
  );
  // meridian: a great circle in the local X=0 plane
  const meridian3D: Vec3[] = [];
  for (let i = 0; i < RING_SEGMENTS; i++) {
    const theta = (i / RING_SEGMENTS) * Math.PI * 2;
    meridian3D.push([0, Math.cos(theta), Math.sin(theta)]);
  }
  const meridianRotated = meridian3D.map((v) =>
    rotateVec3(v, rotationX, rotationY, rotationZ),
  );

  const silhouette2D = silhouette3D.map(
    ([x, y]) => [x, y] as readonly [number, number],
  );
  const fit = makeFit(width, height);

  const silhouetteFit = silhouette2D.map(fit);
  const equatorFit = equator3D.map(([x, y]) => fit([x, y]));
  const meridianFit = meridianRotated.map(([x, y]) => fit([x, y]));

  const fills: Shape3DFill[] = wireframe
    ? []
    : [{ points: silhouetteFit, curved: true }];

  const strokes: Shape3DPolyline[] = [
    { points: silhouetteFit, closed: true, curved: true },
    { points: equatorFit, closed: true, curved: true },
    { points: meridianFit, closed: true, curved: true },
  ];

  return { fills, strokes };
};

/**
 * Rescales + recenters an already-projected geometry so its silhouette at
 * the CURRENT rotation fits within [0, width] x [0, height] — the box the
 * user actually drew — without ever overflowing it. Every geometry function
 * above still projects through `makeFit`'s fixed [-1, 1] reference first,
 * which only lands exactly on the box at rotation (0, 0, 0): a rotated
 * cube's diagonal, for instance, projects to more than that reference, so
 * the shape visibly overflowed (or, for a foreshortened view, fell short
 * of) the selection outline the user drew. A sphere's silhouette happens to
 * be rotation-invariant, so it always looked right — this makes every
 * primitive behave the way the sphere always did.
 *
 * The scale factor is uniform (one number, not independent X/Y factors):
 * a rigid solid's true proportions have to stay intact as it turns, or the
 * silhouette visibly squashes/stretches every frame as its natural aspect
 * ratio changes with rotation — which reads as the object warping rather
 * than rotating, especially for cylinder/cone's curved caps. So this only
 * shrinks to whichever axis is tighter (like `object-fit: contain`) and
 * centers the result — it can fall short of the far edges on the other
 * axis, but it never distorts and it never overflows.
 */
const rescaleToFit = (
  geometry: Shape3DGeometry,
  width: number,
  height: number,
): Shape3DGeometry => {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const { points } of [...geometry.fills, ...geometry.strokes]) {
    for (const [x, y] of points) {
      if (x < minX) {
        minX = x;
      }
      if (x > maxX) {
        maxX = x;
      }
      if (y < minY) {
        minY = y;
      }
      if (y > maxY) {
        maxY = y;
      }
    }
  }
  if (!Number.isFinite(minX)) {
    return geometry;
  }

  const spanX = maxX - minX || 1;
  const spanY = maxY - minY || 1;
  const scale = Math.min(width / spanX, height / spanY);
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  const remap = ([x, y]: LocalPoint): LocalPoint =>
    pointFrom<LocalPoint>(
      width / 2 + (x - centerX) * scale,
      height / 2 + (y - centerY) * scale,
    );

  return {
    fills: geometry.fills.map((fill) => ({
      ...fill,
      points: fill.points.map(remap),
    })),
    strokes: geometry.strokes.map((stroke) => ({
      ...stroke,
      points: stroke.points.map(remap),
    })),
  };
};

export const getShape3DGeometry = (
  element: Shape3DElementLike,
): Shape3DGeometry => {
  const geometry = (() => {
    switch (element.shape3DType) {
      case "cube":
        return getPolyhedronGeometry(CUBE_MODEL, element);
      case "pyramid":
        return getPolyhedronGeometry(PYRAMID_MODEL, element);
      case "cylinder":
        return getCylinderGeometry(element);
      case "cone":
        return getConeGeometry(element);
      case "sphere":
        return getSphereGeometry(element);
      default: {
        const _exhaustive: never = element.shape3DType;
        throw new Error(`Unimplemented Shape3DType ${_exhaustive}`);
      }
    }
  })();
  return rescaleToFit(geometry, element.width, element.height);
};

/** every 2D point the geometry touches — used to build a bounding polygon for hit-testing */
export const getShape3DOutlinePoints = (
  element: Shape3DElementLike,
): LocalPoint[] => {
  const { fills, strokes } = getShape3DGeometry(element);
  const points: LocalPoint[] = [];
  for (const fill of fills) {
    points.push(...fill.points);
  }
  for (const stroke of strokes) {
    points.push(...stroke.points);
  }
  return points;
};

export const isShape3DType = (value: string): value is Shape3DType =>
  value === "cube" ||
  value === "pyramid" ||
  value === "cylinder" ||
  value === "cone" ||
  value === "sphere";
