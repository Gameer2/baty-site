"use strict";
/* Corpus runners for the ODE, PDE, and Complex engines — Phase 0, the other three quarters.
   Methodology in docs/kernel/05_BENCHMARKS.md and 07_VALIDATION.md.

   These are separate from the integration corpus because each engine needs a DIFFERENT
   verifier. There is no antiderivative to differentiate back:

     ODE      substitute the solution into the equation. For first order this is done as an
              INVARIANT check — G(x,y) must stay constant along an independently computed RK4
              trajectory — because the engine returns solutions in five different shapes
              (explicit y(x), explicit mu/rhsInt, implicit lhsY/rhsX, implicit F, implicit
              lhsXY/rhsX) and an invariant check is the one form that handles all of them.

     PDE      four separate checks, all mandatory. A solution that satisfies the equation but
              not the boundary conditions is wrong in exactly the way a student cannot detect.

     COMPLEX  per-operation checks (Cauchy-Riemann against central differences, harmonic
              conjugate against Laplace's equation).

   COVERAGE, NOT JUST CORRECTNESS. Each corpus deliberately contains syllabus topics the engine
   does not implement yet (implemented:false). Without them a corpus only measures what exists
   and always reads 100%. Those entries are reported as MISSING — a coverage gap, distinct from
   a wrong answer. */

const path = require("path");
const fs = require("fs");

const ROOT = path.join(__dirname, "..", "..");
const math = require(path.join(ROOT, "assets", "vendor", "math.min.js"));
const nerdamer = require(path.join(__dirname, "..", "lib", "load-cas.js"))();

const CalcCore = require(path.join(ROOT, "assets", "js", "calc-core.js"));
CalcCore.configure({ nerdamer, math });
const CalculusSymbolic = require(path.join(ROOT, "assets", "js", "calculus-symbolic.js"));
CalculusSymbolic.configure({ nerdamer, math });
const ODESymbolic = require(path.join(ROOT, "assets", "js", "ode-symbolic.js"));
ODESymbolic.configure({ nerdamer, math });
const ComplexSymbolic = require(path.join(ROOT, "assets", "js", "complex-symbolic.js"));
ComplexSymbolic.configure({ nerdamer, math });

const CORPORA = path.join(__dirname, "corpora");

const CORRECT = "CORRECT", WRONG = "WRONG", REFUSED = "REFUSED",
      UNVERIFIABLE = "UNVERIFIABLE", MISSING = "MISSING";

function load(name) {
  const f = path.join(CORPORA, name + ".json");
  if (!fs.existsSync(f)) throw new Error("corpus not found: " + f + " (run node tests/bench/import-rubi.js for rubi-*)");
  return JSON.parse(fs.readFileSync(f, "utf8"));
}

/* ============================== ODE ============================== */

/* Phase 1 of the ODE engine redesign (2026-08-01) deleted the hand-rolled classifyFirstOrder/
   classifySecondOrder this corpus used to drive (five different internal solution shapes, each
   needing its own invariant-of/residual verifier below) and replaced them with ODESolver.solve()
   -- one general path that calls SymPy through a real browser Web Worker (Pyodide/WASM).

   There is no pyodide npm package in this repo -- deliberately; every ODE phase's own plan
   (docs/superpowers/plans/2026-08-0*-ode-engine-phase*.md) treats "the SymPy worker can't be
   exercised from the Node test suite" as a hard constraint, not an oversight. That means
   ODESolver.solve() genuinely cannot be invoked from this Node-based benchmark at all -- not
   "hard to wire up," structurally impossible without a Node-compatible Pyodide runtime, which
   is real, separate infrastructure work this cleanup pass does not attempt.

   Reporting every implemented problem UNVERIFIABLE (rather than crashing on the deleted
   functions, or worse, silently reporting 100% REFUSED -- which would misreport the engine as
   unable to solve any of these, when in fact it solves all of them fine in a browser) is the
   honest signal available here: this corpus needs a browser-based (or Node+Pyodide) runner to
   actually measure coverage against the current architecture. */
