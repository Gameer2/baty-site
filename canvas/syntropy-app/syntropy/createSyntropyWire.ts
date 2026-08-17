import { pointFrom } from "@excalidraw/math";

import {
  newArrowElement,
  newElementWith,
  syncInvalidIndices,
  CaptureUpdateAction,
} from "@excalidraw/element";

import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import type { ExcalidrawElement } from "@excalidraw/element/types";
import type { LocalPoint } from "@excalidraw/math";

/**
 * Creates the real connection between a dragged-from output port and a dropped-on input port
 * (NodeOverlay's drag-to-connect handler — see wiring.ts for the propagation engine this feeds).
 *
 * The wire still rides on a real Excalidraw arrow element for free undo/redo/persistence/export,
 * same reasoning as createSyntropyNode.ts's embeddable — but it's constructed directly rather
 * than drawn with Excalidraw's interactive arrow tool, because the user chose the exact ports by
 * dragging from one dot to another; there's no ambiguity left for a tool-drawn arrow + a picker
 * to resolve. `strokeColor: "transparent"`: like the node embeddables, this element is an
 * invisible data carrier — NodeOverlay draws the real curve as SVG between the two ports' live
 * measured screen positions every render, not from this arrow's own stored points, so the exact
 * geometry set here only matters as a reasonable fallback if the user ever interacts with the
 * underlying arrow through Excalidraw's own native tools.
 */
export const createSyntropyWire = (
  excalidrawAPI: ExcalidrawImperativeAPI,
  params: {
    sourceNodeId: string;
    sourceOutputKey: string;
    targetNodeId: string;
    targetInputKey: string;
  },
): void => {
  const elements = excalidrawAPI.getSceneElements();
  const sourceEl = elements.find((el) => el.id === params.sourceNodeId);
  const targetEl = elements.find((el) => el.id === params.targetNodeId);
  if (!sourceEl || !targetEl) {
    return;
  }

  const sourceCenter = {
    x: sourceEl.x + sourceEl.width / 2,
    y: sourceEl.y + sourceEl.height / 2,
  };
  const targetCenter = {
    x: targetEl.x + targetEl.width / 2,
    y: targetEl.y + targetEl.height / 2,
  };
  const dx = targetCenter.x - sourceCenter.x;
  const dy = targetCenter.y - sourceCenter.y;

  const arrow = newArrowElement({
    type: "arrow",
    x: sourceCenter.x,
    y: sourceCenter.y,
    points: [pointFrom<LocalPoint>(0, 0), pointFrom<LocalPoint>(dx, dy)],
    width: Math.abs(dx) || 1,
    height: Math.abs(dy) || 1,
    strokeColor: "transparent",
    customData: {
      syntropyWire: true,
      sourceOutputKey: params.sourceOutputKey,
      targetInputKey: params.targetInputKey,
    },
  });

  const wire = newElementWith(arrow, {
    startBinding: {
      elementId: params.sourceNodeId,
      fixedPoint: [1, 0.5],
      mode: "orbit",
    },
    endBinding: {
      elementId: params.targetNodeId,
      fixedPoint: [0, 0.5],
      mode: "orbit",
    },
  });

  const nextElements = elements.map((el) => {
    if (el.id !== params.sourceNodeId && el.id !== params.targetNodeId) {
      return el;
    }
    return newElementWith(el, {
      boundElements: [
        ...(el.boundElements ?? []),
        { id: wire.id, type: "arrow" as const },
      ],
    });
  });

  const synced = syncInvalidIndices([...nextElements, wire]);

  excalidrawAPI.updateScene({
    elements: synced,
    captureUpdate: CaptureUpdateAction.IMMEDIATELY,
  });
};

/** Deletes a wire (the underlying arrow element) by id — click-to-select + Delete in NodeOverlay. */
export const deleteSyntropyWire = (
  excalidrawAPI: ExcalidrawImperativeAPI,
  arrowId: string,
): void => {
  const elements = excalidrawAPI.getSceneElements();
  const nextElements = elements.map((el) =>
    el.id === arrowId
      ? newElementWith(el as ExcalidrawElement, { isDeleted: true })
      : el,
  );
  excalidrawAPI.updateScene({
    elements: nextElements,
    captureUpdate: CaptureUpdateAction.IMMEDIATELY,
  });
};
