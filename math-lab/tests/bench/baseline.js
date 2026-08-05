"use strict";
/* Symbolic kernel benchmark harness.
   See docs/kernel/05_BENCHMARKS.md for methodology.

   Usage:
     node tests/bench/baseline.js            run everything, print report, write snapshot
     node tests/bench/baseline.js --quick    integration + kernel probes only, no snapshot
     node tests/bench/baseline.js --compare  diff against the newest snapshot; exit 1 on regression

   Every result is classified CORRECT / WRONG / REFUSED / UNVERIFIABLE. The distinction between
   the middle two is the whole point: a refusal is a safe failure, a wrong answer shown to a
   student is the worst possible outcome.

   Verification is central-difference in math.js, never the CAS differentiating its own output.
   verify-calculus.js:198 documents why: nerdamer's diff() is wrong on sqrt(quadratic) forms and
   would reject correct answers. The verifier and the verified must not share an implementation. */

const path = require("path");
const fs = require("fs");
const { execSync, execFileSync } = require("child_process");

const ROOT = path.join(__dirname, "..", "..");
const math = require(path.join(ROOT, "assets", "vendor", "math.min.js"));
const nerdamer = require(path.join(__dirname, "..", "lib", "load-cas.js"))();
const lnToLog = require(path.join(__dirname, "..", "lib", "ln-to-log.js"));

// The production technique pipeline (docs/kernel/04_BUILD_PHASES.md Phase 2's "production
// integration" gap) — used by runProductionIntegration() below, kept separate from the raw
// nerdamer path runIntegration() measures so both numbers stay independently readable.
const CalcCore = require(path.join(ROOT, "assets", "js", "calc-core.js"));
CalcCore.configure({ nerdamer, math });
const CalculusSymbolic = require(path.join(ROOT, "assets", "js", "calculus-symbolic.js"));
CalculusSymbolic.configure({ nerdamer, math });
const IntegrationAdvanced = require(path.join(ROOT, "assets", "js", "integration-advanced.js"));
IntegrationAdvanced.configure({ nerdamer, math });

const SNAPSHOT_DIR = path.join(__dirname, "snapshots");
const CORPORA_DIR = path.join(__dirname, "corpora");
const args = process.argv.slice(2);
const QUICK = args.includes("--quick");
const COMPARE = args.includes("--compare");
const CORPUS = (args.find((a) => a.startsWith("--corpus=")) || "").split("=")[1] || null;
const LIMIT = parseInt((args.find((a) => a.startsWith("--limit=")) || "").split("=")[1], 10) || 0;
const OFFSET = parseInt((args.find((a) => a.startsWith("--offset=")) || "").split("=")[1], 10) || 0;
const WORKER = args.includes("--worker");
const DUMP = (args.find((a) => a.startsWith("--dump=")) || "").split("=")[1] || null;

/* ---- classification ----------------------------------------------------------------
   TIMEOUT is a fifth class, added after a full-corpus run hung indefinitely: nerdamer can
   enter a non-terminating search, and synchronous JavaScript cannot be interrupted from
   inside the same process. The corpus runner therefore executes in child processes and
   classifies anything the child fails to report before its deadline as TIMEOUT. Like
   REFUSED it is a safe failure — no wrong answer reaches anyone — but unlike REFUSED it is
   a *usability* defect: a page that hangs is as bad as a page that lies. */
const CORRECT = "CORRECT", WRONG = "WRONG", REFUSED = "REFUSED", UNVERIFIABLE = "UNVERIFIABLE",
      TIMEOUT = "TIMEOUT";

/* Central-difference check. Returns a classification, never a boolean — "could not sample"
   must not be reported as success. math.js has no "ln" function (only "log" for natural
   log), but the kernel canonicalizes natural log to "ln(...)" everywhere — translate before
   parsing so a correct kernel answer isn't misclassified UNVERIFIABLE by a parser error. */
function verifyAntiderivative(F, f, pts, variable) {
  const v = variable || "x";
  let cF, cf;
  try { cF = math.parse(lnToLog(F)).compile(); } catch (e) { return UNVERIFIABLE; }
  try { cf = math.parse(lnToLog(f)).compile(); } catch (e) { return UNVERIFIABLE; }
  const h = 1e-5;
  let usable = 0;
  for (const x of pts) {
    let fp, gx;
    try { fp = (cF.evaluate({ [v]: x + h }) - cF.evaluate({ [v]: x - h })) / (2 * h); } catch (e) { continue; }
    try { gx = cf.evaluate({ [v]: x }); } catch (e) { continue; }
    if (typeof fp !== "number" || typeof gx !== "number") continue;
    if (!Number.isFinite(fp) || !Number.isFinite(gx)) continue;
    usable++;
    if (Math.abs(fp - gx) > 1e-3 * Math.max(1, Math.abs(gx))) return WRONG;
  }
  // A result checked at fewer than 3 usable points is UNVERIFIABLE, never CORRECT.
  return usable >= 3 ? CORRECT : UNVERIFIABLE;
}

