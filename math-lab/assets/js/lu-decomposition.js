/* LU decomposition with partial pivoting — DOM wiring only. */
(function () {
  "use strict";
  LinAlgPage.init({
    storeKey: "engine-lab:linear-algebra-lu-decomposition",
    square: true,
    example: { A: [[2, 1, 1], [4, -6, 0], [-2, 7, 2]] },
    compute: (A) => LinAlg.luDecompose(A),
    render: (r, ui, A) => {
      const PA = Algorithms.matMul(r.P, A);
      const LU = Algorithms.matMul(r.L, r.U);
      let worst = 0;
      for (let i = 0; i < PA.length; i++) for (let j = 0; j < PA[i].length; j++) worst = Math.max(worst, Math.abs(PA[i][j] - LU[i][j]));
      ui.stat("Row swaps", r.swaps, true);
      ui.stat("det(A)", MatrixUI.format(r.det));
      ui.stat("Row order", r.perm.map((p) => p + 1).join(", "));
      ui.stat("Check ‖PA − LU‖", worst.toExponential(2));
      ui.matrix("L (unit lower-triangular)", r.L);
      ui.matrix("U (upper-triangular)", r.U);
      ui.matrix("P (permutation)", r.P);
      ui.matrix("P · A", PA);
      ui.matrix("L · U (should match P · A above)", LU);
      ui.note("Why P is needed", r.swaps === 0
        ? "No row swaps were required here, so P is the identity and A = LU directly."
        : `Partial pivoting swapped rows ${r.swaps} time(s) to keep the largest available pivot, which is what keeps the arithmetic stable. P records those swaps.`, "");
    },
  });
})();
