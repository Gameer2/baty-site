/* Cholesky decomposition — DOM wiring only. */
(function () {
  "use strict";
  LinAlgPage.init({
    storeKey: "engine-lab:linear-algebra-cholesky",
    square: true,
    example: { A: [[4, 2, -2], [2, 10, 2], [-2, 2, 5]] },
    compute: (A) => ({ chol: LinAlg.cholesky(A), lu: LinAlg.luDecompose(A) }),
    render: (r, ui, A) => {
      const n = A.length;
      const LLt = Algorithms.matMul(r.chol.L, LinAlg.transpose(r.chol.L));
      let err = 0;
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) err = Math.max(err, Math.abs(LLt[i][j] - A[i][j]));
      ui.stat("Positive definite", "Yes", true);
      ui.stat("det(A)", MatrixUI.format(r.chol.det));
      ui.stat("Check ‖LLᵀ − A‖", err.toExponential(2));
      ui.stat("vs LU", `${MatrixUI.format(r.lu.det)}`);
      ui.note("Why it succeeded", "The factorization exists exactly when the matrix is symmetric positive definite, so completing it IS the proof — every value under a square root came out positive. That makes Cholesky the standard positive-definiteness test, and it needs about half the arithmetic of LU.", "ok");
      ui.matrix("L (lower-triangular)", r.chol.L);
      ui.matrix("Lᵀ", LinAlg.transpose(r.chol.L));
      ui.matrix("L Lᵀ (should reproduce A)", LLt);
      ui.html("Determinant from the diagonal",
        `<p class="p1">det(A) = (∏ Lᵢᵢ)² = <span class="mono">(${r.chol.L.map((row, i) => MatrixUI.format(row[i])).join(" × ")})²  =  ${MatrixUI.format(r.chol.det)}</span>, matching the LU determinant <span class="mono">${MatrixUI.format(r.lu.det)}</span>.</p>`);
    },
  });
})();
