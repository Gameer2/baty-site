import type { UIAppState } from "@excalidraw/excalidraw/types";

import { getSelectedElements } from "./selection";
import { isSyntropyLinkElement } from "./syntropyLink";

import type { NonDeletedExcalidrawElement } from "./types";

export const showSelectedShapeActions = (
  appState: UIAppState,
  elements: readonly NonDeletedExcalidrawElement[],
) =>
  Boolean(
    !appState.viewModeEnabled &&
      appState.openDialog?.name !== "elementLinkSelector" &&
      ((appState.activeTool.type !== "custom" &&
        (appState.editingTextElement ||
          (appState.activeTool.type !== "selection" &&
            appState.activeTool.type !== "lasso" &&
            appState.activeTool.type !== "hand" &&
            appState.activeTool.type !== "laser"))) ||
        // Syntropy nodes are not plain shapes — selecting one alone should not surface the
        // generic stroke/background/etc. properties panel (excalidraw-app/syntropy provides its
        // own UI). A regular shape selected alongside a node still shows the panel, scoped to it.
        getSelectedElements(elements, appState).filter(
          (element) => !isSyntropyLinkElement(element),
        ).length),
  );