/* ---- sample-point sets ------------------------------------------------------------- */
/* Irrational-looking offsets are deliberate: they avoid accidental symmetry, removable
   singularities and exact zeros that could make a wrong answer look right. */
const NEAR0  = [0.21, 0.43, 0.67, 0.91, 1.17, 1.41, 1.63, 1.87];
const OUTER  = [3.4, 4.1, 5.3, 6.7, 8.2];
const LOGS   = [1.3, 1.9, 2.6, 3.4, 4.5];
const SMALL  = [0.11, 0.29, 0.47, 0.62, 0.78];
const UNIT   = [0.21, 0.43, 0.67, 0.91, 1.1];

/* ---- corpus: 40 standard textbook integrals ---------------------------------------- */
const INTEGRATION_CORPUS = [
  ["x*sin(x^2)",           NEAR0, "u-sub"],
  ["x^3*cos(x^4)",         NEAR0, "u-sub"],
  ["tan(x)",               SMALL, "u-sub"],
  ["sec(x)^2",             SMALL, "basic"],
  ["1/(x*log(x))",         OUTER, "u-sub"],
  ["x/(x^2+1)",            NEAR0, "u-sub"],
  ["x*e^x",                NEAR0, "by-parts"],
  ["x^2*e^x",              NEAR0, "by-parts"],
  ["log(x)",               LOGS,  "by-parts"],
  ["asin(x)",              SMALL, "by-parts"],
  ["atan(x)",              NEAR0, "by-parts"],
  ["e^x*sin(x)",           NEAR0, "by-parts (cyclic)"],
  ["x^2*log(x)",           LOGS,  "by-parts"],
  ["sec(x)^3",             SMALL, "by-parts (cyclic)"],
  ["1/(x^2-1)",            OUTER, "partial fractions"],
  ["1/(x^4-1)",            OUTER, "partial fractions"],
  ["1/(x^3+x)",            NEAR0, "partial fractions"],
  ["x^3/(x^2-1)",          OUTER, "improper rational"],
  ["1/((x-1)^2*(x+2))",    OUTER, "repeated factor"],
  ["(x^2+1)/(x^3-x)",      OUTER, "partial fractions"],
  ["sqrt(4-x^2)",          NEAR0, "trig sub a^2-x^2"],
  ["sqrt(9-x^2)",          NEAR0, "trig sub a^2-x^2"],
  ["1/sqrt(4-x^2)",        NEAR0, "trig sub -> asin"],
  ["sqrt(1+x^2)",          NEAR0, "trig sub a^2+x^2"],
  ["sqrt(x^2-1)",          OUTER, "trig sub x^2-a^2"],
  ["x^2/sqrt(x^2-9)",      OUTER, "trig sub x^2-a^2"],
  ["x^2*sqrt(4-x^2)",      NEAR0, "trig sub"],
  ["1/(x^2*sqrt(x^2-1))",  OUTER, "trig sub -> asec"],
  ["1/sqrt(x^2+4*x+13)",   NEAR0, "complete the square"],
  ["1/(x^2+2*x+5)",        NEAR0, "complete the square"],
  ["sin(x)^2",             NEAR0, "power-reduction"],
  ["sin(x)^3",             NEAR0, "trig powers"],
  ["sin(x)^2*cos(x)^2",    NEAR0, "trig powers"],
  ["tan(x)^3",             SMALL, "trig powers"],
  ["x*sqrt(x+1)",          NEAR0, "algebraic sub"],
  ["1/(1+sqrt(x))",        NEAR0, "algebraic sub"],
  ["x^3*e^(x^2)",          NEAR0, "sub + by-parts"],
  ["log(x)/x^2",           LOGS,  "by-parts"],
  ["e^(sqrt(x))",          NEAR0, "sub + by-parts"],
  ["x*atan(x)",            UNIT,  "by-parts"]
];

