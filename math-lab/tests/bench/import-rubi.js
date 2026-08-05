"use strict";
/* Rubi corpus importer — Phase 0 of docs/kernel/04_BUILD_PHASES.md.

   Turns the Rubi project's Maxima-syntax test suite (MIT, 72,254 problems across 215 files)
   into JSON corpora this repo's benchmark harness can run.

   Usage:
     node tests/bench/import-rubi.js              download if needed, then parse
     node tests/bench/import-rubi.js --src=DIR    parse an existing checkout
     node tests/bench/import-rubi.js --no-download parse only what is already on disk

   Source: https://github.com/RuleBasedIntegration/MaximaSyntaxTestSuite  (MIT licence)
   Maxima syntax is used rather than the Mathematica original because it is infix and maps
   almost one-to-one onto math.js / nerdamer. NOTE: the Maxima *program* is GPL, but this is
   the Rubi organisation's own test data re-expressed in Maxima notation and is MIT-licensed —
   see docs/kernel/06_DATA_SOURCES.md §1.

   Each source entry is  [integrand, variable, optimalSteps, expectedAntiderivative]  where
   optimalSteps is the number of rule applications Rubi needs — a genuine difficulty rating,
   which is why it is carried through into the corpus.

   TWO CORPORA ARE PRODUCED:
     rubi-syllabus.json  Stewart's textbook problems — matches CURRICULUM_ROADMAP.md §2's
                         stated textbook basis, so this is the corpus that defines "done".
     rubi-full.json      everything, as the stretch measure. Not committed: regenerate on
                         demand, it is large. */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const BENCH = __dirname;
const CORPORA = path.join(BENCH, "corpora");
const SRC_DEFAULT = path.join(CORPORA, ".rubi-src");
const TARBALL = "https://github.com/RuleBasedIntegration/MaximaSyntaxTestSuite/archive/refs/heads/master.tar.gz";

const args = process.argv.slice(2);
const argSrc = (args.find((a) => a.startsWith("--src=")) || "").split("=")[1];
const NO_DOWNLOAD = args.includes("--no-download");
const SRC = argSrc || SRC_DEFAULT;

/* The syllabus subset. Stewart is the textbook CURRICULUM_ROADMAP.md §2 names for the
   Calculus engine, so its problem set is exactly the scope "closed over a corpus" means.
   The other three are small, classic, undergraduate-level sets used to broaden it slightly
   without drifting into research-grade integrals. */
const SYLLABUS_FILES = [
  "Stewart Problems.mac",
  "Apostol Problems.mac",
  "Moses Problems.mac",
  "Hearn Problems.mac"
];

/* Anything mentioning these is outside an undergraduate syllabus: the answer is a special
   function no first-course student has met, so a failure to produce it is not a defect worth
   counting. They stay in the full corpus and are excluded from the syllabus one. */
const SPECIAL_FUNCTIONS = [
  "polylog", "elliptic_f", "elliptic_e", "elliptic_pi", "elliptic_kc", "elliptic_ec",
  "hypergeometric", "erf", "erfi", "erfc", "expintegral", "gamma_incomplete", "gamma_greek",
  "li", "nintegrable", "unintegrable", "beta_incomplete", "fresnel", "airy",
  "bessel", "struve", "zeta", "psi", "barnes", "signum", "kron_delta"
];

/* ---------------------------------------------------------------- download */
function ensureSource() {
  if (fs.existsSync(SRC) && fs.readdirSync(SRC).length) return;
  if (NO_DOWNLOAD) {
    throw new Error("No Rubi source at " + SRC + " and --no-download was given.");
  }
  fs.mkdirSync(SRC, { recursive: true });
  console.log("  downloading Rubi Maxima test suite (~5 MB)...");
  const tgz = path.join(SRC, "master.tar.gz");
  execSync(`curl -sSL "${TARBALL}" -o "${tgz}"`, { stdio: "inherit" });
  execSync(`tar xzf "${tgz}" -C "${SRC}"`, { stdio: "inherit" });
  fs.unlinkSync(tgz);
}

function walk(dir, out) {
  out = out || [];
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const st = fs.statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (name.endsWith(".mac")) out.push(full);
  }
  return out;
}

/* ---------------------------------------------------------- syntax mapping */

