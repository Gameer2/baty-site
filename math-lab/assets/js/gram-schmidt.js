/* Gram-Schmidt (modified) and QR — DOM wiring only. */
(function () {
  "use strict";
  function columnsOf(A) { return A[0].map((_, j) => A.map((r) => r[j])); }
  LinAlgPage.init({
    square: false,
    example: { A: [[1, 1, 0], [1, 0, 1], [0, 1, 1]] },
    compute: (A) => {
      const cols = columnsOf(A);
      const gs = LinAlg.gramSchmidt(cols);
      const qr = LinAlg.qrDecompose(A);
      return { cols, gs, qr };
    },
    render: (r, ui, A) => {
      const Qt = LinAlg.transpose(r.qr.Q);
      const QtQ = Algorithms.matMul(Qt, r.qr.Q);
      const QR = Algorithms.matMul(r.qr.Q, r.qr.R);
      let orth = 0, recon = 0;
      for (let i = 0; i < QtQ.length; i++) for (let j = 0; j < QtQ[i].length; j++) orth = Math.max(orth, Math.abs(QtQ[i][j] - (i === j ? 1 : 0)));
      for (let i = 0; i < A.length; i++) for (let j = 0; j < A[i].length; j++) recon = Math.max(recon, Math.abs(QR[i][j] - A[i][j]));
      ui.stat("Vectors", r.cols.length, true);
      ui.stat("Check ‖QᵀQ − I‖", orth.toExponential(2));
      ui.stat("Check ‖QR − A‖", recon.toExponential(2));
      ui.stat("Process", "modified");
      ui.vectors("Original vectors (columns of A)", r.cols, { prefix: "a" });
      ui.vectors("Orthonormal vectors q", r.gs.Q, { prefix: "q" });
      ui.matrix("Q", r.qr.Q);
      ui.matrix("R (upper triangular)", r.qr.R);
      ui.matrix("Q · R (should reproduce A)", QR);
      ui.plot("Before: the original vectors", (el) => LinAlgViz.vectors(el, r.cols, { labels: r.cols.map((_, i) => `a${i + 1}`) }), 360);
      ui.plot("After: mutually perpendicular, same span", (el) => LinAlgViz.vectors(el, r.gs.Q, { labels: r.gs.Q.map((_, i) => `q${i + 1}`) }), 360);
      ui.note("Modified vs classical", "Each projection is subtracted from the running vector rather than from the original column. The two are identical on paper, but the modified form keeps its orthogonality in floating point where the classical one drifts.", "ok");
      ui.steps(r.gs.steps);
    },
  });
})();
