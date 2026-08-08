//
// On-canvas engineering / drafting instruments: compass, ruler, protractor,
// T-square, set square, angle bisector.
//
// Unlike generic shapes, these render as visible, manipulable overlays on the
// interactive canvas (semi-transparent, themed to match the board) — drag the
// body to move, a handle to rotate, and the pen handle to draw. A draw gesture
// commits a native Excalidraw element (compass → ellipse, straightedges → line,
// protractor / angle bisector → arrow) through the scene + undo pipeline.
//
// Interaction model (after GeoGebra's protractor/ruler and the open-source
// Compose-Geometry-Playground): the instrument is positioned in scene space and
// re-renders every frame the app state changes; dragging is driven by the
// standard pointer lifecycle in App.tsx, which delegates here.
//

import {
  THEME,
  FONT_FAMILY,
  STROKE_WIDTH,
  getFontFamilyString,
} from "@excalidraw/common";
import {
  newElement,
  newLinearElement,
  newArrowElement,
} from "@excalidraw/element";

import { pointFrom, type LocalPoint } from "@excalidraw/math";

import type { NonDeletedExcalidrawElement } from "@excalidraw/element/types";

import type { AppState } from "../types";
import type App from "./App";

/** the slice of AppState the overlay needs to theme itself — loose enough that
 *  the interactive renderer can pass its `InteractiveCanvasAppState` subset */
type InstrumentAppState = Pick<AppState, "theme" | "zoom">;

export type InstrumentType =
  | "compass"
  | "ruler"
  | "protractor"
  | "tsquare"
  | "setsquare"
  | "anglebisector";

export type InstrumentDragZone =
  | "move"
  | "rotate"
  | "draw"
  | "radius"
  | "spread"
  | null;

/**
 * A live drafting instrument placed on the canvas. All geometry is in scene
 * coordinates / radians; the renderer's existing zoom/scroll transform places
 * it correctly (same scheme as snap lines / selection element).
 */
export type InstrumentOverlay = {
  type: InstrumentType;
  /** anchor in scene coords (compass: circle center; ruler: body centre;
   *  protractor: baseline midpoint; T-square: head/blade junction;
   *  set square: right-angle corner; angle bisector: vertex) */
  x: number;
  y: number;
  /** instrument orientation, radians (0 = natural orientation) */
  rotation: number;
  /** compass: radius; ruler/T-square/set-square/angle-bisector: edge length;
   *  protractor: semicircle radius — all in scene units */
  size: number;
  /** compass: pen-leg angle (local); protractor / angle-bisector: marked ray
   *  angle (local, radians) */
  penAngle: number;
  /** ruler/T-square/set-square/angle-bisector: drawn length along the edge
   *  (0..edgeMax), set while drawing */
  drawLen: number;
  /** true while a draw gesture is in progress (pen handle dragged) */
  drawing: boolean;
  // --- transient interaction snapshot, set on pointer-down ---
  dragZone: InstrumentDragZone;
  dragOffsetX: number;
  dragOffsetY: number;
  dragStartRotation: number;
  dragStartPointerAngle: number;
  /** compass: local angle (radians) where the current draw gesture began, so
   *  the swept arc can be rendered live as the pen swings around */
  drawStartAngle: number;
  /** compass: signed accumulated sweep (radians) since the draw began — grows
   *  continuously as the pen swings, so the scribed arc never "flips" past
   *  180° and can span more than a full turn. Used for the live arc and to
   *  decide whether to commit a full circle or a partial arc. */
  drawSweep: number;
};

// geometry constants ----------------------------------------------------------

const MIN_RADIUS = 12;
const MAX_RADIUS = 4000;
const MIN_DRAW_LEN = 6;
// angle bisector: how wide the two legs may open, half-angle in radians
// (~5°..~165°) — wide enough to trace almost any real-world angle, never so
// narrow/wide the two legs and the bisector become indistinguishable
const MIN_SPREAD = 0.09;
const MAX_SPREAD = Math.PI * 0.92;

// CSS reference pixel convention (96dpi, 1in = 2.54cm) — the same assumption
// browsers use for `1px`, so a scene unit here reads as a real screen cm.
const PX_PER_CM = 96 / 2.54;

const DEFAULT_SIZE: Record<InstrumentType, number> = {
  compass: 4 * PX_PER_CM, // opens to a clean 4.0cm radius by default
  ruler: 20 * PX_PER_CM, // a 20cm ruler, ticked in real cm/mm — see drawRuler
  protractor: 180,
  tsquare: 10 * PX_PER_CM, // a 10cm blade, ticked in real cm/mm
  setsquare: 8 * PX_PER_CM, // 8cm legs, hypotenuse ticked in real cm/mm
  anglebisector: 280,
};

const REST_PEN_ANGLE: Record<InstrumentType, number> = {
  compass: 0.6,
  ruler: 0,
  protractor: -Math.PI / 4,
  tsquare: 0,
  setsquare: 0,
  anglebisector: 0.5, // ~57° between the two legs, matching the old fixed value
};

// 2D helpers ------------------------------------------------------------------

type Vec = [number, number];

const rot = (p: Vec, a: number): Vec => {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [p[0] * c - p[1] * s, p[0] * s + p[1] * c];
};

const localToScene = (local: Vec, state: InstrumentOverlay): Vec => [
  state.x +
    local[0] * Math.cos(state.rotation) -
    local[1] * Math.sin(state.rotation),
  state.y +
    local[0] * Math.sin(state.rotation) +
    local[1] * Math.cos(state.rotation),
];

const sceneToLocal = (scene: Vec, state: InstrumentOverlay): Vec =>
  rot([scene[0] - state.x, scene[1] - state.y], -state.rotation);

const clamp = (v: number, lo: number, hi: number) =>
  v < lo ? lo : v > hi ? hi : v;

// per-instrument local geometry ----------------------------------------------

/** the primary drawing edge in local frame: a start point, unit direction,
 *  and max length. compass returns null (it draws a circle, not an edge) */
const instrumentEdge = (
  state: InstrumentOverlay,
): { start: Vec; dir: Vec; max: number } | null => {
  const w = Math.max(state.size * 0.14, 14);
  switch (state.type) {
    case "ruler":
      return { start: [-state.size / 2, -w / 2], dir: [1, 0], max: state.size };
    case "tsquare":
      return { start: [0, 0], dir: [0, 1], max: state.size };
    case "setsquare": {
      const inv = 1 / Math.SQRT2;
      return {
        start: [state.size, 0],
        dir: [-inv, inv],
        max: state.size * Math.SQRT2,
      };
    }
    case "anglebisector":
      return { start: [0, 0], dir: [1, 0], max: state.size };
    case "protractor":
      return {
        start: [0, 0],
        dir: [Math.cos(state.penAngle), Math.sin(state.penAngle)],
        max: state.size,
      };
    default:
      return null;
  }
};

