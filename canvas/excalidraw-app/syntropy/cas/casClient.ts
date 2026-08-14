// CAS bridge — the canvas side of math-lab's symbolic-engine worker.
//
// math-lab ships `cas-worker.js` + `cas-client.js` as browser IIFE scripts (`root.CAS =
// factory()`), not ES modules, so the canvas app (a Vite/ESM bundle) can't import them directly.
// This adapter is the ES-module half: it speaks the same Promise RPC protocol (`postMessage({ id,
// op, args })` → worker → resolve on `{ id, ok, result }`) so a run-mode Syntropy node's
// `compute()` can `await casCall(op, args)` exactly as a math-lab page calls `CAS.call(op, args)`.
//
// The worker is lazy — the first `casCall` (or an explicit `loadCas()`) spawns it, and a board
// with no run-mode node pays zero CAS bundle cost. The kill switch is replicated from
// cas-client.js verbatim: every call is raced against a timeout, and an overrun terminates the
// worker outright (the only way to stop a synchronous nerdamer hang), rejecting every call in
// flight and forcing a fresh spawn next time.
//
// The in-page sync fallback cas-client.js falls back to over file:// is deliberately NOT
// replicated here — it depends on `self.CalculusSymbolic` & friends, which the canvas bundle
// never loads. If the worker can't spawn, `casCall` rejects with a clear "unavailable" message
// rather than hanging.
//
// Worker URL wiring (Task 3): the app layer (syntropy/cas/init.ts, imported from index.tsx) calls
// `configureCas({ workerUrl: "../../math-lab/assets/js/cas-worker.js" })` at startup. That path is
// resolved relative to the document (same convention as portalPrefill's lab-page URLs) so it
// reaches the sibling math-lab/ from canvas/dist, the dev proxy, and file:// alike. cas-worker.js
// is a classic (importScripts) worker, so the default `new Worker(url)` boots it with no module
// wrapper or build step. Tests inject a `workerFactory` so no real nerdamer is ever loaded; the
// real-worker boot is verified manually behind `CAS_INT=1` (casClient.integration.test.ts).

type CasWorkerLike = {
  postMessage: (msg: unknown) => void;
  onmessage: ((e: { data: unknown }) => void) | null;
  onerror: ((e: unknown) => void) | null;
  terminate: () => void;
};

export type CasWorkerFactory = (url: string) => CasWorkerLike;

