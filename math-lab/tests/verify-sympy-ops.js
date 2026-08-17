"use strict";
/* SymPy/Pyodide worker — verification suite for the 13 operations in sympy-worker.js's OPS
   table (see that file's own header for why it's a separate worker from cas-worker.js). Unlike
   every other verify-*.js file here, this is the one engine layer that had NO automated
   correctness test at all before this file — sympy-worker.js's own comment on `_dsolve_system`
   used to say "it is NOT unit tested here; it's verified manually in a browser." The 7 of these
   13 ops the canvas Syntropy nodes actually reach (solveOde -> dsolveGeneral, solveOdeSystems ->
   dsolveSystem, seriesSolutions -> seriesSolution, laplaceTransform -> laplaceTransform,
   contourIntegration -> singularitiesWithResidues, realIntegralsResidues ->
   realIntegralByResidues, laurentSingularities -> classifySingularity + laurentSeries) are the
   ones whose correctness a published site's users would actually be relying on.

   Runs the EXACT Python source sympy-worker.js ships — extracted verbatim from the file at
   import time (see extractPythonSource below), not retyped here — so this can never drift from
   what the real worker executes, the same "run the exact code the pages ship" discipline
   verify-calculus.js's header describes.

   Where a closed-form answer is well known (a Laplace transform pair, a classic limit), cases
   assert against that known answer directly. Where the result contains arbitrary constants or
   a series with no single canonical string form, cases independently re-derive the checkable
   property in a *fresh* sympy call the function under test never sees (does the solution
   actually satisfy the original ODE/integral/transform?) — same principle as
   verify-ode-systems.js's own verifySystem, just written once here for the ops that call SymPy
   directly instead of going through that JS-side checker.

   Requires the `pyodide` devDependency (math-lab/package.json) — boots and loads sympy once at
   startup (~3-5s the first time; sympy is cached under node_modules/pyodide after that), which
   is why this is its own file rather than folded into run-all.js's fast suites; run-all.js still
   picks it up like any other verify-*.js.

   Run with: node tests/verify-sympy-ops.js */

const fs = require("fs");
const path = require("path");

const PYODIDE_PATH = path.join(__dirname, "..", "node_modules", "pyodide");
if (!fs.existsSync(PYODIDE_PATH)) {
  console.error(
    "The pyodide devDependency isn't installed. Run `npm install` in math-lab/ first, then " +
      "re-run this file (or tests/run-all.js).",
  );
  process.exit(1);
}
const { loadPyodide } = require(PYODIDE_PATH);

const WORKER_PATH = path.join(__dirname, "..", "assets", "js", "sympy-worker.js");

let pass = 0;
let fail = 0;

function ok(cond, label, detail) {
  if (cond) {
    pass++;
    console.log(`  ok    ${label}${detail ? ": " + detail : ""}`);
  } else {
    fail++;
    console.error(`  FAIL  ${label}${detail ? ": " + detail : ""}`);
  }
  return cond;
}

/** Pulls the Python source verbatim out of sympy-worker.js's `pyodide.runPythonAsync(\`...\`)`
 *  boot block, between the two literal markers the file always has (see its bootPyodide). */
function extractPythonSource() {
  const src = fs.readFileSync(WORKER_PATH, "utf8");
  const startMarker = "pyodide.runPythonAsync(`";
  const start = src.indexOf(startMarker);
  if (start === -1) {
    throw new Error(
      "Couldn't find the Python boot block in sympy-worker.js — has its shape changed?",
    );
  }
  const bodyStart = start + startMarker.length;
  const end = src.indexOf("\n`);", bodyStart);
  if (end === -1) {
    throw new Error(
      "Couldn't find the end of the Python boot block in sympy-worker.js — has its shape changed?",
    );
  }
  return src.slice(bodyStart, end);
}

/** Calls one of the extracted `_xxx` Python functions the same way sympy-worker.js's OPS table
 *  does — JSON-encode each JS arg into Python literal syntax (JSON and Python object/array/
 *  string/number literals agree; never pass `null`/`undefined`, matching production, which
 *  normalizes those to `[]`/omitted args one layer up in the JS engines before they ever reach
 *  this worker — see ode-systems.js's `ics ? ics.map(String) : []`). */