const isArrowInstrument = (type: InstrumentType) =>
  type === "protractor" || type === "anglebisector";

// the draw handle, in local frame (where the pen currently sits) */
const drawHandleLocal = (state: InstrumentOverlay): Vec => {
  switch (state.type) {
    case "compass":
      return [
        state.size * Math.cos(state.penAngle),
        state.size * Math.sin(state.penAngle),
      ];
    case "protractor":
      return [
        state.size * Math.cos(state.penAngle),
        state.size * Math.sin(state.penAngle),
      ];
    default: {
      const edge = instrumentEdge(state)!;
      return [
        edge.start[0] + edge.dir[0] * state.drawLen,
        edge.start[1] + edge.dir[1] * state.drawLen,
      ];
    }
  }
};

// the rotate handle, in local frame
const rotateHandleLocal = (state: InstrumentOverlay): Vec => {
  switch (state.type) {
    case "compass":
      return [0, -state.size * 0.7 - 14];
    case "ruler":
      return [-state.size / 2 - 6, 0];
    case "protractor":
      return [0, -state.size - 6];
    case "tsquare":
      return [0, state.size + 6];
    case "setsquare":
      return [0, state.size + 6];
    case "anglebisector":
      return [state.size + 6, 0];
  }
};

// the radius-adjust handle (compass only), in local frame — a grip sitting on
// the pen leg, ~halfway from the hinge to the pen tip. Drag it to open / close
// the compass (set the radius) without drawing.
const radiusHandleLocal = (state: InstrumentOverlay): Vec | null => {
  if (state.type !== "compass") {
    return null;
  }
  const h = state.size * 0.7;
  const pen: Vec = [
    state.size * Math.cos(state.penAngle),
    state.size * Math.sin(state.penAngle),
  ];
  return [pen[0] * 0.5, -h + (pen[1] - -h) * 0.5];
};

// the two spread handles (angle-bisector only), in local frame — small grips
// sitting at the tip of each leg. Drag either one to open/close the angle
// being bisected; the bisector arm always stays exactly between them.
const spreadHandlePoints = (state: InstrumentOverlay): [Vec, Vec] | null => {
  if (state.type !== "anglebisector") {
    return null;
  }
  const s = state.size * 0.7;
  const spread = state.penAngle;
  return [
    [Math.cos(spread) * s, Math.sin(spread) * s],
    [Math.cos(-spread) * s, Math.sin(-spread) * s],
  ];
};

// local-frame bounding box (for the move hit zone), as [minX,minY,maxX,maxY]
const localBBox = (
  state: InstrumentOverlay,
): [number, number, number, number] => {
  const w = Math.max(state.size * 0.14, 14);
  const headW = state.size * 0.5;
  switch (state.type) {
    case "compass":
      return [-state.size, -state.size * 0.7, state.size, state.size];
    case "ruler":
      return [-state.size / 2, -w / 2, state.size / 2, w / 2];
    case "protractor":
      return [-state.size, -state.size, state.size, 0];
    case "tsquare":
      return [-headW / 2, 0, headW / 2, state.size];
    case "setsquare":
      return [0, 0, state.size, state.size];
    case "anglebisector": {
      // scales with the current leg spread so "move" hit-testing always
      // covers both legs, however wide the bisected angle is opened
      const legY = Math.sin(state.penAngle) * state.size * 0.7;
      return [0, -legY, state.size, legY];
    }
  }
};

// factories -------------------------------------------------------------------

export const defaultInstrument = (
  type: InstrumentType,
  x: number,
  y: number,
): InstrumentOverlay => ({
  type,
  x,
  y,
  rotation: 0,
  size: DEFAULT_SIZE[type],
  penAngle: REST_PEN_ANGLE[type],
  drawLen: 0,
  drawing: false,
  dragZone: null,
  dragOffsetX: 0,
  dragOffsetY: 0,
  dragStartRotation: 0,
  dragStartPointerAngle: 0,
  drawStartAngle: 0,
  drawSweep: 0,
});

// hit testing -----------------------------------------------------------------

/** hit tolerance in screen px — converted to scene units by the caller */
export const INSTRUMENT_HIT_PX = 14;

export const hitTestInstrument = (
  scenePt: Vec,
  state: InstrumentOverlay,
  zoom: number,
): InstrumentDragZone => {
  const tol = INSTRUMENT_HIT_PX / zoom;
  const handleTol = Math.max(tol, 14 / zoom);

  const drawHandle = localToScene(drawHandleLocal(state), state);
  if (
    Math.hypot(scenePt[0] - drawHandle[0], scenePt[1] - drawHandle[1]) <=
    handleTol
  ) {
    return "draw";
  }
  const rotHandle = localToScene(rotateHandleLocal(state), state);
  if (
    Math.hypot(scenePt[0] - rotHandle[0], scenePt[1] - rotHandle[1]) <=
    handleTol
  ) {
    return "rotate";
  }
  const radLocal = radiusHandleLocal(state);
  if (radLocal) {
    const radHandle = localToScene(radLocal, state);
    if (
      Math.hypot(scenePt[0] - radHandle[0], scenePt[1] - radHandle[1]) <=
      handleTol
    ) {
      return "radius";
    }
  }
  const spreadPts = spreadHandlePoints(state);
  if (spreadPts) {
    for (const local of spreadPts) {
      const handle = localToScene(local, state);
      if (
        Math.hypot(scenePt[0] - handle[0], scenePt[1] - handle[1]) <=
        handleTol
      ) {
        return "spread";
      }
    }
  }
  const [lx, ly] = sceneToLocal(scenePt, state);
  const [minX, minY, maxX, maxY] = localBBox(state);
  if (
    lx >= minX - tol &&
    lx <= maxX + tol &&
    ly >= minY - tol &&
    ly <= maxY + tol
  ) {
    return "move";
  }
  return null;
};

// pointer-down: snapshot the interaction -------------------------------------

