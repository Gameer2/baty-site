/* Determinant, two ways — DOM wiring only. */
(function () {
  "use strict";
  LinAlgPage.init({
    storeKey: "engine-lab:linear-algebra-determinant",
    square: true,
    example: { A: [[2, -1, 0], [-1, 2, -1], [0, -1, 2]] },
    compute: (A) => {
      const elimination = LinAlg.determinant(A);
      let cofactor = null, cofactorError = null;
      try { cofactor = LinAlg.determinantCofactor(A); } catch (e) { cofactorError = e.message; }
      return { elimination, cofactor, cofactorError, lu: A.length > 0 && Math.abs(elimination) > 1e-12 ? LinAlg.luDecompose(A) : null };
    },
    render: (r, ui, A) => {
      ui.stat("det(A)", MatrixUI.format(r.elimination), true);
      ui.stat("By elimination", MatrixUI.format(r.elimination));
      ui.stat("By cofactor expansion", r.cofactor === null ? "n/a" : MatrixUI.format(r.cofactor));
      ui.stat("Singular?", Math.abs(r.elimination) < 1e-12 ? "Yes (det = 0)" : "No");
      if (r.cofactor !== null) {
        const agree = Math.abs(r.elimination - r.cofactor) < 1e-8 * Math.max(1, Math.abs(r.elimination));
        ui.note("Cross-check", agree
          ? `Both methods agree (difference ${Math.abs(r.elimination - r.cofactor).toExponential(2)}). Elimination costs O(n³); cofactor expansion costs O(n!).`
          : `The two methods disagree — that is a bug, please report it.`, agree ? "ok" : "bad");
      } else {
        ui.note("Cofactor expansion", r.cofactorError, "");
      }
      if (Math.abs(r.elimination) < 1e-12) {
        ui.note("What det = 0 means", "The columns are linearly dependent, A has no inverse, and Ax = b either has no solution or infinitely many.", "");
      }
      if (r.lu) ui.matrix("Upper-triangular U from elimination — det is the product of its diagonal", r.lu.U);
    },
  });
})();
