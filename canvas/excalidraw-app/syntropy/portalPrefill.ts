import type { PortSpec } from "./portSpecs/types";

/**
 * The node's current inputs ARE the page's saveState() shape for Riemann Sums — both keyed by
 * the same fx/a/b/n names (math-lab/assets/js/riemann-sums.js's own snapshot()). This is the
 * default for every spec that doesn't declare `toPageState` — a spec whose input keys don't map
 * 1:1 onto its page's storage shape provides that mapping itself instead (see PortSpec.toPageState
 * in portSpecs/types.ts for when that's needed).
 */
export const buildPageState = (
  spec: PortSpec,
  inputs: Record<string, unknown>,
): Record<string, unknown> => {
  if (spec.toPageState) {
    return spec.toPageState(inputs);
  }
  const state: Record<string, unknown> = {};
  for (const input of spec.inputs) {
    state[input.key] = inputs[input.key];
  }
  return state;
};

/**
 * Resolve a canonical lab page path (`/math-lab/engines/…/method.html`) to a URL that opens
 * correctly no matter where the canvas app is served from.
 *
 * The app and the lab are sibling directories under the repo root — `canvas/dist/` (this app)
 * and `math-lab/`. A hard-coded root-absolute `/math-lab/...` only resolves when the app is
 * served from the repo root (serve.py) or via the dev proxy; opened from `canvas/dist/` with a
 * static server, or via `file://`, that absolute path 404s and the page "doesn't open properly".
 *
 * `../../math-lab/...` is relative to this document: from `canvas/dist/` it climbs to the repo
 * root and into the sibling `math-lab/`; under the dev server (document at `/`) it clamps to
 * `/math-lab/...` which the Vite proxy forwards to serve.py; under `file://` it reaches the real
 * sibling folder. `window.open` resolves the relative URL against this document's base URI.
 */
const toLabUrl = (pagePath: string): string =>
  pagePath.startsWith("/math-lab/") ? `../../${pagePath.slice(1)}` : pagePath;

/**
 * The portal: writes the node's current values into the exact localStorage key/shape the
 * method's real page already reads on load via Proto.loadState (math-lab/assets/proto/proto.js),
 * then opens that page in a new tab. Works only because phase A put the hub, math-lab, and
 * canvas on one origin — localStorage doesn't cross origins.
 */
export const openMethodPage = (
  spec: PortSpec,
  inputs: Record<string, unknown>,
): void => {
  const state = buildPageState(spec, inputs);
  localStorage.setItem(spec.pageStoreKey, JSON.stringify(state));
  window.open(toLabUrl(spec.pagePath), "_blank");
};

/**
 * Path-only portal open for methods that don't have a port spec yet (the ~134 placeholder nodes).
 * There are no live inputs to prefill without a spec, so this just opens the method's real lab page
 * in a new tab — same destination as `openMethodPage`, minus the localStorage write. Page path
 * follows the same convention the port specs use: `/math-lab/engines/<engineId>/methods/<methodId>.html`.
 */
export const openMethodPageByPath = (pagePath: string): void => {
  window.open(toLabUrl(pagePath), "_blank");
};

export const methodPagePath = (engineId: string, methodId: string): string =>
  `/math-lab/engines/${engineId}/methods/${methodId}.html`;