export const beginInstrumentDrag = (
  state: InstrumentOverlay,
  scenePt: Vec,
  zoom: number,
): InstrumentOverlay => {
  const zone = hitTestInstrument(scenePt, state, zoom);
  if (zone === "draw") {
    return {
      ...state,
      dragZone: "draw",
      drawing: true,
      drawStartAngle: state.penAngle,
      drawSweep: 0,
    };
  }
  if (zone === "radius") {
    // opening the compass to set the radius — not a draw gesture
    return { ...state, dragZone: "radius", drawing: false };
  }
  if (zone === "spread") {
    // opening/closing the bisected angle — not a draw gesture
    return { ...state, dragZone: "spread", drawing: false };
  }
  if (zone === "rotate") {
    const a = Math.atan2(scenePt[1] - state.y, scenePt[0] - state.x);
    return {
      ...state,
      dragZone: "rotate",
      dragStartRotation: state.rotation,
      dragStartPointerAngle: a,
    };
  }
  if (zone === "move") {
    return {
      ...state,
      dragZone: "move",
      dragOffsetX: scenePt[0] - state.x,
      dragOffsetY: scenePt[1] - state.y,
    };
  }
  return { ...state, dragZone: null };
};

// pointer-move: apply the drag ------------------------------------------------

export const updateInstrumentOnDrag = (
  state: InstrumentOverlay,
  scenePt: Vec,
): InstrumentOverlay => {
  switch (state.dragZone) {
    case "move":
      return {
        ...state,
        x: scenePt[0] - state.dragOffsetX,
        y: scenePt[1] - state.dragOffsetY,
      };
    case "rotate": {
      const a = Math.atan2(scenePt[1] - state.y, scenePt[0] - state.x);
      return {
        ...state,
        rotation: state.dragStartRotation + (a - state.dragStartPointerAngle),
      };
    }
    case "draw": {
      const [lx, ly] = sceneToLocal(scenePt, state);
      if (state.type === "compass") {
        // scribing: the radius is LOCKED at the value set when the swing
        // began (size is untouched) — the pen swings around a perfect
        // circle, and the scribed arc stays a true circle. Only the angle
        // follows the pointer. The sweep is accumulated continuously
        // (handling the ±π wrap) so the arc grows past 180° without
        // flipping and can span more than a full turn.
        const next = Math.atan2(ly, lx);
        let delta = next - state.penAngle;
        while (delta > Math.PI) {
          delta -= Math.PI * 2;
        }
        while (delta < -Math.PI) {
          delta += Math.PI * 2;
        }
        return {
          ...state,
          penAngle: next,
          drawSweep: state.drawSweep + delta,
          drawing: true,
        };
      }
      if (state.type === "protractor") {
        return {
          ...state,
          penAngle: Math.atan2(ly, lx),
          drawing: true,
        };
      }
      const edge = instrumentEdge(state)!;
      const relX = lx - edge.start[0];
      const relY = ly - edge.start[1];
      const t = relX * edge.dir[0] + relY * edge.dir[1];
      return {
        ...state,
        drawLen: clamp(t, 0, edge.max),
        drawing: true,
      };
    }
    case "radius": {
      // compass only — open / close the legs to set the radius + leg angle
      const [lx, ly] = sceneToLocal(scenePt, state);
      const r = clamp(Math.hypot(lx, ly), MIN_RADIUS, MAX_RADIUS);
      return {
        ...state,
        size: r,
        penAngle: Math.atan2(ly, lx),
      };
    }
    case "spread": {
      // angle-bisector only — open/close the two legs around the bisector;
      // dragging either leg tip sets the same half-angle by symmetry
      const [lx, ly] = sceneToLocal(scenePt, state);
      const spread = clamp(
        Math.abs(Math.atan2(ly, lx)),
        MIN_SPREAD,
        MAX_SPREAD,
      );
      return { ...state, penAngle: spread };
    }
    default:
      return state;
  }
};

// commit the drawn element ----------------------------------------------------

export const commitInstrumentDrawing = (
  app: App,
  state: InstrumentOverlay,
): NonDeletedExcalidrawElement | null => {
  const s = app.state;
  const base = {
    strokeColor: s.currentItemStrokeColor,
    backgroundColor: s.currentItemBackgroundColor,
    fillStyle: s.currentItemFillStyle,
    strokeWidth: STROKE_WIDTH[s.currentItemStrokeWidthKey],
    strokeStyle: s.currentItemStrokeStyle,
    roughness: s.currentItemRoughness,
    opacity: s.currentItemOpacity,
    roundness: null,
  } as const;

  if (state.type === "compass") {
    if (state.size < MIN_RADIUS) {
      return null;
    }
    const r = state.size;
    const sweep = state.drawSweep;
    const absSweep = Math.abs(sweep);
    // a near-complete (or multi-revolution) scribe → a clean full circle
    if (absSweep >= Math.PI * 2 - 0.05) {
      const el = newElement({
        type: "ellipse",
        x: state.x - r,
        y: state.y - r,
        width: r * 2,
        height: r * 2,
        ...base,
        // a compass scribes a geometrically perfect circle — never the
        // hand-drawn roughness the scene default would apply
        roughness: 0,
      });
      app.scene.insertElementsAtIndex([el], null);
      app.scheduleCapture();
      app.setState({ selectedElementIds: { [el.id]: true } });
      return el;
    }
    // a partial scribe → commit the actual arc as a polyline along the
    // (perfect, locked-radius) circle, so you can draw part of a circle
    if (absSweep < 0.04) {
      return null;
    }
    // dense sampling (every ~1.5°) + zero roughness so the arc reads as a
    // true smooth curve, not a hand-drawn one
    const stepCount = Math.min(
      720,
      Math.max(2, Math.ceil(absSweep / (Math.PI / 120))),
    );
    const startLocal: Vec = [
      r * Math.cos(state.drawStartAngle),
      r * Math.sin(state.drawStartAngle),
    ];
    const first = localToScene(startLocal, state);
    const pts: LocalPoint[] = [pointFrom<LocalPoint>(0, 0)];
    for (let i = 1; i <= stepCount; i++) {
      const theta = state.drawStartAngle + (sweep * i) / stepCount;
      const sc = localToScene(
        [r * Math.cos(theta), r * Math.sin(theta)],
        state,
      );
      pts.push(pointFrom<LocalPoint>(sc[0] - first[0], sc[1] - first[1]));
    }
    const el = newLinearElement({
      type: "line",
      x: first[0],
      y: first[1],
      points: pts,
      ...base,
      roughness: 0,
    });
    app.scene.insertElementsAtIndex([el], null);
    app.scheduleCapture();
    app.setState({ selectedElementIds: { [el.id]: true } });
    return el;
  }

  const edge = instrumentEdge(state);
  if (!edge) {
    return null;
  }
  const len = state.drawing ? state.drawLen : edge.max;
  if (len < MIN_DRAW_LEN) {
    return null;
  }
  const start = localToScene(edge.start, state);
  const endLocal: Vec = [
    edge.start[0] + edge.dir[0] * len,
    edge.start[1] + edge.dir[1] * len,
  ];
  const end = localToScene(endLocal, state);

  let el: NonDeletedExcalidrawElement;
  const points: LocalPoint[] = [
    pointFrom<LocalPoint>(0, 0),
    pointFrom<LocalPoint>(end[0] - start[0], end[1] - start[1]),
  ];
  if (isArrowInstrument(state.type)) {
    el = newArrowElement({
      type: "arrow",
      x: start[0],
      y: start[1],
      points,
      startArrowhead: null,
      endArrowhead: s.currentItemEndArrowhead,
      ...base,
    });
  } else {
    el = newLinearElement({
      type: "line",
      x: start[0],
      y: start[1],
      points,
      ...base,
    });
  }
  app.scene.insertElementsAtIndex([el], null);
  app.scheduleCapture();
  app.setState({
    selectedElementIds: { [el.id]: true },
  });
  return el;
};

