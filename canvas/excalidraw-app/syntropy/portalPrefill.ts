import type { PortSpec } from "./portSpecs/types";

/**
 * The node's current inputs ARE the page's saveState() shape for Riemann Sums — both keyed by
 * the same fx/a/b/n names (math-lab/assets/js/riemann-sums.js's own snapshot()). This function
 * exists as its own step (rather than passing `inputs` straight to localStorage) because a
 * future port spec's input keys will not always match its page's storage keys one-to-one; this
 * is the seam where that mapping would go without touching the caller.
 */
export const buildPageState = (
  spec: PortSpec,
  inputs: Record<string, unknown>,
): Record<string, unknown> => {
  const state: Record<string, unknown> = {};
  for (const input of spec.inputs) {
    state[input.key] = inputs[input.key];
  }
  return state;
};

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
  window.open(spec.pagePath, "_blank");
};

/**
 * Path-only portal open for methods that don't have a port spec yet (the ~134 placeholder nodes).
 * There are no live inputs to prefill without a spec, so this just opens the method's real lab page
 * in a new tab — same destination as `openMethodPage`, minus the localStorage write. Page path
 * follows the same convention the port specs use: `/math-lab/engines/<engineId>/methods/<methodId>.html`.
 */
export const openMethodPageByPath = (pagePath: string): void => {
  window.open(pagePath, "_blank");
};

export const methodPagePath = (engineId: string, methodId: string): string =>
  `/math-lab/engines/${engineId}/methods/${methodId}.html`;