function matchParen(s, open) {
  let d = 0;
  for (let i = open; i < s.length; i++) {
    if (s[i] === "(") d++;
    else if (s[i] === ")") { d--; if (d === 0) return i; }
  }
  return -1;
}

/* %e^X -> exp(X). Done structurally rather than by regex so that %e^(a+b*x) keeps its whole
   exponent. Must run BEFORE parameter renaming, otherwise the `e` in `%e` is mistaken for
   Rubi's parameter `e` (which really does occur, e.g. in "(e x)^m (a+b x^n)^p"). */
function eulerToExp(s) {
  let out = "", i = 0;
  while (i < s.length) {
    const at = s.indexOf("%e", i);
    if (at === -1) { out += s.slice(i); break; }
    out += s.slice(i, at);
    let j = at + 2;
    if (s[j] === "^") {
      j++;
      let arg;
      if (s[j] === "(") {
        const close = matchParen(s, j);
        if (close === -1) { out += "exp(1)"; i = at + 2; continue; }
        arg = s.slice(j + 1, close);
        j = close + 1;
      } else {
        // a bare token exponent: %e^x, %e^2, %e^-3
        let k = j;
        if (s[k] === "-" || s[k] === "+") k++;
        while (k < s.length && /[A-Za-z0-9_.]/.test(s[k])) k++;
        arg = s.slice(j, k);
        j = k;
      }
      out += "exp(" + arg + ")";
    } else {
      out += "exp(1)";
    }
    i = j;
  }
  return out;
}

const CONST_MAP = [[/%pi/g, "pi"], [/%i\b/g, "i"], [/%gamma/g, "0.5772156649015329"]];

/* Function names math.js knows, plus the integration variable, are never treated as free
   parameters. Everything else that looks like a bare identifier is a Rubi parameter. */
const KNOWN_FUNCS = new Set([
  "sin", "cos", "tan", "sec", "csc", "cot", "asin", "acos", "atan", "asec", "acsc", "acot",
  "sinh", "cosh", "tanh", "sech", "csch", "coth", "asinh", "acosh", "atanh", "asech", "acsch",
  "acoth", "log", "exp", "sqrt", "abs", "sign", "integrate", "pi", "i", "e", "nthRoot"
]);

function freeSymbols(expr, variable) {
  const found = new Set();
  const re = /([A-Za-z_][A-Za-z_0-9]*)\s*(\()?/g;
  let m;
  while ((m = re.exec(expr)) !== null) {
    const name = m[1];
    if (m[2] === "(") continue;            // a function call, not a symbol
    if (KNOWN_FUNCS.has(name)) continue;
    if (name === variable) continue;
    found.add(name);
  }
  return [...found];
}

/* Rename free parameters to p1, p2, ... so none of them can collide with a math.js constant.
   `e` is the dangerous one: math.js resolves a bare `e` to Euler's number, so a Rubi problem
   using `e` as a coefficient would silently evaluate against 2.718 instead of the value the
   verifier substitutes. Renaming removes the whole class of error. */
function renameParams(expr, answer, variable) {
  const syms = new Set([...freeSymbols(expr, variable), ...freeSymbols(answer, variable)]);
  const ordered = [...syms].sort();
  const map = {};
  ordered.forEach((s, k) => { map[s] = "p" + (k + 1); });
  const apply = (str) => str.replace(/[A-Za-z_][A-Za-z_0-9]*/g, (name, off, whole) => {
    if (whole[off + name.length] === "(") return name;      // function call
    return Object.prototype.hasOwnProperty.call(map, name) ? map[name] : name;
  });
  return { expr: apply(expr), answer: apply(answer), params: ordered.map((s) => map[s]) };
}

function toMathJs(s) {
  let out = eulerToExp(s);
  for (const [re, rep] of CONST_MAP) out = out.replace(re, rep);
  return out.trim();
}

/* ------------------------------------------------------------------ parse */

/* Entries are one per line, `[integrand, var, steps, answer],`, with a handful spanning two
   lines. Rather than a bracket-counting state machine, lines are accumulated until the
   brackets balance — simpler and it handles the rare wrapped entry correctly. */
function parseFile(file) {
  const text = fs.readFileSync(file, "utf8");
  const lines = text.split(/\r?\n/);
  const entries = [];
  let section = "";
  let buf = "";

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (!buf && /^\/\*/.test(line)) {                 // section comment
      const c = line.replace(/^\/\*\s*/, "").replace(/\s*\*\/$/, "").trim();
      if (c && !/^Maxima integration test file/i.test(c)) section = c;
      continue;
    }
    if (!buf && !line.startsWith("[")) continue;      // `lst: '[` and other scaffolding

    buf += (buf ? " " : "") + line;
    let depth = 0;
    for (const ch of buf) { if (ch === "[") depth++; else if (ch === "]") depth--; }
    if (depth !== 0) continue;                        // wrapped entry — keep accumulating

    const body = buf.replace(/,\s*$/, "").replace(/^\[/, "").replace(/\]$/, "");
    buf = "";

    // split on top-level commas only
    const parts = [];
    let cur = "", d = 0;
    for (const ch of body) {
      if (ch === "(" || ch === "[") d++;
      else if (ch === ")" || ch === "]") d--;
      if (ch === "," && d === 0) { parts.push(cur); cur = ""; }
      else cur += ch;
    }
    parts.push(cur);
    if (parts.length < 4) continue;

    const integrandRaw = parts[0].trim();
    const variable = parts[1].trim();
    const steps = parseInt(parts[2].trim(), 10);
    const answerRaw = parts.slice(3).join(",").trim();
    if (!integrandRaw || !variable) continue;

    const integrand0 = toMathJs(integrandRaw);
    const answer0 = toMathJs(answerRaw);
    const renamed = renameParams(integrand0, answer0, variable);

    const blob = (integrandRaw + " " + answerRaw).toLowerCase();
    const special = SPECIAL_FUNCTIONS.filter((f) => blob.includes(f + "("));

    entries.push({
      integrand: renamed.expr,
      variable: variable,
      steps: Number.isFinite(steps) ? steps : null,
      expected: renamed.answer,
      params: renamed.params,
      section: section,
      source: path.basename(file),
      special: special.length ? special : undefined
    });
  }
  return entries;
}

