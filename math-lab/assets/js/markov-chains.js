/* Markov chains — DOM wiring only. */
(function () {
  "use strict";
  LinAlgPage.init({
    square: true,
    example: { A: [[0.9, 0.5, 0.1], [0.05, 0.4, 0.3], [0.05, 0.1, 0.6]] },
    compute: (P) => {
      const ss = LinAlg.markovSteadyState(P);
      const start = new Array(P.length).fill(0); start[0] = 1;
      return { ss, evo: LinAlg.markovEvolve(P, start, 40) };
    },
    render: (r, ui, P) => {
      const n = P.length;
      const applied = Algorithms.matVec(r.ss.convention === "column-stochastic" ? P : LinAlg.transpose(P), r.ss.steadyState);
      let fixErr = 0;
      for (let i = 0; i < n; i++) fixErr = Math.max(fixErr, Math.abs(applied[i] - r.ss.steadyState[i]));

      ui.stat("States", n, true);
      ui.stat("Convention", r.ss.convention === "column-stochastic" ? "columns sum to 1" : "rows sum to 1");
      ui.stat("Unique steady state", r.ss.uniqueUpToScale ? "Yes" : `No (${r.ss.nullSpaceDimension}-dim)`);
      ui.stat("Check ‖Pv − v‖", fixErr.toExponential(2));

      ui.vectors("Steady-state distribution", [r.ss.steadyState], { prefix: "π" });
      ui.note("What this is", "The steady state is the eigenvector for eigenvalue 1, normalised to sum to 1. It is computed here exactly, as the null space of (P − I), rather than by simulating until things stop moving — the simulation below is a check on it, not the method. Ranking pages by this eigenvector is what PageRank does.", "ok");

      ui.plot("Starting from state 1, the distribution settles onto the steady state (dotted)",
        (el) => LinAlgViz.evolution(el, r.evo.history, { steadyState: r.ss.steadyState }), 340);

      ui.html("Steady state vs. long-run simulation",
        `<div class="data-table-wrap"><table class="data-table"><thead><tr><th>state</th><th>exact π</th><th>after 40 steps</th><th>difference</th></tr></thead><tbody>` +
        r.ss.steadyState.map((v, i) => `<tr><td>${i + 1}</td><td class="mono">${MatrixUI.format(v)}</td>` +
          `<td class="mono">${MatrixUI.format(r.evo.final[i])}</td>` +
          `<td class="mono">${Math.abs(v - r.evo.final[i]).toExponential(2)}</td></tr>`).join("") +
        `</tbody></table></div>`);
    },
  });
})();
