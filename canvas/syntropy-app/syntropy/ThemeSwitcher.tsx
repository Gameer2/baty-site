import { type ReactNode } from "react";

import { THEME } from "@excalidraw/excalidraw";

import type { Theme } from "@excalidraw/element/types";

import "./ThemeSwitcher.scss";

/** The three theme modes the picker offers. `system` follows the browser's
    `prefers-color-scheme` and updates live when the OS setting changes. */
export type ThemeMode = Theme | "system";

type ThemeSwitcherProps = {
  appTheme: ThemeMode;
  onChange: (theme: ThemeMode) => void;
};

const SunIcon = () => (
  <svg
    viewBox="0 0 24 24"
    width="15"
    height="15"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    aria-hidden="true"
  >
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2.5v2.6M12 18.9v2.6M2.5 12h2.6M18.9 12h2.6M5 5l1.85 1.85M17.15 17.15L19 19M19 5l-1.85 1.85M6.85 17.15L5 19" />
  </svg>
);

const MoonIcon = () => (
  <svg
    viewBox="0 0 24 24"
    width="15"
    height="15"
    fill="currentColor"
    aria-hidden="true"
  >
    <path d="M21.3 13.6A8.8 8.8 0 1 1 10.4 2.7a6.8 6.8 0 0 0 10.9 10.9z" />
  </svg>
);

const AutoIcon = () => (
  <svg
    viewBox="0 0 24 24"
    width="15"
    height="15"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    aria-hidden="true"
  >
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 3.5a8.5 8.5 0 0 0 0 17z" fill="currentColor" stroke="none" />
  </svg>
);

const OPTIONS: { value: ThemeMode; label: string; icon: ReactNode }[] = [
  { value: "system", label: "Auto — follow browser", icon: <AutoIcon /> },
  { value: THEME.LIGHT, label: "Light", icon: <SunIcon /> },
  { value: THEME.DARK, label: "Dark", icon: <MoonIcon /> },
];

/**
 * Auto / Light / Dark segment. `Auto` makes the canvas follow the visitor's
 * OS/browser color scheme; Light and Dark are explicit overrides. The choice
 * persists (see useHandleAppTheme) and, in Auto, re-resolves live when the
 * browser scheme changes. Surfaces and borders use Excalidraw's theme-aware
 * tokens so the control itself follows the mood.
 *
 * Rendered as a plain row inside ChromeRail — no own position/background/
 * shadow here; the rail supplies those once for the whole capsule.
 */
export const ThemeSwitcher = ({ appTheme, onChange }: ThemeSwitcherProps) => {
  return (
    <div className="ThemeSwitcher" role="group" aria-label="Theme">
      {OPTIONS.map((o) => (
        <button
          key={o.value}
          type="button"
          className={`ThemeSwitcher__btn${
            appTheme === o.value ? " ThemeSwitcher__btn--active" : ""
          }`}
          onClick={() => onChange(o.value)}
          aria-pressed={appTheme === o.value}
          aria-label={o.label}
          title={o.label}
        >
          {o.icon}
        </button>
      ))}
    </div>
  );
};
