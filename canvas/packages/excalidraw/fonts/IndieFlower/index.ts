import { GOOGLE_FONTS_RANGES } from "@excalidraw/common";

import { type SyntropyFontFaceDescriptor } from "../Fonts";

import IndieFlowerLatinExt from "./IndieFlower-latin-ext.woff2";
import IndieFlowerLatin from "./IndieFlower-latin.woff2";

// SIL Open Font License — https://fonts.google.com/specimen/Indie+Flower/license
export const IndieFlowerFontFaces: SyntropyFontFaceDescriptor[] = [
  {
    uri: IndieFlowerLatinExt,
    descriptors: { unicodeRange: GOOGLE_FONTS_RANGES.LATIN_EXT },
  },
  {
    uri: IndieFlowerLatin,
    descriptors: { unicodeRange: GOOGLE_FONTS_RANGES.LATIN },
  },
];
