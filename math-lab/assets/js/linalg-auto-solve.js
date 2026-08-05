/* Linear Algebra Engine — "Hand It Your Matrix" auto-solve board.
   Classifies A (symmetric? positive-definite? diagonally dominant? square?), picks the
   matching textbook method the way a numerical analyst would — Cholesky for SPD, Jacobi/
   Gauss-Seidel when diagonally dominant, Gaussian elimination otherwise; characteristic
   polynomial for eigenvalues when the matrix is small, shifted QR when it isn't — and shows
   the full working for both solving Ax = b and finding eigenvalues in one pass.
   No new mathematics: every number here comes from LinAlg.* functions already used and
   tested elsewhere in this engine (linear-systems.js, cholesky.js, iterative-solvers.js,
   eigenvalues.js) — this file only adds the classification in front of them. */
(function () {
  "use strict";

  function classify(A) {
    const square = A.length === A[0].length;
    const n = A.length;
    let symmetric = false, spd = false, dominant = false, rowChecks = [];
    if (square) {
      let asym = 0;
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) asym = Math.max(asym, Math.abs(A[i][j] - A[j][i]));
      symmetric = asym < 1e-9;
      if (symmetric) { try { LinAlg.cholesky(A); spd = true; } catch (e) { spd = false; } }
      dominant = true;
      for (let i = 0; i < n; i++) {
        let off = 0;
        for (let j = 0; j < n; j++) if (j !== i) off += Math.abs(A[i][j]);
        const ok = Math.abs(A[i][i]) > off;
        rowChecks.push({ row: i, diagonal: Math.abs(A[i][i]), offDiagonalSum: off, dominant: ok });
        if (!ok) dominant = false;
      }
    }
    return { square, n, symmetric, spd, dominant, rowChecks };
  }

  // Same formatting helper as eigenvalues.js — kept in sync deliberately (see that file).
  function polyString(coeffs) {
    const terms = [];
    for (let k = coeffs.length - 1; k >= 0; k--) {
      const c = coeffs[k];
      if (Math.abs(c) < 1e-12) continue;
      const p = k === 0 ? "" : (k === 1 ? "λ" : `λ^${k}`);
      const mag = Math.abs(c);
      const shown = (k > 0 && Math.abs(mag - 1) < 1e-12) ? "" : MatrixUI.format(mag);
      terms.push(`${terms.length && c > 0 ? "+ " : (c < 0 ? "− " : "")}${shown}${p}`);
    }
    return (terms.join(" ") || "0") + " = 0";
  }

  LinAlgPage.init({
    square: false, vector: true,
    example: { A: [[4, -1, 0], [-1, 4, -1], [0, -1, 4]], b: [15, 10, 10] },

    compute: (A, b) => {
      const cls = classify(A);
      const exact = LinAlg.solveSystem(A, b);

      const extra = {};
      if (cls.spd) { try { extra.chol = LinAlg.cholesky(A); } catch (e) { /* ignore */ } }
      if (cls.square && cls.dominant) {
        try {
          extra.jacobi = LinAlg.jacobi(A, b, 1e-12, 500);
          extra.gs = LinAlg.gaussSeidel(A, b, 1e-12, 500);
        } catch (e) { /* structurally shouldn't happen when dominant, but stay defensive */ }
      }

      let eig = null, spectral = null, eigSpaces = null;
      if (cls.square) {
        eig = LinAlg.eigenvalues(A);
        if (cls.symmetric) { try { spectral = LinAlg.spectralDecomposition(A); } catch (e) { /* ignore */ } }
        eigSpaces = eig.real
          .filter((l, i, arr) => arr.findIndex((x) => Math.abs(x - l) < 1e-7) === i)
          .map((l) => ({ lambda: l, vectors: LinAlg.eigenvectorsFor(A, l) }));
      }

      return { cls, exact, extra, eig, spectral, eigSpaces };
    },

    render: (r, ui, A) => {
      const cls = r.cls;
      ui.stat("Size", `${A.length}×${A[0].length}`, true);
      ui.stat("Symmetric", cls.square ? (cls.symmetric ? "Yes" : "No") : "n/a (not square)");
      ui.stat("Positive definite", cls.symmetric ? (cls.spd ? "Yes" : "No") : "n/a");
      ui.stat("Diagonally dominant", cls.square ? (cls.dominant ? "Yes" : "No") : "n/a");

      /* ---------------- Solving Ax = b ---------------- */
      let methodLine, methodWhy, methodTone;
      if (cls.spd) {
        methodLine = "SPD detected — Cholesky applies";
        methodWhy = "This matrix is symmetric positive-definite, so Cholesky factorization (A = LLᵀ) applies — about half the arithmetic of general elimination, and the factorization succeeding IS the proof of positive-definiteness.";
        methodTone = "ok";
      } else if (cls.square && cls.dominant) {
        methodLine = "Diagonally dominant — iterative methods guaranteed to converge";
        methodWhy = "Every diagonal entry exceeds the sum of the others in its row, so Jacobi and Gauss-Seidel are both guaranteed to converge from any starting vector — cheaper than elimination once a system gets large and sparse.";
        methodTone = "ok";
      } else {
        methodLine = "General case — Gaussian elimination";
        methodWhy = cls.square
          ? "Not symmetric positive-definite and not diagonally dominant, so no faster special-case method applies — the safe, always-works default is row reduction with partial pivoting."
          : "A non-square system — solved the general way, via row reduction on the augmented matrix.";
        methodTone = "";
      }
      ui.note(`Solving Ax = b — ${methodLine}`, methodWhy, methodTone);

      const labels = { unique: "Exactly one solution", infinite: "Infinitely many solutions", none: "No solution" };
      ui.stat("Result", labels[r.exact.type]);
      if (r.exact.type === "none") {
        ui.note("Why there is no solution", r.exact.reason, "bad");
      } else if (r.exact.type === "unique") {
        ui.vectors("Solution x", [r.exact.solution], { prefix: "x" });
      } else {
        ui.html("Solution set",
          `<p class="p1" style="margin-bottom:14px;">Every solution has the form <span class="mono">x = p + ` +
          r.exact.nullBasis.map((_, i) => `t${i + 1}·n${i + 1}`).join(" + ") +
          `</span>. The solution set is ${r.exact.dimensionOfSolutionSet}-dimensional.</p>`);
        ui.vectors("Particular solution p", [r.exact.particular], { prefix: "p" });
        ui.vectors("Null-space directions", r.exact.nullBasis, { prefix: "n" });
      }

      if (r.extra.chol) {
        ui.matrix("Cholesky factor L (A = LLᵀ)", r.extra.chol.L);
      }
      if (r.extra.jacobi) {
        ui.stat("Jacobi sweeps", r.extra.jacobi.converged ? r.extra.jacobi.sweeps : "diverged");
        ui.stat("Gauss-Seidel sweeps", r.extra.gs.converged ? r.extra.gs.sweeps : "diverged");
        ui.plot("Residual per sweep (log scale) — the iterative alternative", (el) => LinAlgViz.convergence(el, [
          { name: "Jacobi", values: r.extra.jacobi.iterations.map((i) => i.residual) },
          { name: "Gauss-Seidel", values: r.extra.gs.iterations.map((i) => i.residual) },
        ]), 300);
      }
      ui.matrix("Reduced augmented matrix [A | b]", r.exact.rref, { highlightCols: r.exact.pivots });
      ui.steps(r.exact.steps, r.exact.stepsOmitted);

      /* ---------------- Eigen-analysis ---------------- */
      if (!r.eig) {
        ui.note("Eigen-analysis", "Only defined for square matrices — this one is not square.", "");
        return;
      }
      const eigTone = r.eig.method === "charpoly" ? "ok" : "";
      const eigLine = r.eig.method === "charpoly" ? "Characteristic polynomial (exact route)" : "Shifted QR iteration (numeric fallback)";
      const eigWhy = r.eig.method === "charpoly"
        ? "This matrix is small enough that the exact characteristic-polynomial route is both accurate and fast."
        : "For a matrix this size the characteristic polynomial's coefficients and roots become numerically unstable, so eigenvalues come from shifted QR iteration on the Hessenberg form instead — the industrial-strength method, the same idea a library's eig() call uses under the hood.";
      ui.note(`Eigenvalues — ${eigLine}`, eigWhy, eigTone);
      if (r.eig.charPoly) {
        ui.html("Characteristic equation det(A − λI) = 0", `<p class="mono" style="font-size:15px;">${polyString(r.eig.charPoly)}</p>`);
      }
      ui.html("Eigenvalues", `<p class="mono" style="font-size:15px;line-height:1.9;">` +
        r.eig.values.map((z, i) => `λ${i + 1} = ${z.im === 0 ? MatrixUI.format(z.re) : `${MatrixUI.format(z.re)} ${z.im > 0 ? "+" : "−"} ${MatrixUI.format(Math.abs(z.im))}i`}`).join("<br>") + `</p>`);

      if (r.spectral) {
        ui.note("Spectral theorem applies", "This matrix is symmetric, so its eigenvalues are guaranteed real and its eigenvectors orthogonal — computed directly via Jacobi rotations rather than solving each eigenspace separately.", "ok");
      } else if (r.eig.hasComplex) {
        ui.note("Complex eigenvalues", "This matrix has a complex-conjugate pair, so it rotates rather than merely stretching — no real eigenvectors exist for those values.", "");
      }
      r.eigSpaces.forEach((s) => {
        ui.vectors(`Eigenspace for λ = ${MatrixUI.format(s.lambda)}`, s.vectors, { prefix: "v", emptyMessage: "no eigenvector found at this tolerance" });
      });
      const realVecs = [], vlabels = [];
      r.eigSpaces.forEach((s) => s.vectors.forEach((v) => { realVecs.push(v); vlabels.push(`λ=${MatrixUI.format(s.lambda)}`); }));
      if (realVecs.length) ui.plot("Eigenvectors — the directions A only stretches", (el) => LinAlgViz.vectors(el, realVecs, { labels: vlabels }), 340);
    },
  });
})();
