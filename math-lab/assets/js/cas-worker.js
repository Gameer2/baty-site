/* CAS worker — hosts the whole symbolic stack off the main thread.

   nerdamer can hang outright on some inputs (limit(abs(x)/x, x, 0) never returns), and a
   synchronous infinite loop cannot be interrupted from inside the same thread — no timer,
   flag or try/catch can stop it. Terminating a worker is the only mechanism that actually
   kills one, so every symbolic call the site makes runs here and the main thread keeps a
   kill switch. See cas-client.js for the timeout/terminate/respawn side.

   The whole computation lives in here, not just the CAS primitives: a hang can happen deep
   inside a candidate search or an L'Hopital loop, so the loops must be on this side of the
   boundary too, otherwise the kill switch has nothing to kill.

   Paths are relative to this file (assets/js/), as importScripts resolves against the
   worker script's own URL. */

importScripts(
  "../vendor/math.min.js",
  "../vendor/nerdamer.min.js",
  "./calc-core.js",
  "./calculus-symbolic.js",
  "./integration-advanced.js",
  "./ode-symbolic.js",
  "./complex-symbolic.js"
);

/* Symbolic kernel (assets/js/kernel/ — see docs/kernel/04_BUILD_PHASES.md Phase 1/2/2b/2d).
   Loaded from bundle.generated.js, NOT the individual kernel files: every kernel file does
   `const { Expr } = require("./expr")` at its own top level, and classic-script evaluation
   (importScripts included) shares ONE top-level lexical environment for let/const across
   every file loaded into a realm — so a second file destructuring the same import name
   throws "Identifier 'Expr' has already been declared". Confirmed against the real worker
   boot test (tests/verify-cas-worker.js) before landing on the bundle instead. The bundle
   (tools/build-kernel-bundle.js) wraps each file's untouched source in its own function
   scope, sidestepping the collision without touching a single kernel source file — those
   stay exactly what tests/verify-kernel*.js exercises under Node's real require().
   Regenerate the bundle after any kernel source change: node tools/build-kernel-bundle.js */
try {
  importScripts("./kernel/bundle.generated.js");
} catch (e) {
  // Best-effort everywhere it's consumed (see calc-core.js's CalcCore.kernel()) — a load
  // failure here degrades to "no kernel", never breaks the worker nerdamer already depends on.
  self.KernelBridge = null;
}

CalculusSymbolic.configure({ nerdamer: self.nerdamer, math: self.math });
IntegrationAdvanced.configure({ nerdamer: self.nerdamer, math: self.math });
ODESymbolic.configure({ nerdamer: self.nerdamer, math: self.math });
ComplexSymbolic.configure({ nerdamer: self.nerdamer, math: self.math });

/* Whitelist rather than dispatching on an arbitrary name from the message: the worker should
   only ever expose the operations the pages actually need.

   Null-prototype, because a plain object literal inherits from Object.prototype and so
   "resolves" names that were never whitelisted — OPS["constructor"] is a function, passes a
   truthiness check, and gets called. A null prototype makes the table contain exactly what
   is written here and nothing else. */
const OPS = Object.assign(Object.create(null), {
  autoIntegrate: (args) => IntegrationAdvanced.autoIntegrate(args[0], args[1]),
  uSubstitution: (args) => CalculusSymbolic.uSubstitution(args[0], args[1]),
  integrationByParts: (args) => CalculusSymbolic.integrationByParts(args[0], args[1]),
  partialFractions: (args) => CalculusSymbolic.partialFractions(args[0], args[1]),
  trigSubstitution: (args) => CalculusSymbolic.trigSubstitution(args[0], args[1]),
  algebraicSubstitution: (args) => IntegrationAdvanced.algebraicSubstitution(args[0], args[1]),
  completeTheSquare: (args) => IntegrationAdvanced.completeTheSquare(args[0], args[1]),
  limit: (args) => CalculusSymbolic.limit(args[0], args[1], args[2]),
  lhopital: (args) => CalculusSymbolic.lhopital(args[0], args[1], args[2]),
  taylorSeries: (args) => CalculusSymbolic.taylorSeries(args[0], args[1], args[2], args[3]),
  curveAnalysis: (args) => CalculusSymbolic.curveAnalysis(args[0], args[1], args[2], args[3]),
  appliedOptimization: (args) => CalculusSymbolic.appliedOptimization(args[0], args[1], args[2], args[3], args[4]),
  convergenceTests: (args) => CalculusSymbolic.convergenceTests(args[0], args[1]),
  powerSeries: (args) => CalculusSymbolic.powerSeries(args[0], args[1], args[2]),
  vectorOps: (args) => CalculusSymbolic.vectorOps(args[0], args[1]),
  partialDerivatives: (args) => CalculusSymbolic.partialDerivatives(args[0], args[1], args[2]),
  volumeOfRevolution: (args) => CalculusSymbolic.volumeOfRevolution(args[0], args[1], args[2], args[3], args[4]),
  multipleIntegral: (args) => CalculusSymbolic.multipleIntegral(args[0], args[1]),
  lagrangeMultipliers: (args) => CalculusSymbolic.lagrangeMultipliers(args[0], args[1], args[2], args[3], args[4]),
  relatedRates: (args) => CalculusSymbolic.relatedRates(args[0], args[1], args[2], args[3], args[4]),
  arcLengthSurfaceArea: (args) => CalculusSymbolic.arcLengthSurfaceArea(args[0], args[1], args[2], args[3], args[4]),
  parametricAndPolar: (args) => CalculusSymbolic.parametricAndPolar(args[0], args[1], args[2]),
  vectorCalculus: (args) => CalculusSymbolic.vectorCalculus(args[0], args[1], args[2]),
  improperIntegral: (args) => CalculusSymbolic.improperIntegral(args[0], args[1], args[2], args[3]),
  fourierSeries: (args) => CalculusSymbolic.fourierSeries(args[0], args[1], args[2], args[3], args[4]),

  // Coefficients only, never the u(x,t) closure solveHeatEquation computes internally —
  // functions cannot cross the structured-clone boundary. The caller reconstructs u(x,t)
  // with ODESymbolic.heatSeriesValue(bn, L, k, x, t), which needs no CAS (no nerdamer call,
  // just a finite trig sum) and so runs safely on the main thread.
  solveHeatEquation: (args) => ODESymbolic.solveHeatEquation(args[0]),
  solveWaveEquation: (args) => ODESymbolic.solveWaveEquation(args[0]),

  cauchyRiemann: (args) => ComplexSymbolic.cauchyRiemann(args[0], args[1]),
  harmonicConjugate: (args) => ComplexSymbolic.harmonicConjugate(args[0], args[1])
});

self.onmessage = function (e) {
  const msg = e.data || {};
  const id = msg.id;
  const op = OPS[msg.op];

  if (!op) {
    self.postMessage({ id, ok: false, error: "Unknown operation: " + msg.op });
    return;
  }

  try {
    // Results are plain JSON-shaped objects by design (see calculus-symbolic.js), so they
    // cross the structured-clone boundary unchanged.
    self.postMessage({ id, ok: true, result: op(msg.args || []) });
  } catch (err) {
    self.postMessage({ id, ok: false, error: err && err.message ? err.message : String(err) });
  }
};

// Lets the client confirm the worker booted and imported everything before trusting it.
self.postMessage({ id: "__ready__", ok: true, result: { ready: true } });
