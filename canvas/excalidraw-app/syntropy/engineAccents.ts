// Real per-engine accent colors, read from each engine's own
// math-lab/engines/*/index.html (`:root{--electric-teal:#...}` override).
// Keep in sync by hand if an engine's accent ever changes there.
export const ENGINE_ACCENTS = {
  calculus: "#4f9e82",
  complex: "#b45fd0",
  "linear-algebra": "#8570b3",
  "number-theory": "#a3623c",
  numerical: "#5c939f",
  ode: "#4f8fc0",
  statistics: "#c99a3c",
} as const;

export type EngineId = keyof typeof ENGINE_ACCENTS;

export type AccentShades = {
  primary: string;
  primaryDarker: string;
  primaryDarkest: string;
  primaryLight: string;
  primaryLightDarker: string;
  primaryHover: string;
  brandHover: string;
  brandActive: string;
  onPrimaryContainer: string;
  surfacePrimaryContainer: string;
  selection: string;
};

const hexToRgb = (hex: string): [number, number, number] => {
  const n = parseInt(hex.replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

const rgbToHex = (r: number, g: number, b: number): string => {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  const hex = [clamp(r), clamp(g), clamp(b)]
    .map((v) => v.toString(16).padStart(2, "0"))
    .join("");
  return `#${hex}`;
};

const rgbToHsl = (
  r: number,
  g: number,
  b: number,
): [number, number, number] => {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;
  const d = max - min;
  if (d !== 0) {
    s = d / (1 - Math.abs(2 * l - 1));
    switch (max) {
      case r:
        h = ((g - b) / d) % 6;
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      default:
        h = (r - g) / d + 4;
    }
    h *= 60;
    if (h < 0) {
      h += 360;
    }
  }
  return [h, s, l];
};

const hslToRgb = (
  h: number,
  s: number,
  l: number,
): [number, number, number] => {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let [r, g, b] = [0, 0, 0];
  if (h < 60) {
    [r, g, b] = [c, x, 0];
  } else if (h < 120) {
    [r, g, b] = [x, c, 0];
  } else if (h < 180) {
    [r, g, b] = [0, c, x];
  } else if (h < 240) {
    [r, g, b] = [0, x, c];
  } else if (h < 300) {
    [r, g, b] = [x, 0, c];
  } else {
    [r, g, b] = [c, 0, x];
  }
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
};

/** Lighten/darken (dl) and saturate/desaturate (ds) a hex color by a delta
 * in HSL space, clamped to [0,1]. Same formula used to derive the site's
 * original Syntropy gold shade ramp — now parameterized per engine. */
const adjust = (hex: string, dl: number, ds = 0): string => {
  const [r, g, b] = hexToRgb(hex);
  const [h, s, l] = rgbToHsl(r, g, b);
  const newS = Math.max(0, Math.min(1, s + ds));
  const newL = Math.max(0, Math.min(1, l + dl));
  const [r2, g2, b2] = hslToRgb(h, newS, newL);
  return rgbToHex(r2, g2, b2);
};

/** Derive the full accent ramp for a base color. Dark-theme shades darken the
 *  container/surface stops (they sit on a dark board); light-theme shades
 *  lighten them into tints and flip hover to darken so the accent reads on
 *  white. `theme` defaults to "dark" to keep the original behavior. */
export const deriveAccentShades = (
  baseHex: string,
  theme: "dark" | "light" = "dark",
): AccentShades =>
  theme === "light"
    ? {
        primary: baseHex,
        primaryDarker: adjust(baseHex, -0.1),
        primaryDarkest: adjust(baseHex, -0.18),
        primaryLight: adjust(baseHex, 0.42, -0.25),
        primaryLightDarker: adjust(baseHex, 0.36, -0.28),
        primaryHover: adjust(baseHex, -0.08),
        brandHover: adjust(baseHex, -0.08),
        brandActive: adjust(baseHex, -0.14),
        onPrimaryContainer: adjust(baseHex, -0.4, -0.25),
        surfacePrimaryContainer: adjust(baseHex, 0.44, -0.3),
        selection: adjust(baseHex, 0.3, -0.18),
      }
    : {
        primary: baseHex,
        primaryDarker: adjust(baseHex, -0.08),
        primaryDarkest: adjust(baseHex, -0.16),
        primaryLight: adjust(baseHex, -0.32, -0.35),
        primaryLightDarker: adjust(baseHex, -0.37, -0.4),
        primaryHover: adjust(baseHex, 0.08),
        brandHover: adjust(baseHex, 0.08),
        brandActive: adjust(baseHex, 0.14),
        onPrimaryContainer: adjust(baseHex, 0.3, -0.3),
        surfacePrimaryContainer: adjust(baseHex, -0.32, -0.35),
        selection: adjust(baseHex, -0.27, -0.2),
      };
