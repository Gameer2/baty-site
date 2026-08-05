/* Conjugate gradient — DOM wiring only. */
(function () {
  "use strict";
  LinAlgPage.init({
    square: true, vector: true,
    example: { A: [[4, -1, 0], [-1, 4, -1], [0, -1, 4]], b: [15, 10, 10] },
    compute: (A, b) => {
      const cg = LinAlg.conjugateGradient(A, b, 1e-14);
      let gs = null, jac = null;
      try { gs = LinAlg.gaussSeidel(A, b, 1e-14, 500); } catch (e) { /* not applicable */ }
      try { jac = LinAlg.jacobi(A, b, 1e-14, 500); } catch (e) { /* not applicable */ }
      return { cg, gs, jac, direct: LinAlg.solveSystem(A, b) };
    },
    render: (r, ui, A) => {
      const { cg } = r;
      ui.stat("Steps", cg.steps, true);
      ui.stat("Size n", cg.size);
      ui.stat("Converged", cg.converged ? "Yes" : "No");
      ui.stat("Final residual", cg.iterations.length ? cg.iterations[cg.iterations.length - 1].residual.toExponential(2) : "—");
      ui.note("The guarantee", `Each step moves along a direction A-orthogonal to every previous one, so after n steps the directions span the whole space and nothing is left to correct. In exact arithmetic conjugate gradient is a direct method: it took ${cg.steps} step${cg.steps === 1 ? "" : "s"} here for n = ${cg.size}.`, "ok");
      ui.vectors("Solution x", [cg.solution], { prefix: "x" });
      if (r.direct.type === "unique") ui.vectors("Direct elimination, for comparison", [r.direct.solution], { prefix: "x" });

      const series = [{ name: "Conjugate gradient", values: cg.iterations.map((i) => i.residual) }];
      if (r.gs && r.gs.iterations.length) series.push({ name: "Gauss-Seidel", values: r.gs.iterations.map((i) => i.residual) });
      if (r.jac && r.jac.iterations.length) series.push({ name: "Jacobi", values: r.jac.iterations.map((i) => i.residual) });
      ui.plot("Residual per step (log scale) — CG stops dead; the sweeps decay geometrically",
        (el) => LinAlgViz.convergence(el, series, { yTitle: "‖b − Ax‖" }), 340);

      ui.html("Step by step",
        `<div class="data-table-wrap"><table class="data-table"><thead><tr><th>step</th><th>α</th><th>‖b − Ax‖</th></tr></thead><tbody>` +
        cg.iterations.map((it) => `<tr><td>${it.n}</td><td class="mono">${MatrixUI.format(it.alpha)}</td><td class="mono">${it.residual.toExponential(3)}</td></tr>`).join("") +
        `</tbody></table></div>`);
    },
  });
})();
