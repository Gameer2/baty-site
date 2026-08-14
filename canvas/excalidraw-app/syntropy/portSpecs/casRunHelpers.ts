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
): Promise<RunCasOk | RunCasErr> => {
  try {
    const r = (await casCall(op, args)) as CasResult;
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
