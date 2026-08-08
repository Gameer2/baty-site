import { useCallback, useEffect, useRef } from "react";

import { CaptureUpdateAction, newElementWith } from "@excalidraw/element";

import {
  SHAPE3D_TYPES,
  MIN_SHAPE3D_ROTATION,
  MAX_SHAPE3D_ROTATION,
} from "@excalidraw/common";

import type { Shape3DType } from "@excalidraw/element/types";

import {
  Shape3DIcon,
  PyramidIcon,
  CylinderIcon,
  ConeIcon,
  SphereIcon,
  Shape3DSolidIcon,
  Shape3DWireframeIcon,
} from "../components/icons";
import { Range } from "../components/Range";
import { RadioSelection } from "../components/RadioSelection";
import { t } from "../i18n";

import { changeProperty, getFormValue } from "./actionProperties";
import { register } from "./register";

import type { JSX } from "react";

// Native <input type="range"> fires onChange on every pixel of pointer
// movement, and every shape3d rotation commit forces a full geometry rebuild
// plus a rough.js redraw of up to 72-segment curved rings (shape3d.ts) —
// unlike most other property sliders (opacity, roughness), which don't touch
// the cached shape geometry at all. Coalescing commits to once per animation
// frame keeps rotation dragging smooth; it doesn't affect how the slider
// feels, since the native input's own thumb tracks the pointer regardless of
// when React re-renders.
const useRafThrottledCallback = (callback: (value: number) => void) => {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;
  const pendingRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, []);

  return useCallback((value: number) => {
    pendingRef.current = value;
    if (rafRef.current === null) {
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        if (pendingRef.current !== null) {
          callbackRef.current(pendingRef.current);
          pendingRef.current = null;
        }
      });
    }
  }, []);
};

const SHAPE3D_ICONS: Record<Shape3DType, JSX.Element> = {
  cube: Shape3DIcon,
  pyramid: PyramidIcon,
  cylinder: CylinderIcon,
  cone: ConeIcon,
  sphere: SphereIcon,
};

// which 3D primitive — grouped with the other 3D controls below into one
// toolbar entry's properties panel, same pattern as the polygon side-count
// slider in actionPolygon.tsx
export const actionChangeShape3DType = register<Shape3DType>({
  name: "changeShape3DType",
  label: "labels.shape3DType",
  trackEvent: false,
  perform: (elements, appState, value) => {
    return {
      elements: changeProperty(elements, appState, (el) =>
        el.type === "shape3d" ? newElementWith(el, { shape3DType: value }) : el,
      ),
      appState: { ...appState, currentItemShape3DType: value },
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    };
  },
  PanelComponent: ({ elements, appState, updateData, app }) => (
    <fieldset>
      <legend>{t("labels.shape3DType")}</legend>
      <div className="buttonList">
        <RadioSelection
          group="shape3DType"
          options={SHAPE3D_TYPES.map((type) => ({
            value: type,
            text: t(`labels.shape3DType_${type}`),
            icon: SHAPE3D_ICONS[type],
          }))}
          value={getFormValue(
            elements,
            app,
            (element) =>
              element.type === "shape3d" ? element.shape3DType : null,
            (element) => element.type === "shape3d",
            (hasSelection) =>
              hasSelection ? null : appState.currentItemShape3DType,
          )}
          onChange={updateData}
        />
      </div>
    </fieldset>
  ),
});

export const actionChangeShape3DRotationX = register<number>({
  name: "changeShape3DRotationX",
  label: "labels.shape3DRotationX",
  trackEvent: false,
  perform: (elements, appState, value) => {
    return {
      elements: changeProperty(elements, appState, (el) =>
        el.type === "shape3d" ? newElementWith(el, { rotationX: value }) : el,
      ),
      appState: { ...appState, currentItemShape3DRotationX: value },
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    };
  },
  PanelComponent: ({ elements, appState, updateData, app }) => {
    const throttledUpdateData = useRafThrottledCallback(updateData);
    return (
      <fieldset>
        <legend>{t("labels.shape3DRotationX")}</legend>
        <Range
          label={null}
          value={getFormValue(
            elements,
            app,
            (element) =>
              element.type === "shape3d"
                ? element.rotationX
                : MIN_SHAPE3D_ROTATION,
            (element) => element.type === "shape3d",
            (hasSelection) =>
              hasSelection
                ? MIN_SHAPE3D_ROTATION
                : appState.currentItemShape3DRotationX,
          )}
          onChange={throttledUpdateData}
          min={MIN_SHAPE3D_ROTATION}
          max={MAX_SHAPE3D_ROTATION}
          step={1}
          testId="shape3DRotationX"
        />
      </fieldset>
    );
  },
});

