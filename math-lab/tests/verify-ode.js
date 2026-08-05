"use strict";
/* ODE/PDE Engine — verification suite for what's left in ode-symbolic.js after the Phase 1
   redesign (see docs/superpowers/plans/2026-08-01-ode-engine-phase1-general-solver.md): the
   numeric fallback (Euler/RK4), the heat-equation PDE solver, the display utilities, and the
   small text-parsing utilities laplace-transform.js still depends on directly. The general
   symbolic ODE solver's pure-JS verification logic is tested separately in
   tests/verify-ode-solver.js; its SymPy/Pyodide half is browser-only and verified manually
   (see the plan's Task 9) — there is no `pyodide` npm package in this repo to run it under
   Node.

   Note: ode-symbolic.js no longer needs nerdamer for anything kept here (that was only used by
   the now-retired classify tree), so this suite configures math.js only.

   Run with: node tests/verify-ode.js */

const path = require("path");
const math = require(path.join(__dirname, "..", "assets", "vendor", "math.min.js"));
const ODESymbolic = require(path.join(__dirname, "..", "assets", "js", "ode-symbolic.js"));

ODESymbolic.configure({ math });

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

console.log("ODE/PDE Engine — verification suite (post-Phase-1 scope)\n");

/* ================================================================
 * Numeric fallback — Euler / RK4, first-order
 * ================================================================ */
console.log("eulerRK4FirstOrder:");
{
  // y' = y, y(0) = 1 -> exact solution y = e^x
  const { path: eulerPath, rk4Path } = ODESymbolic.eulerRK4FirstOrder((x, y) => y, 0, 1, 0.01, 200);
  ok(eulerPath.length === 201 && rk4Path.length === 201, "returns steps+1 points on both paths");

  const xEnd = 2; // 0 + 200*0.01
  const exact = Math.exp(xEnd);
  const rk4End = rk4Path[rk4Path.length - 1].y;
  const eulerEnd = eulerPath[eulerPath.length - 1].y;
  ok(Math.abs(rk4End - exact) < 1e-4 * exact, "RK4 endpoint matches e^x to tight tolerance (4th-order accurate)", `rk4=${rk4End}, exact=${exact}`);
  ok(Math.abs(eulerEnd - exact) < 5e-2 * exact, "Euler endpoint matches e^x to a looser tolerance (1st-order accurate)", `euler=${eulerEnd}, exact=${exact}`);
  ok(Math.abs(eulerEnd - exact) > Math.abs(rk4End - exact), "RK4 is genuinely more accurate than Euler on the same step");
}

/* ================================================================
 * Numeric fallback — RK4, second-order constant-coefficient
 * ================================================================ */
console.log("\nrk4SecondOrder:");
{
  // y'' + y = 0, y(0) = 1, y'(0) = 0 -> exact solution y = cos(x)
  const traj = ODESymbolic.rk4SecondOrder(1, 0, 1, () => 0, 0, 1, 0, 0.01, 200);
  ok(traj.length === 201, "returns steps+1 points");

  const xEnd = 2;
  const exact = Math.cos(xEnd);
  const end = traj[traj.length - 1].y;
  ok(Math.abs(end - exact) < 1e-3, "endpoint matches cos(x) to tight tolerance", `rk4=${end}, exact=${exact}`);

  // Spot-check partway through the trajectory too, not just the endpoint.
  const mid = traj[100]; // x = 1
  ok(Math.abs(mid.y - Math.cos(1)) < 1e-3, "midpoint matches cos(x)", `rk4=${mid.y}, exact=${Math.cos(1)}`);
}

/* ================================================================
 * PDE — Heat equation
 * ================================================================ */
