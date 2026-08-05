"use strict";
/* Phase 0 gate: ONE command that prints a baseline coverage number for every engine and
   writes a snapshot. See docs/kernel/04_BUILD_PHASES.md Phase 0.

     node tests/bench/all.js              all four corpora, snapshot written
     node tests/bench/all.js --quick      skip the 875-problem integration corpus
     node tests/bench/all.js --no-snap    print only

   FOUR corpora, not three: ODE and PDE are separate because PDE needs a four-part verifier
   (residual, boundary conditions, initial condition, series convergence) that has nothing in
   common with substituting a solution back into an ODE.

   Everything runs in short-lived child processes. That is not tidiness — Phase 0 established
   that one nerdamer evaluate() throwing "log(0) is undefined!" leaves the library unable to
   classify a later, unrelated equation. In-process runs silently under-report. */

const path = require("path");
const fs = require("fs");
const { execFileSync } = require("child_process");

const BENCH = __dirname;
const SNAP = path.join(BENCH, "snapshots");
const args = process.argv.slice(2);
const QUICK = args.includes("--quick");
const NOSNAP = args.includes("--no-snap");

const CORRECT = "CORRECT", WRONG = "WRONG", REFUSED = "REFUSED",
      UNVERIFIABLE = "UNVERIFIABLE", MISSING = "MISSING", TIMEOUT = "TIMEOUT";

