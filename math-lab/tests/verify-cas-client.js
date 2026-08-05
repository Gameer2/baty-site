"use strict";
/* CAS worker harness — verification suite.
   Run with: node tests/verify-cas-client.js

   Tests the client's kill-switch logic against a mock worker. The point of the harness is
   what happens when a computation does NOT come back, and that path is impossible to
   exercise with the real worker (a genuine nerdamer hang would hang the test too, which is
   the whole problem). So the worker is mocked and made to hang on demand, letting the
   timeout, terminate and respawn behaviour be asserted directly.

   The real worker's symbolic results are already covered by tests/verify-calculus.js, which
   tests the same calculus-symbolic.js the worker imports. */

const path = require("path");
const CAS = require(path.join(__dirname, "..", "assets", "js", "cas-client.js"));

let pass = 0;
let fail = 0;

function ok(cond, label, detail) {
  if (cond) { pass++; console.log(`  ok    ${label}${detail ? ": " + detail : ""}`); }
  else { fail++; console.error(`  FAIL  ${label}${detail ? ": " + detail : ""}`); }
}

/* A stand-in for a real Worker. `behaviour` decides what it does with a message:
     "echo"  — reply straight away
     "error" — reply with an engine-level failure
     "hang"  — never reply, the case the harness exists for */
let spawnCount = 0;
let terminateCount = 0;
let behaviour = "echo";

function MockWorker() {
  spawnCount++;
  this.onmessage = null;
  this.onerror = null;
  this.terminated = false;
}
MockWorker.prototype.postMessage = function (msg) {
  if (this.terminated) return;
  const self_ = this;
  if (behaviour === "hang") return; // silence, forever
  setTimeout(function () {
    if (self_.terminated || !self_.onmessage) return;
    if (behaviour === "error") {
      self_.onmessage({ data: { id: msg.id, ok: false, error: "engine says no" } });
    } else {
      self_.onmessage({ data: { id: msg.id, ok: true, result: { echoed: msg.op, args: msg.args } } });
    }
  }, 5);
};
MockWorker.prototype.terminate = function () {
  this.terminated = true;
  terminateCount++;
};

function reset(b) {
  behaviour = b;
  CAS._reset();
  CAS.configure({ workerFactory: () => new MockWorker(), timeoutMs: 150 });
}

async function main() {
  console.log("CAS worker harness — verification suite\n");

  /* ---- normal operation ---- */
  reset("echo");
  spawnCount = 0; terminateCount = 0;
  {
    const r = await CAS.uSubstitution("x*sin(x^2)", "x");
    ok(r && r.echoed === "uSubstitution", "a normal call resolves with the worker's result", JSON.stringify(r.args));
    ok(CAS.mode() === "worker", "reports worker mode when a Worker is available");
    ok(spawnCount === 1, "spawns exactly one worker", `spawned ${spawnCount}`);
  }
  {
    // A second call must reuse the same worker rather than spawning per request.
    await CAS.limit("sin(x)/x", "x", 0);
    ok(spawnCount === 1, "reuses the existing worker for later calls", `spawned ${spawnCount}`);
  }

  /* ---- engine-level failure ---- */
  reset("error");
  {
    let msg = null;
    try { await CAS.limit("x", "x", 0); } catch (e) { msg = e.message; }
    ok(msg === "engine says no", "an engine error rejects with the engine's own message", String(msg));
  }

  /* ---- the case the harness exists for ---- */
  reset("hang");
  spawnCount = 0; terminateCount = 0;
  {
    const started = Date.now();
    let msg = null;
    try { await CAS.limit("abs(x)/x", "x", 0); } catch (e) { msg = e.message; }
    const elapsed = Date.now() - started;
    ok(msg !== null, "a hanging computation rejects instead of hanging forever");
    ok(/took longer than|stopped/i.test(String(msg)), "the timeout message explains what happened", String(msg).slice(0, 60) + "…");
    ok(elapsed >= 140 && elapsed < 1500, "rejects at roughly the configured timeout", `${elapsed}ms`);
    ok(terminateCount === 1, "terminates the worker — the only way to stop a sync hang", `terminate() x${terminateCount}`);
  }

  /* ---- respawn ---- */
  {
    behaviour = "echo"; // the next worker will behave
    const r = await CAS.uSubstitution("x*sin(x^2)", "x");
    ok(r && r.echoed === "uSubstitution", "the next call after a kill spawns a fresh worker and succeeds");
    ok(spawnCount === 2, "exactly one replacement worker was spawned", `spawned ${spawnCount}`);
  }

  /* ---- collateral damage is reported, not silently dropped ----
     Terminating kills every in-flight call, not just the slow one. Those calls must reject;
     leaving them pending would hang the page just as badly as the original problem. */
  reset("hang");
  spawnCount = 0; terminateCount = 0;
  {
    const a = CAS.limit("abs(x)/x", "x", 0).then(() => "resolved", (e) => "rejected: " + e.message);
    const b = CAS.uSubstitution("x*e^x", "x").then(() => "resolved", (e) => "rejected: " + e.message);
    const [ra, rb] = await Promise.all([a, b]);
    ok(ra.startsWith("rejected"), "the timed-out call rejects");
    ok(rb.startsWith("rejected"), "a bystander call killed by the terminate also rejects", rb.slice(0, 55) + "…");
    ok(terminateCount === 1, "one terminate covers both", `terminate() x${terminateCount}`);
  }

  /* ---- fallback when Workers are unavailable (file://) ---- */
  {
    CAS._reset();
    CAS.configure({ workerFactory: () => { throw new Error("Worker blocked"); }, timeoutMs: 150 });
    // Stand in for the in-page engine the browser would have loaded via a <script> tag.
    global.self = global;
    global.self.CalculusSymbolic = { limit: (e, v, at) => ({ ok: true, value: "sync-" + e + "-" + at }) };

    const r = await CAS.limit("sin(x)/x", "x", 0);
    ok(r && r.value === "sync-sin(x)/x-0", "falls back to in-page execution when no Worker can be created", r.value);
    ok(CAS.mode() === "sync", "reports sync mode so the page can warn about the lost kill switch", CAS.mode());
  }
  {
    // Fallback with nothing to fall back to must fail loudly, not resolve undefined.
    delete global.self.CalculusSymbolic;
    let msg = null;
    try { await CAS.limit("x", "x", 0); } catch (e) { msg = e.message; }
    ok(msg !== null && /unavailable/i.test(msg), "rejects clearly when there is no engine at all", String(msg));
  }

  console.log(`\n${pass} passed, ${fail} failed.`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error("suite crashed:", e); process.exit(1); });
