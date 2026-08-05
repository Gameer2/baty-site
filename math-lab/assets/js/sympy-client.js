/* SymPy client — main-thread half of the SymPy/Pyodide worker harness.

   Sibling of cas-client.js, same discipline (id-based request/response, timeout + kill-switch
   via terminate()), but deliberately its OWN worker (sympy-worker.js), not an added op on
   cas-client.js's CAS object — see sympy-worker.js's header for why.

   Unlike CAS.call, there is NO synchronous in-page fallback here: Pyodide is a multi-second,
   multi-megabyte async boot (fetching and instantiating a WASM runtime), not something that
   can plausibly run "in-page" as a same-tick fallback the way a small nerdamer call can. If
   Workers are unavailable (e.g. file://), this honestly rejects rather than pretending to
   degrade gracefully — same strangler-fig principle (never silently worse), just a harder
   floor: no worker means no SymPy path, not a slower one. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.SympyClient = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const SympyClient = {};

  // Generously long: the first call on a fresh worker pays Pyodide's own boot cost (core +
  // sympy package, ~4-5s cold) on top of whatever the computation itself takes, and SymPy's
  // integrate() can itself take several more seconds on a genuinely hard input.
  const DEFAULT_TIMEOUT_MS = 30000;

  let workerUrl = null;
  let workerFactory = null; // injectable for tests, same as cas-client.js
  let worker = null;
  let seq = 0;
  const pending = new Map(); // id -> { resolve, reject, timer }

  if (typeof document !== "undefined" && document.currentScript && document.currentScript.src) {
    workerUrl = document.currentScript.src.replace(/[^/]*$/, "sympy-worker.js");
  }

  SympyClient.configure = function (opts) {
    if (!opts) return;
    if (opts.workerUrl) workerUrl = opts.workerUrl;
    if (opts.workerFactory) workerFactory = opts.workerFactory;
    if (opts.timeoutMs) SympyClient.timeoutMs = opts.timeoutMs;
  };

  SympyClient.timeoutMs = DEFAULT_TIMEOUT_MS;

  // "unavailable" | "booting" | "ready" — lets a page show a "first use may take a few
  // seconds" notice only when it is actually true, rather than on every call.
  let bootState = "unavailable";
  SympyClient.bootState = function () { return bootState; };

  function spawn() {
    if (worker) return worker;
    if (!workerUrl) return null;
    try {
      worker = workerFactory ? workerFactory(workerUrl) : new self.Worker(workerUrl);
    } catch (e) {
      worker = null;
      return null;
    }
    bootState = "booting";
    worker.onmessage = function (e) {
      const msg = e.data || {};
      if (msg.id === "__ready__") return; // worker script loaded; Pyodide itself boots lazily per-call
      const entry = pending.get(msg.id);
      if (!entry) return;
      clearTimeout(entry.timer);
      pending.delete(msg.id);
      if (msg.ok) {
        bootState = "ready";
        entry.resolve(msg.result);
      } else {
        entry.reject(new Error(msg.error || "SymPy failed on this input."));
      }
    };
    worker.onerror = function (e) {
      failAll("The SymPy engine failed to start: " + ((e && e.message) || "worker error"));
      kill();
    };
    return worker;
  }

  function kill() {
    if (worker) {
      try { worker.terminate(); } catch (e) { /* already gone */ }
      worker = null;
    }
    bootState = "unavailable";
  }

  function failAll(message) {
    for (const [, entry] of pending) {
      clearTimeout(entry.timer);
      entry.reject(new Error(message));
    }
    pending.clear();
  }

  SympyClient.call = function (op, args, opts) {
    const timeoutMs = (opts && opts.timeoutMs) || SympyClient.timeoutMs;
    const w = spawn();
    if (!w) {
      return Promise.reject(new Error(
        "The advanced solver needs Web Workers, which are unavailable here (opened over file://?). " +
        "Serve the site over http:// to use it."
      ));
    }

    return new Promise(function (resolve, reject) {
      const id = ++seq;
      const timer = setTimeout(function () {
        pending.delete(id);
        kill();
        failAll("Cancelled: another advanced-solver computation had to be stopped.");
        const howLong = timeoutMs >= 1000 ? Math.round(timeoutMs / 1000) + "s" : timeoutMs + "ms";
        reject(new Error(
          "The advanced solver took longer than " + howLong + " on this input and was stopped."
        ));
      }, timeoutMs);

      pending.set(id, { resolve, reject, timer });
      try {
        w.postMessage({ id, op, args: args || [] });
      } catch (e) {
        clearTimeout(timer);
        pending.delete(id);
        reject(new Error("Couldn't reach the advanced solver: " + e.message));
      }
    });
  };

  // .integrate (the technique pages) and .limit (lhopital.js) — add wrappers here (matching
  // ops added to sympy-worker.js) when a page actually needs them, not speculatively.
  SympyClient.integrate = function (exprStr, variable, opts) {
    return SympyClient.call("integrate", [exprStr, variable], opts);
  };

  SympyClient.limit = function (exprStr, variable, point, opts) {
    return SympyClient.call("limit", [exprStr, variable, point], opts);
  };

  // .dsolveGeneral (ode-solver.js) — any-order general solver, used by the consolidated
  // ODE Solver page.
  SympyClient.dsolveGeneral = function (equationText, order, ics, opts) {
    return SympyClient.call("dsolveGeneral", [equationText, order, ics || []], opts);
  };

  // .dsolveSystem (ode-systems.js) — systems of first-order linear ODEs, Phase 2 of the ODE
  // engine redesign. matrixRows: number[][]. gList: string[]. icsList: string[] or [].
  SympyClient.dsolveSystem = function (matrixRows, gList, icsList, opts) {
    return SympyClient.call("dsolveSystem", [matrixRows, gList || [], icsList || []], opts);
  };

  // .laplaceTransform / .inverseLaplaceTransform / .laplaceSolveIvp / .laplaceConvolution
  // (laplace-engine.js) — Phase 3 of the ODE engine redesign, the real Laplace Transform
  // engine replacing the old dsolve()-front-end laplace-transform.js.
  SympyClient.laplaceTransform = function (exprText, opts) {
    return SympyClient.call("laplaceTransform", [exprText], opts);
  };
  SympyClient.inverseLaplaceTransform = function (exprText, opts) {
    return SympyClient.call("inverseLaplaceTransform", [exprText], opts);
  };
  SympyClient.laplaceSolveIvp = function (coeffs, rhsText, icsList, opts) {
    return SympyClient.call("laplaceSolveIvp", [coeffs, rhsText, icsList || []], opts);
  };
  SympyClient.laplaceConvolution = function (fText, gText, opts) {
    return SympyClient.call("laplaceConvolution", [fText, gText], opts);
  };

  // .seriesSolution (series-solutions.js) — homogeneous 2nd-order variable-coefficient ODEs,
  // ordinary or (safe-case) regular singular points. See sympy-worker.js's _series_solution
  // for the indicial-root safety gate this relies on.
  SympyClient.seriesSolution = function (equationText, point, order, opts) {
    return SympyClient.call("seriesSolution", [equationText, point, order], opts);
  };

  // .singularitiesWithResidues / .laurentSeries — the shared residue-theorem module
  // (complex-residues.js). See sympy-worker.js's header on why these two are one module.
  SympyClient.singularitiesWithResidues = function (exprStr, variable, opts) {
    return SympyClient.call("singularitiesWithResidues", [exprStr, variable], opts);
  };

  SympyClient.laurentSeries = function (exprStr, variable, point, order, opts) {
    return SympyClient.call("laurentSeries", [exprStr, variable, point, order], opts);
  };

  // .classifySingularity — limit-based isolated-singularity classification (analytic / removable /
  // pole / essential) for the Laurent & Singularities page. See sympy-worker.js's
  // _classify_singularity for why this is limit-based rather than a principal-part parse.
  SympyClient.classifySingularity = function (exprStr, variable, point, opts) {
    return SympyClient.call("classifySingularity", [exprStr, variable, point], opts);
  };

  // .realIntegralByResidues — rational R(x) integrated over (-inf,inf) or (0,inf) by closing the
  // contour with an upper semicircle and summing upper-half-plane residues. See sympy-worker.js's
  // _real_integral_by_residues for the validity gates (real-axis pole / decay / evenness refusals).
  SympyClient.realIntegralByResidues = function (exprStr, variable, mode, opts) {
    return SympyClient.call("realIntegralByResidues", [exprStr, variable, mode], opts);
  };

  return SympyClient;
});
