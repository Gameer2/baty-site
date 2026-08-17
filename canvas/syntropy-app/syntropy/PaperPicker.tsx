import { useEffect, useState, type CSSProperties } from "react";

import { CaptureUpdateAction } from "@excalidraw/excalidraw";

import type {
  AppState,
  ExcalidrawImperativeAPI,
  PaperMode,
} from "@excalidraw/excalidraw/types";

import "./PaperPicker.scss";

// `CaptureUpdateActionType` isn't re-exported from the public types, so derive
// it from the value object — same shape the store uses (`ValueOf<typeof ...>`).
type CaptureUpdateActionType =
  typeof CaptureUpdateAction[keyof typeof CaptureUpdateAction];

/**
 * GoodNotes-style paper picker for the Syntropy Canvas. A "• PAPER" chip on the
 * left edge opens a panel with full control over the paper:
 *  - Paper type: Blank / Lined / Grid / Dotted (live preview tiles).
 *  - Paper color: swatches + a native color wheel + hex field — free choice.
 *  - Line/dot color: same controls, plus an "Auto" reset to the theme default.
 *  - Spacing: a slider for the grid/ruled/dot size.
 *
 * Paper type drives `appState.paperMode`; `grid` is kept in sync with
 * `gridModeEnabled` so element snapping follows the paper. Paper color is
 * `viewBackgroundColor`; line/dot color is `paperColor` ("" = auto by theme);
 * spacing is `gridSize`.
 */
const PAPER_TYPES: { mode: PaperMode; label: string }[] = [
  { mode: "blank", label: "Blank" },
  { mode: "ruled", label: "Lined" },
  { mode: "grid", label: "Grid" },
  { mode: "dotted", label: "Dotted" },
];

// Curated paper-color swatches — distinguishable GoodNotes-style paper tones
// (white, cream, legal-pad tan, mint, blue, pink) plus two dark surfaces. The
// color wheel + hex field cover anything else. These paint literally when
// picked (paperBgOverride), so what you see is what you get in any theme.
const PAPER_COLOR_SWATCHES = [
  "#ffffff",
  "#fff7d6",
  "#fde3a2",
  "#cfe8d6",
  "#cfe3f6",
  "#f4d6e3",
  "#1b1b1b",
  "#0a0a0a",
];

const LINE_COLOR_SWATCHES = [
  "#c9c9c9",
  "#9aa0a6",
  "#5c939f",
  "#ed6d40",
  "#b8a06a",
  "#1e1e1e",
];

const isValidHex = (v: string) => /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v);

/** Normalize a hex color to lowercase `#rrggbb` (expanding 3-digit forms). Returns
    "" for anything that isn't a valid hex — used both to feed `<input type="color">`
    (which only accepts 6-digit) and to compare colors for active-swatch matching. */
const normalizeHex = (v: string): string => {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(v.trim());
  if (!m) {
    return "";
  }
  let h = m[1].toLowerCase();
  if (h.length === 3) {
    h = h
      .split("")
      .map((c) => c + c)
      .join("");
  }
  return `#${h}`;
};

type PaperPickerProps = {
  excalidrawAPI: ExcalidrawImperativeAPI | null;
  // Controlled from ChromeRail, which renders the trigger segment — this
  // component now owns only the panel + scrim, not its own chip.
  open: boolean;
  onClose: () => void;
  // When the Library panel is open it owns the left 300px, so the panel
  // slides right to sit next to it (mirrors the rail's own slide).
  libraryOpen: boolean;
};

