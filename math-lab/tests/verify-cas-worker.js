"use strict";
/* CAS worker boot — verification suite.
   Run with: node tests/verify-cas-worker.js

   Boots the real assets/js/cas-worker.js inside a sandbox that emulates the worker global
   scope (a `self`, a `postMessage`, and an `importScripts` that resolves paths off the
   worker file's own directory, exactly as a browser does).

   Node has no Web Workers, so without this the worker file would ship completely untested —
   and its most likely failure is silent and total: one wrong relative path in importScripts
   and every symbolic page stops working, with nothing in any other suite noticing. */

const fs = require("fs");
const vm = require("vm");
const path = require("path");

const JS_DIR = path.join(__dirname, "..", "assets", "js");

let pass = 0;
let fail = 0;

function ok(cond, label, detail) {
  if (cond) { pass++; console.log(`  ok    ${label}${detail ? ": " + detail : ""}`); }
  else { fail++; console.error(`  FAIL  ${label}${detail ? ": " + detail : ""}`); }
}

console.log("CAS worker boot — verification suite\n");

const sandbox = { console: { log() {}, warn() {}, error() {} }, setTimeout, clearTimeout };
sandbox.self = sandbox;
sandbox.window = sandbox;
const posted = [];
sandbox.postMessage = (m) => posted.push(m);

const imported = [];
sandbox.importScripts = function (...urls) {
  for (const u of urls) {
    const p = path.resolve(JS_DIR, u);
    if (!fs.existsSync(p)) throw new Error("importScripts could not resolve " + u);
    imported.push(u);
    vm.runInContext(fs.readFileSync(p, "utf8"), sandbox);
  }
};

vm.createContext(sandbox);

let booted = true;
try {
  vm.runInContext(fs.readFileSync(path.join(JS_DIR, "cas-worker.js"), "utf8"), sandbox);
} catch (e) {
  booted = false;
  ok(false, "cas-worker.js boots", e.message);
}

