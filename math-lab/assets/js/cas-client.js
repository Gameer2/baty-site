/* CAS client — main-thread half of the worker harness.

   Exposes the symbolic engine as promises and, crucially, owns the kill switch: every call
   is raced against a timeout, and a call that overruns causes the worker to be terminated
   outright. That is not a nicety — nerdamer hangs on some inputs, and terminate() is the
   only thing that stops a synchronous infinite loop.

   Terminating kills the whole worker, so any *other* calls in flight die with it. They are
   rejected explicitly rather than left pending forever, and the next call transparently
   spawns a fresh worker.

   Falls back to running in-page when Workers are unavailable — notably over file://, where
   browsers refuse to construct one. The fallback is honest about what it costs: CAS.mode()
   reports "sync", and in that mode a hang will freeze the tab, exactly as it would have
   before this harness existed. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.CAS = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const CAS = {};

  const DEFAULT_TIMEOUT_MS = 8000;

  let workerUrl = null;
  let workerFactory = null;   // injectable for tests
  let worker = null;
  let mode = "worker";        // "worker" | "sync"
  let seq = 0;
  const pending = new Map();  // id -> { resolve, reject, timer }

  // Resolved from this script's own URL so pages at any depth need no configuration:
  // cas-worker.js is a sibling of this file.
  if (typeof document !== "undefined" && document.currentScript && document.currentScript.src) {
    workerUrl = document.currentScript.src.replace(/[^/]*$/, "cas-worker.js");
  }

  CAS.configure = function (opts) {
    if (!opts) return;
    if (opts.workerUrl) workerUrl = opts.workerUrl;
    if (opts.workerFactory) workerFactory = opts.workerFactory;
    if (opts.timeoutMs) CAS.timeoutMs = opts.timeoutMs;
  };

  CAS.timeoutMs = DEFAULT_TIMEOUT_MS;

  CAS.mode = function () { return mode; };

  function spawn() {
    if (worker) return worker;
    try {
      worker = workerFactory ? workerFactory(workerUrl) : new self.Worker(workerUrl);
    } catch (e) {
      // No Worker available (file://, or a browser refusing the URL) — degrade to in-page.
      worker = null;
      mode = "sync";
      return null;
    }
    mode = "worker";
    worker.onmessage = function (e) {
      const msg = e.data || {};
      if (msg.id === "__ready__") return;
      const entry = pending.get(msg.id);
      if (!entry) return; // a late reply from before a terminate; nothing to settle
      clearTimeout(entry.timer);
      pending.delete(msg.id);
      if (msg.ok) entry.resolve(msg.result);
      else entry.reject(new Error(msg.error || "The symbolic engine failed."));
    };
    worker.onerror = function (e) {
      // A worker-level error (bad import, syntax error) is not recoverable per-request:
      // fail everything outstanding rather than let callers hang.
      failAll("The symbolic engine failed to start: " + ((e && e.message) || "worker error"));
      kill();
    };
    return worker;
  }

  function kill() {
    if (worker) {
      try { worker.terminate(); } catch (e) { /* already gone */ }
      worker = null;
    }
  }

  function failAll(message) {
    for (const [, entry] of pending) {
      clearTimeout(entry.timer);
      entry.reject(new Error(message));
    }
    pending.clear();
  }

  /* Runs one operation. Rejects with a clear, user-showable message on timeout — the page is
     expected to surface it, because "this input hangs the CAS" is real information about the
     input, not just an internal failure. */
  CAS.call = function (op, args, opts) {
    const timeoutMs = (opts && opts.timeoutMs) || CAS.timeoutMs;

    const w = spawn();
    if (!w) return syncCall(op, args, timeoutMs);

    return new Promise(function (resolve, reject) {
      const id = ++seq;
      const timer = setTimeout(function () {
        pending.delete(id);
        // The only way to stop a synchronous hang inside the worker.
        kill();
        failAll("Cancelled: another symbolic computation had to be stopped.");
        // Rounding to whole seconds reads as "longer than 0s" for sub-second timeouts.
        const howLong = timeoutMs >= 1000 ? Math.round(timeoutMs / 1000) + "s" : timeoutMs + "ms";
        reject(new Error(
          "The symbolic engine took longer than " + howLong +
          " on this input and was stopped. Some expressions send the CAS into a loop it " +
          "cannot return from — try a simpler form."
        ));
      }, timeoutMs);

      pending.set(id, { resolve, reject, timer });
      try {
        w.postMessage({ id, op, args: args || [] });
      } catch (e) {
        clearTimeout(timer);
        pending.delete(id);
        reject(new Error("Couldn't reach the symbolic engine: " + e.message));
      }
    });
  };

  // In-page fallback. Deliberately still a Promise so callers need no branching, but there
  // is no EXTERNAL timeout here — nothing on the main thread can interrupt a synchronous
  // main-thread hang from the outside (no threads, no signals). Per
  // docs/kernel/04_BUILD_PHASES.md Phase 2c, the only real fix is COOPERATIVE: whatever runs
  // must check a deadline itself. `self.CAS_DEADLINE` is that hook — set to a Date.now()-style
  // timestamp for the duration of this call, so any deadline-aware engine (the existing
  // nerdamer-based ones do not check it yet; the new kernel's rewrite engine does, see
  // assets/js/kernel/rewrite.js) can read it and refuse instead of hanging. Engines that don't
  // check it behave exactly as before — this is additive, not a behavior change.
  function syncCall(op, args, timeoutMs) {
    return new Promise(function (resolve, reject) {
      const engines = typeof self !== "undefined" ? [self.CalculusSymbolic, self.IntegrationAdvanced, self.ODESymbolic, self.ComplexSymbolic] : [];
      const engine = engines.find((e) => e && typeof e[op] === "function");
      if (!engine) {
        reject(new Error("The symbolic engine is unavailable (no Worker support and no in-page fallback)."));
        return;
      }
      const previousDeadline = typeof self !== "undefined" ? self.CAS_DEADLINE : undefined;
      if (typeof self !== "undefined") self.CAS_DEADLINE = Date.now() + (timeoutMs || CAS.timeoutMs);
      try {
        resolve(engine[op].apply(engine, args || []));
      } catch (e) {
        reject(e);
      } finally {
        if (typeof self !== "undefined") self.CAS_DEADLINE = previousDeadline;
      }
    });
  }

  // Was implemented (assets/js/integration-advanced.js) and tested (tests/bench/baseline.js)
  // but never actually reachable from a page — not in cas-worker.js's OPS whitelist, no CAS.*
  // wrapper here. Added so the general-purpose integral calculator can reach it with the same
  // timeout/kill-switch protection every other technique gets (autoIntegrate's own nerdamer
  // last-resort fallback can hang, per docs/kernel/04_BUILD_PHASES.md Phase 2c's 19-hangs finding).
  CAS.autoIntegrate = function (expr, variable, opts) {
    return CAS.call("autoIntegrate", [expr, variable], opts);
  };

  CAS.uSubstitution = function (expr, variable, opts) {
    return CAS.call("uSubstitution", [expr, variable], opts);
  };

  CAS.integrationByParts = function (expr, variable, opts) {
    return CAS.call("integrationByParts", [expr, variable], opts);
  };

  CAS.partialFractions = function (expr, variable, opts) {
    return CAS.call("partialFractions", [expr, variable], opts);
  };

  CAS.algebraicSubstitution = function (expr, variable, opts) {
    return CAS.call("algebraicSubstitution", [expr, variable], opts);
  };

  CAS.completeTheSquare = function (expr, variable, opts) {
    return CAS.call("completeTheSquare", [expr, variable], opts);
  };

  CAS.trigSubstitution = function (expr, variable, opts) {
    return CAS.call("trigSubstitution", [expr, variable], opts);
  };

  CAS.limit = function (expr, variable, at, opts) {
    return CAS.call("limit", [expr, variable, at], opts);
  };

  CAS.lhopital = function (expr, variable, at, opts) {
    return CAS.call("lhopital", [expr, variable, at], opts);
  };

  CAS.taylorSeries = function (expr, variable, at, degree, opts) {
    return CAS.call("taylorSeries", [expr, variable, at, degree], opts);
  };

  CAS.curveAnalysis = function (expr, variable, a, b, opts) {
    return CAS.call("curveAnalysis", [expr, variable, a, b], opts);
  };

  CAS.appliedOptimization = function (expr, variable, a, b, goal, opts) {
    return CAS.call("appliedOptimization", [expr, variable, a, b, goal], opts);
  };

  CAS.convergenceTests = function (term, variable, opts) {
    return CAS.call("convergenceTests", [term, variable], opts);
  };

  CAS.powerSeries = function (coeffs, variable, center, opts) {
    return CAS.call("powerSeries", [coeffs, variable, center], opts);
  };

  CAS.vectorOps = function (operation, operands, opts) {
    return CAS.call("vectorOps", [operation, operands], opts);
  };

  CAS.partialDerivatives = function (expr, vars, point, opts) {
    return CAS.call("partialDerivatives", [expr, vars, point], opts);
  };

  CAS.volumeOfRevolution = function (f, variable, a, b, opts) {
    return CAS.call("volumeOfRevolution", [f, variable, a, b, opts], opts);
  };

  CAS.multipleIntegral = function (f, opts) {
    return CAS.call("multipleIntegral", [f, opts], opts);
  };

  CAS.lagrangeMultipliers = function (f, g, c, vars, opts) {
    return CAS.call("lagrangeMultipliers", [f, g, c, vars, opts], opts);
  };

  CAS.relatedRates = function (equation, vars, values, knownRates, unknownVar, opts) {
    return CAS.call("relatedRates", [equation, vars, values, knownRates, unknownVar], opts);
  };

  CAS.arcLengthSurfaceArea = function (f, variable, a, b, opts) {
    return CAS.call("arcLengthSurfaceArea", [f, variable, a, b, opts], opts);
  };

  CAS.parametricAndPolar = function (mode, spec, opts) {
    return CAS.call("parametricAndPolar", [mode, spec, opts], opts);
  };

  CAS.vectorCalculus = function (operation, spec, opts) {
    return CAS.call("vectorCalculus", [operation, spec, opts], opts);
  };

  CAS.improperIntegral = function (f, variable, a, b, opts) {
    return CAS.call("improperIntegral", [f, variable, a, b], opts);
  };

  CAS.fourierSeries = function (f, variable, L, mode, N, opts) {
    return CAS.call("fourierSeries", [f, variable, L, mode, N], opts);
  };

  CAS.solveHeatEquation = function (params, opts) {
    return CAS.call("solveHeatEquation", [params], opts);
  };

  CAS.solveWaveEquation = function (params, opts) {
    return CAS.call("solveWaveEquation", [params], opts);
  };

  // ODE/PDE solvers. The four symbolic solvers (solveOde, solveOdeSystems, laplaceTransform,
  // laplaceInverse, seriesSolutions) route through SymPy and so are async. The three Field
  // orchestration ops (heatField, waveField, solveLaplacePoisson) build a sampled 2D grid from a
  // numeric solve and are sync. ics for solveOde is {x0, derivValues:[]}; for solveOdeSystems it
  // is a flat number[] (one IC per component) or null for the general solution.
  CAS.solveOde = function (equation, ics, opts) {
    return CAS.call("solveOde", [equation, ics], opts);
  };
  CAS.solveOdeSystems = function (matrixRows, gExprList, ics, opts) {
    return CAS.call("solveOdeSystems", [matrixRows, gExprList, ics], opts);
  };
  CAS.laplaceTransform = function (f, opts) {
    return CAS.call("laplaceTransform", [f], opts);
  };
  CAS.laplaceInverse = function (F, opts) {
    return CAS.call("laplaceInverse", [F], opts);
  };
  CAS.seriesSolutions = function (equation, point, order, opts) {
    return CAS.call("seriesSolutions", [equation, point, order], opts);
  };
  CAS.heatField = function (cfg, opts) {
    return CAS.call("heatField", [cfg], opts);
  };
  CAS.waveField = function (cfg, opts) {
    return CAS.call("waveField", [cfg], opts);
  };
  CAS.solveLaplacePoisson = function (cfg, opts) {
    return CAS.call("solveLaplacePoisson", [cfg], opts);
  };

  CAS.cauchyRiemann = function (f, point, opts) {
    return CAS.call("cauchyRiemann", [f, point], opts);
  };

  CAS.harmonicConjugate = function (u, basepoint, opts) {
    return CAS.call("harmonicConjugate", [u, basepoint], opts);
  };

  // Complex contour theorems — pure-numeric cores in complex-contour-theorems.js (no SymPy).
  // cauchyIntegralFormula: f(z), z0 = {re, im}, derivative order n, contour radius r.
  CAS.cauchyIntegralFormula = function (f, z0, order, radius, opts) {
    return CAS.call("cauchyIntegralFormula", [f, z0, order, radius], opts);
  };
  // argumentRouche: mode "argument" (f only, returns N−P) or "rouche" (f + g, returns zeros of
  // f inside γ when |f−g| < |f| on γ). contour = { type:"circle", center:{re,im}, radius }.
  CAS.argumentRouche = function (f, g, contour, mode, opts) {
    return CAS.call("argumentRouche", [f, g, contour, mode], opts);
  };

  // Numeric complex ops — composed from Complex.* primitives + math.js (no CAS, no SymPy).
  // complexArithmetic: z = {re, im}, n (power/root count) → polar form, z^n, nth roots.
  CAS.complexArithmetic = function (z, n, opts) {
    return CAS.call("complexArithmetic", [z, n], opts);
  };
  // complexExpLogPowers: mode "log"|"rational"|"complex", params {p,q}|{wRe,wIm}, z = {re,im}
  // → principal branch value + the branch list.
  CAS.complexExpLogPowers = function (mode, params, z, opts) {
    return CAS.call("complexExpLogPowers", [mode, params, z], opts);
  };
  // complexTrigHyperbolic: fn name (sin/cos/sinh/...), z = {re, im} → fn(z) value.
  CAS.complexTrigHyperbolic = function (fn, z, opts) {
    return CAS.call("complexTrigHyperbolic", [fn, z], opts);
  };

  // Complex residue ops — these route through SymPy inside the worker (complex-residues.js → the
  // nested sympy-worker). The first call pays Pyodide's cold boot; callers should allow ~30s.
  // contourIntegration: f(z) + contour = { type:"circle", center:{re,im}, radius } → ∮ f dz.
  CAS.contourIntegration = function (f, contour, opts) {
    return CAS.call("contourIntegration", [f, contour], opts);
  };
  // realIntegralsResidues: f(x) + mode ("infinite" | "semicircle" | …) → the real integral value.
  CAS.realIntegralsResidues = function (f, mode, opts) {
    return CAS.call("realIntegralsResidues", [f, mode], opts);
  };
  // laurentSingularities: f(z) + z0 = {re, im} + series order → classification + Laurent series.
  CAS.laurentSingularities = function (f, point, order, opts) {
    return CAS.call("laurentSingularities", [f, point, order], opts);
  };

  // Exposed for tests and for pages that want to reset after a timeout.
  CAS._reset = function () { kill(); failAll("reset"); seq = 0; mode = "worker"; };

  return CAS;
});
