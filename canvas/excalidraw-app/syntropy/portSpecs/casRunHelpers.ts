// Shared helpers for the run-mode CAS port specs (Calculus / Complex / ODE rollouts). Each
// spec's async `computeRun` calls a math-lab CAS op through the bridge (`casCall`) and maps the
// engine's return into the spec's declared outputs. These helpers keep that mapping uniform
// across specs so no individual spec re-derives the ok/error unwrap or the steps→text flatten.
//
// The engine return shape (see math-lab/assets/js/calculus-symbolic.js et al.) is a plain
// JSON-shaped object: `{ ok: true, <result fields…> }` on success or `{ ok: false, reason }` on
// a handled failure. casCall resolves to that object, or rejects on a worker timeout/spawn
// failure — both paths collapse to a single `{ ok, error }` here. See
// docs/superpowers/specs/2026-08-14-syntropy-async-run-and-symbolic-design.md §4.

import { casCall } from "../cas/casClient";

import type { PortSpec } from "./types";

/** Timeout for the 7 `casTier: "sympy"` ops (solveOde, solveOdeSystems, seriesSolutions,
 *  laplaceTransform, contourIntegration, realIntegralsResidues, laurentSingularities) — mirrors
 *  math-lab's own sympy-client.js DEFAULT_TIMEOUT_MS, which is "generously long" for the same
 *  reason: the first call on a fresh worker pays Pyodide's cold boot (core + the sympy package,
 *  ~4-5s) on top of the computation itself. The canvas's own casClient.ts default (8s, tuned for
 *  the fast in-process nerdamer ops) is too short for these specifically. */
export const SYMPY_CAS_TIMEOUT_MS = 30000;

/** The engine return object every CAS op yields (success fields vary; `ok` + `reason` are the
 *  common spine). CasCall resolves to this, so we narrow it once here. */
type CasResult = { ok?: boolean; reason?: string; error?: string } & Record<
  string,
  unknown
>;

export type RunCasOk = { ok: true; result: CasResult };
export type RunCasErr = { ok: false; error: string };

/** Await one CAS op and collapse the success/failure/exception paths into a single result. The
 *  `result` on success is the engine's full return object (the spec maps its fields to outputs);
 *  the `error` on failure is a user-showable string (a handled `reason`, a worker rejection, or a
 *  thrown message). */
export const runCas = async (
  op: string,
  args: unknown[],
  timeoutMs?: number,
): Promise<RunCasOk | RunCasErr> => {
  try {
    // Forward the override only when given — passing `undefined` explicitly (vs. omitting the
    // argument) changes the call's recorded arity, which every other spec's mocked-casCall test
    // asserts on with an exact 2-arg toHaveBeenCalledWith.
    const r = (await (timeoutMs === undefined
      ? casCall(op, args)
      : casCall(op, args, timeoutMs))) as CasResult;
    if (!r.ok) {
      return {
        ok: false,
        error:
          r.reason ?? r.error ?? "The symbolic engine could not compute this.",
      };
    }
    return { ok: true, result: r };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
};

/** Map a limit op's `{ kind, value }` (limit / lhopital) into a display string for an expression
 *  output. The page treats ∞ and DNE as legitimate answers — not errors — so the node mirrors
 *  that: finite → the exact value, infinite → ∞ / -∞, dne → "Does not exist". */
export const limitDisplay = (r: { kind?: string; value?: unknown }): string => {
  if (r.kind === "dne") {
    return "Does not exist";
  }
  if (r.kind === "infinite") {
    return String(r.value ?? "").startsWith("-") ? "-∞" : "∞";
  }
  return String(r.value ?? "");
};

/** Flatten an op's `steps` array (each step `{ rule, text, latex }` or a plain string) into a
 *  single text block for a `text` output. Returns "" when the op returned no steps. */
export const stepsToText = (steps: unknown): string => {
  if (!Array.isArray(steps)) {
    return "";
  }
  return steps
    .map((s) => {
      if (typeof s === "string") {
        return s;
      }
      if (s && typeof s === "object") {
        const step = s as { rule?: unknown; text?: unknown };
        const rule = step.rule ? String(step.rule) : "";
        const text = step.text ? String(step.text) : "";
        return [rule, text].filter(Boolean).join(": ");
      }
      return "";
    })
    .filter(Boolean)
    .join("\n");
};

/** Format a complex value `{ re, im }` (the shape complex.js / the residue ops return) as a
 *  readable "a + bi" string for a `text` output. Handles pure-real / pure-imaginary / unit-imag
 *  cases, trims trailing zeros, and returns "—" for missing or non-finite values. */
export const complexDisplay = (
  z: { re?: number; im?: number } | undefined,
  dp = 4,
): string => {
  if (!z || !Number.isFinite(z.re) || !Number.isFinite(z.im)) {
    return "—";
  }
  const re = Number(Number(z.re).toFixed(dp));
  const im = Number(Number(z.im).toFixed(dp));
  if (im === 0) {
    return String(re);
  }
  if (re === 0) {
    return im === 1 ? "i" : im === -1 ? "-i" : `${im}i`;
  }
  const sign = im >= 0 ? " + " : " − ";
  const mag = Math.abs(im);
  return `${re}${sign}${mag === 1 ? "" : mag}i`;
};

/** Fires a spec's own `computeRun` with its declared defaults, purely for the worker-boot side
 *  effect — the result is discarded and errors are swallowed, since this is never shown to the
 *  user. Called once when a `casTier: "sympy"` node is placed on the canvas (createSyntropyNode.ts)
 *  so Pyodide's cold boot happens in the background while the user is still reading the node or
 *  editing its inputs, instead of blocking their first real Run click. A no-op for any spec whose
 *  defaults happen to be invalid (the real Run click will report that the normal way); this is a
 *  head start, not a correctness dependency — a node still works if the warm call fails or is
 *  still in flight when Run is pressed, it just won't have gotten the early start. */
export const warmSympyTier = (spec: PortSpec): void => {
  if (spec.casTier !== "sympy" || !spec.computeRun) {
    return;
  }
  const defaults = Object.fromEntries(
    spec.inputs.map((i) => [i.key, i.default]),
  );
  spec.computeRun(defaults).catch(() => {
    /* discarded — this is a cache warm, not a real run */
  });
};
