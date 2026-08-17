// Task 3 integration check: boots the REAL math-lab cas-worker.js from the canvas wiring and runs
// one CAS operation end-to-end. This is the spec for "the canvas build can actually spawn the
// symbolic worker" — the unit tests (casClient.test.ts) only exercise the protocol against a
// FakeWorker, so they can't catch a wrong worker URL, a broken importScripts chain, or a
// classic-vs-module worker mismatch.
//
// GUARD — runs only when BOTH are true:
//   1. `CAS_INT=1` is set (opt-in; never runs in normal CI), AND
//   2. a real `Worker` global exists (a Web-Worker-capable environment).
// vitest's default jsdom does NOT implement Web Workers (`typeof Worker === "undefined"`), so this
// test skips there even with CAS_INT=1 — it would only reject "unavailable" and prove nothing.
// To genuinely verify the boot, run it in a browser test runner (Playwright / @vitest/browser)
// against the built site, or any runner that provides a real `Worker` global, with CAS_INT=1:
//   CAS_INT=1 yarn test:app --run casClient.integration
// Under such an environment the assertion below (a finite limit value) must pass; that is the
// real "the worker boots" signal. The default suite skips this entirely, so the gate is
// non-blocking. See
// docs/superpowers/plans/2026-08-14-syntropy-foundation-async-symbolic-field.md Task 3.

import { describe, expect, it } from "vitest";

import { casCall, configureCas, resetCas } from "./casClient";

// jsdom leaves `Worker` undefined; a real browser runner defines it. Evaluated at module load so
// the skipIf guard below is stable.
const HAS_WORKER_GLOBAL = typeof Worker !== "undefined";

describe("casClient integration — real math-lab worker", () => {
  it.skipIf(!process.env.CAS_INT || !HAS_WORKER_GLOBAL)(
    "boots the real cas-worker.js and resolves a CAS op to a finite value",
    async () => {
      resetCas();
      configureCas({ workerUrl: "../../math-lab/assets/js/cas-worker.js" });

      // limit(expr="x", variable="x", at=0) → 0. The worker's OPS table routes this to
      // CalculusSymbolic.limit, which returns { ok, kind, value, ... }.
      const result = (await casCall("limit", ["x", "x", 0])) as {
        ok?: boolean;
        value?: unknown;
      };

      expect(result.ok).toBe(true);
      expect(Number.isFinite(Number(result.value))).toBe(true);
    },
  );
});
