import { CaptureUpdateAction } from "@excalidraw/element";

import {
  ERASER_SIZE_MIN,
  ERASER_SIZE_MAX,
  ERASER_SIZE_STEP,
  ERASER_MODES,
} from "@excalidraw/common";

import type { EraserMode } from "@excalidraw/common";

import {
  EraserIcon,
  EraserPrecisionIcon,
  TrashIcon,
} from "../components/icons";
import { RadioSelection } from "../components/RadioSelection";
import { Range } from "../components/Range";
import { t } from "../i18n";

import { register } from "./register";

import "./actionEraser.scss";

import type { JSX } from "react";

// One icon per mode, reused from elsewhere in the icon set rather than invented from scratch —
// keeps the family visually anchored to icons users already recognize: a precision/focus glyph
// for the exact-cut mode, the plain eraser for the default whole-element-on-touch behavior, and
// trash for "clear" (which really is select-all + delete, not a per-touch erase at all).
const ERASER_MODE_ICONS: Record<EraserMode, JSX.Element> = {
  precision: EraserPrecisionIcon,
  stroke: EraserIcon,
  clear: TrashIcon,
};

// Not a per-element property — the eraser tool has no selection to act on, so unlike most
// actions here this only ever reads/writes appState.currentItemEraserSize. Consumed by
// packages/excalidraw/eraser/index.ts, which scales both the eraser's visual brush trail and its
// actual hit-test radius from this value.
export const actionChangeEraserSize = register<number>({
  name: "changeEraserSize",
  label: "labels.eraserSize",
  trackEvent: false,
  perform: (elements, appState, value) => {
    return {
      elements,
      appState: { ...appState, currentItemEraserSize: value },
      captureUpdate: CaptureUpdateAction.EVENTUALLY,
    };
  },
  PanelComponent: ({ appState, updateData }) => (
    <fieldset>
      <legend>{t("labels.eraserSize")}</legend>
      <div className="EraserSizeControl">
        <span
          className="EraserSizeControl__dot EraserSizeControl__dot--min"
          aria-hidden="true"
        />
        <div className="EraserSizeControl__slider">
          <Range
            label={null}
            value={appState.currentItemEraserSize}
            onChange={updateData}
            min={ERASER_SIZE_MIN}
            max={ERASER_SIZE_MAX}
            step={ERASER_SIZE_STEP}
            testId="eraserSize"
          />
        </div>
        <span
          className="EraserSizeControl__dot EraserSizeControl__dot--max"
          aria-hidden="true"
        />
      </div>
    </fieldset>
  ),
});

// Same "no selection to act on" shape as actionChangeEraserSize above — writes
// appState.currentItemEraserMode. Consumed by App.tsx's onPointerDownFromPointerDownHandler
// (short-circuits straight to clearAllErasableElements() for "clear") and eraseElements (which
// chooses whole-element delete vs. packages/excalidraw/eraser/splitStrokeElement.ts's partial cut
// for "precision").
export const actionChangeEraserMode = register<EraserMode>({
  name: "changeEraserMode",
  label: "labels.eraserMode",
  trackEvent: false,
  perform: (elements, appState, value) => {
    return {
      elements,
      appState: { ...appState, currentItemEraserMode: value },
      captureUpdate: CaptureUpdateAction.EVENTUALLY,
    };
  },
  PanelComponent: ({ appState, updateData }) => (
    <fieldset>
      <legend>{t("labels.eraserMode")}</legend>
      <div className="buttonList">
        <RadioSelection
          type="button"
          value={appState.currentItemEraserMode}
          options={ERASER_MODES.map((mode) => ({
            value: mode,
            text: `${t(`labels.eraserMode_${mode}`)} — ${t(
              `labels.eraserMode_${mode}_description`,
            )}`,
            icon: ERASER_MODE_ICONS[mode],
            testId: `eraserMode-${mode}`,
          }))}
          onClick={(mode) => updateData(mode)}
        />
      </div>
    </fieldset>
  ),
});