console.log("\nHeat equation:");
{
  // u_t = u_xx, L=pi, f(x) = sin(x) (already a single Fourier mode) -> u(x,t) = sin(x) e^{-t}
  const box = ODESymbolic.solveHeatEquation({ L: Math.PI, k: 1, fxExpr: "sin(x)", N: 5, T: 1 });
  ok(box.bn.length === 5, "heat equation returns N Fourier coefficients");
  ok(Math.abs(box.bn[0] - 1) < 1e-3, "b1 ≈ 1 for f(x)=sin(x) (single-mode initial condition)", `b1=${box.bn[0]}`);
  ok(box.bn.slice(1).every((b) => Math.abs(b) < 1e-3), "higher modes ≈ 0 for a pure sin(x) initial condition");

  // Initial condition match: u(x,0) should reconstruct f(x) = sin(x)
  const u0 = (x) => ODESymbolic.heatSeriesValue(box.bn, Math.PI, 1, x, 0);
  ok(Math.abs(u0(1.0) - Math.sin(1.0)) < 1e-2, "u(x,0) matches initial condition f(x)=sin(x)", `u(1,0)=${u0(1.0)}, sin(1)=${Math.sin(1.0)}`);

  // Boundary conditions: u(0,t) = u(L,t) = 0
  const uAtT = (x, t) => ODESymbolic.heatSeriesValue(box.bn, Math.PI, 1, x, t);
  ok(Math.abs(uAtT(0, 0.3)) < 1e-6, "u(0,t) = 0 (Dirichlet)");
  ok(Math.abs(uAtT(Math.PI, 0.3)) < 1e-6, "u(L,t) = 0 (Dirichlet)");

  // PDE itself: u_t = k*u_xx via finite differences, at an interior point/time.
  const hx = 1e-3, ht = 1e-4;
  const x0 = 1.4, t0 = 0.4;
  const ut = (uAtT(x0, t0 + ht) - uAtT(x0, t0 - ht)) / (2 * ht);
  const uxx = (uAtT(x0 + hx, t0) - 2 * uAtT(x0, t0) + uAtT(x0 - hx, t0)) / (hx * hx);
  ok(Math.abs(ut - 1 * uxx) < 1e-2 * Math.max(1, Math.abs(uxx)), "u_t = k*u_xx (finite-difference check)", `u_t=${ut}, k*u_xx=${uxx}`);
}

/* ================================================================
 * Wave equation (Phase 5a)
 * ================================================================ */
console.log("\nwaveSeriesValue:");
{
  // Single mode n=1: An=[1], Bn=[0], L=1, c=1 -> u(x,t) = cos(pi*t)*sin(pi*x), the exact
  // standing-wave solution for f(x)=sin(pi x), g=0.
  const u = ODESymbolic.waveSeriesValue([1], [0], 1, 1, 0.3, 0.5);
  const exact = Math.cos(Math.PI * 0.5) * Math.sin(Math.PI * 0.3);
  ok(Math.abs(u - exact) < 1e-10, "single-mode standing wave matches the exact solution", `got=${u}, exact=${exact}`);
}

console.log("\noddPeriodicExtension:");
{
  const f = (x) => x * (1 - x); // defined on [0,1]
  const F = ODESymbolic.oddPeriodicExtension(f, 1);
  ok(Math.abs(F(0.3) - f(0.3)) < 1e-10, "matches f on [0,L]");
  ok(Math.abs(F(-0.3) - (-f(0.3))) < 1e-10, "odd: F(-x) = -f(x)");
  ok(Math.abs(F(1.7) - F(1.7 - 2)) < 1e-10, "2L-periodic: F(x) = F(x - 2L)");
  ok(Math.abs(F(0) - 0) < 1e-10, "F(0) = 0 (odd function)");
}

console.log("\ndAlembertValue:");
{
  // f(x) = sin(pi x), g = 0, L=1, c=1 -> exact solution cos(pi c t) sin(pi x), same as the
  // waveSeriesValue single-mode check above -- cross-checks the two independent code paths.
  const f = (x) => Math.sin(Math.PI * x);
  const Fext = ODESymbolic.oddPeriodicExtension(f, 1);
  const Gext = ODESymbolic.oddPeriodicExtension(() => 0, 1);
  const u = ODESymbolic.dAlembertValue(Fext, Gext, 1, 0.3, 0.5);
  const exact = Math.cos(Math.PI * 0.5) * Math.sin(Math.PI * 0.3);
  ok(Math.abs(u - exact) < 1e-6, "d'Alembert matches the same exact single-mode solution", `got=${u}, exact=${exact}`);
}