function gitRev() {
  try {
    return execFileSync("git", ["rev-parse", "--short", "HEAD"],
      { cwd: path.join(BENCH, "..", ".."), encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch (e) { return "unknown"; }
}

/* ---- engine corpora, chunked ---- */
const CHUNK = 5, CHUNK_MS = 45000;

function runEngineCorpus(name, total) {
  const merged = { counts: {}, failures: [], byGroup: {}, groupLabel: "", total: 0 };
  for (const k of [CORRECT, WRONG, REFUSED, UNVERIFIABLE, MISSING, TIMEOUT]) merged.counts[k] = 0;

  for (let off = 0; off < total; off += CHUNK) {
    const lim = Math.min(CHUNK, total - off);
    let out = null;
    try {
      out = execFileSync(process.execPath,
        [path.join(BENCH, "corpus-engines.js"), "--corpus=" + name, "--offset=" + off, "--limit=" + lim],
        { encoding: "utf8", timeout: CHUNK_MS, maxBuffer: 8 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] });
    } catch (e) { out = null; }

    if (!out) { merged.counts[TIMEOUT] += lim; continue; }   // chunk died: count as hung
    let r;
    try { r = JSON.parse(out.trim().split("\n").pop()); } catch (e) { merged.counts[TIMEOUT] += lim; continue; }

    for (const k of Object.keys(r.counts)) merged.counts[k] = (merged.counts[k] || 0) + r.counts[k];
    merged.failures.push(...r.failures);
    merged.groupLabel = r.groupLabel;
    if (r.note) merged.note = r.note;
    for (const g of Object.keys(r.byGroup)) {
      merged.byGroup[g] = merged.byGroup[g] || { total: 0, correct: 0 };
      merged.byGroup[g].total += r.byGroup[g].total;
      merged.byGroup[g].correct += r.byGroup[g].correct;
    }
    merged.total += r.total;
  }
  merged.name = name;
  return merged;
}

function corpusSize(name) {
  return JSON.parse(fs.readFileSync(path.join(BENCH, "corpora", name + ".json"), "utf8")).problems.length;
}

/* ---- integration corpus ----
   Runs baseline.js (already chunked) and reads the JSON snapshot it writes rather than
   scraping its stdout: a regex over formatted output silently returned 0 for "refused"
   because of double-escaped parens, which understated the safe-failure count to zero. */
function runIntegration() {
  execFileSync(process.execPath,
    [path.join(BENCH, "baseline.js"), "--corpus=syllabus"],
    { encoding: "utf8", maxBuffer: 32 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] });

  const files = fs.readdirSync(SNAP).filter((f) => f.startsWith("corpus-syllabus-")).sort();
  if (!files.length) throw new Error("baseline.js wrote no corpus snapshot");
  const s = JSON.parse(fs.readFileSync(path.join(SNAP, files[files.length - 1]), "utf8"));

  return {
    name: "integration", total: s.total,
    counts: {
      [CORRECT]: s.correct, [WRONG]: s.wrong, [REFUSED]: s.refused,
      [UNVERIFIABLE]: s.unverifiable, [TIMEOUT]: s.timeout || 0, [MISSING]: 0
    },
    failures: [], byGroup: s.bySteps || {}, groupLabel: "Rubi difficulty"
  };
}

/* ---- reporting ---- */
function pct(n, d) { return d ? ((n / d) * 100).toFixed(1) + "%" : "—"; }

function line(label, n, d) {
  return `    ${label.padEnd(22)} ${String(n).padStart(4)}/${String(d).padEnd(4)} ${pct(n, d).padStart(7)}`;
}

function report(r) {
  const t = r.total, c = r.counts;
  console.log(`\n=== ${r.name.toUpperCase()} (${t} problems) ===\n`);
  if (r.note) console.log(`  NOTE: ${r.note}\n`);
  console.log(line("correct", c[CORRECT], t));
  console.log(line("SILENTLY WRONG", c[WRONG], t) + (c[WRONG] ? "   <-- worst outcome" : ""));
  console.log(line("refused (safe)", c[REFUSED], t));
  if (c[UNVERIFIABLE]) console.log(line("unverifiable", c[UNVERIFIABLE], t));
  if (c[TIMEOUT]) console.log(line("TIMEOUT / hung", c[TIMEOUT], t));
  if (c[MISSING]) console.log(line("MISSING (not built)", c[MISSING], t) + "   <-- coverage gap");

  const impl = t - c[MISSING];
  if (c[MISSING]) {
    console.log(`\n    of what IS built:   ${c[CORRECT]}/${impl} = ${pct(c[CORRECT], impl)}`);
    console.log(`    of the syllabus:    ${c[CORRECT]}/${t} = ${pct(c[CORRECT], t)}`);
  }

  const groups = Object.keys(r.byGroup);
  if (groups.length) {
    console.log(`\n  by ${r.groupLabel}:`);
    for (const g of groups.sort()) {
      const b = r.byGroup[g];
      console.log(line("  " + g, b.correct, b.total));
    }
  }
  if (r.failures.length) {
    console.log(`\n  failures (${r.failures.length}):`);
    for (const f of r.failures.slice(0, 12)) {
      console.log(`    ${String(f.cls).padEnd(8)} ${String(f.eq).slice(0, 52).padEnd(54)} [${f.family}]${f.detail ? " " + f.detail : ""}`);
    }
  }
}

/* ---- main ---- */
console.log("\n########  PHASE 0 GATE — baseline coverage, every engine  ########");

const results = [];
if (!QUICK) {
  process.stdout.write("\n  integration corpus (875, this takes a few minutes)...");
  results.push(runIntegration());
  process.stdout.write(" done\n");
} else {
  console.log("\n  (--quick: integration corpus skipped)");
}
for (const name of ["ode", "pde", "complex"]) {
  process.stdout.write(`  ${name} corpus...`);
  results.push(runEngineCorpus(name, corpusSize(name)));
  process.stdout.write(" done\n");
}

for (const r of results) report(r);

console.log("\n=== SUMMARY ===\n");
console.log(`    ${"engine".padEnd(14)} ${"correct".padStart(12)} ${"wrong".padStart(8)} ${"missing".padStart(9)}`);
for (const r of results) {
  console.log(`    ${r.name.padEnd(14)} ${(r.counts[CORRECT] + "/" + r.total).padStart(12)} ${String(r.counts[WRONG]).padStart(8)} ${String(r.counts[MISSING] || 0).padStart(9)}`);
}

if (!NOSNAP) {
  if (!fs.existsSync(SNAP)) fs.mkdirSync(SNAP, { recursive: true });
  const snap = {
    timestamp: new Date().toISOString(), git: gitRev(), kind: "phase0-all",
    engines: results.map((r) => ({
      name: r.name, total: r.total, counts: r.counts, byGroup: r.byGroup,
      failures: r.failures.slice(0, 40)
    }))
  };
  const f = path.join(SNAP, "all-" + snap.timestamp.replace(/[:.]/g, "-") + ".json");
  fs.writeFileSync(f, JSON.stringify(snap, null, 2));
  console.log(`\n  snapshot: tests/bench/snapshots/${path.basename(f)}`);
}
console.log("");