function callOp(pyodide, fn, ...args) {
  const pyArgs = args.map((a) => JSON.stringify(a)).join(", ");
  return pyodide.runPython(`${fn}(${pyArgs})`);
}

(async () => {
  console.log("SymPy worker (Pyodide) — verification suite\n");
  console.log("Booting Pyodide + sympy (first run downloads and caches the sympy wheel)…");

  const pythonSource = extractPythonSource();
  const pyodide = await loadPyodide();
  await pyodide.loadPackage("sympy");
  await pyodide.runPythonAsync(pythonSource);
  console.log("Ready.\n");

  // ---- integrate -----------------------------------------------------------------------
  console.log("_integrate:");
  {
    const result = callOp(pyodide, "_integrate", "x^2", "x");
    ok(result === "x**3/3", "∫x² dx = x³/3", result);

    // Independent check: differentiate the antiderivative in a fresh sympy call and compare
    // to the original integrand, rather than trusting _integrate's own simplify.
    const checks = pyodide.runPython(`
str(sp.simplify(sp.diff(sp.sympify("${result}"), sp.symbols("x")) - sp.sympify("x^2")))
`);
    ok(checks === "0", "d/dx of the returned antiderivative reproduces x² exactly");
  }

  // ---- limit -----------------------------------------------------------------------------
  console.log("\n_limit:");
  {
    ok(callOp(pyodide, "_limit", "sin(x)/x", "x", "0") === "1", "lim(sin(x)/x, x→0) = 1");
    ok(callOp(pyodide, "_limit", "1/x", "x", "Infinity") === "0", "lim(1/x, x→∞) = 0");
    ok(callOp(pyodide, "_limit", "(1+1/x)^x", "x", "Infinity") === "E", "lim((1+1/x)^x, x→∞) = e");
  }

  // ---- dsolveGeneral -----------------------------------------------------------------------
  console.log("\n_dsolve_general:");
  {
    const generalRaw = callOp(pyodide, "_dsolve_general", "y' - y", 1, []);
    const general = JSON.parse(generalRaw);
    ok(general.solution === "EXPLICIT:C1*exp(x)", "y' = y (general) -> C1*e^x", general.solution);

    const ivpRaw = callOp(pyodide, "_dsolve_general", "y' - y", 1, ["0", "1"]);
    const ivp = JSON.parse(ivpRaw);
    ok(ivp.solution === "EXPLICIT:exp(x)", "y' = y, y(0)=1 -> e^x", ivp.solution);

    // Independent check on a harder case with no single canonical string form (y'' + y = 0):
    // solve it, then verify the RETURNED expression satisfies the ODE via a fresh diff+simplify,
    // never trusting _dsolve_general's own internal simplification.
    const shoRaw = callOp(pyodide, "_dsolve_general", "y'' + y", 2, []);
    const sho = JSON.parse(shoRaw).solution.replace(/^EXPLICIT:/, "");
    const shoResidual = pyodide.runPython(`
_y = sp.sympify("${sho}")
_x = sp.symbols("x")
str(sp.simplify(sp.diff(_y, _x, 2) + _y))
`);
    ok(shoResidual === "0", "y'' + y = 0's returned solution satisfies the ODE (fresh check)", sho);
  }

  // ---- dsolveSystem --------------------------------------------------------------------
  console.log("\n_dsolve_system:");
  {
    const A = [
      [0, 1],
      [-1, 0],
    ];
    // General solution (no ICs) — verify components independently by substituting the RETURNED
    // x1(t), x2(t) back into x' = A x and checking the residual simplifies to zero for both
    // rows, a fresh sympy computation this function's own return value never touches.
    const generalRaw = callOp(pyodide, "_dsolve_system", A, [], []);
    const components = JSON.parse(generalRaw).components;
    ok(components.length === 2, "system x'=[[0,1],[-1,0]]x returns one component per state var");
    const residual = pyodide.runPython(`
_t = sp.symbols("t")
_x1 = sp.sympify("${components[0]}")
_x2 = sp.sympify("${components[1]}")
_r1 = sp.simplify(sp.diff(_x1, _t) - _x2)
_r2 = sp.simplify(sp.diff(_x2, _t) + _x1)
json.dumps([str(_r1), str(_r2)])
`);
    const [r1, r2] = JSON.parse(residual);
    ok(r1 === "0" && r2 === "0", "returned x1(t), x2(t) satisfy x'=[[0,1],[-1,0]]x (fresh check)");

    // With ICs x(0) = [1, 0]: known closed form is x1=cos(t), x2=-sin(t) — check numerically at
    // several points against math's own cos/sin, not against sympy's simplify of its own answer.
    const icsRaw = callOp(pyodide, "_dsolve_system", A, [], ["1", "0"]);
    const icsComponents = JSON.parse(icsRaw).components;
    const sampled = pyodide.runPython(`
_t = sp.symbols("t")
_x1 = sp.sympify("${icsComponents[0]}")
_x2 = sp.sympify("${icsComponents[1]}")
json.dumps([[float(_x1.subs(_t, tv)), float(_x2.subs(_t, tv))] for tv in [0.0, 0.5, 1.3, 2.0]])
`);
    const points = JSON.parse(sampled);
    const allMatch = [0.0, 0.5, 1.3, 2.0].every((t, i) => {
      const [x1, x2] = points[i];
      return Math.abs(x1 - Math.cos(t)) < 1e-9 && Math.abs(x2 + Math.sin(t)) < 1e-9;
    });
    ok(allMatch, "x(0)=[1,0] system solution matches [cos t, -sin t] at 4 sample points");
  }

  // ---- seriesSolution ---------------------------------------------------------------------
  console.log("\n_series_solution:");
  {
    // y'' + y = 0 about x=0 (ordinary point) — the classic sin/cos generator. Independently
    // check the returned series y(x) satisfies y'' + y = 0 to the textbook-correct order
    // (residual vanishes to O(x^(order-2)), from differentiating an O(x^order) series twice),
    // by re-differentiating it in a fresh sympy call and truncating the residual's own series.
    //
    // This exact check used to fail: sympy-worker.js requested n=order from sp.dsolve's
    // power-series hint, but for an equation whose independent solutions split into an
    // even-degree-only branch and an odd-degree-only branch (true whenever p, q have pure
    // parity about the expansion point, the common textbook case), that request leaves exactly
    // ONE of the two branches one recurrence-step short of true O(x^order) accuracy — verified
    // independently by numeric convergence at the time (error ratio ~32 per halving = O(x^5),
    // not the claimed O(x^6)). Fixed by requesting n=order+1 (see _series_solution's own
    // comment on that call) — this test now holds the tight, correct bound rather than the
    // margin the bug required.
    const raw = callOp(pyodide, "_series_solution", "y'' + y", "0", 6);
    const parsed = JSON.parse(raw);
    ok(parsed.kind === "ordinary", "y''+y=0 at x=0 is classified as an ordinary point");
    const residual = pyodide.runPython(`
_x = sp.symbols("x")
_y = sp.sympify("${parsed.y}")
_resid = sp.diff(_y, _x, 2) + _y
str(sp.series(_resid, _x, 0, 4).removeO())
`);
    ok(residual === "0", "series solution satisfies y''+y=0 to its full claimed order 6");

    // Same check for an odd requested order, which flips which branch was previously short —
    // guards against a fix that only happened to work for the even case above.
    const rawOdd = callOp(pyodide, "_series_solution", "y'' + y", "0", 7);
    const parsedOdd = JSON.parse(rawOdd);
    const residualOdd = pyodide.runPython(`
_x = sp.symbols("x")
_y = sp.sympify("${parsedOdd.y}")
_resid = sp.diff(_y, _x, 2) + _y
str(sp.series(_resid, _x, 0, 5).removeO())
`);
    ok(residualOdd === "0", "series solution satisfies y''+y=0 to its full claimed order 7");
  }

  // ---- laplaceTransform / inverseLaplaceTransform ------------------------------------------
  console.log("\n_laplace_transform_of / _inverse_laplace_transform_of:");
  {
    // The exact regression case sympy-worker.js's own comment calls out by name (a symbol-
    // assumption mismatch previously made this return exp(-2*x)/s instead of 1/(s+2)).
    ok(
      callOp(pyodide, "_laplace_transform_of", "exp(-2*x)") === "1/(s + 2)",
      "L{e^(-2x)} = 1/(s+2)",
    );
    ok(callOp(pyodide, "_laplace_transform_of", "1") === "1/s", "L{1} = 1/s");
    ok(
      callOp(pyodide, "_inverse_laplace_transform_of", "1/(s+2)") === "exp(-2*x)",
      "L⁻¹{1/(s+2)} = e^(-2x)",
    );
  }

  // ---- laplaceSolveIvp --------------------------------------------------------------------
  console.log("\n_laplace_solve_ivp:");
  {
    // y' - y = 0, y(0) = 1 -> y = e^x. coeffs are [a1, a0] highest order first.
    const raw = callOp(pyodide, "_laplace_solve_ivp", [1, -1], "0", ["1"]);
    const parsed = JSON.parse(raw);
    ok(parsed.y_x === "exp(x)", "L{}-solved y'=y, y(0)=1 -> e^x", parsed.y_x);
  }

  // ---- laplaceConvolution -----------------------------------------------------------------
  console.log("\n_laplace_convolution:");
  {
    // (1 * 1)(x) = ∫₀ˣ 1 dτ = x — a textbook convolution identity.
    const raw = callOp(pyodide, "_laplace_convolution", "1", "1");
    const parsed = JSON.parse(raw);
    ok(parsed.conv_result === "x", "(1 * 1)(x) = x", parsed.conv_result);
  }

  // ---- singularitiesWithResidues (canvas: contourIntegration) ------------------------------
  console.log("\n_singularities_with_residues:");
  {
    const raw = callOp(pyodide, "_singularities_with_residues", "1/(z-1)", "z");
    const sings = JSON.parse(raw);
    ok(sings.length === 1, "1/(z-1) has exactly one singularity");
    ok(
      Math.abs(sings[0].location.re - 1) < 1e-9 && Math.abs(sings[0].location.im) < 1e-9,
      "1/(z-1)'s pole is at z=1",
    );
    ok(
      Math.abs(sings[0].residue.re - 1) < 1e-9 && Math.abs(sings[0].residue.im) < 1e-9,
      "1/(z-1)'s residue at z=1 is 1",
    );
  }

  // ---- laurentSeries (canvas: laurentSingularities) -----------------------------------------
  console.log("\n_laurent_series:");
  {
    // e^z/z about z=0: known Laurent expansion 1/z + 1 + z/2 + z²/6 + O(z³).
    const raw = callOp(pyodide, "_laurent_series", "exp(z)/z", "z", "0", 3);
    ok(
      raw === "1/z + 1 + z/2 + z**2/6 + O(z**3)",
      "Laurent series of e^z/z about 0 to O(z³)",
      raw,
    );
  }

  // ---- classifySingularity (canvas: laurentSingularities) -----------------------------------
  console.log("\n_classify_singularity:");
  {
    const pole = JSON.parse(callOp(pyodide, "_classify_singularity", "1/(z-1)", "z", "1"));
    ok(pole.kind === "pole" && pole.order === 1, "1/(z-1) has a simple pole at z=1");

    const removable = JSON.parse(
      callOp(pyodide, "_classify_singularity", "sin(z)/z", "z", "0"),
    );
    ok(removable.kind === "removable", "sin(z)/z has a removable singularity at z=0");

    const essential = JSON.parse(
      callOp(pyodide, "_classify_singularity", "exp(1/z)", "z", "0"),
    );
    ok(essential.kind === "essential", "e^(1/z) has an essential singularity at z=0");
  }

  // ---- realIntegralByResidues (canvas: realIntegralsResidues) -------------------------------
  console.log("\n_real_integral_by_residues:");
  {
    // ∫_{-∞}^{∞} 1/(1+x²) dx = π — the textbook residue-calculus example.
    const whole = JSON.parse(
      callOp(pyodide, "_real_integral_by_residues", "1/(1+x^2)", "x", "whole"),
    );
    ok(Math.abs(whole.value.re - Math.PI) < 1e-9, "∫_{-∞}^{∞} 1/(1+x²) dx = π", whole.value.re);
    ok(Math.abs(whole.value.im) < 1e-9, "the result is real");

    const half = JSON.parse(
      callOp(pyodide, "_real_integral_by_residues", "1/(1+x^2)", "x", "half"),
    );
    ok(Math.abs(half.value.re - Math.PI / 2) < 1e-9, "∫_0^∞ 1/(1+x²) dx = π/2 (half-line mode)");
  }

  console.log(`\n${pass} passed, ${fail} failed.`);
  process.exit(fail ? 1 : 0);
})().catch((err) => {
  console.error("SUITE CRASHED:", err);
  process.exit(1);
});
