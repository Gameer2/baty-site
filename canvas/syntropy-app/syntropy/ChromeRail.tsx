import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

import { PaperPicker } from "./PaperPicker";
import { ThemeSwitcher, type ThemeMode } from "./ThemeSwitcher";

import "./ChromeRail.scss";

type ChromeRailProps = {
  excalidrawAPI: ExcalidrawImperativeAPI | null;
  libraryOpen: boolean;
  onLibraryToggle: () => void;
  paperOpen: boolean;
  onPaperToggle: () => void;
  onPaperClose: () => void;
  appTheme: ThemeMode;
  onThemeChange: (theme: ThemeMode) => void;
};

/**
 * Library / Paper / Theme, merged into one capsule instead of three
 * separately-bordered, separately-shadowed chips 44px apart, each with its
 * own glow-halo hover. One rail, one border, one shadow — hover/active reads
 * as a flat accent fill, matching proto.css's own .mode-tabs (used elsewhere
 * on the site for Solver/PDE/Fields) rather than the glow this chrome had
 * grown independently of that source.
 *
 * Positioning (including the library-open shift) lives here once; Library,
 * Paper, and Theme no longer each duplicate their own fixed-position + shift
 * logic.
 */
export const ChromeRail = ({
  excalidrawAPI,
  libraryOpen,
  onLibraryToggle,
  paperOpen,
  onPaperToggle,
  onPaperClose,
  appTheme,
  onThemeChange,
}: ChromeRailProps) => {
  const shifted = libraryOpen ? " shifted" : "";

  return (
    <>
      <div className={`ChromeRail${shifted}`}>
        <button
          type="button"
          className={`ChromeRail__seg${
            libraryOpen ? " ChromeRail__seg--active" : ""
          }`}
          aria-pressed={libraryOpen}
          onClick={onLibraryToggle}
        >
          Library
        </button>
        <button
          type="button"
          className={`ChromeRail__seg${
            paperOpen ? " ChromeRail__seg--active" : ""
          }`}
          aria-pressed={paperOpen}
          onClick={onPaperToggle}
        >
          Paper
        </button>
        <div className="ChromeRail__themeRow">
          <ThemeSwitcher appTheme={appTheme} onChange={onThemeChange} />
        </div>
      </div>
      <PaperPicker
        excalidrawAPI={excalidrawAPI}
        open={paperOpen}
        onClose={onPaperClose}
        libraryOpen={libraryOpen}
      />
    </>
  );
};
