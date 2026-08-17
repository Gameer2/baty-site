/* Matrix inverse by Gauss-Jordan — DOM wiring only. */
(function () {
  "use strict";
  LinAlgPage.init({
    storeKey: "engine-lab:linear-algebra-matrix-inverse",
    square: true,
    example: { A: [[2, -1, 0], [-1, 2, -1], [0, -1, 2]] },
    compute: (A) => ({ inv: LinAlg.inverse(A), det: LinAlg.determinant(A) }),
    render: (r, ui, A) => {
      const n = A.length;
      const product = Algorithms.matMul(A, r.inv.inverse);
      let worst = 0;
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) worst = Math.max(worst, Math.abs(product[i][j] - (i === j ? 1 : 0)));
      ui.stat("Invertible", "Yes", true);
      ui.stat("Rank", r.inv.rank);
      ui.stat("det(A)", MatrixUI.format(r.det));
      ui.stat("Check ‖AA⁻¹ − I‖", worst.toExponential(2));
      ui.matrix("Inverse A⁻¹", r.inv.inverse);
      ui.matrix("Verification A · A⁻¹ (should be the identity)", product);
      ui.steps(r.inv.steps, r.inv.stepsOmitted);
    },
  });
})();
