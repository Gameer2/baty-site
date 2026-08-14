// Wires the CAS bridge to math-lab's real symbolic worker at app startup. Imported for its side
// effect (like sentry.ts) from index.tsx — the entry HTML's only script.
//
// The worker URL follows the same relative-to-document convention portalPrefill uses for lab
// pages (`../../math-lab/...`): from canvas/dist it climbs to the repo root and into the sibling
// math-lab/; under the Vite dev server (document at /) it clamps to /math-lab/... which the proxy
// in vite.config.mts forwards to serve.py; under file:// it reaches the real sibling folder.
// `new Worker(url)` resolves the URL against the document base, exactly as window.open does.
//
// cas-worker.js is a CLASSIC worker (importScripts-based), so the default `new Worker(url)` is
// correct — no `{ type: "module" }`, no entry wrapper. Its own importScripts("../vendor/...",
// "./calc-core.js", "./calculus-symbolic.js", …) resolve against the worker script's URL, so the
// whole symbolic stack (math.js, nerdamer, the kernel bundle, every engine core) loads with it.
// Vite only transforms `new Worker(new URL(...import.meta.url))` patterns; a runtime-string
// `new Worker(url)` is left untouched, so no build step is needed here.
//
// Wiring is lazy and free until used: configureCas only records the URL. The worker spawns on the
// first run-mode node's `casCall` (see useNodeCompute → computeRun), so a board with no run-mode
// node pays zero CAS bundle cost. Verified manually via CAS_INT=1 — see casClient.integration.test.

import { configureCas } from "./casClient";

/** The math-lab symbolic worker, resolved relative to the document (see file header). */
const CAS_WORKER_URL = "../../math-lab/assets/js/cas-worker.js";

/** Configure the CAS bridge's worker URL. Idempotent; no spawn happens until the first `casCall`. */
export const initCas = (): void => {
  configureCas({ workerUrl: CAS_WORKER_URL });
};

initCas();