type PendingEntry = {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

type CasResponse = {
  id?: unknown;
  ok?: boolean;
  result?: unknown;
  error?: string;
};

const DEFAULT_TIMEOUT_MS = 8000;

let workerUrl: string | null = null;
let workerFactory: CasWorkerFactory | null = null;
let worker: CasWorkerLike | null = null;
let mode: "worker" | "sync" = "worker";
let seq = 0;
let timeoutMs = DEFAULT_TIMEOUT_MS;
const pending = new Map<number, PendingEntry>();

/** Set the worker URL, an injectable factory (tests), and/or the per-call timeout. The factory
 *  lets tests stub the worker without spawning a real one; production leaves it unset so `spawn`
 *  falls back to `new Worker(url)` (wired in Task 3). */
export const configureCas = (opts: {
  workerUrl?: string;
  workerFactory?: CasWorkerFactory;
  timeoutMs?: number;
}) => {
  if (opts.workerUrl !== undefined) {
    workerUrl = opts.workerUrl;
  }
  if (opts.workerFactory !== undefined) {
    workerFactory = opts.workerFactory;
  }
  if (opts.timeoutMs !== undefined) {
    timeoutMs = opts.timeoutMs;
  }
};

/** "worker" once a worker spawned successfully, "sync" if spawning threw (no Worker available). */
export const casMode = (): "worker" | "sync" => mode;

/** True once a worker has been spawned and is still alive. */
export const casReady = (): boolean => worker !== null;

const kill = () => {
  if (worker) {
    try {
      worker.terminate();
    } catch {
      /* already gone */
    }
    worker = null;
  }
};

const failAll = (message: string) => {
  for (const entry of pending.values()) {
    clearTimeout(entry.timer);
    entry.reject(new Error(message));
  }
  pending.clear();
};

const spawn = (): CasWorkerLike | null => {
  if (worker) {
    return worker;
  }
  const url = workerUrl;
  if (!url) {
    return null;
  }
  let spawned: CasWorkerLike;
  try {
    // A real DOM Worker is structurally compatible (postMessage/onmessage/onerror/terminate)
    // but its onmessage is typed against MessageEvent, so cast through unknown to the adapter's
    // minimal event shape — the handler only reads `.data`, which MessageEvent carries.
    spawned = workerFactory
      ? workerFactory(url)
      : (new Worker(url) as unknown as CasWorkerLike);
  } catch {
    // No Worker available (file://, or a browser refusing the URL) — degrade to "sync", which
    // for this adapter means "unavailable": casCall rejects rather than hanging.
    worker = null;
    mode = "sync";
    return null;
  }
  worker = spawned;
  mode = "worker";
  spawned.onmessage = (e: { data: unknown }) => {
    const msg = (e.data ?? {}) as CasResponse;
    if (msg.id === "__ready__") {
      return;
    }
    if (typeof msg.id !== "number") {
      return;
    }
    const entry = pending.get(msg.id);
    if (!entry) {
      // A late reply from before a terminate; nothing to settle.
      return;
    }
    clearTimeout(entry.timer);
    pending.delete(msg.id);
    if (msg.ok) {
      entry.resolve(msg.result);
    } else {
      entry.reject(new Error(msg.error || "The symbolic engine failed."));
    }
  };
  spawned.onerror = () => {
    // A worker-level error (bad import, syntax error) is not recoverable per-request: fail
    // everything outstanding rather than let callers hang.
    failAll("The symbolic engine failed to start.");
    kill();
  };
  return spawned;
};

/** Runs one CAS operation. Rejects with a user-showable message on timeout or worker error — the
 *  node layer surfaces it as the run's status, because "this input hangs the CAS" is real
 *  information about the input, not just an internal failure. Never leaves a caller pending. */
export const casCall = (op: string, args: unknown[] = []): Promise<unknown> => {
  const w = spawn();
  if (!w) {
    return Promise.reject(
      new Error(
        "The symbolic engine is unavailable (no CAS worker configured).",
      ),
    );
  }
  return new Promise((resolve, reject) => {
    const id = ++seq;
    const timer = setTimeout(() => {
      pending.delete(id);
      // The only way to stop a synchronous hang inside the worker.
      kill();
      failAll("Cancelled: another symbolic computation had to be stopped.");
      const howLong =
        timeoutMs >= 1000
          ? `${Math.round(timeoutMs / 1000)}s`
          : `${timeoutMs}ms`;
      reject(
        new Error(
          `The symbolic engine took longer than ${howLong} on this input and was stopped. ` +
            "Some expressions send the CAS into a loop it cannot return from — try a simpler form.",
        ),
      );
    }, timeoutMs);
    pending.set(id, { resolve, reject, timer });
    try {
      w.postMessage({ id, op, args });
    } catch (e) {
      clearTimeout(timer);
      pending.delete(id);
      reject(
        new Error(
          `Couldn't reach the symbolic engine: ${(e as Error).message}`,
        ),
      );
    }
  });
};

/** Eagerly spawn the worker (so the first `casCall` doesn't pay the spawn cost). Returns whether
 *  a live worker now exists. */
export const loadCas = (): boolean => {
  spawn();
  return worker !== null;
};

/** Test/reset hook — kills the worker, rejects anything pending, and clears all config so the
 *  next test starts from a clean slate. Mirrors cas-client.js's `CAS._reset`. */
export const resetCas = () => {
  kill();
  failAll("reset");
  seq = 0;
  mode = "worker";
  workerUrl = null;
  workerFactory = null;
  timeoutMs = DEFAULT_TIMEOUT_MS;
};