console.log("\nsolveWaveEquation:");
{
  // f(x) = sin(pi x), g = 0, L=1, c=1 -> An=[1,0,0,...], Bn=[0,0,0,...] (single mode).
  const box = ODESymbolic.solveWaveEquation({ L: 1, c: 1, fxExpr: "sin(pi*x)", gxExpr: "0", N: 5, T: 1 });
  ok(Math.abs(box.An[0] - 1) < 1e-6, "A1 ~ 1 for f(x)=sin(pi x)", `A1=${box.An[0]}`);
  ok(box.An.slice(1).every((v) => Math.abs(v) < 1e-6), "higher An ~ 0 for a pure single-mode f");
  ok(box.Bn.every((v) => Math.abs(v) < 1e-6), "all Bn ~ 0 when g=0");
  ok(typeof box.classificationLine === "string" && box.classificationLine.length > 0, "returns a classification line");
}

console.log("\nheatFTCS / heatBTCS / heatCrankNicolson:");
{
  const L = 1, k = 1, M = 20;
  const h = L / M;
  const f0 = Array.from({ length: M + 1 }, (_, i) => Math.sin(Math.PI * i * h / L));
  function exact(x, t) { return Math.exp(-k * (Math.PI / L) ** 2 * t) * Math.sin(Math.PI * x / L); }

  // Stable case: r = 0.4, all three schemes should track the exact solution closely.
  {
    const r = 0.4, steps = 30, dt = r * h * h / k, tFinal = steps * dt;
    const exactProfile = Array.from({ length: M + 1 }, (_, i) => exact(i * h, tFinal));
    for (const [name, fn] of [["heatFTCS", ODESymbolic.heatFTCS], ["heatBTCS", ODESymbolic.heatBTCS], ["heatCrankNicolson", ODESymbolic.heatCrankNicolson]]) {
      const out = fn(f0, r, steps);
      const maxErr = Math.max(...out.profile.map((v, i) => Math.abs(v - exactProfile[i])));
      ok(maxErr < 0.02, `${name} matches the exact solution at r=0.4`, `maxErr=${maxErr}`);
      ok(out.cflRatio === r, `${name} reports the CFL ratio`);
    }
  }

  // Unstable case for explicit only: r = 0.9, explicit should blow up, implicit/CN should not.
  {
    const r = 0.9, steps = 60, dt = r * h * h / k;
    const explicitOut = ODESymbolic.heatFTCS(f0, r, steps);
    const maxExplicit = Math.max(...explicitOut.profile.map(Math.abs));
    ok(maxExplicit > 1000, "explicit scheme visibly diverges at r=0.9", `max|U|=${maxExplicit}`);

    const btcsOut = ODESymbolic.heatBTCS(f0, r, steps);
    const maxBtcs = Math.max(...btcsOut.profile.map(Math.abs));
    ok(maxBtcs < 2, "implicit scheme stays bounded at r=0.9 (unconditionally stable)", `max|U|=${maxBtcs}`);

    const cnOut = ODESymbolic.heatCrankNicolson(f0, r, steps);
    const maxCn = Math.max(...cnOut.profile.map(Math.abs));
    ok(maxCn < 2, "Crank-Nicolson stays bounded at r=0.9 (unconditionally stable)", `max|U|=${maxCn}`);
  }
}

/* ================================================================
 * Display utilities
 * ================================================================ */
console.log("\nDisplay utilities:");
{
  ok(ODESymbolic.toLatex("x^2+1") === "{ x}^{2}+1", "toLatex renders a simple expression", ODESymbolic.toLatex("x^2+1"));
  ok(ODESymbolic.formatNum(3.14159265) === "3.1416", "formatNum rounds to 4 decimals by default");
  ok(ODESymbolic.formatNum(0) === "0", "formatNum handles zero");
  ok(ODESymbolic.formatNum(NaN) === "—", "formatNum handles NaN");
  ok(ODESymbolic.formatNum(1e8).includes("e"), "formatNum switches to exponential notation for very large numbers");
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
