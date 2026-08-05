import { useMemo, useState } from "react";

import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

import "./LibraryPanel.scss";

// No corner crosshairs on the engine rows. The site's crosshair motif is sized for a full
// .engine-card with 28px of padding; on a ~36px-tall row the four "+" marks land on the border
// and read as clutter, not instrumentation. The mockup's own .eng5-head has none either.
import manifest from "./manifest.generated.json";
import { createSyntropyNode } from "./createSyntropyNode";

import type { EngineId } from "./engineAccents";

type Method = {
  methodId: string;
  name: string;
  categoryId?: string;
  categoryName?: string;
};

type LibraryPanelProps = {
  excalidrawAPI: ExcalidrawImperativeAPI | null;
};

/**
 * Methods in manifest order, split into runs of the same category. Only calculus carries
 * categories (see generate-engine-manifest.mjs); the other six engines produce a single
 * unnamed group, so both shapes render down the same path with no per-engine branching.
 */
const groupByCategory = (methods: Method[]) => {
  const groups: { categoryName: string | null; methods: Method[] }[] = [];
  for (const method of methods) {
    const categoryName = method.categoryName ?? null;
    const last = groups[groups.length - 1];
    if (last && last.categoryName === categoryName) {
      last.methods.push(method);
    } else {
      groups.push({ categoryName, methods: [method] });
    }
  }
  return groups;
};

export const LibraryPanel = ({ excalidrawAPI }: LibraryPanelProps) => {
  // Collapsed by default. 135 methods across 7 engines means any auto-opened engine fills the
  // whole panel — calculus alone is 26 rows — and the list reads as a file dump instead of a
  // library. You open what you want, or you search.
  const [openEngineId, setOpenEngineId] = useState<EngineId | null>(null);
  const [query, setQuery] = useState("");

  const trimmedQuery = query.trim().toLowerCase();
  const isSearching = trimmedQuery.length > 0;

  // While searching, every engine holding a match is force-expanded and engines with none are
  // dropped — searching across all 7 is the point, so the accordion gets out of the way.
  const engines = useMemo(() => {
    if (!isSearching) {
      return manifest.map((engine) => ({ ...engine, methods: engine.methods }));
    }
    return manifest
      .map((engine) => ({
        ...engine,
        methods: (engine.methods as Method[]).filter((method) =>
          method.name.toLowerCase().includes(trimmedQuery),
        ),
      }))
      .filter((engine) => engine.methods.length > 0);
  }, [isSearching, trimmedQuery]);

  const totalMatches = useMemo(
    () => engines.reduce((sum, engine) => sum + engine.methods.length, 0),
    [engines],
  );

  return (
    <div className="LibraryPanel">
      {/* Sticky: with an engine expanded the list runs well past the viewport, and a search
          field that scrolls out of reach is a search field you stop using. */}
      <div className="LibraryPanel__head">
        <div className="LibraryPanel__eyebrow">Engines · Library</div>
        <input
          type="search"
          className="LibraryPanel__searchInput"
          placeholder="Search methods…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          aria-label="Search methods across all engines"
        />
      </div>

      {isSearching && totalMatches === 0 && (
        <p className="LibraryPanel__empty">
          No method matches “{query.trim()}”.
        </p>
      )}

      {engines.map((engine) => {
        const isOpen = isSearching || engine.engineId === openEngineId;
        const accent = engine.accent;
        return (
          <div className="LibraryPanel__engine" key={engine.engineId}>
            <button
              type="button"
              className="LibraryPanel__engine-head"
              style={{ "--engine-accent": accent } as React.CSSProperties}
              aria-expanded={isOpen}
              onClick={() =>
                setOpenEngineId(
                  engine.engineId === openEngineId
                    ? null
                    : (engine.engineId as EngineId),
                )
              }
            >
              <span
                className="LibraryPanel__engine-dot"
                style={{ background: accent }}
              />
              <span className="LibraryPanel__engine-name">
                {engine.engineName}
              </span>
              <span className="LibraryPanel__engine-count">
                {engine.methods.length}
              </span>
            </button>

            {isOpen && (
              <div
                className="LibraryPanel__methods"
                style={{ "--engine-accent": accent } as React.CSSProperties}
              >
                {groupByCategory(engine.methods as Method[]).map((group) => (
                  <div
                    className="LibraryPanel__category"
                    key={group.categoryName ?? "__ungrouped"}
                  >
                    {group.categoryName && (
                      <div className="LibraryPanel__categoryName">
                        {group.categoryName}
                      </div>
                    )}
                    {group.methods.map((method) => (
                      <button
                        type="button"
                        key={method.methodId}
                        className="LibraryPanel__method"
                        onClick={() => {
                          if (excalidrawAPI) {
                            createSyntropyNode(excalidrawAPI, {
                              engineId: engine.engineId as EngineId,
                              methodId: method.methodId,
                              name: method.name,
                            });
                          }
                        }}
                      >
                        <span className="LibraryPanel__method-dot" />
                        <span className="LibraryPanel__method-name">
                          {method.name}
                        </span>
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};