// rendering -------------------------------------------------------------------

type InstrumentStyle = {
  ink: string;
  inkSoft: string;
  bodyFill: string;
  bodyFill2: string; // gradient stop
  edgeFill: string;
  accent: string;
  accentSoft: string;
  metal: string;
  metalDark: string;
  handleFill: string;
  handleRing: string;
  preview: string;
  shadow: string;
  lineWidth: number;
  thinLineWidth: number;
  font: string;
  labelFont: string;
  /** scene units per screen px (1 / zoom) — for sizing handles/ticks in px */
  px: number;
};

const instrumentStyle = (appState: InstrumentAppState): InstrumentStyle => {
  const dark = appState.theme === THEME.DARK;
  const z = appState.zoom.value;
  const px = 1 / z;
  const fam = getFontFamilyString({ fontFamily: FONT_FAMILY.Excalifont });
  return dark
    ? {
        ink: "#e9eaee",
        inkSoft: "rgba(233,234,238,0.55)",
        bodyFill: "rgba(54,57,66,0.62)",
        bodyFill2: "rgba(36,38,45,0.5)",
        edgeFill: "rgba(255,255,255,0.12)",
        // the lab's real --accent-violet token (math-lab/assets/css/engine.css),
        // not an invented nearby purple
        accent: "#9b8bd9",
        accentSoft: "rgba(155,139,217,0.22)",
        // a mid-tone slate, deliberately darker than `ink` — a near-white
        // metal would leave the ink outline around it almost invisible
        metal: "#9a9fab",
        metalDark: "#5f636d",
        handleFill: "#e9eaee",
        handleRing: "#9b8bd9",
        preview: "rgba(155,139,217,0.9)",
        shadow: "rgba(0,0,0,0.5)",
        lineWidth: 1.6 * px,
        thinLineWidth: 1 * px,
        font: `${10 * px}px ${fam}`,
        labelFont: `${11 * px}px ${fam}`,
        px,
      }
    : {
        ink: "#2b2b2b",
        inkSoft: "rgba(43,43,43,0.45)",
        bodyFill: "rgba(255,255,255,0.7)",
        bodyFill2: "rgba(238,240,245,0.6)",
        edgeFill: "rgba(0,0,0,0.08)",
        accent: "#6965db",
        accentSoft: "rgba(105,101,219,0.2)",
        // deeper than bodyFill on purpose — flat fills need real contrast to
        // read as metal instead of blending into the frosted white body
        metal: "#e3e7ec",
        metalDark: "#a8afb9",
        handleFill: "#ffffff",
        handleRing: "#6965db",
        preview: "rgba(105,101,219,0.9)",
        shadow: "rgba(40,40,60,0.2)",
        lineWidth: 1.6 * px,
        thinLineWidth: 1 * px,
        font: `${10 * px}px ${fam}`,
        labelFont: `${11 * px}px ${fam}`,
        px,
      };
};

// a linear metallic gradient across a band of `thickness` scene-units
const metalGrad = (
  ctx: CanvasRenderingContext2D,
  style: InstrumentStyle,
  thickness: number,
) => {
  // a restrained brushed-metal band — one soft mid highlight, not a glossy
  // cylinder
  const g = ctx.createLinearGradient(0, -thickness / 2, 0, thickness / 2);
  g.addColorStop(0, style.metalDark);
  g.addColorStop(0.5, style.metal);
  g.addColorStop(1, style.metalDark);
  return g;
};

// paint a soft drop shadow around the next fill, then clear it so later
// strokes don't get blurred
const withShadow = (
  ctx: CanvasRenderingContext2D,
  style: InstrumentStyle,
  fn: () => void,
) => {
  ctx.save();
  ctx.shadowColor = style.shadow;
  ctx.shadowBlur = 4 * style.px;
  ctx.shadowOffsetY = 1 * style.px;
  fn();
  ctx.restore();
};

// a frosted body: shadowed translucent fill (with optional gradient), then a
// crisp outline
const frostedBody = (
  ctx: CanvasRenderingContext2D,
  style: InstrumentStyle,
  buildPath: () => void,
  fill: string | CanvasGradient = style.bodyFill,
) => {
  withShadow(ctx, style, () => {
    buildPath();
    ctx.fillStyle = fill;
    ctx.fill();
  });
  buildPath();
  ctx.strokeStyle = style.ink;
  ctx.lineWidth = style.lineWidth;
  ctx.lineJoin = "round";
  ctx.stroke();
};

// rounded-rect path helper
const roundRect = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) => {
  const rr = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
};

// the live "ink being laid down" preview — a bold solid ghost line in the ink
// colour (what will actually be committed) over a thin accent guide
const drawInkPreview = (
  ctx: CanvasRenderingContext2D,
  a: Vec,
  b: Vec,
  style: InstrumentStyle,
) => {
  ctx.save();
  // accent guide
  ctx.strokeStyle = style.accentSoft;
  ctx.lineWidth = 4 * style.px;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(a[0], a[1]);
  ctx.lineTo(b[0], b[1]);
  ctx.stroke();
  // ink ghost (what the committed element will look like)
  ctx.strokeStyle = style.ink;
  ctx.globalAlpha = 0.85;
  ctx.lineWidth = 2.4 * style.px;
  ctx.setLineDash([10 * style.px, 6 * style.px]);
  ctx.beginPath();
  ctx.moveTo(a[0], a[1]);
  ctx.lineTo(b[0], b[1]);
  ctx.stroke();
  ctx.restore();
};

