/* Least squares — DOM wiring only. */
(function () {
  "use strict";
  LinAlgPage.init({
    square: false, vector: true,
    example: { A: [[1, 0], [1, 1], [1, 2], [1, 3]], b: [1, 3, 4, 8] },
    compute: (A, b) => LinAlg.leastSquares(A, b),
    render: (ls, ui, A) => {
      ui.stat("‖Ax − b‖", MatrixUI.format(ls.residualNorm), true);
      ui.stat("R²", MatrixUI.format(ls.r2));
      ui.stat("Unknowns", A[0].length);
      ui.stat("Equations", A.length);

      ui.vectors("Least-squares solution x (via QR)", [ls.solution], { prefix: "x" });
      if (ls.viaQR && ls.viaNormalEquations) {
        let diff = 0;
        for (let i = 0; i < ls.viaQR.length; i++) diff = Math.max(diff, Math.abs(ls.viaQR[i] - ls.viaNormalEquations[i]));
        ui.html("Two routes, compared",
          `<div class="data-table-wrap"><table class="data-table"><thead><tr><th></th>${ls.viaQR.map((_, i) => `<th>x${i + 1}</th>`).join("")}</tr></thead><tbody>` +
          `<tr><td>via QR (stable)</td>${ls.viaQR.map((v) => `<td class="mono">${MatrixUI.format(v)}</td>`).join("")}</tr>` +
          `<tr><td>via AᵀAx = Aᵀb</td>${ls.viaNormalEquations.map((v) => `<td class="mono">${MatrixUI.format(v)}</td>`).join("")}</tr>` +
          `</tbody></table></div><p class="p1" style="margin-top:12px;">Largest disagreement: <span class="mono">${diff.toExponential(2)}</span>. The normal equations are the derivation every textbook shows, but they square the condition number — on an ill-conditioned A the two columns above separate.</p>`);
      }

      // The defining property, checked rather than asserted.
      let worst = 0;
      for (let j = 0; j < A[0].length; j++) {
        let dot = 0;
        for (let i = 0; i < A.length; i++) dot += A[i][j] * ls.residualVector[i];
        worst = Math.max(worst, Math.abs(dot));
      }
      ui.note("The defining property", `The residual must be orthogonal to every column of A — that is what makes this the closest point. Largest |column · residual| = ${worst.toExponential(2)}.`, "ok");

      ui.vectors("Residual (b − Ax)", [ls.residualVector], { prefix: "r" });

      // If A is [1, x] the fit is a line, so it can be drawn.
      const isLineFit = A[0].length === 2 && A.every((row) => Math.abs(row[0] - 1) < 1e-12);
      if (isLineFit) {
        const xs = A.map((r2) => r2[1]);
        const bs = ls.fitted.map((v, i) => v - ls.residualVector[i]);
        ui.plot("The fitted line", (el) => {
          if (typeof Plotly === "undefined") return false;
          const lo = Math.min(...xs), hi = Math.max(...xs), pad = (hi - lo) * 0.1 || 1;
          Plotly.react(el, [
            { x: xs, y: bs, mode: "markers", marker: { color: "#8570b3", size: 10 }, name: "data" },
            { x: [lo - pad, hi + pad], y: [lo - pad, hi + pad].map((x) => ls.solution[0] + ls.solution[1] * x),
              mode: "lines", line: { color: "#ed6d40", width: 2.5 }, name: "fit" },
          ], Engine.plotlyBaseLayout({ showlegend: false }), Engine.plotlyConfig);
          return true;
        }, 320);
      }
    },
  });
})();
