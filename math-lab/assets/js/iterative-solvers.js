/* Jacobi and Gauss-Seidel iterative solvers — DOM wiring only. */
(function () {
  "use strict";
  LinAlgPage.init({
    storeKey: "engine-lab:linear-algebra-iterative-solvers",
    square: true, vector: true,
    example: { A: [[4, -1, 0], [-1, 4, -1], [0, -1, 4]], b: [15, 10, 10] },
    compute: (A, b) => {
      const jacobi = LinAlg.jacobi(A, b, 1e-12, 500);
      const gs = LinAlg.gaussSeidel(A, b, 1e-12, 500);
      let tuned = null, best = null;
      try {
        best = LinAlg.bestOmega(A, b, 1e-12, 500);
        if (best.best) tuned = LinAlg.sor(A, b, best.best.omega, 1e-12, 500);
      } catch (e) { /* SOR not applicable here */ }
      return { jacobi, gs, tuned, best, direct: LinAlg.solveSystem(A, b) };
    },
    render: (r, ui) => {
      const j = r.jacobi, g = r.gs;
      ui.stat("Gauss-Seidel sweeps", g.converged ? g.sweeps : "did not converge", true);
      ui.stat("Jacobi sweeps", j.converged ? j.sweeps : "did not converge");
      ui.stat("Diagonally dominant", j.diagonallyDominant ? "Yes" : "No");
      ui.stat("Best SOR ω", r.best && r.best.best ? `${r.best.best.omega} (${r.best.best.sweeps} sweeps)` : "—");
      ui.stat("Speed-up vs Jacobi", j.converged && g.converged ? (j.sweeps / g.sweeps).toFixed(2) + "x" : "—");

      ui.note("Convergence condition", j.diagonallyDominant
        ? "This matrix is strictly diagonally dominant — every diagonal entry is larger than the sum of the others in its row — so both iterations are guaranteed to converge from any starting vector."
        : "This matrix is NOT strictly diagonally dominant, so convergence is not guaranteed. It may still converge, but a diverging run here is the method's honest answer, not a bug.",
        j.diagonallyDominant ? "ok" : "bad");

      ui.html("Row-by-row dominance check",
        `<div class="data-table-wrap"><table class="data-table"><thead><tr><th>row</th><th>|a<sub>ii</sub>|</th><th>Σ|a<sub>ij</sub>|, j≠i</th><th></th></tr></thead><tbody>` +
        j.rowChecks.map((c) => `<tr><td>${c.row + 1}</td><td class="mono">${MatrixUI.format(c.diagonal)}</td>` +
          `<td class="mono">${MatrixUI.format(c.offDiagonalSum)}</td><td class="mono">${c.dominant ? "dominant" : "not dominant"}</td></tr>`).join("") +
        `</tbody></table></div>`);

      if (r.direct.type === "unique") {
        ui.vectors("Exact solution (direct elimination, for comparison)", [r.direct.solution], { prefix: "x" });
      }
      if (r.tuned && r.tuned.converged) {
        ui.note("Successive over-relaxation",
          `SOR takes the Gauss-Seidel update and goes ω times as far. ω = 1 is exactly Gauss-Seidel; the best value found here was ω = ${r.best.best.omega}, needing ${r.best.best.sweeps} sweeps against Gauss-Seidel's ${g.sweeps}. Outside 0 < ω < 2 the iteration always diverges.`, "ok");
      }
      ui.plot("Residual per sweep (log scale)", (el) => LinAlgViz.convergence(el, [
        { name: "Jacobi", values: j.iterations.map((i) => i.residual) },
        { name: "Gauss-Seidel", values: g.iterations.map((i) => i.residual) },
      ].concat(r.tuned ? [{ name: `SOR (ω=${r.best.best.omega})`, values: r.tuned.iterations.map((i) => i.residual) }] : [])),
        340);
      if (g.converged) ui.vectors("Gauss-Seidel solution", [g.solution], { prefix: "x" });
      if (j.converged) ui.vectors("Jacobi solution", [j.solution], { prefix: "x" });

      const rows = Math.max(j.iterations.length, g.iterations.length);
      const body = [];
      for (let i = 0; i < Math.min(rows, 60); i++) {
        const ji = j.iterations[i], gi = g.iterations[i];
        body.push(`<tr><td>${i + 1}</td>` +
          `<td class="mono">${ji ? ji.change.toExponential(2) : ""}</td>` +
          `<td class="mono">${ji ? ji.residual.toExponential(2) : ""}</td>` +
          `<td class="mono">${gi ? gi.change.toExponential(2) : ""}</td>` +
          `<td class="mono">${gi ? gi.residual.toExponential(2) : ""}</td></tr>`);
      }
      ui.html("Convergence, sweep by sweep",
        `<div class="data-table-wrap"><table class="data-table"><thead><tr><th>sweep</th>` +
        `<th>Jacobi change</th><th>Jacobi ‖Ax−b‖</th><th>G-S change</th><th>G-S ‖Ax−b‖</th></tr></thead>` +
        `<tbody>${body.join("")}</tbody></table></div>` +
        (rows > 60 ? `<p class="p1" style="margin-top:10px;">Showing the first 60 of ${rows} sweeps.</p>` : ""));
    },
  });
})();