const drawHandle = (
  ctx: CanvasRenderingContext2D,
  p: Vec,
  style: InstrumentStyle,
  active = false,
) => {
  const r = 6 * style.px;
  if (active) {
    // crisp emphasis ring while drawing — no blur, just a thin outer band
    ctx.beginPath();
    ctx.arc(p[0], p[1], r * 1.7, 0, Math.PI * 2);
    ctx.strokeStyle = style.accent;
    ctx.globalAlpha = 0.35;
    ctx.lineWidth = 1 * style.px;
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  // a single flat disc with a thin accent rim — a precise mark, not a
  // glossy button
  ctx.beginPath();
  ctx.arc(p[0], p[1], r, 0, Math.PI * 2);
  ctx.fillStyle = style.handleFill;
  ctx.fill();
  ctx.strokeStyle = style.handleRing;
  ctx.lineWidth = 1.2 * style.px;
  ctx.stroke();
};

const drawRotateHandle = (
  ctx: CanvasRenderingContext2D,
  p: Vec,
  style: InstrumentStyle,
) => {
  const r = 6 * style.px;
  ctx.beginPath();
  ctx.arc(p[0], p[1], r, 0, Math.PI * 2);
  ctx.fillStyle = style.handleFill;
  ctx.fill();
  ctx.strokeStyle = style.accent;
  ctx.lineWidth = 1.2 * style.px;
  ctx.stroke();
  // two small grip ticks suggesting rotation
  ctx.strokeStyle = style.accent;
  ctx.lineWidth = style.thinLineWidth;
  for (const ang of [Math.PI * 0.25, Math.PI * 1.25]) {
    ctx.beginPath();
    ctx.moveTo(p[0] + Math.cos(ang) * r * 0.4, p[1] + Math.sin(ang) * r * 0.4);
    ctx.lineTo(
      p[0] + Math.cos(ang) * r * 0.75,
      p[1] + Math.sin(ang) * r * 0.75,
    );
    ctx.stroke();
  }
};

// small angle readout chip (text in scene units, upright in local frame)
const drawReadout = (
  ctx: CanvasRenderingContext2D,
  p: Vec,
  text: string,
  style: InstrumentStyle,
) => {
  ctx.save();
  ctx.font = style.labelFont;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const w = ctx.measureText(text).width + 10 * style.px;
  const h = 17 * style.px;
  roundRect(ctx, p[0] - w / 2, p[1] - h / 2, w, h, 6 * style.px);
  withShadow(ctx, style, () => {
    ctx.fillStyle = style.bodyFill;
    ctx.fill();
  });
  roundRect(ctx, p[0] - w / 2, p[1] - h / 2, w, h, 6 * style.px);
  ctx.strokeStyle = style.accent;
  ctx.lineWidth = style.thinLineWidth;
  ctx.stroke();
  ctx.fillStyle = style.ink;
  ctx.fillText(text, p[0], p[1]);
  ctx.restore();
};

// a metallic leg drawn as a tapered band with a centred highlight rib
const drawLeg = (
  ctx: CanvasRenderingContext2D,
  a: Vec,
  b: Vec,
  width: number,
  style: InstrumentStyle,
) => {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(a[0] + nx * width, a[1] + ny * width);
  ctx.lineTo(b[0] + nx * width * 0.55, b[1] + ny * width * 0.55);
  ctx.lineTo(b[0] - nx * width * 0.55, b[1] - ny * width * 0.55);
  ctx.lineTo(a[0] - nx * width, a[1] - ny * width);
  ctx.closePath();
  withShadow(ctx, style, () => {
    ctx.fillStyle = metalGrad(ctx, style, width * 2);
    ctx.fill();
  });
  ctx.strokeStyle = style.ink;
  ctx.lineWidth = style.thinLineWidth;
  ctx.stroke();
  // centred highlight rib
  ctx.beginPath();
  ctx.moveTo(a[0], a[1]);
  ctx.lineTo(b[0], b[1]);
  ctx.strokeStyle = style.metal;
  ctx.lineWidth = style.thinLineWidth;
  ctx.globalAlpha = 0.6;
  ctx.stroke();
  ctx.restore();
};

const withTransform = (
  ctx: CanvasRenderingContext2D,
  state: InstrumentOverlay,
  fn: () => void,
) => {
  ctx.save();
  ctx.translate(state.x, state.y);
  ctx.rotate(state.rotation);
  fn();
  ctx.restore();
};

// the leg grip knob (compass radius handle): a metallic clamp sitting across
// the pen leg — drag it to open / close the compass
const drawGripHandle = (
  ctx: CanvasRenderingContext2D,
  p: Vec,
  legAngle: number,
  style: InstrumentStyle,
  active = false,
) => {
  const r = 6 * style.px;
  if (active) {
    // crisp emphasis ring while opening — no blur
    ctx.beginPath();
    ctx.arc(p[0], p[1], r * 1.6, 0, Math.PI * 2);
    ctx.strokeStyle = style.accent;
    ctx.globalAlpha = 0.35;
    ctx.lineWidth = 1 * style.px;
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  // a flat metal disc — matte, no gloss
  ctx.beginPath();
  ctx.arc(p[0], p[1], r, 0, Math.PI * 2);
  ctx.fillStyle = style.metal;
  ctx.fill();
  ctx.strokeStyle = style.ink;
  ctx.lineWidth = style.lineWidth;
  ctx.stroke();
  // perpendicular grip bar across the leg (the "clamp")
  ctx.save();
  ctx.translate(p[0], p[1]);
  ctx.rotate(legAngle + Math.PI / 2);
  ctx.beginPath();
  ctx.moveTo(-r * 0.8, 0);
  ctx.lineTo(r * 0.8, 0);
  ctx.strokeStyle = style.ink;
  ctx.lineWidth = 2 * style.px;
  ctx.lineCap = "round";
  ctx.stroke();
  ctx.restore();
};

const drawCompass = (
  ctx: CanvasRenderingContext2D,
  state: InstrumentOverlay,
  style: InstrumentStyle,
) => {
  const r = state.size;
  const h = r * 0.7;
  const pen = drawHandleLocal(state);
  const legAngle = Math.atan2(pen[1] - -h, pen[0] - 0);
  const grip = radiusHandleLocal(state)!;
  const opening = state.dragZone === "radius";
  withTransform(ctx, state, () => {
    // faint guide circle — the circle this compass will scribe. Stronger
    // while opening the legs so you can read the target radius, dim at rest.
    ctx.save();
    ctx.strokeStyle = opening ? style.accent : style.inkSoft;
    ctx.globalAlpha = opening ? 0.85 : 0.5;
    ctx.lineWidth = style.thinLineWidth;
    ctx.setLineDash([6 * style.px, 5 * style.px]);
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    // the live scribed arc — solid ink growing along the locked (perfect)
    // circle as the pen swings around. Radius is frozen during a draw, so
    // this is always a true circle.
    if (state.drawing) {
      const s0 = state.drawStartAngle;
      const sweep = state.drawSweep;
      ctx.save();
      ctx.strokeStyle = style.ink;
      ctx.globalAlpha = 0.9;
      ctx.lineWidth = 2.4 * style.px;
      ctx.lineCap = "round";
      ctx.beginPath();
      // continuous sweep — grows past 180° without flipping
      ctx.arc(0, 0, r, s0, s0 + sweep, sweep < 0);
      ctx.stroke();
      ctx.restore();
      // ink comet at the pen tip
      ctx.fillStyle = style.accent;
      ctx.beginPath();
      ctx.arc(pen[0], pen[1], 3.5 * style.px, 0, Math.PI * 2);
      ctx.fill();
    }
    // legs — metallic tapered bands
    drawLeg(ctx, [0, -h], [0, 0], 3.2 * style.px, style); // needle leg
    drawLeg(ctx, [0, -h], pen, 3.2 * style.px, style); // pencil leg
    // knurled hinge knob — flat metal, no glossy sphere
    const hr = 6 * style.px;
    ctx.beginPath();
    ctx.arc(0, -h, hr, 0, Math.PI * 2);
    ctx.fillStyle = style.metal;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(0, -h, hr, 0, Math.PI * 2);
    ctx.strokeStyle = style.ink;
    ctx.lineWidth = style.lineWidth;
    ctx.stroke();
    // knurling tick marks around the knob
    ctx.strokeStyle = style.metalDark;
    ctx.lineWidth = style.thinLineWidth;
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(0 + Math.cos(a) * hr * 0.55, -h + Math.sin(a) * hr * 0.55);
      ctx.lineTo(0 + Math.cos(a) * hr * 0.92, -h + Math.sin(a) * hr * 0.92);
      ctx.stroke();
    }
    // adjustment wheel between the legs
    const wy = -h * 0.62;
    ctx.beginPath();
    ctx.arc(0, wy, 3.2 * style.px, 0, Math.PI * 2);
    ctx.fillStyle = style.metal;
    ctx.fill();
    ctx.strokeStyle = style.accent;
    ctx.lineWidth = style.thinLineWidth;
    ctx.stroke();
    // needle point at pivot
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-2 * style.px, 5 * style.px);
    ctx.lineTo(2 * style.px, 5 * style.px);
    ctx.closePath();
    ctx.fillStyle = style.ink;
    ctx.fill();
    // pencil body near the pen tip
    const ang = Math.atan2(pen[1], pen[0]);
    ctx.save();
    ctx.translate(pen[0], pen[1]);
    ctx.rotate(ang);
    ctx.beginPath();
    ctx.roundRect
      ? ctx.roundRect(
          -12 * style.px,
          -2.6 * style.px,
          12 * style.px,
          5.2 * style.px,
          1.5 * style.px,
        )
      : ctx.rect(
          -12 * style.px,
          -2.6 * style.px,
          12 * style.px,
          5.2 * style.px,
        );
    ctx.fillStyle = style.metal;
    ctx.fill();
    ctx.strokeStyle = style.ink;
    ctx.lineWidth = style.thinLineWidth;
    ctx.stroke();
    // pencil nib
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-3 * style.px, -2.6 * style.px);
    ctx.lineTo(-3 * style.px, 2.6 * style.px);
    ctx.closePath();
    ctx.fillStyle = style.ink;
    ctx.fill();
    ctx.restore();
    // radius readout, in real cm (same 96dpi convention as the ruler)
    drawReadout(
      ctx,
      [r * 0.42, r * 0.42],
      `r ${(r / PX_PER_CM).toFixed(1)}cm`,
      style,
    );
    // handles — grip (open), pen tip (scribe), rotate
    drawGripHandle(ctx, grip, legAngle, style, opening);
    drawHandle(ctx, pen, style, state.drawing);
    drawRotateHandle(ctx, [0, -h], style);
  });
};

