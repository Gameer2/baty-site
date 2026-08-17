/* Row Reduction (RREF) — DOM wiring only. Math lives in linalg-algorithms.js. */
(function () {
  "use strict";
  LinAlgPage.init({
    storeKey: "engine-lab:linear-algebra-row-reduction",
    square: false,
    example: { A: [[1, 2, -1, 3], [2, 4, -2, 6], [3, 6, -3, 9]] },
    compute: (A) => LinAlg.rref(A),
    render: (r, ui, A) => {
      ui.stat("Rank", r.rank, true);
      ui.stat("Pivot columns", r.pivots.length ? r.pivots.map((p) => p + 1).join(", ") : "none");
      ui.stat("Free columns", r.freeCols.length ? r.freeCols.map((p) => p + 1).join(", ") : "none");
      ui.stat("Row operations", r.steps.length);
      ui.matrix("Original matrix A", A);
      ui.matrix("Reduced row echelon form", r.R, { highlightCols: r.pivots });
      ui.steps(r.steps, r.stepsOmitted);
    },
  });
})();