export const PaperPicker = ({
  excalidrawAPI,
  open,
  onClose,
  libraryOpen,
}: PaperPickerProps) => {
  const appState = excalidrawAPI?.getAppState();
  const paperMode: PaperMode = appState?.paperMode ?? "dotted";
  const paperColor = appState?.paperColor ?? "";
  const bg = (appState?.viewBackgroundColor ?? "#ffffff").toLowerCase();
  const paperBgOverride = appState?.paperBgOverride ?? false;
  const gridSize = appState?.gridSize ?? 20;

  // Color shown by the native wheel when the line color is "Auto" (the wheel
  // input can't represent empty). Purely cosmetic; committing "" resets to auto.
  const linePreview = normalizeHex(paperColor) || "#c9c9c9";

  const update = <K extends keyof AppState>(
    patch: Pick<AppState, K>,
    // Discrete picks capture to the undo stack immediately; continuous drags
    // (slider, color wheel) capture EVENTUALLY so one drag = one undo entry,
    // then a final IMMEDIATELY commit on pointer/key up locks the last value.
    capture: CaptureUpdateActionType = CaptureUpdateAction.IMMEDIATELY,
  ) => {
    excalidrawAPI?.updateScene({ appState: patch, captureUpdate: capture });
  };

  const setPaper = (mode: PaperMode) =>
    update({ paperMode: mode, gridModeEnabled: mode === "grid" });
  const setPaperColor = (color: string, capture?: CaptureUpdateActionType) => {
    // "" is the Auto sentinel: reset to the theme-default background (white,
    // which the dark-mode filter renders as the dark board) and clear the
    // override so the filter applies again. Any real color is painted
    // literally (override on) — WYSIWYG, including light paper in dark theme.
    if (color === "") {
      update(
        { viewBackgroundColor: "#ffffff", paperBgOverride: false },
        capture,
      );
      return;
    }
    update({ viewBackgroundColor: color, paperBgOverride: true }, capture);
  };
  const setLineColor = (color: string, capture?: CaptureUpdateActionType) =>
    update({ paperColor: color }, capture);
  const setSpacing = (size: number, capture?: CaptureUpdateActionType) =>
    update({ gridSize: size }, capture);

  const shifted = libraryOpen ? " shifted" : "";

  return (
    <>
      {open && (
        <>
          <div className="PaperPicker__scrim" onClick={onClose} />
          <div
            className={`PaperPanel${shifted}`}
            role="dialog"
            aria-label="Paper"
          >
            <div className="PaperPanel__section">
              <div className="PaperPanel__eyebrow">Paper</div>
              <div className="PaperPanel__types">
                {PAPER_TYPES.map(({ mode, label }) => (
                  <button
                    key={mode}
                    type="button"
                    className={`PaperType${
                      paperMode === mode ? " PaperType--active" : ""
                    }`}
                    onClick={() => setPaper(mode)}
                    aria-pressed={paperMode === mode}
                    style={
                      {
                        "--paper-bg": bg,
                        "--paper-line": linePreview,
                      } as CSSProperties
                    }
                  >
                    <span
                      className={`PaperType__preview PaperType__preview--${mode}`}
                    />
                    <span className="PaperType__label">{label}</span>
                  </button>
                ))}
              </div>
            </div>

            <ColorField
              label="Paper color"
              value={bg}
              swatches={PAPER_COLOR_SWATCHES}
              allowAuto={true}
              // Auto for paper color = "no override" (theme-default dark board),
              // signaled by paperBgOverride rather than an empty value.
              autoActive={!paperBgOverride}
              onChange={(c, cap) => setPaperColor(c, cap)}
            />
            <ColorField
              label="Line color"
              value={paperColor}
              swatches={LINE_COLOR_SWATCHES}
              allowAuto={true}
              onChange={(c, cap) => setLineColor(c, cap)}
            />

            <div className="PaperPanel__section">
              <div className="PaperPanel__eyebrow">
                Spacing
                <span className="PaperPanel__value">{gridSize}px</span>
              </div>
              <input
                className="PaperSlider"
                type="range"
                min={10}
                max={80}
                step={1}
                value={gridSize}
                onChange={(e) =>
                  setSpacing(
                    Number(e.target.value),
                    CaptureUpdateAction.EVENTUALLY,
                  )
                }
                onPointerUp={(e) =>
                  setSpacing(
                    Number((e.target as HTMLInputElement).value),
                    CaptureUpdateAction.IMMEDIATELY,
                  )
                }
                onKeyUp={(e) =>
                  setSpacing(
                    Number((e.target as HTMLInputElement).value),
                    CaptureUpdateAction.IMMEDIATELY,
                  )
                }
              />
            </div>
          </div>
        </>
      )}
    </>
  );
};