const drawRuler = (
  ctx: CanvasRenderingContext2D,
  state: InstrumentOverlay,
  style: InstrumentStyle,
) => {
  const w = Math.max(state.size * 0.14, 20);
  const half = state.size / 2;
  withTransform(ctx, state, () => {
    const grad = ctx.createLinearGradient(0, -w / 2, 0, w / 2);
    grad.addColorStop(0, style.bodyFill2);
    grad.addColorStop(0.5, style.bodyFill);
    grad.addColorStop(1, style.bodyFill2);
    frostedBody(
      ctx,
      style,
      () => roundRect(ctx, -half, -w / 2, state.size, w, 5 * style.px),
      grad,
    );
    // centre inlay strip
    ctx.save();
    roundRect(
      ctx,
      -half + 4 * style.px,
      -w * 0.16,
      state.size - 8 * style.px,
      w * 0.06,
      2 * style.px,
    );
    ctx.fillStyle = style.accentSoft;
    ctx.fill();
    ctx.restore();
    // bevel highlight along the top edge
    ctx.beginPath();
    ctx.moveTo(-half + 4 * style.px, -w / 2 + 2.5 * style.px);
    ctx.lineTo(half - 4 * style.px, -w / 2 + 2.5 * style.px);
    ctx.strokeStyle = style.edgeFill;
    ctx.lineWidth = style.thinLineWidth;
    ctx.stroke();
    // end caps
    for (const ex of [-half, half]) {
      ctx.beginPath();
      ctx.moveTo(ex, -w / 2);
      ctx.lineTo(ex, w / 2);
      ctx.strokeStyle = style.ink;
      ctx.lineWidth = style.lineWidth;
      ctx.stroke();
    }
    // ticks: cm (tall, labelled) / half-cm (medium) / mm (short) — a real
    // metric scale, not an arbitrary percentage split
    ctx.strokeStyle = style.ink;
    ctx.fillStyle = style.ink;
    ctx.font = style.font;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const mmPx = PX_PER_CM / 10;
    const totalMm = Math.round(state.size / mmPx);
    for (let mm = 0; mm <= totalMm; mm++) {
      const x = -half + mm * mmPx;
      const isCm = mm % 10 === 0;
      const isHalfCm = mm % 5 === 0;
      ctx.lineWidth = isCm ? style.lineWidth : style.thinLineWidth;
      ctx.beginPath();
      ctx.moveTo(x, -w / 2);
      ctx.lineTo(x, -w / 2 + (isCm ? w * 0.5 : isHalfCm ? w * 0.36 : w * 0.2));
      ctx.stroke();
      if (isCm) {
        // the unit only needs stating once — tack it onto the last number
        const label = mm === totalMm ? `${mm / 10}cm` : `${mm / 10}`;
        ctx.fillText(label, x, w / 4);
      }
    }
    // live ink preview along the top edge
    if (state.drawing) {
      drawInkPreview(
        ctx,
        [-half, -w / 2],
        [-half + state.drawLen, -w / 2],
        style,
      );
    }
    drawHandle(ctx, [-half + state.drawLen, -w / 2], style, state.drawing);
    drawRotateHandle(ctx, [-half - 8 * style.px, 0], style);
  });
};

