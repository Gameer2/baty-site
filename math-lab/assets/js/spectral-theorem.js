/* The spectral theorem — DOM wiring only. */
(function () {
  "use strict";
  LinAlgPage.init({
    storeKey: "engine-lab:linear-algebra-spectral-theorem",
    square: true,
    example: { A: [[4, -2, 1], [-2, 4, -2], [1, -2, 4]] },
    compute: (A) => LinAlg.spectralDecomposition(A),
    render: (sp, ui, A) => {
      const n = A.length;
      const QDQt = Algorithms.matMul(Algorithms.matMul(sp.Q, sp.D), LinAlg.transpose(sp.Q));
      const QtQ = Algorithms.matMul(LinAlg.transpose(sp.Q), sp.Q);
      let rec = 0, orth = 0;
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
        rec = Math.max(rec, Math.abs(QDQt[i][j] - A[i][j]));
        orth = Math.max(orth, Math.abs(QtQ[i][j] - (i === j ? 1 : 0)));
      }
      ui.stat("Eigenvalues", n, true);
      ui.stat("All real", "Yes");
      ui.stat("Check ‖QDQᵀ − A‖", rec.toExponential(2));
      ui.stat("Check ‖QᵀQ − I‖", orth.toExponential(2));

      ui.note("What the theorem guarantees", "Because A is symmetric, its eigenvalues are all real and eigenvectors from different eigenvalues are automatically orthogonal — so Q can be made orthogonal, and Q⁻¹ is just Qᵀ. No symmetric matrix is ever defective.", "ok");

      ui.html("Eigenvalues", `<p class="mono" style="font-size:15px;line-height:1.9;">` +
        sp.eigenvalues.map((l, i) => `λ${i + 1} = ${MatrixUI.format(l)}`).join("<br>") + `</p>`);

      sp.eigenspaces.forEach((e) => {
        ui.vectors(`Orthonormal eigenvectors for λ = ${MatrixUI.format(e.eigenvalue)}${e.multiplicity > 1 ? ` (multiplicity ${e.multiplicity})` : ""}`,
          e.vectors, { prefix: "q" });
      });

      if (n === 2 || n === 3) {
        ui.plot("The eigenvectors — mutually perpendicular, as the theorem promises",
          (el) => LinAlgViz.vectors(el, sp.Q[0].map((_, j) => sp.Q.map((r) => r[j])),
            { labels: sp.eigenvalues.map((l, i) => `q${i + 1} (λ=${MatrixUI.format(l)})`) }), 380);
      }

      ui.matrix("Q — orthonormal eigenvectors as columns", sp.Q);
      ui.matrix("D — eigenvalues on the diagonal", sp.D);
      ui.matrix("Q D Qᵀ (should reproduce A)", QDQt);
    },
  });
})();
