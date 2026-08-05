/* ODE/PDE support module — Phase 1 of the ODE engine redesign retired the hand-rolled
   classify-then-derive pipeline that used to live here (see git history / the plan at
   docs/superpowers/plans/2026-08-01-ode-engine-phase1-general-solver.md for why). A full
   pre-trim copy is kept at archive/ode-engine-hand-rolled-classifier/ode-symbolic-full.js.
   What's left:
     - toLatex / formatNum — display utilities, still used everywhere ODE/PDE results get
       shown.
     - simpsonIntegrate / eulerRK4FirstOrder / rk4SecondOrder — numeric methods: Simpson's
       Rule (used by the heat-equation Fourier coefficients), and the Euler/RK4 fallback for
       when no closed form is found (order 1, and order 2 with constant coefficients).
     - heatSeriesValue / solveHeatEquation — the Heat Equation PDE page's solver, untouched by
       the Phase 1 redesign (PDE stays hand-rolled deliberately — see the plan).
   The general ODE-solving path now lives in assets/js/ode-solver.js. The hand-rolled
   text-parsing helpers (splitAtDepth0 / parseExactForm / parseExplicitFirstOrder /
   rhsFromInput / parseSecondOrder / isSecondOrderInput) that used to live here were removed
   in Phase 3 — laplace-transform.js's rewrite no longer needs them. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.ODESymbolic = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const ODESymbolic = {};

  /* Shared CAS core, same resolution as calculus-symbolic.js. This module reaches both
     libraries THROUGH the core rather than holding its own references, so that the input
     normalization and the independent-parse gate in calc-core.js apply here too — a solver
     on this engine must not be able to see a different parse of the user's equation than
     the Calculus Engine's integrator sees. */
  const CalcCore =
    (typeof module === "object" && module.exports)
      ? require("./calc-core.js")
      : (typeof self !== "undefined" ? self.CalcCore : root.CalcCore);

  if (!CalcCore) {
    throw new Error("ODESymbolic requires calc-core.js to be loaded first.");
  }

  // Same require-or-global resolution as CalcCore above, for the two new numerical PDE
  // schemes (Phase 5c) that need LinAlg.solveSystem. Pages that don't load linalg-algorithms.js
  // (everything except heat-equation.html) simply never call heatBTCS/heatCrankNicolson, so an
  // unresolved LinAlg there is harmless.
  const LinAlg =
    (typeof module === "object" && module.exports)
      ? require("./linalg-algorithms.js")
      : (typeof self !== "undefined" ? self.LinAlg : root.LinAlg);

  // Injected in Node/the worker by the caller; auto-resolved from globals in the browser.
  ODESymbolic.configure = function (deps) {
    CalcCore.configure(deps);
  };

  // The core's normalizing math.js facade, never the raw library.
  function math_() {
    return CalcCore.math();
  }

  // math.js parse -> TeX. Local replacement for the browser-only Engine.toLatex, so this
  // module has no dependency on engine-core.js (which touches document/window).
  function toLatex(exprStr) {
    try { return math_().parse(exprStr).toTex({ parenthesis: "auto" }); }
    catch (e) { return exprStr; }
  }

  // Local replacement for the browser-only Engine.formatNum.
  function formatNum(x, decimals) {
    decimals = decimals === undefined ? 4 : decimals;
    if (x === null || x === undefined || Number.isNaN(x)) return "—";
    if (x === 0) return "0";
    const abs = Math.abs(x);
    if (abs !== 0 && (abs < 1e-4 || abs >= 1e6)) return x.toExponential(4);
    return Number(x.toFixed(decimals)).toString();
  }

  // Plain composite Simpson's Rule — used by solveHeatEquation for the Fourier sine
  // coefficients below. Self-contained, no dependency on the retired classify tree.
  function simpsonIntegrate(fn, a, b, n) {
    if (n % 2 === 1) n++;
    const h = (b - a) / n;
    let sum = fn(a) + fn(b);
    for (let i = 1; i < n; i++) sum += (i % 2 === 0 ? 2 : 4) * fn(a + i * h);
    return (h / 3) * sum;
  }

  /* ============================================================
   * PDE — Heat Equation (Section 7A of the design doc; Dirichlet only, v1)
   * ============================================================ */

  // Pure: given the Fourier sine coefficients bn, evaluates the series solution
  // u(x,t) = sum bn * sin(n*pi*x/L) * e^(-k*(n*pi/L)^2*t). Split out from
  // solveHeatEquation so the coefficients (plain numbers, structured-clone-safe) can cross
  // the CAS worker boundary while the closure that uses them is rebuilt on the caller's side.
  ODESymbolic.heatSeriesValue = function (bn, L, k, x, t) {
    let s = 0;
    for (let n = 1; n <= bn.length; n++) {
      const lambda = Math.pow((n * Math.PI) / L, 2);
      s += bn[n - 1] * Math.sin((n * Math.PI * x) / L) * Math.exp(-k * lambda * t);
    }
    return s;
  };

  ODESymbolic.solveHeatEquation = function ({ L, k, fxExpr, N, T }) {
    const fFn = math_().parse(fxExpr).compile();
    const f = (x) => fFn.evaluate({ x });
    const bn = [];
    for (let n = 1; n <= N; n++) {
      const integrand = (x) => f(x) * Math.sin((n * Math.PI * x) / L);
      bn.push((2 / L) * simpsonIntegrate(integrand, 0, L, 120));
    }
    const steps = [
      { tex: `u_t = ${k}\\,u_{xx}, \\quad 0 < x < ${L}, \\quad u(0,t)=u(${L},t)=0, \\quad u(x,0)=f(x)` },
      { label: "Separate variables: u(x,t) = X(x)·T(t)", tex: `X'' + \\lambda X = 0, \\qquad T' + ${k}\\lambda T = 0` },
      { label: "Dirichlet eigenvalue problem gives", tex: `\\lambda_n = \\left(\\frac{n\\pi}{${L}}\\right)^2, \\quad X_n(x) = \\sin\\!\\frac{n\\pi x}{${L}}` },
      { label: "Solve the time ODE", tex: `T_n(t) = e^{-${k}\\lambda_n t}` },
      { label: "Match the initial condition — Fourier sine coefficients (computed via Simpson's Rule)", tex: `b_n = \\frac{2}{${L}}\\int_0^{${L}} f(x)\\sin\\!\\frac{n\\pi x}{${L}}\\,dx` },
    ];
    return {
      classificationLine: "Parabolic PDE (heat equation), Dirichlet boundary conditions — solved by separation of variables.",
      steps,
      generalSolution: `u(x,t) = \\sum_{n=1}^{\\infty} b_n \\sin\\!\\frac{n\\pi x}{${L}}\\,e^{-${k}(n\\pi/${L})^2 t}`,
      particularSolution: null,
      bn, L, k, T,
      // u(x,t) is reconstructed by the caller via ODESymbolic.heatSeriesValue(bn, L, k, x, t) —
      // not returned as a closure here, since closures cannot cross the CAS worker's
      // structured-clone boundary (see cas-worker.js OPS.solveHeatEquation).
    };
  };

  /* ============================================================
   * PDE — Wave Equation (Phase 5a of the ODE/PDE redesign)
   * ============================================================ */

  // Standing-wave (normal-mode) series: u(x,t) = sum [An cos(n*pi*c*t/L) + Bn sin(n*pi*c*t/L)] sin(n*pi*x/L).
  ODESymbolic.waveSeriesValue = function (An, Bn, L, c, x, t) {
    let s = 0;
    for (let n = 1; n <= An.length; n++) {
      const arg = (n * Math.PI * c * t) / L;
      s += (An[n - 1] * Math.cos(arg) + Bn[n - 1] * Math.sin(arg)) * Math.sin((n * Math.PI * x) / L);
    }
    return s;
  };

  // The odd, 2L-periodic extension of fn (defined on [0,L]) to all reals -- the reflection
  // method d'Alembert's form needs for a FINITE string with Dirichlet ends. Shared by both F
  // (from the initial position f) and G (from the initial velocity g).
  ODESymbolic.oddPeriodicExtension = function (fn, L) {
    const period = 2 * L;
    return function (x) {
      let xm = ((x % period) + period) % period; // reduce to [0, 2L)
      if (xm > L) xm -= period; // now in (-L, L]
      return xm < 0 ? -fn(-xm) : fn(xm);
    };
  };

  // d'Alembert's traveling-wave form: u(x,t) = [Fext(x-ct)+Fext(x+ct)]/2 + (1/2c) * integral of
  // Gext from x-ct to x+ct. Fext/Gext: odd-periodic extensions of f/g (oddPeriodicExtension).
  ODESymbolic.dAlembertValue = function (Fext, Gext, c, x, t) {
    const lo = x - c * t, hi = x + c * t;
    const travelling = (Fext(lo) + Fext(hi)) / 2;
    if (c === 0) return travelling;
    const velocityTerm = simpsonIntegrate(Gext, lo, hi, 200) / (2 * c);
    return travelling + velocityTerm;
  };

  ODESymbolic.solveWaveEquation = function ({ L, c, fxExpr, gxExpr, N, T }) {
    const fFn = math_().parse(fxExpr).compile();
    const f = (x) => fFn.evaluate({ x });
    const gFn = math_().parse(gxExpr || "0").compile();
    const g = (x) => gFn.evaluate({ x });

    const An = [], Bn = [];
    for (let n = 1; n <= N; n++) {
      const integrandA = (x) => f(x) * Math.sin((n * Math.PI * x) / L);
      An.push((2 / L) * simpsonIntegrate(integrandA, 0, L, 120));
      const integrandB = (x) => g(x) * Math.sin((n * Math.PI * x) / L);
      const bCoeff = (2 / L) * simpsonIntegrate(integrandB, 0, L, 120);
      Bn.push(bCoeff / ((n * Math.PI * c) / L));
    }

    const steps = [
      { tex: `u_{tt} = ${c}^2\\,u_{xx}, \\quad 0 < x < ${L}, \\quad u(0,t)=u(${L},t)=0, \\quad u(x,0)=f(x), \\quad u_t(x,0)=g(x)` },
      { label: "Separate variables: u(x,t) = X(x)·T(t)", tex: `X'' + \\lambda X = 0, \\qquad T'' + ${c}^2\\lambda T = 0` },
      { label: "Dirichlet eigenvalue problem gives", tex: `\\lambda_n = \\left(\\frac{n\\pi}{${L}}\\right)^2, \\quad X_n(x) = \\sin\\!\\frac{n\\pi x}{${L}}` },
      { label: "Solve the time ODE", tex: `T_n(t) = A_n\\cos\\!\\frac{n\\pi ${c} t}{${L}} + B_n\\sin\\!\\frac{n\\pi ${c} t}{${L}}` },
      { label: "Match u(x,0)=f(x) — Fourier sine coefficients", tex: `A_n = \\frac{2}{${L}}\\int_0^{${L}} f(x)\\sin\\!\\frac{n\\pi x}{${L}}\\,dx` },
      { label: "Match u_t(x,0)=g(x) — Fourier sine coefficients", tex: `B_n = \\frac{2}{n\\pi ${c}}\\int_0^{${L}} g(x)\\sin\\!\\frac{n\\pi x}{${L}}\\,dx` },
    ];
    return {
      classificationLine: "Hyperbolic PDE (wave equation), Dirichlet boundary conditions — solved by separation of variables, cross-checked against d'Alembert's traveling-wave form.",
      steps,
      generalSolution: `u(x,t) = \\sum_{n=1}^{\\infty} \\left(A_n\\cos\\frac{n\\pi ${c} t}{${L}} + B_n\\sin\\frac{n\\pi ${c} t}{${L}}\\right)\\sin\\frac{n\\pi x}{${L}}`,
      particularSolution: null,
      An, Bn, L, c, T,
    };
  };

  /* ============================================================
   * PDE — Numerical schemes for the Heat Equation (Phase 5c)
   * ============================================================ */

  // Explicit FTCS: U[i]^(n+1) = U[i]^n + r*(U[i+1]^n - 2U[i]^n + U[i-1]^n). Endpoints stay 0
  // (Dirichlet). Stable iff r <= 1/2 -- unstable r visibly diverges, which is the point of this
  // section, not a bug to hide.
  ODESymbolic.heatFTCS = function (f0Values, r, steps) {
    let U = f0Values.slice();
    const M = U.length - 1;
    for (let s = 0; s < steps; s++) {
      const next = U.slice();
      for (let i = 1; i < M; i++) next[i] = U[i] + r * (U[i + 1] - 2 * U[i] + U[i - 1]);
      next[0] = 0; next[M] = 0;
      U = next;
    }
    return { profile: U, cflRatio: r, method: "explicit" };
  };

  // Implicit BTCS: (1+2r)U[i]^(n+1) - r*U[i+1]^(n+1) - r*U[i-1]^(n+1) = U[i]^n. Unconditionally
  // stable -- solved as a dense linear system each step via LinAlg.solveSystem (strictly
  // diagonally dominant by construction: 1+2r > 2r always, so always a unique solution).
  ODESymbolic.heatBTCS = function (f0Values, r, steps) {
    const M = f0Values.length - 1;
    const n = M - 1;
    const A = Array.from({ length: n }, () => new Array(n).fill(0));
    for (let i = 0; i < n; i++) {
      A[i][i] = 1 + 2 * r;
      if (i > 0) A[i][i - 1] = -r;
      if (i < n - 1) A[i][i + 1] = -r;
    }
    let interior = f0Values.slice(1, M);
    for (let s = 0; s < steps; s++) {
      const result = LinAlg.solveSystem(A, interior);
      if (result.type !== "unique") throw new Error("The implicit scheme's linear system did not have a unique solution.");
      interior = result.solution;
    }
    return { profile: [0, ...interior, 0], cflRatio: r, method: "implicit" };
  };

  // Crank-Nicolson: averages the explicit and implicit operators -- (1+r)U[i]^(n+1) -
  // (r/2)(U[i+1]^(n+1)+U[i-1]^(n+1)) = (1-r)U[i]^n + (r/2)(U[i+1]^n+U[i-1]^n). Also
  // unconditionally stable, second-order accurate in time (vs BTCS's first-order).
  ODESymbolic.heatCrankNicolson = function (f0Values, r, steps) {
    const M = f0Values.length - 1;
    const n = M - 1;
    const A = Array.from({ length: n }, () => new Array(n).fill(0));
    for (let i = 0; i < n; i++) {
      A[i][i] = 1 + r;
      if (i > 0) A[i][i - 1] = -r / 2;
      if (i < n - 1) A[i][i + 1] = -r / 2;
    }
    let U = f0Values.slice();
    for (let s = 0; s < steps; s++) {
      const rhs = new Array(n);
      for (let k = 0; k < n; k++) {
        const i = k + 1;
        rhs[k] = (1 - r) * U[i] + (r / 2) * (U[i + 1] + U[i - 1]);
      }
      const result = LinAlg.solveSystem(A, rhs);
      if (result.type !== "unique") throw new Error("The Crank-Nicolson scheme's linear system did not have a unique solution.");
      U = [0, ...result.solution, 0];
    }
    return { profile: U, cflRatio: r, method: "crank-nicolson" };
  };

  /* ============================================================
   * Numeric fallbacks — never a dead end
   * ============================================================ */

  ODESymbolic.eulerRK4FirstOrder = function (fn, x0, y0, h, steps) {
    const path = [{ x: x0, y: y0, slope: null }];
    let x = x0, y = y0;
    for (let i = 0; i < steps; i++) {
      let slope; try { slope = fn(x, y); } catch (e) { slope = 0; }
      path[path.length - 1].slope = slope;
      y = y + h * slope; x = x + h;
      path.push({ x, y, slope: null });
    }
    try { path[path.length - 1].slope = fn(x, y); } catch (e) { path[path.length - 1].slope = 0; }

    const rk4Path = [{ x: x0, y: y0 }];
    let rx = x0, ry = y0;
    for (let i = 0; i < steps; i++) {
      let k1, k2, k3, k4;
      try {
        k1 = fn(rx, ry);
        k2 = fn(rx + h / 2, ry + (h / 2) * k1);
        k3 = fn(rx + h / 2, ry + (h / 2) * k2);
        k4 = fn(rx + h, ry + h * k3);
      } catch (e) { k1 = k2 = k3 = k4 = 0; }
      ry = ry + (h / 6) * (k1 + 2 * k2 + 2 * k3 + k4);
      rx = rx + h;
      rk4Path.push({ x: rx, y: ry });
    }
    return { path, rk4Path };
  };

  // Converts a*y''+b*y'+c*y=g(x) to the system y1'=y2, y2'=(g(x)-b*y2-c*y1)/a and
  // steps it with RK4 — the fallback whenever the coefficients aren't constant enough
  // for the symbolic classifier, or when undetermined coefficients / variation of
  // parameters both fail to find a closed form.
  ODESymbolic.rk4SecondOrder = function (a, b, c, rhsFn, x0, y0, yp0, h, steps) {
    const path = [{ x: x0, y: y0, yp: yp0 }];
    let x = x0, y1 = y0, y2 = yp0;
    const deriv = (x, y1, y2) => {
      let g; try { g = rhsFn(x); } catch (e) { g = 0; }
      return [y2, (g - b * y2 - c * y1) / a];
    };
    for (let i = 0; i < steps; i++) {
      const k1 = deriv(x, y1, y2);
      const k2 = deriv(x + h / 2, y1 + (h / 2) * k1[0], y2 + (h / 2) * k1[1]);
      const k3 = deriv(x + h / 2, y1 + (h / 2) * k2[0], y2 + (h / 2) * k2[1]);
      const k4 = deriv(x + h, y1 + h * k3[0], y2 + h * k3[1]);
      y1 = y1 + (h / 6) * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]);
      y2 = y2 + (h / 6) * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]);
      x = x + h;
      path.push({ x, y: y1, yp: y2 });
    }
    return path;
  };

  ODESymbolic.toLatex = toLatex;
  ODESymbolic.formatNum = formatNum;

  return ODESymbolic;
});
