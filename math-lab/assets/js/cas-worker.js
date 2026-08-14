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

/* Display-sampling ops — evaluate an already-computed (or user-input) expression at a set of
   sample points so the Syntropy node renderers can plot a curve or field. These are NOT new
   math: they reuse CalcCore.compileFn (the same math.js parse+compile path the engines use for
   finite-difference verification and numeric probes), so a sampled curve agrees with the
   symbolic result the engine reports. Pure display sampling — the method's real result still
   comes from its own CAS op; these ops only turn an expression string into {x, y} points.

   They exist because the Syntropy canvas bundle deliberately does NOT load nerdamer/math.js
   (the whole point of this lazy worker), so it cannot compile an expression to sample it
   client-side. A node whose archetype needs a plot (curve-sketching, parametric/polar, power
   series, vector fields, gradient fields, convergence partial sums) therefore asks the worker
   to do the sampling here. See
   docs/superpowers/plans/2026-08-14-syntropy-engine-calculus.md (option 1). */

// Compiles an expression string to a math.js evaluator. CalcCore.compileFn ignores its second
// arg and just parses+compiles; the variable binding happens via the scope passed to evaluate().
const compileForSample = (str) => CalcCore.compileFn(String(str));

// Evaluates a compiled node at a scope, returning NaN on any error (undefined point, domain
// error) so the caller can skip the gap rather than abort the whole sample.
const evalAt = (node, scope) => {
  try {
    const v = node.evaluate(scope);
    return typeof v === "number" ? v : Number(v);
  } catch (e) {
    return NaN;
  }
};

function sampleCurveImpl(cfg) {
  if (!cfg) return { ok: false, error: "sampleCurve needs a config." };
  const mode = cfg.mode || "function";
  const n = Math.max(2, Math.min(2000, Math.floor(Number(cfg.n) || 200)));
  const a = Number(cfg.a);
  const b = Number(cfg.b);
  if (!Number.isFinite(a) || !Number.isFinite(b)) {
    return { ok: false, error: "sampleCurve needs finite sample bounds a, b." };
  }
  const points = [];
  if (mode === "function") {
    const f = compileForSample(cfg.expr);
    if (!f) return { ok: false, error: "Couldn't compile the expression to sample." };
    const v = cfg.variable || "x";
    for (let i = 0; i <= n; i++) {
      const x = a + ((b - a) * i) / n;
      const y = evalAt(f, { [v]: x });
      if (Number.isFinite(y)) points.push({ x, y });
    }
  } else if (mode === "parametric") {
    const fx = compileForSample(cfg.xExpr);
    const fy = compileForSample(cfg.yExpr);
    if (!fx || !fy) return { ok: false, error: "Couldn't compile x(t) or y(t)." };
    const v = cfg.variable || "t";
    for (let i = 0; i <= n; i++) {
      const t = a + ((b - a) * i) / n;
      const x = evalAt(fx, { [v]: t });
      const y = evalAt(fy, { [v]: t });
      if (Number.isFinite(x) && Number.isFinite(y)) points.push({ x, y });
    }
  } else if (mode === "polar") {
    const fr = compileForSample(cfg.rExpr);
    if (!fr) return { ok: false, error: "Couldn't compile r(theta)." };
    const v = cfg.variable || "t";
    for (let i = 0; i <= n; i++) {
      const th = a + ((b - a) * i) / n;
      const r = evalAt(fr, { [v]: th });
      if (Number.isFinite(r)) points.push({ x: r * Math.cos(th), y: r * Math.sin(th) });
    }
  } else if (mode === "series") {
    // Partial sum of Σ_{k=0}^{degree} c_k · (variable − center)^k, where c_k = coeffsExpr(k).
    // coeffsExpr is an expression in the index variable (e.g. "1/n" for the geometric series).
    const cf = compileForSample(cfg.coeffsExpr);
    if (!cf) return { ok: false, error: "Couldn't compile the coefficient expression." };
    const idx = cfg.indexVar || "n";
    const center = Number(cfg.center) || 0;
    const degree = Math.max(0, Math.floor(Number(cfg.degree) || 0));
    const v = cfg.variable || "x";
    const coeffs = [];
    for (let k = 0; k <= degree; k++) {
      const c = evalAt(cf, { [idx]: k });
      if (!Number.isFinite(c)) {
        return { ok: false, error: "Coefficient is not finite at " + idx + " = " + k + "." };
      }
      coeffs.push(c);
    }
    for (let i = 0; i <= n; i++) {
      const x = a + ((b - a) * i) / n;
      let y = 0;
      for (let k = 0; k <= degree; k++) y += coeffs[k] * Math.pow(x - center, k);
      points.push({ x, y });
    }
  } else {
    return { ok: false, error: "Unknown sampleCurve mode: " + mode };
  }
  return { ok: true, points, a, b };
}