const drawProtractor = (
  ctx: CanvasRenderingContext2D,
  state: InstrumentOverlay,
  style: InstrumentStyle,
) => {
  const r = state.size;
  withTransform(ctx, state, () => {
    // frosted semicircle disc with radial gradient
    const grad = ctx.createRadialGradient(0, -r * 0.4, 0, 0, 0, r);
    grad.addColorStop(0, style.bodyFill);
    grad.addColorStop(1, style.bodyFill2);
    frostedBody(
      ctx,
      style,
      () => {
        ctx.beginPath();
        ctx.arc(0, 0, r, Math.PI, 2 * Math.PI);
        ctx.closePath();
      },
      grad,
    );
    // outer bevel ring
    ctx.beginPath();
    ctx.arc(0, 0, r - 2 * style.px, Math.PI, 2 * Math.PI);
    ctx.strokeStyle = style.edgeFill;
    ctx.lineWidth = style.thinLineWidth;
    ctx.stroke();
    // inner reference arc
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.8, Math.PI, 2 * Math.PI);
    ctx.strokeStyle = style.inkSoft;
    ctx.lineWidth = style.thinLineWidth;
    ctx.stroke();
    // fine ticks every 5°, labels every 30°, majors every 10°
    ctx.strokeStyle = style.ink;
    ctx.fillStyle = style.ink;
    ctx.font = style.font;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (let deg = 0; deg <= 180; deg += 5) {
      const a = -(deg / 180) * Math.PI;
      const major = deg % 10 === 0;
      const big = deg % 30 === 0;
      const inner = big ? r * 0.74 : major ? r * 0.85 : r * 0.93;
      ctx.lineWidth = big ? style.lineWidth : style.thinLineWidth;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      ctx.lineTo(Math.cos(a) * inner, Math.sin(a) * inner);
      ctx.stroke();
      if (big) {
        ctx.fillText(`${deg}`, Math.cos(a) * r * 0.6, Math.sin(a) * r * 0.6);
      }
    }
    // crosshair at center
    ctx.strokeStyle = style.ink;
    ctx.lineWidth = style.thinLineWidth;
    ctx.beginPath();
    ctx.moveTo(-7 * style.px, 0);
    ctx.lineTo(7 * style.px, 0);
    ctx.moveTo(0, -7 * style.px);
    ctx.lineTo(0, 0);
    ctx.stroke();
    // marked swivel ray
    const pa = state.penAngle;
    const rayEnd: Vec = [r * Math.cos(pa), r * Math.sin(pa)];
    if (state.drawing) {
      drawInkPreview(ctx, [0, 0], rayEnd, style);
    } else {
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(rayEnd[0], rayEnd[1]);
      ctx.strokeStyle = style.inkSoft;
      ctx.lineWidth = style.thinLineWidth;
      ctx.stroke();
    }
    // angle readout
    const deg = Math.round((-pa / Math.PI) * 180);
    drawReadout(ctx, [0, -r * 0.45], `${deg}°`, style);
    drawHandle(ctx, rayEnd, style, state.drawing);
    drawRotateHandle(ctx, [0, -r - 8 * style.px], style);
    // center pivot — flat metal with a thin accent rim
    ctx.beginPath();
    ctx.arc(0, 0, 3 * style.px, 0, Math.PI * 2);
    ctx.fillStyle = style.metal;
    ctx.fill();
    ctx.strokeStyle = style.accent;
    ctx.lineWidth = style.thinLineWidth;
    ctx.stroke();
  });
};

const drawTSquare = (
  ctx: CanvasRenderingContext2D,
  state: InstrumentOverlay,
  style: InstrumentStyle,
) => {
  const headW = state.size * 0.5;
  const headH = Math.max(state.size * 0.07, 16);
  const bladeW = Math.max(state.size * 0.05, 12);
  withTransform(ctx, state, () => {
    // chunky head bar (metallic gradient)
    const hg = ctx.createLinearGradient(0, 0, 0, headH);
    hg.addColorStop(0, style.metal);
    hg.addColorStop(0.5, style.bodyFill);
    hg.addColorStop(1, style.metalDark);
    frostedBody(
      ctx,
      style,
      () => roundRect(ctx, -headW / 2, 0, headW, headH, 5 * style.px),
      hg,
    );
    // thin blade (wood/acrylic gradient)
    const bg = ctx.createLinearGradient(-bladeW / 2, 0, bladeW / 2, 0);
    bg.addColorStop(0, style.bodyFill2);
    bg.addColorStop(0.5, style.bodyFill);
    bg.addColorStop(1, style.bodyFill2);
    frostedBody(
      ctx,
      style,
      () =>
        roundRect(ctx, -bladeW / 2, headH, bladeW, state.size, 3 * style.px),
      bg,
    );
    // head end-cap seams
    for (const ex of [-headW / 2, headW / 2]) {
      ctx.beginPath();
      ctx.moveTo(ex, 0);
      ctx.lineTo(ex, headH);
      ctx.strokeStyle = style.ink;
      ctx.lineWidth = style.lineWidth;
      ctx.stroke();
    }
    // engraved tick marks down the blade — real cm/mm scale, same convention
    // as the ruler
    ctx.strokeStyle = style.ink;
    ctx.fillStyle = style.ink;
    ctx.font = style.font;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    const bladeMmPx = PX_PER_CM / 10;
    const bladeTotalMm = Math.round(state.size / bladeMmPx);
    for (let mm = 0; mm <= bladeTotalMm; mm++) {
      const y = headH + mm * bladeMmPx;
      const isCm = mm % 10 === 0;
      const isHalfCm = mm % 5 === 0;
      ctx.lineWidth = isCm ? style.lineWidth : style.thinLineWidth;
      ctx.beginPath();
      ctx.moveTo(bladeW / 2, y);
      ctx.lineTo(
        bladeW / 2 + (isCm ? 11 : isHalfCm ? 8 : 6) * style.px,
        y,
      );
      ctx.stroke();
      if (isCm) {
        const label = mm === bladeTotalMm ? `${mm / 10}cm` : `${mm / 10}`;
        ctx.fillText(label, bladeW / 2 + 13 * style.px, y);
      }
    }
    if (state.drawing) {
      drawInkPreview(ctx, [0, 0], [0, state.drawLen], style);
    }
    drawHandle(ctx, [0, state.drawLen], style, state.drawing);
    drawRotateHandle(ctx, [0, state.size + 8 * style.px], style);
  });
};

