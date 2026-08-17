import { CaptureUpdateAction } from "@excalidraw/excalidraw";

import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import type { StrokeWidthKey } from "@excalidraw/common";

import "./PenPresets.scss";

// Same derivation PaperPicker.tsx uses — `CaptureUpdateActionType` isn't re-exported from the
// public types, so derive it from the value object.
type CaptureUpdateActionType =
  typeof CaptureUpdateAction[keyof typeof CaptureUpdateAction];

type Preset = {
  id: string;
  label: string;
  // undefined = leave the current stroke color alone (theme-default ink,
  // whatever the user last picked via Excalidraw's own color panel), rather
  // than forcing a fixed color that would read wrong against dark paper.
  color?: string;
  widthKey: StrokeWidthKey;
  opacity: number;
  highlighter?: boolean;
};

// Six slots — the same size as GoodNotes'/Notability's default favorites row.
// Colors reuse the site's existing accent tokens (see DESIGN_SYSTEM.md /
// math-lab engine.css) rather than introducing new ones, so a red/blue/green
// derivation on the board reads as the same palette as the rest of the lab.
const PRESETS: Preset[] = [
  { id: "ink", label: "Ink", widthKey: "thin", opacity: 100 },
  {
    id: "red",
    label: "Red",
    color: "#cb3500",
    widthKey: "medium",
    opacity: 100,
  },
  {
    id: "blue",
    label: "Blue",
    color: "#5c939f",
    widthKey: "medium",
    opacity: 100,
  },
  {
    id: "green",
    label: "Green",
    color: "#59a993",
    widthKey: "medium",
    opacity: 100,
  },
  {
    id: "yellow-hl",
    label: "Yellow highlighter",
    color: "#f5d90a",
    widthKey: "bold",
    opacity: 35,
    highlighter: true,
  },
  {
    id: "pink-hl",
    label: "Pink highlighter",
    color: "#e0559a",
    widthKey: "bold",
    opacity: 35,
    highlighter: true,
  },
];

type PenPresetsProps = {
  excalidrawAPI: ExcalidrawImperativeAPI | null;
};

/**
 * Quick-swap pen favorites, GoodNotes/Notability-style: tap a swatch to switch straight to the
 * freedraw tool with that swatch's color/width/opacity already applied, instead of reopening
 * Excalidraw's own style panel every time you want to change pens mid-lecture. The two
 * "highlighter" slots are the same freedraw tool with a wide stroke and low opacity — there's no
 * new element type or renderer change, so nothing about how existing strokes draw or export
 * changes; the effect is entirely in what NEW strokes default to.
 *
 * "Active" is tracked locally (not read back from appState) — good enough for a favorites bar:
 * it reflects the last preset tapped here, and stops highlighting once the user changes color/
 * width through Excalidraw's own panel instead, which is the same "last thing you explicitly
 * picked" behavior those apps' own favorites bars have.
 */
export const PenPresets = ({ excalidrawAPI }: PenPresetsProps) => {
  const applyPreset = (preset: Preset) => {
    if (!excalidrawAPI) {
      return;
    }
    // Two literal branches, not a spread-built object — updateScene's `appState` param is typed
    // as `Pick<AppState, K>` for whatever literal keys are present, and a widened `Partial<AppState>`
    // variable doesn't satisfy that (AppState's own fields, e.g. `name`, are `string | null`, not
    // `| undefined`, so a general Partial is a strictly looser type than any single Pick).
    if (preset.color) {
      excalidrawAPI.updateScene({
        appState: {
          currentItemStrokeColor: preset.color,
          currentItemStrokeWidthKey: preset.widthKey,
          currentItemOpacity: preset.opacity,
          currentItemRoughness: 0,
        },
      });
    } else {
      excalidrawAPI.updateScene({
        appState: {
          currentItemStrokeWidthKey: preset.widthKey,
          currentItemOpacity: preset.opacity,
          currentItemRoughness: 0,
        },
      });
    }
    excalidrawAPI.setActiveTool({ type: "freedraw" });
  };

  // Real-time stroke smoothing/stabilization ("Auto Refine Handwriting"-style, per FreeNotes —
  // see App.tsx's handleFreeDrawElementOnPointerDown for the actual mechanism: this dials
  // perfect-freehand's own `streamline` option, which already smooths the in-progress stroke live
  // as points are captured, not just the final render). Read directly off appState like
  // PaperPicker's controls do — this component isn't subscribed to appState changes, it just
  // reflects whatever it was last set to, which is fine for a control that's the only thing
  // writing to this value in the first place.
  const smoothing =
    excalidrawAPI?.getAppState().currentItemStrokeSmoothing ?? 0;
  const setSmoothing = (value: number, capture: CaptureUpdateActionType) => {
    excalidrawAPI?.updateScene({
      appState: { currentItemStrokeSmoothing: value },
      captureUpdate: capture,
    });
  };

  return (
    <div className="PenPresets" role="toolbar" aria-label="Pen favorites">
      {PRESETS.map((preset) => (
        <button
          key={preset.id}
          type="button"
          className={`PenPresets__swatch${
            preset.highlighter ? " PenPresets__swatch--highlighter" : ""
          }${preset.id === "ink" ? " PenPresets__swatch--ink" : ""}`}
          style={
            preset.color
              ? ({ "--swatch-color": preset.color } as React.CSSProperties)
              : undefined
          }
          title={preset.label}
          aria-label={preset.label}
          onClick={() => applyPreset(preset)}
        />
      ))}
      <div className="PenPresets__smoothing" title="Handwriting smoothing">
        <input
          type="range"
          min={0}
          max={100}
          step={5}
          value={Math.round(smoothing * 100)}
          aria-label="Handwriting smoothing"
          onChange={(e) =>
            setSmoothing(
              Number(e.target.value) / 100,
              CaptureUpdateAction.EVENTUALLY,
            )
          }
          onPointerUp={(e) =>
            setSmoothing(
              Number((e.target as HTMLInputElement).value) / 100,
              CaptureUpdateAction.IMMEDIATELY,
            )
          }
        />
      </div>
    </div>
  );
};