export const actionChangeShape3DRotationY = register<number>({
  name: "changeShape3DRotationY",
  label: "labels.shape3DRotationY",
  trackEvent: false,
  perform: (elements, appState, value) => {
    return {
      elements: changeProperty(elements, appState, (el) =>
        el.type === "shape3d" ? newElementWith(el, { rotationY: value }) : el,
      ),
      appState: { ...appState, currentItemShape3DRotationY: value },
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    };
  },
  PanelComponent: ({ elements, appState, updateData, app }) => {
    const throttledUpdateData = useRafThrottledCallback(updateData);
    return (
      <fieldset>
        <legend>{t("labels.shape3DRotationY")}</legend>
        <Range
          label={null}
          value={getFormValue(
            elements,
            app,
            (element) =>
              element.type === "shape3d"
                ? element.rotationY
                : MIN_SHAPE3D_ROTATION,
            (element) => element.type === "shape3d",
            (hasSelection) =>
              hasSelection
                ? MIN_SHAPE3D_ROTATION
                : appState.currentItemShape3DRotationY,
          )}
          onChange={throttledUpdateData}
          min={MIN_SHAPE3D_ROTATION}
          max={MAX_SHAPE3D_ROTATION}
          step={1}
          testId="shape3DRotationY"
        />
      </fieldset>
    );
  },
});

export const actionChangeShape3DRotationZ = register<number>({
  name: "changeShape3DRotationZ",
  label: "labels.shape3DRotationZ",
  trackEvent: false,
  perform: (elements, appState, value) => {
    return {
      elements: changeProperty(elements, appState, (el) =>
        el.type === "shape3d" ? newElementWith(el, { rotationZ: value }) : el,
      ),
      appState: { ...appState, currentItemShape3DRotationZ: value },
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    };
  },
  PanelComponent: ({ elements, appState, updateData, app }) => {
    const throttledUpdateData = useRafThrottledCallback(updateData);
    return (
      <fieldset>
        <legend>{t("labels.shape3DRotationZ")}</legend>
        <Range
          label={null}
          value={getFormValue(
            elements,
            app,
            (element) =>
              element.type === "shape3d"
                ? element.rotationZ
                : MIN_SHAPE3D_ROTATION,
            (element) => element.type === "shape3d",
            (hasSelection) =>
              hasSelection
                ? MIN_SHAPE3D_ROTATION
                : appState.currentItemShape3DRotationZ,
          )}
          onChange={throttledUpdateData}
          min={MIN_SHAPE3D_ROTATION}
          max={MAX_SHAPE3D_ROTATION}
          step={1}
          testId="shape3DRotationZ"
        />
      </fieldset>
    );
  },
});

export const actionToggleShape3DWireframe = register<boolean>({
  name: "toggleShape3DWireframe",
  label: "labels.shape3DWireframe",
  trackEvent: false,
  perform: (elements, appState, value) => {
    return {
      elements: changeProperty(elements, appState, (el) =>
        el.type === "shape3d" ? newElementWith(el, { wireframe: value }) : el,
      ),
      appState: { ...appState, currentItemShape3DWireframe: value },
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    };
  },
  PanelComponent: ({ elements, appState, updateData, app }) => (
    <fieldset>
      <legend>{t("labels.fill")}</legend>
      <div className="buttonList">
        <RadioSelection<boolean>
          group="shape3DWireframe"
          options={[
            {
              value: false,
              text: t("labels.strokeStyle_solid"),
              icon: Shape3DSolidIcon,
            },
            {
              value: true,
              text: t("labels.shape3DWireframe"),
              icon: Shape3DWireframeIcon,
            },
          ]}
          value={getFormValue(
            elements,
            app,
            (element) =>
              element.type === "shape3d" ? element.wireframe : null,
            (element) => element.type === "shape3d",
            (hasSelection) =>
              hasSelection ? null : appState.currentItemShape3DWireframe,
          )}
          onChange={updateData}
        />
      </div>
    </fieldset>
  ),
});