if (booted) {
  ok(true, "cas-worker.js boots and all importScripts paths resolve", imported.join(", "));
  ok(typeof sandbox.onmessage === "function", "installs an onmessage handler");
  ok(posted.length === 1 && posted[0].id === "__ready__", "signals readiness once booted");

  // The bundle is generated (tools/build-kernel-bundle.js) from the kernel source files and
  // committed so cas-worker.js has one file to importScripts (see that file's comment for
  // why it can't just importScripts the kernel files directly). A source edit with no
  // regenerate would silently ship a stale kernel to the worker while every Node-side kernel
  // test — which requires() the source files directly — kept passing. Rebuild in memory and
  // diff against what's on disk so that drift fails loudly here instead.
  const { build, OUT_FILE } = require(path.join(__dirname, "..", "tools", "build-kernel-bundle.js"));
  const committed = fs.readFileSync(OUT_FILE, "utf8");
  ok(build() === committed,
     "kernel bundle.generated.js matches the kernel source (run: node tools/build-kernel-bundle.js)");

  ok(sandbox.KernelBridge && typeof sandbox.KernelBridge.simplify === "function",
     "the worker's self.KernelBridge is live (loaded from the kernel bundle)");
  ok(sandbox.KernelBridge && sandbox.KernelBridge.sqrtDifferenceOfSquaresValidUnderGT() === true,
     "worker-side kernel confirms the Phase 1 gate fact: sqrt(x^2-a^2) valid under x>a");

  const send = (msg) => { posted.length = 0; sandbox.onmessage({ data: msg }); return posted[0]; };

  {
    const r = send({ id: 1, op: "uSubstitution", args: ["x*sin(x^2)", "x"] });
    ok(r && r.ok && r.result.ok && r.result.result === "(-1/2)*cos(x^2)",
       "dispatches uSubstitution and returns the symbolic result", r && r.result && r.result.result);
    ok(r.id === 1, "echoes the request id so the client can match the reply");
    // Structured clone would reject functions or class instances; the contract is plain data.
    let cloneable = true;
    try { JSON.parse(JSON.stringify(r.result)); } catch (e) { cloneable = false; }
    ok(cloneable, "the result is plain JSON-shaped data (survives structured clone)");
  }
  {
    const r = send({ id: 2, op: "limit", args: ["(1-cos(x))/x^2", "x", 0] });
    ok(r && r.ok && r.result.value === "1/2", "dispatches limit and returns an exact value", r && r.result && r.result.value);
  }
  {
    const r = send({ id: 6, op: "taylorSeries", args: ["e^x", "x", 0, 3] });
    ok(r && r.ok && r.result.ok && Math.abs(r.result.coeffs[3] - 1 / 6) < 1e-9,
       "dispatches taylorSeries and returns the polynomial coefficients", r && r.result && r.result.result);
  }
  {
    const r = send({ id: 7, op: "lhopital", args: ["sin(x)/x", "x", 0] });
    ok(r && r.ok && r.result.ok && r.result.value === "1", "dispatches lhopital and returns an exact value", r && r.result && r.result.value);
  }
  {
    const r = send({ id: 8, op: "curveAnalysis", args: ["x^3-3*x", "x", -3, 3] });
    ok(r && r.ok && r.result.ok && r.result.criticalPoints.length === 2,
       "dispatches curveAnalysis and returns critical points", r && r.result && r.result.criticalPoints);
  }
  {
    const r = send({ id: 9, op: "appliedOptimization", args: ["x*(200-2*x)", "x", 0, 100, "max"] });
    ok(r && r.ok && r.result.ok && Math.abs(r.result.x - 50) < 1e-6,
       "dispatches appliedOptimization and returns the optimum", r && r.result && r.result.x);
  }
  {
    const r = send({ id: 10, op: "integrationByParts", args: ["x*e^x", "x"] });
    ok(r && r.ok && r.result.ok && r.result.u === "x", "dispatches integrationByParts and picks u by LIATE", r && r.result && r.result.u);
  }
  {
    const r = send({ id: 11, op: "partialFractions", args: ["1/(x^2-1)", "x"] });
    ok(r && r.ok && r.result.ok && r.result.technique === "partial-fractions" && r.result.verified,
       "dispatches partialFractions and returns a verified decomposition", r && r.result && r.result.technique);
  }
  {
    const r = send({ id: 12, op: "trigSubstitution", args: ["sqrt(4-x^2)", "x"] });
    ok(r && r.ok && r.result.ok && r.result.technique === "trigonometric-substitution" && r.result.verified,
       "dispatches trigSubstitution and returns a verified antiderivative", r && r.result && r.result.technique);
  }
  {
    // The two techniques from integration-advanced.js. Both are integrals nerdamer refuses or
    // answers wrongly on its own, so a verified result here proves the module is genuinely
    // reachable through the worker rather than merely present in the bundle.
    const r = send({ id: 121, op: "algebraicSubstitution", args: ["x*sqrt(x+1)", "x"] });
    ok(r && r.ok && r.result.ok && r.result.technique === "algebraic substitution" && r.result.verified,
       "dispatches algebraicSubstitution and returns a verified antiderivative", r && r.result && r.result.result);
  }
  {
    const r = send({ id: 122, op: "completeTheSquare", args: ["1/(x^2+2*x+5)", "x"] });
    ok(r && r.ok && r.result.ok && r.result.technique === "completing the square" && r.result.verified,
       "dispatches completeTheSquare and returns a verified antiderivative", r && r.result && r.result.result);
  }
  {
    const r = send({ id: 13, op: "convergenceTests", args: ["1/n^2", "n"] });
    ok(r && r.ok && r.result.ok && r.result.verdict === "converges" && r.result.verified,
       "dispatches convergenceTests and returns a verified verdict", r && r.result && r.result.verdict);
  }
  {
    const r = send({ id: 14, op: "powerSeries", args: ["1/n", "x", 0] });
    ok(r && r.ok && r.result.ok && r.result.radius === 1 && r.result.interval === "[-1, 1)" && r.result.verified,
       "dispatches powerSeries and returns the radius, interval, and endpoints", r && r.result && r.result.interval);
  }
  {
    const r = send({ id: 15, op: "vectorOps", args: ["cross", [["1","2","3"],["4","5","6"]]] });
    ok(r && r.ok && r.result.ok && r.result.kind === "vector" && r.result.verified &&
       Math.abs(r.result.numeric[0] + 3) < 1e-9 && Math.abs(r.result.numeric[1] - 6) < 1e-9,
       "dispatches vectorOps (cross) and returns a verified vector", r && r.result && r.result.numeric);
  }
  {
    const r = send({ id: 16, op: "partialDerivatives", args: ["x^2*y^3", ["x","y"], ["1","2"]] });
    ok(r && r.ok && r.result.ok && r.result.technique === "partial-derivatives" && r.result.verified &&
       r.result.gradAtPointNum[0] === 16 && r.result.gradAtPointNum[1] === 12,
       "dispatches partialDerivatives and returns the gradient at the point", r && r.result && r.result.gradAtPointNum);
  }
  {
    const r = send({ id: 17, op: "volumeOfRevolution", args: ["x^2", "x", "0", "2", { method: "disk" }] });
    ok(r && r.ok && r.result.ok && r.result.technique === "volume-of-revolution" && r.result.verified &&
       /pi/.test(r.result.volume) && Math.abs(r.result.numeric - 32 * Math.PI / 5) < 1e-3,
       "dispatches volumeOfRevolution and returns an exact π-symbolic volume", r && r.result && r.result.volume);
  }
  {
    const r = send({ id: 18, op: "multipleIntegral", args: ["x*y", { mode: "cartesian", a: "0", b: "1", lower: "0", upper: "x" }] });
    ok(r && r.ok && r.result.ok && r.result.technique === "multiple-integral" && r.result.verified &&
       Math.abs(r.result.numeric - 1 / 8) < 1e-9,
       "dispatches multipleIntegral and returns a verified iterated-integral value", r && r.result && r.result.value);
  }
  {
    const r = send({ id: 19, op: "lagrangeMultipliers", args: ["x*y", "x^2+y^2", "1", ["x", "y"], { range: 3 }] });
    ok(r && r.ok && r.result.ok && r.result.technique === "lagrange-multipliers" && r.result.verified &&
       r.result.points.length === 4 && Math.abs(r.result.max.value - 0.5) < 1e-6,
       "dispatches lagrangeMultipliers and returns the verified critical points", r && r.result && r.result.points);
  }
  {
    const r = send({ id: 20, op: "relatedRates", args: ["x^2+y^2=25", ["x","y"], {x:3,y:4}, {x:2}, "y"] });
    ok(r && r.ok && r.result.ok && r.result.technique === "related-rates" && r.result.verified &&
       Math.abs(r.result.numeric - (-1.5)) < 1e-6,
       "dispatches relatedRates and returns a verified rate", r && r.result && r.result.result);
  }
  {
    const r = send({ id: 23, op: "solveHeatEquation", args: [{ L: Math.PI, k: 1, fxExpr: "sin(x)", N: 3, T: 1 }] });
    ok(r && r.ok && r.result.bn && r.result.bn.length === 3 && Math.abs(r.result.bn[0] - 1) < 1e-3,
       "dispatches solveHeatEquation and returns Fourier coefficients (no unclonable closure)", r && r.result && r.result.bn);
    let cloneable = true;
    try { JSON.parse(JSON.stringify(r.result)); } catch (e) { cloneable = false; }
    ok(cloneable, "solveHeatEquation result is plain JSON-shaped data (survives structured clone, no u(x,t) closure)");
  }
  {
    const r = send({ id: 24, op: "cauchyRiemann", args: ["exp(z)", [0.4, -0.7]] });
    ok(r && r.ok && r.result.ok && r.result.verdict === "analytic" && r.result.verified,
       "dispatches cauchyRiemann and returns a verified analytic verdict for exp(z)", r && r.result && r.result.verdict);
  }
  {
    const r = send({ id: 25, op: "harmonicConjugate", args: ["x^2-y^2", [0, 0]] });
    ok(r && r.ok && r.result.ok && r.result.verified && r.result.v === "2*x*y",
       "dispatches harmonicConjugate and returns the verified conjugate", r && r.result && r.result.v);
  }
  {
    // The op table is a whitelist, so an unexpected name is refused rather than reaching
    // anything on the worker's global scope.
    const r = send({ id: 3, op: "constructor", args: [] });
    ok(r && r.ok === false && /Unknown operation/.test(r.error),
       "refuses an operation that is not on the whitelist", r && r.error);
  }
  {
    const r = send({ id: 4, op: "limit", args: ["x", "x", "banana"] });
    ok(r && r.ok === false && /must be a number/.test(r.error),
       "turns a thrown engine error into a failed reply, not a dead worker", r && r.error);
  }
  {
    // A worker that dies on one bad request would take every later request with it.
    const r = send({ id: 5, op: "limit", args: ["sin(x)/x", "x", 0] });
    ok(r && r.ok && r.result.value === "1", "still answers correctly after an error", r && r.result && r.result.value);
  }
}

console.log(`\n${pass} passed, ${fail} failed.`);
process.exit(fail ? 1 : 0);