const drawSetSquare = (
  ctx: CanvasRenderingContext2D,
  state: InstrumentOverlay,
  style: InstrumentStyle,
) => {
  const s = state.size;
  const inv = 1 / Math.SQRT2;
  withTransform(ctx, state, () => {
    // frosted triangle body with linear gradient
    const grad = ctx.createLinearGradient(0, 0, s, s);
    grad.addColorStop(0, style.bodyFill);
    grad.addColorStop(1, style.bodyFill2);
    frostedBody(
      ctx,
      style,
      () => {
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(s, 0);
        ctx.lineTo(0, s);
        ctx.closePath();
      },
      grad,
    );
    // inner reference triangle for depth
    const m = s * 0.12;
    ctx.beginPath();
    ctx.moveTo(m, m);
    ctx.lineTo(s - m, m);
    ctx.lineTo(m, s - m);
    ctx.closePath();
    ctx.strokeStyle = style.edgeFill;
    ctx.lineWidth = style.thinLineWidth;
    ctx.stroke();
    // right-angle marker
    ctx.beginPath();
    ctx.moveTo(m * 1.6, 0);
    ctx.lineTo(m * 1.6, m * 1.6);
    ctx.lineTo(0, m * 1.6);
    ctx.strokeStyle = style.ink;
    ctx.lineWidth = style.thinLineWidth;
    ctx.stroke();
    // degree labels
    ctx.fillStyle = style.ink;
    ctx.font = style.font;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("90°", s * 0.2, s * 0.2);
    ctx.fillText("45°", s * 0.64, s * 0.34);
    // tick marks + cm labels along the hypotenuse — same cm/mm convention as
    // the ruler and T-square
    ctx.strokeStyle = style.ink;
    ctx.fillStyle = style.ink;
    ctx.font = style.font;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const hypMmPx = PX_PER_CM / 10;
    const hypTotalMm = Math.round((s * Math.SQRT2) / hypMmPx);
    const hypLastCmMm = Math.floor((hypTotalMm - 1) / 10) * 10;
    for (let mm = 1; mm < hypTotalMm; mm++) {
      const dist = mm * hypMmPx;
      const px = s - dist * inv;
      const py = dist * inv;
      const isCm = mm % 10 === 0;
      const isHalfCm = mm % 5 === 0;
      const ln = (isCm ? 10 : isHalfCm ? 8 : 6) * style.px;
      ctx.lineWidth = isCm ? style.lineWidth : style.thinLineWidth;
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(px - ln * inv, py - ln * inv);
      ctx.stroke();
      if (isCm) {
        const lbl = 12 * style.px;
        const label = mm === hypLastCmMm ? `${mm / 10}cm` : `${mm / 10}`;
        ctx.fillText(label, px + lbl * inv, py + lbl * inv);
      }
    }
    if (state.drawing) {
      drawInkPreview(
        ctx,
        [s, 0],
        [s - state.drawLen * inv, state.drawLen * inv],
        style,
      );
    }
    drawHandle(
      ctx,
      [s - state.drawLen * inv, state.drawLen * inv],
      style,
      state.drawing,
    );
    drawRotateHandle(ctx, [0, s + 8 * style.px], style);
  });
};

const drawAngleBisector = (
  ctx: CanvasRenderingContext2D,
  state: InstrumentOverlay,
  style: InstrumentStyle,
) => {
  const s = state.size;
  const spread = state.penAngle;
  const legTip1: Vec = [Math.cos(spread) * s * 0.7, Math.sin(spread) * s * 0.7];
  const legTip2: Vec = [
    Math.cos(-spread) * s * 0.7,
    Math.sin(-spread) * s * 0.7,
  ];
  withTransform(ctx, state, () => {
    // two rays forming the angle (drawn as metallic beams) — drag either
    // tip to open/close the angle being bisected
    drawLeg(ctx, [0, 0], legTip1, 2.6 * style.px, style);
    drawLeg(ctx, [0, 0], legTip2, 2.6 * style.px, style);
    // angle arc
    ctx.beginPath();
    ctx.arc(0, 0, s * 0.22, -spread, spread);
    ctx.strokeStyle = style.accent;
    ctx.lineWidth = style.thinLineWidth;
    ctx.stroke();
    // bisector arm (thicker metallic beam)
    drawLeg(ctx, [0, 0], [s, 0], 3 * style.px, style);
    if (state.drawing) {
      drawInkPreview(ctx, [0, 0], [state.drawLen, 0], style);
    }
    // angle readout — the full angle being bisected (the two legs), not
    // just the half-angle to the bisector
    const deg = Math.round(((2 * spread) / Math.PI) * 180);
    drawReadout(ctx, [s * 0.28, 0], `${deg}°`, style);
    const spreadActive = state.dragZone === "spread";
    drawHandle(ctx, legTip1, style, spreadActive);
    drawHandle(ctx, legTip2, style, spreadActive);
    drawHandle(ctx, [state.drawLen, 0], style, state.drawing);
    drawRotateHandle(ctx, [s + 8 * style.px, 0], style);
    // vertex pivot — flat metal, no glossy sphere
    ctx.beginPath();
    ctx.arc(0, 0, 4 * style.px, 0, Math.PI * 2);
    ctx.fillStyle = style.metal;
    ctx.fill();
    ctx.strokeStyle = style.ink;
    ctx.lineWidth = style.thinLineWidth;
    ctx.stroke();
  });
};

/** render the instrument overlay. The caller has already translated by
 *  (scrollX, scrollY); we work in scene coordinates. */
export const renderInstrumentOverlay = (
  ctx: CanvasRenderingContext2D,
  state: InstrumentOverlay,
  appState: InstrumentAppState,
) => {
  const style = instrumentStyle(appState);
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  switch (state.type) {
    case "compass":
      drawCompass(ctx, state, style);
      break;
    case "ruler":
      drawRuler(ctx, state, style);
      break;
    case "protractor":
      drawProtractor(ctx, state, style);
      break;
    case "tsquare":
      drawTSquare(ctx, state, style);
      break;
    case "setsquare":
      drawSetSquare(ctx, state, style);
      break;
    case "anglebisector":
      drawAngleBisector(ctx, state, style);
      break;
  }
  ctx.restore();
};