/* ---- kernel probes: pure algebra, no calculus --------------------------------------- */
const CANONICAL = [
  ["expand-and-cancel",    "(1+x)^2-1-2*x-x^2",       "0"],
  ["difference of squares","(x-1)*(x+1)-x^2+1",       "0"],
  ["trig Pythagorean",     "sin(x)^2+cos(x)^2-1",     "0"],
  ["log product rule",     "log(x*y)-log(x)-log(y)",  "0"],
  ["exp/log inverse",      "log(e^x)-x",              "0"],
  ["rational cancel",      "(x^2-1)/(x-1)-x-1",       "0"],
  ["nested radical",       "sqrt(x^2)-abs(x)",        "0"],
  ["double angle",         "sin(2*x)-2*sin(x)*cos(x)","0"]
];

const INVERSE_TRIG = [
  ["cos(asin(x))", "sqrt(1-x^2)"],
  ["sin(acos(x))", "sqrt(1-x^2)"],
  ["tan(asin(x))", "x/sqrt(1-x^2)"],
  ["sec(atan(x))", "sqrt(1+x^2)"]
];

const BRANCH = [
  ["sqrt(-9)",     "3*i"],
  ["i^2",          "-1"],
  ["1/sqrt(-1)",   "-i"]
];

/* ---- runners ------------------------------------------------------------------------ */
function runIntegration() {
  const results = [], failures = [];
  const counts = { [CORRECT]: 0, [WRONG]: 0, [REFUSED]: 0, [UNVERIFIABLE]: 0 };

  for (const [f, pts, topic] of INTEGRATION_CORPUS) {
    let F = null, cls, note = "";
    try { F = nerdamer(`integrate(${f},x)`).toString(); }
    catch (e) { cls = REFUSED; note = "threw: " + e.message.slice(0, 60); }

    if (F !== null) {
      if (/integrate\s*\(/.test(F)) { cls = REFUSED; note = "returned unevaluated"; }
      else { cls = verifyAntiderivative(F, f, pts); if (cls !== CORRECT) note = String(F).slice(0, 70); }
    }
    counts[cls]++;
    results.push({ problem: f, topic, class: cls });
    if (cls !== CORRECT) failures.push({ problem: f, topic, class: cls, got: note });
  }
  return { total: INTEGRATION_CORPUS.length, counts, results, failures };
}

/* Same 40-problem corpus, routed through IntegrationAdvanced.autoIntegrate — the technique
   dispatcher (u-substitution, by-parts, partial fractions, trig substitution, algebraic
   substitution, completing the square, each already shipped and independently verified; raw
   nerdamer integrate() only as a last resort) — instead of raw nerdamer alone. This is the
   number docs/kernel/04_BUILD_PHASES.md's Phase 2 gate actually names ("the 12 measured
   smoke-corpus failures drop to ≤4"): that gate is about the PRODUCTION pipeline a page
   would actually use, not about nerdamer's bare integrate(), which is what runIntegration()
   above measures and always has. */
function runProductionIntegration() {
  const results = [], failures = [];
  const counts = { [CORRECT]: 0, [WRONG]: 0, [REFUSED]: 0, [UNVERIFIABLE]: 0 };

  for (const [f, pts, topic] of INTEGRATION_CORPUS) {
    let out, cls, note = "";
    try { out = IntegrationAdvanced.autoIntegrate(f, "x"); }
    catch (e) { out = { ok: false, reason: "threw: " + e.message.slice(0, 60) }; }

    if (!out.ok) { cls = REFUSED; note = String(out.reason || "").slice(0, 70); }
    else {
      cls = verifyAntiderivative(out.result, f, pts);
      if (cls !== CORRECT) note = (out.technique + ": " + out.result).slice(0, 70);
    }
    counts[cls]++;
    results.push({ problem: f, topic, class: cls, technique: out.technique || null });
    if (cls !== CORRECT) failures.push({ problem: f, topic, class: cls, got: note });
  }
  return { total: INTEGRATION_CORPUS.length, counts, results, failures };
}

function simplifiesTo(input, expected) {
  try { return nerdamer(input).simplify().toString() === expected; }
  catch (e) { return false; }
}

function runKernelProbes() {
  const canonical = CANONICAL.filter(([, i, e]) => simplifiesTo(i, e)).length;
  const inverseTrig = INVERSE_TRIG.filter(([i, e]) => simplifiesTo(i, e)).length;
  const branch = BRANCH.filter(([i, e]) => simplifiesTo(i, e)).length;

  const has = (n) => typeof nerdamer[n] === "function";
  const assumptions = has("assume") || has("assumptions") || has("setAssumption") || has("declare");

  let dsolve = false;
  try { dsolve = !/dsolve/.test(nerdamer("dsolve(diff(y,x)-y,y,x)").toString()); } catch (e) { dsolve = false; }

  let summation = false;
  try { summation = !/sum\s*\(/.test(nerdamer("sum(k^2,k,1,n)").toString()); } catch (e) { summation = false; }

  return {
    canonical:   [canonical,   CANONICAL.length],
    inverseTrig: [inverseTrig, INVERSE_TRIG.length],
    branch:      [branch,      BRANCH.length],
    assumptions, dsolve, summation
  };
}

/* ---- new symbolic kernel (Phase 1/2) probes ------------------------------------------
   Runs the SAME CANONICAL and INVERSE_TRIG probe corpora above through the new kernel
   (assets/js/kernel/), alongside the existing raw-nerdamer measurement. Purely additive —
   does not change simplifiesTo() or anything nerdamer-based above, and the existing
   kernel probe numbers (nerdamer's own .simplify()) are untouched.

   This is the Phase 2d corpus-level wiring (docs/kernel/04_BUILD_PHASES.md Phase 2d):
   peak/final cost per problem, and determinism across a rule-database reordering,
   measured against real probes rather than only synthetic unit-test examples. */
function runNewKernelProbes() {
  const KERNEL = path.join(ROOT, "assets", "js", "kernel");
  const { parse } = require(path.join(KERNEL, "parser.js"));
  const printer = require(path.join(KERNEL, "printer.js"));
  const directed = require(path.join(KERNEL, "directed.js"));
  const { AssumptionContext } = require(path.join(KERNEL, "assumptions.js"));
  const { RuleSet } = require(path.join(KERNEL, "rules.js"));
  const { cost } = require(path.join(KERNEL, "cost.js"));

  const reversedRuleSet = new RuleSet(
    directed.ALL_RULES.filter((r) => r.direction === "normalize").slice().reverse()
  );

  function bestResult(expr, ctx) {
    const candidates = [];
    const n = directed.normalize(expr, ctx);
    if (!n.refused) candidates.push(n);
    const c = directed.combine(expr, ctx);
    if (!c.refused) candidates.push(c);
    if (!candidates.length) return null;
    candidates.sort((a, b) => cost(a.result) - cost(b.result));
    return candidates[0];
  }

  function peakCost(derivation) {
    let peak = 0;
    derivation.walk((node) => {
      peak = Math.max(peak, cost(node.goal), cost(node.result));
    });
    return peak;
  }

  function median(arr) {
    const s = arr.slice().sort((x, y) => x - y);
    const mid = Math.floor(s.length / 2);
    return s.length ? (s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2) : null;
  }

  function runProbeSet(probes, assumeFn) {
    let correct = 0;
    const costs = [];
    let deterministic = true;

    for (const p of probes) {
      const [input, expected] = p.length === 3 ? [p[1], p[2]] : p;
      let expr;
      try { expr = parse(input); } catch (e) { continue; }

      const ctx = AssumptionContext.create();
      if (assumeFn) assumeFn(ctx);
      const best = bestResult(expr, ctx);
      if (best) {
        costs.push({ peak: peakCost(best.derivation), final: cost(best.result) });
        if (printer.text(best.result) === expected) correct++;
      }

      // determinism across a rule-database reordering (Phase 2d gate)
      const ctxA = AssumptionContext.create();
      const ctxB = AssumptionContext.create();
      if (assumeFn) { assumeFn(ctxA); assumeFn(ctxB); }
      const forward = directed.normalize(expr, ctxA);
      const reordered = directed.normalize(expr, ctxB, { ruleSet: reversedRuleSet });
      const same = forward.refused === reordered.refused && (forward.refused || forward.result === reordered.result);
      if (!same) deterministic = false;
    }

    return {
      correct, total: probes.length, deterministic,
      peakCostMax: costs.length ? Math.max(...costs.map((c) => c.peak)) : null,
      finalCostMedian: median(costs.map((c) => c.final)),
    };
  }

  const canonical = runProbeSet(CANONICAL, (ctx) => { ctx.assume("x", "positive"); ctx.assume("y", "positive"); });
  const inverseTrig = runProbeSet(INVERSE_TRIG, null);

  return { canonical, inverseTrig };
}

/* ---- Rubi corpus runner --------------------------------------------------------------
   Rubi problems carry symbolic parameters (63,153 of the 72,039 do). Verification needs
   concrete numbers, so each parameter is bound to a distinct value before checking. The
   values are deliberately irrational-ish and mutually incommensurate: round numbers make
   different-but-wrong answers coincide, which is exactly the failure this must not miss.

   The importer already renamed every parameter to p1, p2, ... so nothing can collide with a
   math.js constant (a bare `e` would otherwise silently resolve to Euler's number). */
const PARAM_VALUES = [1.7, 2.3, 3.1, 0.7, 5.3, 1.3, 4.1, 2.9, 0.53, 6.7, 1.9, 3.7];

function bindParams(expr, params) {
  let out = expr;
  params.forEach((p, i) => {
    const v = PARAM_VALUES[i % PARAM_VALUES.length];
    out = out.replace(new RegExp("\\b" + p + "\\b", "g"), "(" + v + ")");
  });
  return out;
}

/* A wide spread so that at least a few points land inside whatever domain the integrand has.
   verifyAntiderivative already refuses to call a result CORRECT on fewer than 3 usable points,
   so a bad spread degrades to UNVERIFIABLE rather than to a false pass. */
const CORPUS_POINTS = [0.13, 0.29, 0.47, 0.71, 0.93, 1.21, 1.57, 1.93, 2.41, 3.13, 4.27, 5.61];

function loadCorpus(name) {
  const file = path.join(CORPORA_DIR, "rubi-" + name + ".json");
  if (!fs.existsSync(file)) {
    console.error(`\n  corpus not found: ${file}`);
    console.error("  run:  node tests/bench/import-rubi.js\n");
    process.exit(2);
  }
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

/* Child mode: process one slice and emit a JSON line per problem, flushed immediately so the
   parent still has every completed result if the deadline kills us mid-slice. */
function runCorpusWorker(name) {
  const data = loadCorpus(name);
  let problems = data.problems.slice(OFFSET);
  if (LIMIT) problems = problems.slice(0, LIMIT);

  problems.forEach((p, i) => {
    const v = p.variable;
    const concrete = bindParams(p.integrand, p.params || []);
    let F = null, cls;
    try { F = nerdamer(`integrate(${concrete},${v})`).toString(); }
    catch (e) { cls = REFUSED; }
    if (F !== null) {
      if (/integrate\s*\(/.test(F)) cls = REFUSED;
      else cls = verifyAntiderivative(F, concrete, CORPUS_POINTS, v);
    }
    process.stdout.write(JSON.stringify({ i: OFFSET + i, cls, got: cls === WRONG ? String(F).slice(0, 70) : undefined }) + "\n");
  });
}

const CHUNK = 10;
const CHUNK_TIMEOUT_MS = 20000;

function runCorpus(name) {
  const data = loadCorpus(name);
  let problems = data.problems.slice(OFFSET);
  if (LIMIT) problems = problems.slice(0, LIMIT);

  const counts = { [CORRECT]: 0, [WRONG]: 0, [REFUSED]: 0, [UNVERIFIABLE]: 0, [TIMEOUT]: 0 };
  const failures = [];
  const timeouts = [];
  const bySteps = {};
  const results = new Array(problems.length).fill(null);
  const dump = [];

  const chunks = Math.ceil(problems.length / CHUNK);
  process.stdout.write(`\n  running ${problems.length} problems from the ${name} corpus in ${chunks} isolated chunks\n  `);

  for (let c = 0; c < chunks; c++) {
    const off = OFFSET + c * CHUNK;
    const lim = Math.min(CHUNK, problems.length - c * CHUNK);
    let out = "";
    try {
      out = execFileSync(process.execPath,
        [__filename, "--worker", "--corpus=" + name, "--offset=" + off, "--limit=" + lim],
        { timeout: CHUNK_TIMEOUT_MS, encoding: "utf8", maxBuffer: 8 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] });
    } catch (e) {
      out = (e.stdout || "").toString();      // partial results from before the kill
    }
    for (const line of out.split("\n")) {
      if (!line.trim()) continue;
      let r; try { r = JSON.parse(line); } catch (e) { continue; }
      results[r.i - OFFSET] = r;
    }
    process.stdout.write(c % 50 === 49 ? ".\n  " : ".");
  }
  process.stdout.write("\n");

  problems.forEach((p, i) => {
    const r = results[i];
    const cls = r ? r.cls : TIMEOUT;
    counts[cls]++;

    const bucket = p.steps == null ? "?" : (p.steps <= 2 ? "1-2" : p.steps <= 5 ? "3-5" : p.steps <= 10 ? "6-10" : "11+");
    bySteps[bucket] = bySteps[bucket] || { total: 0, correct: 0 };
    bySteps[bucket].total++;
    if (cls === CORRECT) bySteps[bucket].correct++;

    if (cls === WRONG && failures.length < 40) {
      failures.push({ problem: p.integrand, got: r.got || "", expected: p.expected.slice(0, 70), source: p.source });
    }
    if (cls === TIMEOUT && timeouts.length < 20) {
      timeouts.push({ problem: p.integrand.slice(0, 60), source: p.source });
    }
    if (DUMP) dump.push({ integrand: p.integrand, variable: p.variable, steps: p.steps,
                          expected: p.expected, cls: cls, got: r && r.got, source: p.source });
  });

  if (DUMP) { fs.writeFileSync(DUMP, JSON.stringify(dump, null, 1)); console.log(`\n  full results dumped to ${DUMP}`); }

  return { name, total: problems.length, counts, failures, timeouts, bySteps };
}

/* ---- reporting ---------------------------------------------------------------------- */
function pct(n, d) { return d === 0 ? "0.0%" : ((n / d) * 100).toFixed(1) + "%"; }
function bar(label, n, d) {
  return `    ${label.padEnd(24)} ${String(n).padStart(3)}/${String(d).padEnd(3)}  ${pct(n, d).padStart(6)}`;
}

function report(integration, kernel, newKernel, production) {
  const c = integration.counts, t = integration.total;
  console.log("\n=== SYMBOLIC KERNEL BASELINE ===\n");
  console.log("  INTEGRATION CORPUS (raw nerdamer integrate())");
  console.log(bar("correct", c[CORRECT], t));
  console.log(bar("SILENTLY WRONG", c[WRONG], t) + "   <-- the number that matters");
  console.log(bar("refused (safe)", c[REFUSED], t));
  console.log(bar("unverifiable", c[UNVERIFIABLE], t));

  if (production) {
    const p = production.counts, pt = production.total;
    const failCount = pt - p[CORRECT];
    console.log("\n  INTEGRATION CORPUS (production pipeline — IntegrationAdvanced.autoIntegrate)");
    console.log(bar("correct", p[CORRECT], pt));
    console.log(bar("SILENTLY WRONG", p[WRONG], pt) + "   <-- the number that matters");
    console.log(bar("refused (safe)", p[REFUSED], pt));
    console.log(bar("unverifiable", p[UNVERIFIABLE], pt));
    console.log(`    Phase 2 gate: ${failCount} smoke-corpus failures (raw nerdamer had ${t - c[CORRECT]}) — gate is <=4`
      + (failCount <= 4 ? "  MET" : "  NOT MET"));
  }

  console.log("\n  KERNEL PROBES (raw nerdamer .simplify())");
  console.log(bar("canonical simplify", kernel.canonical[0], kernel.canonical[1]));
  console.log(bar("inverse-trig compose", kernel.inverseTrig[0], kernel.inverseTrig[1]));
  console.log(bar("branch/domain arith", kernel.branch[0], kernel.branch[1]));
  console.log(`    ${"assumptions system".padEnd(24)} ${kernel.assumptions ? "PRESENT" : "ABSENT"}`);
  console.log(`    ${"symbolic dsolve".padEnd(24)} ${kernel.dsolve ? "PRESENT" : "ABSENT"}`);
  console.log(`    ${"symbolic summation".padEnd(24)} ${kernel.summation ? "PRESENT" : "ABSENT"}`);

  if (newKernel) {
    console.log("\n  NEW SYMBOLIC KERNEL (assets/js/kernel/ — Phase 1/2/2b/2d)");
    console.log(bar("canonical simplify", newKernel.canonical.correct, newKernel.canonical.total));
    console.log(bar("inverse-trig compose", newKernel.inverseTrig.correct, newKernel.inverseTrig.total));
    console.log(`    ${"determinism (canonical)".padEnd(24)} ${newKernel.canonical.deterministic ? "OK" : "REGRESSION"}`);
    console.log(`    ${"determinism (inv-trig)".padEnd(24)} ${newKernel.inverseTrig.deterministic ? "OK" : "REGRESSION"}`);
    console.log(`    ${"peak cost, canonical".padEnd(24)} ${newKernel.canonical.peakCostMax ?? "—"}`);
    console.log(`    ${"final cost (median)".padEnd(24)} ${newKernel.canonical.finalCostMedian ?? "—"}`);
  }

  if (integration.failures.length) {
    console.log("\n  FAILURES (raw nerdamer)\n");
    for (const f of integration.failures) {
      console.log(`    ${f.class.padEnd(13)} ${("∫ " + f.problem).padEnd(28)} [${f.topic}]`);
      if (f.got) console.log(`                  ${f.got}`);
    }
  }

  if (production && production.failures.length) {
    console.log("\n  FAILURES (production pipeline)\n");
    for (const f of production.failures) {
      console.log(`    ${f.class.padEnd(13)} ${("∫ " + f.problem).padEnd(28)} [${f.topic}]`);
      if (f.got) console.log(`                  ${f.got}`);
    }
  }
}

/* ---- snapshots ---------------------------------------------------------------------- */
function gitRev() {
  try { return execSync("git rev-parse --short HEAD", { cwd: ROOT, stdio: ["ignore", "pipe", "ignore"] }).toString().trim(); }
  catch (e) { return "unknown"; }
}

function writeSnapshot(integration, kernel, newKernel, production) {
  if (!fs.existsSync(SNAPSHOT_DIR)) fs.mkdirSync(SNAPSHOT_DIR, { recursive: true });
  const snap = {
    timestamp: new Date().toISOString(),
    git: gitRev(),
    integration: {
      total: integration.total,
      correct: integration.counts[CORRECT],
      wrong: integration.counts[WRONG],
      refused: integration.counts[REFUSED],
      unverifiable: integration.counts[UNVERIFIABLE]
    },
    // The production technique pipeline (Phase 2 gate: "12 measured smoke-corpus failures
    // drop to <=4"), separate from the raw-nerdamer `integration` block above.
    production: production ? {
      total: production.total,
      correct: production.counts[CORRECT],
      wrong: production.counts[WRONG],
      refused: production.counts[REFUSED],
      unverifiable: production.counts[UNVERIFIABLE],
      failures: production.failures
    } : null,
    kernel,
    // Phase 2d instrumentation, measured against the real CANONICAL/INVERSE_TRIG probes —
    // see docs/kernel/05_BENCHMARKS.md §1 for the schema this fills in.
    newKernel: newKernel ? {
      canonical: newKernel.canonical,
      inverseTrig: newKernel.inverseTrig,
      cost: {
        peakMax: newKernel.canonical.peakCostMax,
        finalMedian: newKernel.canonical.finalCostMedian
      },
      determinism: {
        canonical: newKernel.canonical.deterministic,
        inverseTrig: newKernel.inverseTrig.deterministic
      }
    } : null,
    fallThrough: 1.0,          // 100% until the kernel exists; drops as phases land
    stepCompleteness: null,    // populated once L5 runs through the harness
    failures: integration.failures
  };
  const file = path.join(SNAPSHOT_DIR, snap.timestamp.replace(/[:.]/g, "-") + ".json");
  fs.writeFileSync(file, JSON.stringify(snap, null, 2));
  console.log(`\n  snapshot written: tests/bench/snapshots/${path.basename(file)}`);
  return snap;
}

/* Corpus runs get their own snapshot series. Without this the headline number — the one the
   whole of Phase 0 exists to produce — is printed to a terminal and then lost. */
function writeCorpusSnapshot(c) {
  if (!fs.existsSync(SNAPSHOT_DIR)) fs.mkdirSync(SNAPSHOT_DIR, { recursive: true });
  const snap = {
    timestamp: new Date().toISOString(),
    git: gitRev(),
    kind: "corpus",
    corpus: c.name,
    total: c.total,
    correct: c.counts[CORRECT],
    wrong: c.counts[WRONG],
    refused: c.counts[REFUSED],
    unverifiable: c.counts[UNVERIFIABLE],
    timeout: c.counts[TIMEOUT],
    bySteps: c.bySteps,
    failures: c.failures,
    timeouts: c.timeouts
  };
  const file = path.join(SNAPSHOT_DIR, "corpus-" + c.name + "-" + snap.timestamp.replace(/[:.]/g, "-") + ".json");
  fs.writeFileSync(file, JSON.stringify(snap, null, 2));
  console.log(`\n  snapshot written: tests/bench/snapshots/${path.basename(file)}`);
}

function newestSnapshot() {
  if (!fs.existsSync(SNAPSHOT_DIR)) return null;
  const files = fs.readdirSync(SNAPSHOT_DIR).filter((f) => f.endsWith(".json")).sort();
  if (!files.length) return null;
  return JSON.parse(fs.readFileSync(path.join(SNAPSHOT_DIR, files[files.length - 1]), "utf8"));
}

/* A REFUSED -> WRONG transition is a regression even when total coverage rises. */
function compare(current, prev) {
  console.log("\n=== COMPARISON WITH PREVIOUS SNAPSHOT ===\n");
  console.log(`  previous: ${prev.timestamp} (${prev.git})`);
  let regressed = false;

  const dCorrect = current.integration.correct - prev.integration.correct;
  const dWrong   = current.integration.wrong   - prev.integration.wrong;
  console.log(`  correct:        ${prev.integration.correct} -> ${current.integration.correct}  (${dCorrect >= 0 ? "+" : ""}${dCorrect})`);
  console.log(`  silently wrong: ${prev.integration.wrong} -> ${current.integration.wrong}  (${dWrong >= 0 ? "+" : ""}${dWrong})`);

  if (dWrong > 0)   { console.error("\n  REGRESSION: silently-wrong count increased"); regressed = true; }
  if (dCorrect < 0) { console.error("  REGRESSION: correct count decreased"); regressed = true; }

  for (const k of ["canonical", "inverseTrig", "branch"]) {
    if (prev.kernel && prev.kernel[k] && current.kernel[k][0] < prev.kernel[k][0]) {
      console.error(`  REGRESSION: kernel probe '${k}' dropped ${prev.kernel[k][0]} -> ${current.kernel[k][0]}`);
      regressed = true;
    }
  }

  if (prev.production && current.production) {
    const dpCorrect = current.production.correct - prev.production.correct;
    const dpWrong = current.production.wrong - prev.production.wrong;
    console.log(`  production correct:        ${prev.production.correct} -> ${current.production.correct}  (${dpCorrect >= 0 ? "+" : ""}${dpCorrect})`);
    console.log(`  production silently wrong: ${prev.production.wrong} -> ${current.production.wrong}  (${dpWrong >= 0 ? "+" : ""}${dpWrong})`);
    if (dpWrong > 0)   { console.error("\n  REGRESSION: production silently-wrong count increased"); regressed = true; }
    if (dpCorrect < 0) { console.error("  REGRESSION: production correct count decreased"); regressed = true; }
  }

  if (!regressed) console.log("\n  no regressions");
  return regressed;
}

function reportCorpus(c) {
  const t = c.total, n = c.counts;
  console.log(`\n=== RUBI CORPUS: ${c.name} (${t} problems) ===\n`);
  console.log(bar("correct", n[CORRECT], t));
  console.log(bar("SILENTLY WRONG", n[WRONG], t) + "   <-- the number that matters");
  console.log(bar("refused (safe)", n[REFUSED], t));
  console.log(bar("unverifiable", n[UNVERIFIABLE], t));
  console.log(bar("TIMEOUT (hung)", n[TIMEOUT], t));

  console.log("\n  by Rubi difficulty (optimal rule applications):");
  for (const k of ["1-2", "3-5", "6-10", "11+", "?"]) {
    if (!c.bySteps[k]) continue;
    const b = c.bySteps[k];
    console.log(bar("  " + k + " steps", b.correct, b.total));
  }

  if (c.timeouts.length) {
    console.log(`\n  problems that HUNG the CAS (${c.timeouts.length} shown) — each is a page that would freeze:\n`);
    for (const t of c.timeouts.slice(0, 8)) console.log(`    ∫ ${t.problem}`);
  }

  if (c.failures.length) {
    console.log(`\n  sample silently-wrong results (${c.failures.length} shown):\n`);
    for (const f of c.failures.slice(0, 10)) {
      console.log(`    ∫ ${f.problem.slice(0, 58)}`);
      console.log(`        got      ${f.got}`);
      console.log(`        expected ${f.expected}`);
    }
  }
}

/* ---- main --------------------------------------------------------------------------- */
if (WORKER) { runCorpusWorker(CORPUS); process.exit(0); }

if (CORPUS) {
  const c = runCorpus(CORPUS);
  reportCorpus(c);
  if (!QUICK) writeCorpusSnapshot(c);
  console.log("");
  process.exit(0);
}

const integration = runIntegration();
const production = runProductionIntegration();
const kernel = runKernelProbes();
const newKernel = runNewKernelProbes();
report(integration, kernel, newKernel, production);

if (QUICK) { console.log("\n  (--quick: no snapshot written)\n"); process.exit(0); }

const prev = COMPARE ? newestSnapshot() : null;
const snap = writeSnapshot(integration, kernel, newKernel, production);

if (COMPARE) {
  if (!prev) { console.log("\n  no previous snapshot to compare against\n"); process.exit(0); }
  const regressed = compare(snap, prev);
  console.log("");
  process.exit(regressed ? 1 : 0);
}
console.log("");