/* ------------------------------------------------------------------- main */

console.log("Rubi corpus importer\n");
ensureSource();

const root = fs.existsSync(path.join(SRC, "MaximaSyntaxTestSuite-master"))
  ? path.join(SRC, "MaximaSyntaxTestSuite-master")
  : SRC;

const files = walk(root);
console.log(`  ${files.length} .mac files found`);

let all = [];
for (const f of files) {
  try { all = all.concat(parseFile(f)); }
  catch (e) { console.error(`  skipped ${path.basename(f)}: ${e.message}`); }
}
console.log(`  ${all.length} problems parsed`);

const syllabus = all.filter((p) =>
  SYLLABUS_FILES.includes(p.source) && !p.special && p.variable === "x");

const withSpecial = all.filter((p) => p.special).length;
const withParams = all.filter((p) => p.params.length).length;

fs.mkdirSync(CORPORA, { recursive: true });
fs.writeFileSync(path.join(CORPORA, "rubi-syllabus.json"), JSON.stringify({
  source: "RuleBasedIntegration/MaximaSyntaxTestSuite (MIT)",
  generated: new Date().toISOString(),
  description: "Undergraduate syllabus subset — Stewart/Apostol/Moses/Hearn, special functions excluded",
  files: SYLLABUS_FILES,
  count: syllabus.length,
  problems: syllabus
}, null, 1));

fs.writeFileSync(path.join(CORPORA, "rubi-full.json"), JSON.stringify({
  source: "RuleBasedIntegration/MaximaSyntaxTestSuite (MIT)",
  generated: new Date().toISOString(),
  description: "Full Rubi test suite — stretch measure, not the definition of done",
  count: all.length,
  problems: all
}, null, 1));

console.log(`\n  syllabus corpus : ${syllabus.length} problems  -> corpora/rubi-syllabus.json`);
console.log(`  full corpus     : ${all.length} problems  -> corpora/rubi-full.json`);
console.log(`\n  of the full set: ${withSpecial} involve special functions, ${withParams} carry symbolic parameters`);
console.log(`\n  sample syllabus entries:`);
for (const p of syllabus.slice(0, 5)) {
  console.log(`    [${String(p.steps).padStart(2)} steps] ∫ ${p.integrand}  d${p.variable}`);
  console.log(`               = ${p.expected}`);
}