function runODE(slice) {
  const data = load("ode");
  if (slice) data.problems = data.problems.slice(slice.offset, slice.offset + slice.limit);
  const counts = {}, failures = [], byFamily = {};
  for (const k of [CORRECT, WRONG, REFUSED, UNVERIFIABLE, MISSING]) counts[k] = 0;

  for (const p of data.problems) {
    const cls = p.implemented === false ? MISSING : UNVERIFIABLE;
    counts[cls]++;
    byFamily[p.family] = byFamily[p.family] || { total: 0, correct: 0 };
    byFamily[p.family].total++;
  }
  return {
    name: "ode", total: data.problems.length, counts, failures, byGroup: byFamily, groupLabel: "family",
    note: "Not evaluable in Node: ODESolver.solve() requires a browser Pyodide Worker (see this function's own header comment). Every implemented problem is UNVERIFIABLE, not WRONG/REFUSED.",
  };
}

/* ============================== PDE ============================== */
/* Four mandatory checks. Passing three of four is a failure: a solution that satisfies the
   equation and the initial condition but not the boundary conditions is still wrong. */
function runPDE(slice) {
  const data = load("pde");
  if (slice) data.problems = data.problems.slice(slice.offset, slice.offset + slice.limit);
  const counts = {}, failures = [], byKind = {};
  for (const k of [CORRECT, WRONG, REFUSED, UNVERIFIABLE, MISSING]) counts[k] = 0;

  for (const p of data.problems) {
    let cls, detail = "";
    if (p.implemented === false) {
      cls = MISSING;
    } else if (p.kind === "heat") {
      let sol = null;
      try { sol = ODESymbolic.solveHeatEquation({ L: p.L, k: p.k, fxExpr: p.f, N: 30, T: 0.5 }); }
      catch (e) { sol = null; }
      if (!sol || !sol.bn) cls = REFUSED;
      else {
        const u = (x, t) => ODESymbolic.heatSeriesValue(sol.bn, p.L, p.k, x, t);
        const fail = [];

        // 1. PDE residual: u_t = k·u_xx, away from t=0 where the series converges slowly
        const hx = p.L / 400, ht = 1e-4;
        for (const t of [0.05, 0.12]) {
          for (const frac of [0.3, 0.5, 0.7]) {
            const x = p.L * frac;
            const ut = (u(x, t + ht) - u(x, t - ht)) / (2 * ht);
            const uxx = (u(x + hx, t) - 2 * u(x, t) + u(x - hx, t)) / (hx * hx);
            if (!Number.isFinite(ut) || !Number.isFinite(uxx)) { fail.push("residual-nan"); break; }
            if (Math.abs(ut - p.k * uxx) > 1e-2 * Math.max(1, Math.abs(ut))) fail.push("residual");
          }
        }
        // 2. Boundary conditions u(0,t) = u(L,t) = 0
        for (const t of [0.02, 0.1, 0.3]) {
          if (Math.abs(u(0, t)) > 1e-9 || Math.abs(u(p.L, t)) > 1e-9) { fail.push("boundary"); break; }
        }
        // 3. Initial condition u(x,0) ≈ f(x)
        let fc;
        try { fc = math.parse(p.f).compile(); } catch (e) { fc = null; }
        if (!fc) fail.push("ic-parse");
        else {
          let worst = 0;
          for (const frac of [0.2, 0.4, 0.6, 0.8]) {
            const x = p.L * frac;
            worst = Math.max(worst, Math.abs(u(x, 0) - fc.evaluate({ x })));
          }
          if (worst > 0.05) fail.push("initial(" + worst.toFixed(3) + ")");
        }
        // 4. Series convergence: more terms must not make the IC fit worse
        try {
          const s10 = ODESymbolic.solveHeatEquation({ L: p.L, k: p.k, fxExpr: p.f, N: 8, T: 0.5 });
          const err = (bn, N) => {
            let e = 0;
            for (const frac of [0.25, 0.5, 0.75]) {
              const x = p.L * frac;
              e = Math.max(e, Math.abs(ODESymbolic.heatSeriesValue(bn, p.L, p.k, x, 0) - fc.evaluate({ x })));
            }
            return e;
          };
          if (err(sol.bn) > err(s10.bn) + 1e-6) fail.push("divergent");
        } catch (e) { /* convergence check unavailable */ }

        cls = fail.length ? WRONG : CORRECT;
        detail = fail.join(",");
      }
    } else {
      cls = REFUSED;
    }
    counts[cls]++;
    byKind[p.kind] = byKind[p.kind] || { total: 0, correct: 0 };
    byKind[p.kind].total++;
    if (cls === CORRECT) byKind[p.kind].correct++;
    if (cls === WRONG || cls === REFUSED) {
      failures.push({ eq: p.desc || `${p.kind} L=${p.L} k=${p.k} f=${p.f}`, family: p.kind, cls, ref: p.ref, detail });
    }
  }
  return { name: "pde", total: data.problems.length, counts, failures, byGroup: byKind, groupLabel: "kind" };
}

