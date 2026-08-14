import { beforeEach, describe, expect, it } from "vitest";

import {
  casCall,
  casReady,
  configureCas,
  loadCas,
  resetCas,
} from "./casClient";

// A minimal stand-in for a Web Worker the ES-module adapter can spawn. The test sets `respond`
// to decide what each posted message resolves to (or `null` to stay silent and trip the
// timeout). postMessage echoes a structured-clone-shaped `{ id, ok, result | error }` back
// through `onmessage` on the next microtask, exactly as the real cas-worker.js does.
class FakeWorker {
  onmessage: ((e: { data: unknown }) => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;
  terminated = false;
  posted: { id: number; op: string; args: unknown[] }[] = [];
  respond: (m: {
    id: number;
    op: string;
    args: unknown[];
  }) => { ok: true; result: unknown } | { ok: false; error: string } | null =
    () => null;

  postMessage = (msg: unknown) => {
    const m = msg as { id: number; op: string; args: unknown[] };
    this.posted.push(m);
    const r = this.respond(m);
    if (r) {
      // Async, like a real worker round-trip.
      setTimeout(() => {
        if (r.ok) {
          this.onmessage?.({ data: { id: m.id, ok: true, result: r.result } });
        } else {
          this.onmessage?.({ data: { id: m.id, ok: false, error: r.error } });
        }
      }, 0);
    }
  };
  terminate = () => {
    this.terminated = true;
  };
}

describe("casClient", () => {
  beforeEach(() => {
    resetCas();
  });

  it("resolves casCall to the worker's result over the postMessage/onmessage protocol", async () => {
    const fake = new FakeWorker();
    fake.respond = () => ({ ok: true, result: 42 });
    configureCas({ workerUrl: "stub.js", workerFactory: () => fake });
    const result = await casCall("limit", ["x", "x", 0]);
    expect(result).toBe(42);
    expect(fake.posted[0]).toEqual({ id: 1, op: "limit", args: ["x", "x", 0] });
  });

  it("reuses one worker across calls (lazy spawn happens once)", async () => {
    const fake = new FakeWorker();
    fake.respond = () => ({ ok: true, result: "ok" });
    let spawnCount = 0;
    configureCas({
      workerUrl: "stub.js",
      workerFactory: () => {
        spawnCount += 1;
        return fake;
      },
    });
    expect(casReady()).toBe(false);
    await casCall("limit", ["x", "x", 0]);
    await casCall("taylorSeries", ["x^2", "x", 0, 3]);
    expect(spawnCount).toBe(1);
    expect(casReady()).toBe(true);
    expect(fake.posted).toHaveLength(2);
  });

  it("rejects when the worker reports { ok: false, error }", async () => {
    const fake = new FakeWorker();
    fake.respond = () => ({ ok: false, error: "nerdamer could not parse" });
    configureCas({ workerUrl: "stub.js", workerFactory: () => fake });
    await expect(casCall("uSubstitution", ["x^2", "x"])).rejects.toThrow(
      "nerdamer could not parse",
    );
  });

  it("rejects on timeout and never leaves the caller pending", async () => {
    const fake = new FakeWorker();
    fake.respond = () => null; // never answers
    configureCas({
      workerUrl: "stub.js",
      workerFactory: () => fake,
      timeoutMs: 30,
    });
    await expect(casCall("limit", ["x", "x", 0])).rejects.toThrow(
      /longer than 30ms/,
    );
  });

  it("rejects when no worker is configured", async () => {
    // No workerUrl/factory configured → spawn returns null and casCall rejects immediately
    // rather than leaving the caller pending.
    await expect(casCall("limit", ["x", "x", 0])).rejects.toThrow(
      /unavailable/,
    );
  });

  it("loadCas spawns the worker and reports readiness", () => {
    const fake = new FakeWorker();
    configureCas({ workerUrl: "stub.js", workerFactory: () => fake });
    expect(casReady()).toBe(false);
    expect(loadCas()).toBe(true);
    expect(casReady()).toBe(true);
  });
});