function sampleFieldImpl(cfg) {
  if (!cfg) return { ok: false, error: "sampleField needs a config." };
  const variant = cfg.variant || "heatmap";
  const cols = Math.max(2, Math.min(200, Math.floor(Number(cfg.cols) || 25)));
  const rows = Math.max(2, Math.min(200, Math.floor(Number(cfg.rows) || 25)));
  const xLo = Number(cfg.xLo);
  const xHi = Number(cfg.xHi);
  const yLo = Number(cfg.yLo);
  const yHi = Number(cfg.yHi);
  if (![xLo, xHi, yLo, yHi].every(Number.isFinite)) {
    return { ok: false, error: "sampleField needs a finite domain." };
  }
  const vars = cfg.vars || ["x", "y"];
  const vx = vars[0];
  const vy = vars[1];
  const grid = [];
  if (variant === "arrows") {
    const fp = compileForSample(cfg.pExpr);
    const fq = compileForSample(cfg.qExpr);
    if (!fp || !fq) return { ok: false, error: "Couldn't compile the vector field components." };
    const vectors = [];
    for (let r = 0; r < rows; r++) {
      const y = yLo + ((yHi - yLo) * r) / (rows - 1);
      const gridRow = [];
      for (let c = 0; c < cols; c++) {
        const x = xLo + ((xHi - xLo) * c) / (cols - 1);
        const dx = evalAt(fp, { [vx]: x, [vy]: y });
        const dy = evalAt(fq, { [vx]: x, [vy]: y });
        const mag = Number.isFinite(dx) && Number.isFinite(dy) ? Math.hypot(dx, dy) : NaN;
        gridRow.push({ x, y, value: mag });
        // Raw (un-normalized) vector — the renderer scales visually; magnitude is preserved.
        if (Number.isFinite(mag) && mag > 1e-12) vectors.push({ x, y, dx, dy });
      }
      grid.push(gridRow);
    }
    return { ok: true, grid, vectors, xLo, xHi, yLo, yHi, variant };
  }
  // heatmap / contour / domainColor: a scalar field value at each grid point.
  const f = compileForSample(cfg.expr);
  if (!f) return { ok: false, error: "Couldn't compile the scalar field expression." };
  for (let r = 0; r < rows; r++) {
    const y = yLo + ((yHi - yLo) * r) / (rows - 1);
    const gridRow = [];
    for (let c = 0; c < cols; c++) {
      const x = xLo + ((xHi - xLo) * c) / (cols - 1);
      gridRow.push({ x, y, value: evalAt(f, { [vx]: x, [vy]: y }) });
    }
    grid.push(gridRow);
  }
  return { ok: true, grid, xLo, xHi, yLo, yHi, variant };
}

function seriesPartialSumsImpl(cfg) {
  if (!cfg) return { ok: false, error: "seriesPartialSums needs a config." };
  const count = Math.max(1, Math.min(5000, Math.floor(Number(cfg.count) || 20)));
  const idx = cfg.indexVar || "n";
  const f = compileForSample(cfg.termExpr);
  if (!f) return { ok: false, error: "Couldn't compile the series term." };
  const rows = [];
  let partial = 0;
  // Series terms index from n = 1 (the convention convergence-tests uses: 1/n, 1/n^2, …).
  for (let k = 1; k <= count; k++) {
    const term = evalAt(f, { [idx]: k });
    if (Number.isFinite(term)) {
      partial += term;
      rows.push({ n: k, term, partialSum: partial });
    } else {
      rows.push({ n: k, term: null, partialSum: partial });
    }
  }
  return { ok: true, rows };
}

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

  // Display sampling for the Syntropy node renderers — see the block above the OPS table. Each
  // takes a single config object as args[0] and returns plain JSON-shaped data (points/grid/
  // rows). No new math: they evaluate an expression via CalcCore.compileFn.
  sampleCurve: (args) => sampleCurveImpl(args[0]),
  sampleField: (args) => sampleFieldImpl(args[0]),
  seriesPartialSums: (args) => seriesPartialSumsImpl(args[0]),

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
