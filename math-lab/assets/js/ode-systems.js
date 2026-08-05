/* Systems of first-order linear ODEs, x' = Ax + g(t) — Phase 2 of the ODE engine redesign
   (see docs/superpowers/plans/2026-08-02-ode-engine-phase2-systems.md). SymPy's dsolve() does
   the algebra generically for any n; this module's job — same discipline as Phase 1's
   ode-solver.js — is turning matrix/vector input into a dsolveSystem() call and independently
   re-verifying whatever comes back before it is ever shown, via numeric substitution into the
   ORIGINAL system. At n=2 only, it also classifies the equilibrium (node/saddle/spiral/center)
   using the Linear Algebra Engine's existing eigenvalue solver — the one deliberately
   hand-rolled piece, a single bounded calculation, not a second classify tree.

   Depends on ODESolver (compileRealFx, withArbitraryConstants — reused, not reimplemented) and
   LinAlg (eigenvalues, eigenvectorsFor — reused for classification). Both must be loaded first. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(require("./ode-solver.js"), require("./linalg-algorithms.js"));
  } else {
    root.ODESystems = factory(root.ODESolver, root.LinAlg);
  }
})(typeof self !== "undefined" ? self : this, function (ODESolver, LinAlg) {
  "use strict";

  const ODESystems = {};

  // Substitutes each candidate xi(t) (and its central-differenced first derivative) into the
  // ORIGINAL system xi'(t) = row_i(A)*x(t) + g_i(t) and checks it holds at a quorum of sample
  // points — the system-of-equations analogue of ode-solver.js's verifyNthOrder. Systems are
  // always first-order (x' = Ax + g), so only a first derivative is ever needed.
  const SAMPLE_T = [0.37, 0.83, 1.29, 1.71, 2.13];
  const H = 1e-4;
  function verifySystem(components, matrixRows, gExprList) {
    const n = matrixRows.length;
    const compiled = components.map((c) => ODESolver.compileRealFx(ODESolver.withArbitraryConstants(c)));
    if (!compiled.every((c) => c.ok)) return false;
    const gList = gExprList && gExprList.length ? gExprList : matrixRows.map(() => "0");
    const gCompiled = gList.map((g) => ODESolver.compileRealFx(g));
    if (!gCompiled.every((c) => c.ok)) return false;

    let usable = 0;
    for (const t of SAMPLE_T) {
      let xVals, xDeriv, gVals;
      try {
        xVals = compiled.map((c) => c.fn({ t }));
        xDeriv = compiled.map((c) => (c.fn({ t: t + H }) - c.fn({ t: t - H })) / (2 * H));
        gVals = gCompiled.map((c) => c.fn({ t }));
      } catch (e) { continue; }
      if (![...xVals, ...xDeriv, ...gVals].every(Number.isFinite)) continue;

      let rowsOk = true;
      for (let i = 0; i < n; i++) {
        let expected = gVals[i];
        for (let j = 0; j < n; j++) expected += matrixRows[i][j] * xVals[j];
        if (Math.abs(xDeriv[i] - expected) > 5e-2 * Math.max(1, Math.abs(expected))) { rowsOk = false; break; }
      }
      if (rowsOk) usable++;
    }
    return usable >= 3;
  }
  ODESystems.verifySystem = verifySystem;

  // n=2 only — classifies the equilibrium at the origin from A's eigenvalues, the standard
  // trace-determinant chart. Deliberately hand-rolled (per the plan's Global Constraints): a
  // single bounded calculation reusing LinAlg.eigenvalues, not a second classify-then-derive
  // tree competing with dsolve().
  function classifyEquilibrium2D(matrixRows) {
    const eig = LinAlg.eigenvalues(matrixRows);
    if (eig.hasComplex) {
      const alpha = eig.values[0].re;
      if (Math.abs(alpha) < 1e-9) return { type: "center", stability: "stable (periodic orbits, not asymptotic)", eigenvalues: eig.values };
      return { type: "spiral", stability: alpha < 0 ? "asymptotically stable" : "unstable", eigenvalues: eig.values };
    }
    const [l1, l2] = eig.real;
    if (Math.abs(l1 - l2) < 1e-7) {
      const geometric = LinAlg.eigenvectorsFor(matrixRows, l1).length;
      const type = geometric === 2 ? "star node" : "improper node";
      const stability = l1 < 0 ? "asymptotically stable" : l1 > 0 ? "unstable" : "degenerate (zero eigenvalue)";
      return { type, stability, eigenvalues: eig.values };
    }
    if (l1 * l2 < 0) return { type: "saddle", stability: "unstable", eigenvalues: eig.values };
    if (l1 === 0 || l2 === 0) return { type: "degenerate", stability: "degenerate (zero eigenvalue)", eigenvalues: eig.values };
    return { type: "node", stability: l1 < 0 && l2 < 0 ? "asymptotically stable" : "unstable", eigenvalues: eig.values };
  }
  ODESystems.classifyEquilibrium2D = classifyEquilibrium2D;

  // Any n — the general stability read the plan's Global Constraints require for n>=3 (where
  // the five-way node/saddle/spiral/center split doesn't generalize). Real part of every
  // eigenvalue negative -> asymptotically stable; every real part positive -> unstable; mixed
  // signs -> saddle-type; any zero real part (with the rest one-signed) -> degenerate, since
  // linearized stability can't decide that case.
  function stabilityFromEigenvalues(matrixRows) {
    const eig = LinAlg.eigenvalues(matrixRows);
    const reParts = eig.values.map((z) => z.re);
    const hasZero = reParts.some((r) => Math.abs(r) < 1e-9);
    const hasNeg = reParts.some((r) => r < -1e-9);
    const hasPos = reParts.some((r) => r > 1e-9);
    let stability;
    if (hasZero) stability = "degenerate (an eigenvalue has zero real part)";
    else if (hasNeg && hasPos) stability = "saddle-type";
    else if (hasNeg) stability = "asymptotically stable";
    else stability = "unstable";
    return { stability, eigenvalues: eig.values };
  }
  ODESystems.stabilityFromEigenvalues = stabilityFromEigenvalues;

  // Classic 4th-order Runge-Kutta, vectorized for x' = Ax + g(t). gFn is (t) => number[], or
  // null for the homogeneous case. Used for the n=2 phase-portrait trajectories.
  function rk4System(matrixRows, gFn, x0, h, steps) {
    const n = x0.length;
    function deriv(t, x) {
      const g = gFn ? gFn(t) : null;
      const dx = new Array(n);
      for (let i = 0; i < n; i++) {
        let s = g ? g[i] : 0;
        for (let j = 0; j < n; j++) s += matrixRows[i][j] * x[j];
        dx[i] = s;
      }
      return dx;
    }
    function addScaled(base, delta, scale) {
      return base.map((v, i) => v + scale * delta[i]);
    }
    let t = 0;
    let x = x0.slice();
    const path = [{ t, x: x.slice() }];
    for (let step = 0; step < steps; step++) {
      const k1 = deriv(t, x);
      const k2 = deriv(t + h / 2, addScaled(x, k1, h / 2));
      const k3 = deriv(t + h / 2, addScaled(x, k2, h / 2));
      const k4 = deriv(t + h, addScaled(x, k3, h));
      x = x.map((v, i) => v + (h / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]));
      t += h;
      path.push({ t, x: x.slice() });
    }
    return path;
  }
  ODESystems.rk4System = rk4System;

  function normalizeSympyText(s) {
    return s.replace(/\*\*/g, "^").replace(/\bAbs\(/g, "abs(");
  }

  // ics: number[] of length n, or null for the general solution with no IC applied.
  ODESystems.solve = function (matrixRows, gExprList, ics) {
    if (typeof SympyClient === "undefined") {
      return Promise.resolve({ ok: false, reason: "The solver isn't available on this page." });
    }
    const n = matrixRows.length;
    if (n === 0 || !matrixRows.every((row) => row.length === n)) {
      return Promise.resolve({ ok: false, reason: "The matrix must be square and non-empty." });
    }
    const gList = gExprList && gExprList.length ? gExprList : matrixRows.map(() => "0");
    const icsList = ics ? ics.map(String) : [];
    return SympyClient.dsolveSystem(matrixRows, gList, icsList)
      .then((out) => {
        const parsed = JSON.parse(out.resultText);
        const components = parsed.components.map(normalizeSympyText);
        if (!verifySystem(components, matrixRows, gList)) {
          return { ok: false, reason: "SymPy returned a solution, but it did not independently verify against the system — refusing to show a result this site cannot confirm." };
        }
        const { stability, eigenvalues } = stabilityFromEigenvalues(matrixRows);
        const result = { ok: true, components, n, verified: true, stability, eigenvalues };
        if (n === 2) result.classification = classifyEquilibrium2D(matrixRows);
        return result;
      })
      .catch((err) => ({ ok: false, reason: err.message || String(err) }));
  };

  return ODESystems;
});
