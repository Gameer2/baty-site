# Design: Suppress Excalidraw's generic shape/link UI on Syntropy nodes

Date: 2026-08-06
Status: Design approved, ready for `writing-plans`.

## Purpose

Syntropy nodes (`excalidraw-app/syntropy/`) are Excalidraw `embeddable` elements with
`link: "syntropy://node/<engineId>/<methodId>"` and `customData.syntropyNode` — see
`docs/superpowers/specs/2026-08-05-syntropy-canvas-node-host-first-method-design.md` for why they
stay a real embeddable element (selection/drag/resize/undo/persistence/export all depend on it)
while all visible chrome renders through the `NodeOverlay` DOM layer instead of
`renderEmbeddable`.

That design correctly stopped `renderEmbeddable` from painting anything, but two pieces of
Excalidraw's *generic* UI — driven off `element.link` and `isEmbeddableElement()`, not off
`renderEmbeddable` — never got the same treatment:

1. Selecting a node still shows the standard shape-properties panel (stroke, background, opacity,
   etc.), as if it were a plain rectangle.
2. Hovering or selecting a node still shows Excalidraw's built-in hyperlink affordances — the
   hover tooltip and the "info" popup badge — even though the node's `SyntropyNodeCard`/
   `SyntropyNode` overlay already has its own "Open ↗" button as the one intended way to navigate
   to the method page.

There's already a precedent for special-casing these elements inside core: `shape.ts`'s
`modifyIframeLikeForRoughOptions` checks `element.link?.startsWith("syntropy://")` to skip
painting the gray "unresolved embed" placeholder, with a comment explaining why. This design
extends that same pattern to the two remaining places.

## Approach

Add one shared predicate and reuse it at every site that currently treats "has a link" or "is
embeddable" as a reason to show generic link/property UI, instead of duplicating the
`link?.startsWith("syntropy://")` check inline at each call site.

```ts
// packages/element/src/syntropyLink.ts (new, small, no dependencies beyond ExcalidrawElement)
export const isSyntropyLinkElement = (element: { link?: string | null }): boolean =>
  typeof element.link === "string" && element.link.startsWith("syntropy://");
```

`shape.ts` gets refactored to import and use this instead of its inline check (behavior
unchanged, just de-duplicated).

## 1. Properties panel

`packages/element/src/showSelectedShapeActions.ts` currently shows the panel whenever
`getSelectedElements(...).length` is truthy, with no exception for element type. Change: filter
Syntropy nodes out of the selection before that length check.

- Selecting a node alone → selection-after-filter is empty → panel does not show (assuming no
  other condition in the existing boolean, e.g. an active drawing tool, already forces it open).
- Selecting a node plus a regular shape → the regular shape remains in the filtered selection →
  panel shows, scoped to that shape, exactly like today's normal multi-select behavior. (Confirmed
  with the user: mixed selections keep showing the panel for the non-node elements — it does not
  hide just because a node happens to be part of the selection.)

## 2. Hover tooltip

`App.tsx`'s `getElementLinkAtPosition` scans elements back-to-front and returns the first one
whose `.link` is hit. Add `!isSyntropyLinkElement(element)` to the hit condition so a Syntropy
node is never returned as `hitLinkElement`. `applyElementLinkHoverAffordance` (which sets the
pointer cursor and calls `showHyperlinkTooltip`) already keys entirely off `hitLinkElement`, so
this one change removes the tooltip with no further edits needed there.

## 3. The "info" popup badge

Same file, the block that sets `showHyperlinkPopup: "info"` on hover-while-selected:

```ts
hitElement &&
  (hitElement.link || isEmbeddableElement(hitElement)) &&
  this.state.selectedElementIds[hitElement.id] &&
  ...
```

The `isEmbeddableElement(hitElement)` half of that OR fires for *any* embeddable regardless of
its link — which is why this shows even though the link itself is otherwise being treated as
inert. Change to `(hitElement.link || isEmbeddableElement(hitElement)) &&
!isSyntropyLinkElement(hitElement)`.

## 4. Right-click menu and click-to-open

`actionLink.tsx`'s "Create link" / "Edit link" context-menu actions, and the Cmd/Ctrl+click
open-link handling in `App.tsx` (`handleElementLinkClick` / `maybeHandleElementLinkClick`), all
key off the same `element.link` truthiness or `hitLinkElement`. Applying
`isSyntropyLinkElement` as an exclusion at these sites too keeps the principle consistent:
**"Open ↗" is the only link-shaped action available on a Syntropy node** — not just in the two
spots originally reported, but everywhere Excalidraw surfaces link UI generically. This is
slightly broader than the original bug report; flagged to the user during design and kept in
scope.

## Explicitly out of scope

- `createSyntropyNode.ts`, `NodeOverlay.tsx`, `SyntropyNode.tsx`/`SyntropyNodeCard.tsx`, the wire
  system (`syntropyWire.ts`) — all unchanged. This is purely suppressing generic UI, not touching
  how nodes are created, wired, or rendered.
- Selection outline, drag-to-move, resize handles, undo/redo, persistence, export — none of these
  read `.link` or `isEmbeddableElement` for their own decisions, so they're unaffected.
- `validateEmbeddable`'s requirement that the element have a non-empty `.link` to avoid the gray
  placeholder (already solved by the existing `shape.ts` special-case) — untouched; the new
  predicate only gates *additional* UI, it never removes or nulls out `.link` itself.

## Testing

- Unit tests for `isSyntropyLinkElement` (syntropy link, normal link, no link, empty string).
- Unit tests for the updated `showSelectedShapeActions`: all-nodes selection (false), mixed
  selection (true), no selection with a drawing tool active (unchanged existing behavior).
- Manual verification in the running app:
  1. Select a node alone — no properties panel, no hyperlink popup on hover.
  2. Select a node + a rectangle together — panel shows, editing it affects the rectangle only.
  3. Hover a node without selecting it — no tooltip, pointer cursor does not change to the link
     cursor.
  4. Right-click a node — context menu has no "Edit link"/"Create link" entries.
  5. `yarn test:app --watch=false` still passes at baseline.