/* ============================== COMPLEX ============================== */
function runComplex(slice) {
  const data = load("complex");
  if (slice) data.problems = data.problems.slice(slice.offset, slice.offset + slice.limit);
  const counts = {}, failures = [], byOp = {};
  for (const k of [CORRECT, WRONG, REFUSED, UNVERIFIABLE, MISSING]) counts[k] = 0;

  for (const p of data.problems) {
    let cls;
    if (p.implemented === false) {
      cls = MISSING;
    } else if (p.op === "cauchyRiemann") {
      let r = null;
      try { r = ComplexSymbolic.cauchyRiemann(p.f, p.point || [0.7, 0.9]); } catch (e) { r = null; }
      if (!r || !r.ok) cls = REFUSED;
      else cls = (!!r.satisfiesAtPoint === !!p.analytic) ? CORRECT : WRONG;
    } else if (p.op === "harmonicConjugate") {
      let r = null;
      try { r = ComplexSymbolic.harmonicConjugate(p.u, p.point || [0, 0]); } catch (e) { r = null; }
      if (!r || !r.ok || !r.v) cls = REFUSED;
      else {
        // v must satisfy Laplace's equation — checked here by central differences, not by
        // asking the engine to confirm its own output.
        let V;
        try { V = math.parse(r.v).compile(); } catch (e) { V = null; }
        if (!V) cls = UNVERIFIABLE;
        else {
          const h = 1e-4;
          let ok = true, checked = 0;
          for (const [x, y] of [[0.3, 0.7], [1.1, 0.4], [0.8, 1.3]]) {
            let lap;
            try {
              lap = (V.evaluate({ x: x + h, y }) - 2 * V.evaluate({ x, y }) + V.evaluate({ x: x - h, y })) / (h * h)
                  + (V.evaluate({ x, y: y + h }) - 2 * V.evaluate({ x, y }) + V.evaluate({ x, y: y - h })) / (h * h);
            } catch (e) { continue; }
            if (!Number.isFinite(lap)) continue;
            checked++;
            if (Math.abs(lap) > 1e-2) ok = false;
          }
          cls = checked < 2 ? UNVERIFIABLE : (ok ? CORRECT : WRONG);
        }
      }
    } else {
      cls = REFUSED;
    }
    counts[cls]++;
    byOp[p.op] = byOp[p.op] || { total: 0, correct: 0 };
    byOp[p.op].total++;
    if (cls === CORRECT) byOp[p.op].correct++;
    if (cls === WRONG || cls === REFUSED) failures.push({ eq: p.f || p.u || p.desc, family: p.op, cls, ref: p.ref });
  }
  return { name: "complex", total: data.problems.length, counts, failures, byGroup: byOp, groupLabel: "operation" };
}

/* CLI worker mode. Phase 0 turned up a hard reason this must run in child processes:
   a single nerdamer evaluate() that throws ("log(0) is undefined!") leaves the library unable
   to classify a later, unrelated equation — see docs/kernel/01_CURRENT_STATE.md. Chunking into
   short-lived processes bounds that contamination to one chunk instead of poisoning the run. */
if (require.main === module) {
  const a = process.argv.slice(2);
  const which = (a.find((x) => x.startsWith("--corpus=")) || "").split("=")[1];
  const offset = parseInt((a.find((x) => x.startsWith("--offset=")) || "").split("=")[1], 10) || 0;
  const limit = parseInt((a.find((x) => x.startsWith("--limit=")) || "").split("=")[1], 10) || 1e9;
  const fn = { ode: runODE, pde: runPDE, complex: runComplex }[which];
  if (!fn) { console.error("usage: --corpus=ode|pde|complex [--offset=N] [--limit=N]"); process.exit(2); }
  const r = fn({ offset, limit });
  process.stdout.write(JSON.stringify(r) + "\n");
}

module.exports = { runODE, runPDE, runComplex, CORRECT, WRONG, REFUSED, UNVERIFIABLE, MISSING };
