// -----------------------------------------------------------------------------
// PDF import
//
// The canvas has no native "PDF element" — and doesn't need one. A PDF on a
// whiteboard is most useful as laid-out pages you can annotate, move, and
// export like anything else. So we render each page to a PNG via pdf.js and
// hand the resulting image files to the existing image-insertion pipeline
// (`insertImages` → `initializeImage`), which already handles storage,
// rendering, resize, and export. No new element type is introduced.
//
// pdf.js is lazy-imported on first use so the (sizable) library + worker only
// load when someone actually imports a PDF.
// -----------------------------------------------------------------------------

// pdf.js worker. `?url` makes Vite emit the worker as an asset and hand back
// its same-origin URL — pdf.js then spawns a module worker from it (no CORS
// pain, unlike a bare `new URL(..., import.meta.url)` which Vite doesn't
// reliably rewrite for bare specifiers).
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

let pdfjsPromise: Promise<typeof import("pdfjs-dist")> | null = null;

const loadPdfjs = async () => {
  if (!pdfjsPromise) {
    pdfjsPromise = import("pdfjs-dist").then((pdfjsLib) => {
      pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;
      return pdfjsLib;
    });
  }
  return pdfjsPromise;
};

/** A single PDF page rendered to a PNG blob, plus its pixel dimensions. */
export type PdfRenderedPage = {
  pageNumber: number;
  blob: Blob;
  width: number;
  height: number;
};

const renderPageToCanvas = async (
  page: import("pdfjs-dist").PDFPageProxy,
  targetMaxDim: number,
): Promise<{ canvas: HTMLCanvasElement; width: number; height: number }> => {
  // cap the render so the larger page dimension ≈ `targetMaxDim` px
  const baseViewport = page.getViewport({ scale: 1 });
  const scale =
    targetMaxDim / Math.max(baseViewport.width, baseViewport.height);
  const viewport = page.getViewport({ scale });

  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Could not get 2D canvas context for PDF render");
  }

  // opaque white page background (PDFs are otherwise transparent)
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);

  await page.render({ canvasContext: context, viewport }).promise;

  return { canvas, width: canvas.width, height: canvas.height };
};

/**
 * Render the given pages of `file` (a PDF) to PNG blobs, one per page, in
 * ascending page order. `pages` is 1-indexed; omit it to render every page.
 *
 * Each page is capped so its larger dimension ≈ `maxWidthOrHeight` px — the
 * same cap the image pipeline applies, so the downstream `resizeImageFile` is
 * usually a no-op when that same value is passed.
 */
export const renderPdfPages = async (
  file: File,
  opts: { maxWidthOrHeight: number; pages?: number[] },
): Promise<PdfRenderedPage[]> => {
  const pdfjsLib = await loadPdfjs();

  const data = new Uint8Array(await file.arrayBuffer());
  const pdf = await pdfjsLib.getDocument({ data }).promise;

  // resolve the page list (1-indexed, sorted, deduped, in range)
  let pageNumbers: number[];
  if (opts.pages && opts.pages.length > 0) {
    const unique = Array.from(new Set(opts.pages)).sort((a, b) => a - b);
    const invalid = unique.find((p) => p < 1 || p > pdf.numPages);
    if (invalid !== undefined) {
      pdf.destroy();
      throw new Error(
        `PDF page ${invalid} is out of range (1..${pdf.numPages})`,
      );
    }
    pageNumbers = unique;
  } else {
    pageNumbers = Array.from({ length: pdf.numPages }, (_, i) => i + 1);
  }

  const pages: PdfRenderedPage[] = [];
  try {
    for (const pageNumber of pageNumbers) {
      const page = await pdf.getPage(pageNumber);
      const { canvas, width, height } = await renderPageToCanvas(
        page,
        opts.maxWidthOrHeight,
      );
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/png"),
      );
      if (!blob) {
        throw new Error(`Failed to encode PDF page ${pageNumber} to PNG`);
      }
      pages.push({ pageNumber, blob, width, height });
      page.cleanup();
    }
  } finally {
    pdf.destroy();
  }

  return pages;
};

/** Number of pages in `file`, without rendering any of them. */
export const getPdfPageCount = async (file: File): Promise<number> => {
  const pdfjsLib = await loadPdfjs();
  const data = new Uint8Array(await file.arrayBuffer());
  const pdf = await pdfjsLib.getDocument({ data }).promise;
  try {
    return pdf.numPages;
  } finally {
    pdf.destroy();
  }
};

/**
 * Render every page of `file` to a PNG `File`, one per page, in order. Thin
 * wrapper over {@link renderPdfPages} for callers that go straight into the
 * image pipeline without a page-selection dialog.
 */
export const renderPdfToImageFiles = async (
  file: File,
  opts: { maxWidthOrHeight: number },
): Promise<File[]> => {
  const pages = await renderPdfPages(file, opts);
  const baseName = file.name.replace(/\.pdf$/i, "");
  return pages.map(
    (page) =>
      new File([page.blob], `${baseName || "pdf"}-p${page.pageNumber}.png`, {
        type: "image/png",
      }),
  );
};
