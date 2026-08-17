import { GOOGLE_FONTS_RANGES } from "@excalidraw/common";

import { type SyntropyFontFaceDescriptor } from "../Fonts";

import KalamLatinExt from "./Kalam-latin-ext.woff2";
import KalamLatin from "./Kalam-latin.woff2";

// SIL Open Font License — https://fonts.google.com/specimen/Kalam/license
export const KalamFontFaces: SyntropyFontFaceDescriptor[] = [
  {
    uri: KalamLatinExt,
    descriptors: { unicodeRange: GOOGLE_FONTS_RANGES.LATIN_EXT },
  },
  {
    uri: KalamLatin,
    descriptors: { unicodeRange: GOOGLE_FONTS_RANGES.LATIN },
  },
];
