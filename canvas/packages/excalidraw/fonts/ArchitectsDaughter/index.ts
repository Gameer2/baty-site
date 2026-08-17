import { GOOGLE_FONTS_RANGES } from "@excalidraw/common";

import { type SyntropyFontFaceDescriptor } from "../Fonts";

import ArchitectsDaughterLatinExt from "./ArchitectsDaughter-latin-ext.woff2";
import ArchitectsDaughterLatin from "./ArchitectsDaughter-latin.woff2";

// SIL Open Font License — https://fonts.google.com/specimen/Architects+Daughter/license
export const ArchitectsDaughterFontFaces: SyntropyFontFaceDescriptor[] = [
  {
    uri: ArchitectsDaughterLatinExt,
    descriptors: { unicodeRange: GOOGLE_FONTS_RANGES.LATIN_EXT },
  },
  {
    uri: ArchitectsDaughterLatin,
    descriptors: { unicodeRange: GOOGLE_FONTS_RANGES.LATIN },
  },
];
