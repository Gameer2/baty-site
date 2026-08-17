"use strict";
/* Runs every verify-*.js correctness suite in this directory as a subprocess and reports one
   aggregate pass/fail — the thing that was missing: each file already runs known-textbook-answer
   checks against the exact code the site ships (see verify-calculus.js's header for why these
   assert on differentiate-back / independent-recheck behavior rather than string equality), but
   nothing ran them all together with a single exit code a human or CI could gate on.

   Run with: node tests/run-all.js

   Does NOT cover the 7 Pyodide/SymPy-backed operations (ODE solving, ODE systems, series
   solutions, Laplace transforms, contour integration, real integrals by residues, Laurent
   singularities) — those have no automated correctness test anywhere yet (see each engine's
   ode-solver.js/ode-systems.js/etc. header comments); only their pure-JS helper functions are
   covered here via verify-ode-systems.js and friends. That gap needs a Pyodide-in-Node harness,
   which this script does not attempt. */

const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const HERE = __dirname;
const SELF = path.basename(__filename);

const files = fs
  .readdirSync(HERE)
  .filter((f) => f.startsWith("verify") && f.endsWith(".js") && f !== SELF)
  .sort();

console.log(`Running ${files.length} verification suites…\n`);

const results = [];
for (const file of files) {
  const start = Date.now();
  try {
    const output = execFileSync(process.execPath, [path.join(HERE, file)], {
      encoding: "utf8",
    });
    const ms = Date.now() - start;
    const summary = output.trim().split("\n").pop();
    console.log(`ok    ${file}  (${ms}ms)  ${summary}`);
    results.push({ file, ok: true, summary });
  } catch (err) {
    const ms = Date.now() - start;
    const output = (err.stdout || "") + (err.stderr || "");
    const summary = output.trim().split("\n").filter(Boolean).pop() || err.message;
    console.error(`FAIL  ${file}  (${ms}ms)  ${summary}`);
    // Show the actual FAIL lines, not just the last line, so a failure is diagnosable from this
    // aggregate run alone without re-running the file by hand.
    for (const line of output.split("\n")) {
      if (line.includes("FAIL")) {
        console.error(`        ${line.trim()}`);
      }
    }
    results.push({ file, ok: false, summary });
  }
}

const failed = results.filter((r) => !r.ok);
console.log(
  `\n${results.length - failed.length}/${results.length} suites passed.`,
);
if (failed.length) {
  console.error(`Failed: ${failed.map((r) => r.file).join(", ")}`);
}
process.exit(failed.length ? 1 : 0);
