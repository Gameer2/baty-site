/* Singular Value Decomposition — DOM wiring only. */
(function () {
  "use strict";
  LinAlgPage.init({
    storeKey: "engine-lab:linear-algebra-svd",
    square: false,
    example: { A: [[3, 1, 1], [-1, 3, 1]] },
    compute: (A) => {
      const svd = LinAlg.svd(A);
      const approx = {};
      for (let k = 1; k <= svd.S.length; k++) approx[k] = LinAlg.lowRankApproximation(A, k);
      return { svd, approx };
    },
    render: (r, ui, A) => {
      const { U, S, V, rank, conditionNumber } = r.svd;
      const D = S.map((s, i) => S.map((_, j) => (i === j ? s : 0)));
      const recon = Algorithms.matMul(Algorithms.matMul(U, D), LinAlg.transpose(V));
      let err = 0;
      for (let i = 0; i < A.length; i++) for (let j = 0; j < A[0].length; j++) err = Math.max(err, Math.abs(recon[i][j] - A[i][j]));

      ui.stat("Rank", rank, true);
      ui.stat("σ₁ (largest)", MatrixUI.format(S[0]));
      ui.stat("σ min (nonzero)", MatrixUI.format(S.filter((v) => v > 0).slice(-1)[0] ?? 0));
      ui.stat("Condition number", Number.isFinite(conditionNumber) ? MatrixUI.format(conditionNumber) : "∞ (singular)");
      ui.stat("Check ‖UΣVᵀ − A‖", err.toExponential(2));

      ui.html("Singular values", `<p class="mono" style="font-size:15px;line-height:1.9;">` +
        S.map((s, i) => `σ${i + 1} = ${MatrixUI.format(s)}${s === 0 ? "   (zero — the matrix is rank deficient)" : ""}`).join("<br>") + `</p>`);

      ui.plot("Singular-value spectrum", (el) => LinAlgViz.spectrum(el, S, { label: "σ", xTitle: "index i", yTitle: "σᵢ" }), 260);

      if (A.length === 2 && A[0].length === 2) {
        ui.plot("What A does to the unit circle — the semi-axes are the singular values",
          (el) => LinAlgViz.unitCircleImage(el, A, { U, S }), 380);
      }

      ui.matrix("U (orthonormal columns)", U);
      ui.matrix("Σ", D);
      ui.matrix("V (orthonormal columns)", V);
      ui.matrix("U Σ Vᵀ (should reproduce A)", recon);

      const rows = [];
      for (let k = 1; k < S.length; k++) {
        const a = r.approx[k];
        rows.push(`<tr><td>${k}</td><td class="mono">${a.keptSingularValues.map((v) => MatrixUI.format(v)).join(", ")}</td>` +
          `<td class="mono">${a.frobeniusError.toExponential(3)}</td></tr>`);
      }
      if (rows.length) {
        ui.html("Best rank-k approximation (Eckart–Young)",
          `<p class="p1" style="margin-bottom:12px;">Truncating the sum after k terms gives the closest rank-k matrix to A that exists — the error left behind is exactly the root-sum-square of the singular values you dropped. This is what image compression and PCA compute.</p>` +
          `<div class="data-table-wrap"><table class="data-table"><thead><tr><th>k</th><th>σ kept</th><th>‖A − A<sub>k</sub>‖<sub>F</sub></th></tr></thead><tbody>${rows.join("")}</tbody></table></div>`);
      }
      ui.note("Why not AᵀA", "The textbook derivation eigen-decomposes AᵀA. That squares the condition number, so a singular value of 1e-8 would be lost entirely. This page uses one-sided Jacobi rotations, which never form AᵀA and keep small singular values exactly.", "");
    },
  });
})();
