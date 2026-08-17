import { GOOGLE_FONTS_RANGES } from "@excalidraw/common";

import { type SyntropyFontFaceDescriptor } from "../Fonts";

import CaveatLatinExt from "./Caveat-latin-ext.woff2";
import CaveatLatin from "./Caveat-latin.woff2";

// SIL Open Font License — https://fonts.google.com/specimen/Caveat/license
export const CaveatFontFaces: SyntropyFontFaceDescriptor[] = [
  {
    uri: CaveatLatinExt,
    descriptors: { unicodeRange: GOOGLE_FONTS_RANGES.LATIN_EXT },
  },
  {
    uri: CaveatLatin,
    descriptors: { unicodeRange: GOOGLE_FONTS_RANGES.LATIN },
  },
];
