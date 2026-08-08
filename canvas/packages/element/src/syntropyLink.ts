// Syntropy Canvas: nodes are real `embeddable` elements carrying a `syntropy://` link so
// `validateEmbeddable` accepts them (see `shape.ts`'s `modifyIframeLikeForRoughOptions`) and so
// they can be identified generically wherever core code decides "does this element have a link"
// or "is this an embeddable" for UI purposes. All of that generic link/property UI (hyperlink
// tooltip, hyperlink popup badge, shape-properties panel) is suppressed for these elements — the
// node's own overlay chrome (excalidraw-app/syntropy/NodeOverlay.tsx) provides the one intended
// way to navigate to it, via its "Open" button.
export const isSyntropyLinkElement = (element: {
  link?: string | null;
}): boolean =>
  typeof element.link === "string" && element.link.startsWith("syntropy://");
