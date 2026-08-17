import { GOOGLE_FONTS_RANGES } from "@excalidraw/common";

import { type SyntropyFontFaceDescriptor } from "../Fonts";

import PatrickHandLatinExt from "./PatrickHand-latin-ext.woff2";
import PatrickHandLatin from "./PatrickHand-latin.woff2";

// SIL Open Font License — https://fonts.google.com/specimen/Patrick+Hand/license
export const PatrickHandFontFaces: SyntropyFontFaceDescriptor[] = [
  {
    uri: PatrickHandLatinExt,
    descriptors: { unicodeRange: GOOGLE_FONTS_RANGES.LATIN_EXT },
  },
  {
    uri: PatrickHandLatin,
    descriptors: { unicodeRange: GOOGLE_FONTS_RANGES.LATIN },
  },
];
