import { CaptureUpdateAction, newElementWith } from "@excalidraw/element";

import { MIN_POLYGON_SIDES, MAX_POLYGON_SIDES } from "@excalidraw/common";

import { Range } from "../components/Range";
import { t } from "../i18n";

import { changeProperty, getFormValue } from "./actionProperties";
import { register } from "./register";

// A regular N-gon's side count — shared by the toolbar's "Shapes" popover (for the next-drawn
// polygon) and this properties-panel slider (for the currently selected one, or the default when
// nothing's selected). Deliberately a continuous 3-20 slider, not a handful of preset shapes.
export const actionChangePolygonSides = register<number>({
  name: "changePolygonSides",
  label: "labels.polygonSides",
  trackEvent: false,
  perform: (elements, appState, value) => {
    return {
      elements: changeProperty(elements, appState, (el) =>
        el.type === "polygon" ? newElementWith(el, { sides: value }) : el,
      ),
      appState: { ...appState, currentItemPolygonSides: value },
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    };
  },
  PanelComponent: ({ elements, appState, updateData, app }) => (
    <fieldset>
      <legend>{t("labels.polygonSides")}</legend>
      <Range
        label={null}
        value={getFormValue(
          elements,
          app,
          (element) =>
            element.type === "polygon" ? element.sides : MIN_POLYGON_SIDES,
          (element) => element.type === "polygon",
          (hasSelection) =>
            hasSelection ? MIN_POLYGON_SIDES : appState.currentItemPolygonSides,
        )}
        onChange={updateData}
        min={MIN_POLYGON_SIDES}
        max={MAX_POLYGON_SIDES}
        step={1}
        testId="polygonSides"
      />
    </fieldset>
  ),
});