/**
 * A color control: quick swatches + a native color wheel (`<input type="color">`)
 * + a hex text field. `allowAuto` adds an "Auto" swatch. By default Auto is
 * active when `value === ""` (the line-color model, where "" means theme-
 * default); pass `autoActive` to drive it from an external signal instead (the
 * paper-color model, where Auto = "no override" tracked in `paperBgOverride`).
 *
 * Capture threading: swatches and the hex field commit IMMEDIATELY (one undo
 * entry each). The color wheel uses `onInput` (fires continuously while the
 * native picker is open) with EVENTUALLY for live preview, then `onChange`
 * (fires once when the picker closes) with IMMEDIATELY to lock the result as a
 * single undo entry.
 */
const ColorField = ({
  label,
  value,
  swatches,
  allowAuto,
  autoActive,
  onChange,
}: {
  label: string;
  value: string;
  swatches: string[];
  allowAuto: boolean;
  // Overrides the `value === ""` Auto test. When true, the Auto swatch is
  // active and swatches/wheel/hex read as "no custom color" regardless of value.
  autoActive?: boolean;
  onChange: (color: string, capture?: CaptureUpdateActionType) => void;
}) => {
  const isAuto = allowAuto && (autoActive ?? value === "");
  // `<input type="color">` only accepts lowercase #rrggbb — feed it the
  // normalized value, falling back to a neutral gray for the Auto state.
  const wheel = normalizeHex(value) || "#c9c9c9";
  const normalized = normalizeHex(value);
  // Local text state so the hex field is editable mid-typing (e.g. "#ff0" before
  // the final digit). Synced from the prop whenever it changes externally.
  const [text, setText] = useState(value);
  useEffect(() => {
    setText(value);
  }, [value]);

  const commit = (next: string, capture?: CaptureUpdateActionType) => {
    setText(next);
    if (next === "" || isValidHex(next)) {
      onChange(next, capture);
    }
  };

  return (
    <div className="PaperPanel__section">
      <div className="PaperPanel__eyebrow">{label}</div>
      <div className="PaperField">
        <div className="PaperField__swatches">
          {allowAuto && (
            <button
              type="button"
              className={`PaperSwatch PaperSwatch--auto${
                isAuto ? " PaperSwatch--active" : ""
              }`}
              onClick={() => commit("")}
              aria-pressed={isAuto}
              title="Auto (theme default)"
            >
              A
            </button>
          )}
          {swatches.map((c) => {
            const active = !isAuto && normalized === c.toLowerCase();
            return (
              <button
                key={c}
                type="button"
                className={`PaperSwatch${active ? " PaperSwatch--active" : ""}`}
                style={{ background: c }}
                onClick={() => commit(c)}
                aria-pressed={active}
                title={c}
              />
            );
          })}
        </div>
        <div className="PaperField__custom">
          <label className="PaperWheel" title="Color wheel">
            <span
              className={`PaperWheel__chip${
                isAuto ? " PaperWheel__chip--auto" : ""
              }`}
              style={isAuto ? undefined : { backgroundColor: value }}
            />
            <input
              type="color"
              value={wheel}
              onInput={(e) =>
                commit(
                  (e.target as HTMLInputElement).value,
                  CaptureUpdateAction.EVENTUALLY,
                )
              }
              onChange={(e) => commit(e.target.value)}
            />
          </label>
          <input
            className="PaperHex"
            type="text"
            value={text}
            placeholder={allowAuto ? "auto" : "#hex"}
            spellCheck={false}
            onChange={(e) => commit(e.target.value)}
            onBlur={() => setText(value)}
          />
        </div>
      </div>
    </div>
  );
};
