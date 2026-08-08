import { ALLOWED_PASTE_MIME_TYPES, PDF_MIME_TYPES } from "@excalidraw/common";

import { isSupportedPdfFile, isSupportedPdfFileType } from "../../data/blob";

describe("PDF import helpers", () => {
  it("PDF_MIME_TYPES exposes application/pdf", () => {
    expect(PDF_MIME_TYPES.pdf).toBe("application/pdf");
  });

  it("application/pdf is an allowed paste type", () => {
    expect(ALLOWED_PASTE_MIME_TYPES).toContain("application/pdf");
  });

  it("isSupportedPdfFileType recognizes application/pdf", () => {
    expect(isSupportedPdfFileType("application/pdf")).toBe(true);
    expect(isSupportedPdfFileType("image/png")).toBe(false);
    expect(isSupportedPdfFileType("video/mp4")).toBe(false);
    expect(isSupportedPdfFileType(null)).toBe(false);
    expect(isSupportedPdfFileType(undefined)).toBe(false);
  });

  it("isSupportedPdfFile narrows a Blob's type", () => {
    const pdf = new File(["%PDF-1.4 fake"], "doc.pdf", {
      type: "application/pdf",
    });
    const png = new File(["x"], "img.png", { type: "image/png" });

    expect(isSupportedPdfFile(pdf)).toBe(true);
    expect(isSupportedPdfFile(png)).toBe(false);
    expect(isSupportedPdfFile(null)).toBe(false);
  });
});
