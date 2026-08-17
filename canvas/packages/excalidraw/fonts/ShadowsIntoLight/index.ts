import { GOOGLE_FONTS_RANGES } from "@excalidraw/common";

import { type SyntropyFontFaceDescriptor } from "../Fonts";

import ShadowsIntoLightLatinExt from "./ShadowsIntoLight-latin-ext.woff2";
import ShadowsIntoLightLatin from "./ShadowsIntoLight-latin.woff2";

// SIL Open Font License — https://fonts.google.com/specimen/Shadows+Into+Light/license
export const ShadowsIntoLightFontFaces: SyntropyFontFaceDescriptor[] = [
  {
    uri: ShadowsIntoLightLatinExt,
    descriptors: { unicodeRange: GOOGLE_FONTS_RANGES.LATIN_EXT },
  },
  {
    uri: ShadowsIntoLightLatin,
    descriptors: { unicodeRange: GOOGLE_FONTS_RANGES.LATIN },
  },
];
