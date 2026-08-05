import {
  newEmbeddableElement,
  syncInvalidIndices,
  CaptureUpdateAction,
} from "@excalidraw/element";

import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

import { computeInitialNodeSize, computeSpawnPoint } from "./nodeGeometry";
import { getPortSpec } from "./portSpecs/registry";

import type { EngineId } from "./engineAccents";

let cascadeOffset = 0;

export const createSyntropyNode = (
  excalidrawAPI: ExcalidrawImperativeAPI,
  method: { engineId: EngineId; methodId: string; name: string },
): void => {
  const spec = getPortSpec(method.engineId, method.methodId);
  const size = computeInitialNodeSize(spec);
  const inputs = spec
    ? Object.fromEntries(spec.inputs.map((i) => [i.key, i.default]))
    : undefined;

  // Spawn under the center of what the user is actually looking at, with a small cascade fan so
  // consecutive drops don't stack — replacing the old fixed `100 + cascade*30` that always landed
  // in the same top-left spot (note-taker: "it always fall in the same spot").
  const appState = excalidrawAPI.getAppState();
  const { x, y } = computeSpawnPoint(
    {
      scrollX: appState.scrollX,
      scrollY: appState.scrollY,
      zoom: appState.zoom,
      offsetLeft: appState.offsetLeft,
      offsetTop: appState.offsetTop,
      width: appState.width,
      height: appState.height,
    },
    size.width,
    size.height,
    cascadeOffset,
  );
  cascadeOffset += 1;

  const element = newEmbeddableElement({
    type: "embeddable",
    x,
    y,
    width: size.width,
    height: size.height,
    // Transparent: the element still paints on the static canvas exactly like a rectangle
    // (packages/element/src/renderElement.ts draws "embeddable" through the same path as
    // "rectangle"), but with nothing visible — all real chrome comes from NodeOverlay (Task 8),
    // a DOM layer outside Excalidraw's own tree that isn't gated by the embeddable
    // pointer-events:none rule this element's own content used to be subject to.
    strokeColor: "transparent",
    backgroundColor: "transparent",
    link: `syntropy://node/${method.engineId}/${method.methodId}`,
    customData: {
      syntropyNode: {
        engineId: method.engineId,
        methodId: method.methodId,
        name: method.name,
        ...(inputs ? { inputs } : {}),
      },
    },
  });

  // newEmbeddableElement doesn't assign a fractional `index` — the scene
  // requires every element to carry one consistent with array order, so
  // sync it in before handing the array to updateScene.
  const elements = syncInvalidIndices([
    ...excalidrawAPI.getSceneElements(),
    element,
  ]);

  excalidrawAPI.updateScene({
    elements,
    captureUpdate: CaptureUpdateAction.IMMEDIATELY,
  });
};
