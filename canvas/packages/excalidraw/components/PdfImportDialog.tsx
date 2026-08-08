import { useEffect, useMemo, useRef, useState } from "react";

import type { LayoutMode } from "@excalidraw/element";

import { t } from "../i18n";

import { Dialog } from "./Dialog";
import DialogActionButton from "./DialogActionButton";
import { RadioGroup } from "./RadioGroup";
import { checkIcon } from "./icons";
import "./PdfImportDialog.scss";

import type { PdfRenderedPage } from "../data/pdf";

// thumbnail render cap (px on the larger dimension) — small enough for a
// responsive grid, big enough to read which page is which
const THUMB_MAX_DIM = 220;

type ThumbPage = PdfRenderedPage & { dataURL: string };

export interface PdfImportLayout {
  mode: LayoutMode;
  gap: number;
  columns?: number;
}

interface PdfImportDialogProps {
  file: File;
  onConfirm: (pages: number[], layout: PdfImportLayout) => void;
  onCloseRequest: () => void;
}

const LAYOUT_CHOICES: LayoutMode[] = ["grid", "row", "column", "stacked"];

export const PdfImportDialog = ({
  file,
  onConfirm,
  onCloseRequest,
}: PdfImportDialogProps) => {
  const [pages, setPages] = useState<ThumbPage[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [mode, setMode] = useState<LayoutMode>("grid");
  const [gap, setGap] = useState<number>(50);
  const [columns, setColumns] = useState<number>(4);
  const [inserting, setInserting] = useState(false);

  const objectUrlsRef = useRef<string[]>([]);

  // render thumbnails for every page on mount
  useEffect(() => {
    let cancelled = false;
    const urls = objectUrlsRef.current;
    import("../data/pdf")
      .then(({ renderPdfPages }) =>
        renderPdfPages(file, { maxWidthOrHeight: THUMB_MAX_DIM }),
      )
      .then((rendered) => {
        if (cancelled) {
          return;
        }
        const withUrls: ThumbPage[] = rendered.map((page) => ({
          ...page,
          dataURL: URL.createObjectURL(page.blob),
        }));
        for (const p of withUrls) {
          urls.push(p.dataURL);
        }
        setPages(withUrls);
        setSelected(new Set(rendered.map((p) => p.pageNumber)));
      })
      .catch((err: Error) => {
        if (!cancelled) {
          setError(err.message || t("errors.unsupportedFileType"));
        }
      });
    return () => {
      cancelled = true;
      for (const url of objectUrlsRef.current) {
        URL.revokeObjectURL(url);
      }
      objectUrlsRef.current = [];
    };
  }, [file]);

  const pageCount = pages?.length ?? 0;

  const togglePage = (pageNumber: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(pageNumber)) {
        next.delete(pageNumber);
      } else {
        next.add(pageNumber);
      }
      return next;
    });
  };

  const selectAll = () =>
    setSelected(new Set((pages ?? []).map((p) => p.pageNumber)));
  const selectNone = () => setSelected(new Set());

  const sortedSelected = useMemo(
    () => Array.from(selected).sort((a, b) => a - b),
    [selected],
  );

  const handleInsert = () => {
    if (sortedSelected.length === 0 || inserting) {
      return;
    }
    setInserting(true);
    onConfirm(sortedSelected, {
      mode,
      gap,
      columns: mode === "grid" ? columns : undefined,
    });
  };

  const insertDisabled = sortedSelected.length === 0 || inserting || !!error;

  return (
    <Dialog
      onCloseRequest={onCloseRequest}
      title={t("pdfImport.title")}
      size="wide"
      className="PdfImportDialog"
    >
      <div className="PdfImportDialog__settings">
        <div className="PdfImportDialog__setting">
          <span className="PdfImportDialog__setting-label">
            {t("pdfImport.layout")}
          </span>
          <RadioGroup
            name="pdf-layout"
            value={mode}
            onChange={(value: LayoutMode) => setMode(value)}
            choices={LAYOUT_CHOICES.map((value) => ({
              value,
              label: t(`pdfImport.${value}`),
            }))}
          />
        </div>

        {mode === "grid" && (
          <div className="PdfImportDialog__setting">
            <span className="PdfImportDialog__setting-label">
              {t("pdfImport.columns")}
            </span>
            <input
              className="PdfImportDialog__number"
              type="number"
              min={1}
              max={Math.max(1, pageCount)}
              value={columns}
              onChange={(e) =>
                setColumns(Math.max(1, Number(e.target.value) || 1))
              }
              disabled={!pages}
            />
          </div>
        )}

        <div className="PdfImportDialog__setting">
          <span className="PdfImportDialog__setting-label">
            {t("pdfImport.gap")}
          </span>
          <input
            className="PdfImportDialog__number"
            type="number"
            min={0}
            value={gap}
            onChange={(e) => setGap(Math.max(0, Number(e.target.value) || 0))}
            disabled={!pages}
          />
        </div>
      </div>

      <div className="PdfImportDialog__pages-header">
        <span className="PdfImportDialog__pages-title">
          {t("pdfImport.pages")}
          {pageCount > 0 && (
            <span className="PdfImportDialog__pages-count">
              {t("pdfImport.selectedCount", { count: selected.size })}
            </span>
          )}
        </span>
        {pages && (
          <div className="PdfImportDialog__select-toggle">
            <button type="button" onClick={selectAll}>
              {t("pdfImport.selectAll")}
            </button>
            <button type="button" onClick={selectNone}>
              {t("pdfImport.selectNone")}
            </button>
          </div>
        )}
      </div>

      {error ? (
        <div className="PdfImportDialog__error">{error}</div>
      ) : !pages ? (
        <div className="PdfImportDialog__loading">{t("pdfImport.loading")}</div>
      ) : (
        <div className="PdfImportDialog__thumbs">
          {pages.map((page) => {
            const isSelected = selected.has(page.pageNumber);
            return (
              <button
                type="button"
                key={page.pageNumber}
                className={`PdfImportDialog__thumb${
                  isSelected ? " PdfImportDialog__thumb--selected" : ""
                }`}
                onClick={() => togglePage(page.pageNumber)}
                title={`${t("pdfImport.pages")} ${page.pageNumber}`}
                aria-pressed={isSelected}
              >
                {page.dataURL && (
                  <img
                    src={page.dataURL}
                    alt={`${t("pdfImport.pages")} ${page.pageNumber}`}
                    draggable={false}
                  />
                )}
                {isSelected && (
                  <span className="PdfImportDialog__thumb-check">
                    {checkIcon}
                  </span>
                )}
                <span className="PdfImportDialog__thumb-number">
                  {page.pageNumber}
                </span>
              </button>
            );
          })}
        </div>
      )}

      <div className="PdfImportDialog__buttons">
        <DialogActionButton
          label={t("pdfImport.cancel")}
          onClick={onCloseRequest}
        />
        <DialogActionButton
          label={t("pdfImport.insert")}
          onClick={handleInsert}
          actionType="primary"
          disabled={insertDisabled}
          isLoading={inserting}
        />
      </div>
    </Dialog>
  );
};
