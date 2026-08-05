/* Eigenvalues and eigenvectors — DOM wiring only. */
(function () {
  "use strict";
  function polyString(coeffs) {
    const terms = [];
    for (let k = coeffs.length - 1; k >= 0; k--) {
      const c = coeffs[k];
      if (Math.abs(c) < 1e-12) continue;
      const p = k === 0 ? "" : (k === 1 ? "λ" : `λ^${k}`);
      // A coefficient of 1 is not written in front of a power of λ — "λ^2", not "1λ^2".
      // The constant term always shows its number.
      const mag = Math.abs(c);
      const shown = (k > 0 && Math.abs(mag - 1) < 1e-12) ? "" : MatrixUI.format(mag);
      terms.push(`${terms.length && c > 0 ? "+ " : (c < 0 ? "− " : "")}${shown}${p}`);
    }
    return (terms.join(" ") || "0") + " = 0";
  }
  LinAlgPage.init({
    square: true,
    example: { A: [[4, -2, 1], [-2, 4, -2], [1, -2, 4]] },
    compute: (A) => {
      const e = LinAlg.eigenvalues(A);
      const spaces = e.real.filter((l, i, arr) => arr.findIndex((x) => Math.abs(x - l) < 1e-7) === i)
        .map((l) => ({ lambda: l, vectors: LinAlg.eigenvectorsFor(A, l) }));
      return { e, spaces };
    },
    render: (r, ui, A) => {
      const n = A.length;
      let trace = 0; for (let i = 0; i < n; i++) trace += A[i][i];
      ui.stat("Eigenvalues", r.e.values.length, true);
      ui.stat("All real?", r.e.hasComplex ? "No" : "Yes");
      ui.stat("Sum (= trace)", MatrixUI.format(r.e.values.reduce((s, z) => s + z.re, 0)) + " / " + MatrixUI.format(trace));
      ui.stat("Product (= det)", MatrixUI.format(LinAlg.determinant(A)));
      ui.stat("Method", r.e.method === "charpoly" ? "char. polynomial" : "shifted QR");
      if (r.e.charPoly) {
        ui.html("Characteristic equation det(A − λI) = 0", `<p class="mono" style="font-size:15px;">${polyString(r.e.charPoly)}</p>`);
      } else {
        ui.note("Method",
          "For a matrix this size the characteristic polynomial is not used: its coefficients grow past what a double can hold and its roots are extremely sensitive to them, so the eigenvalues come from shifted QR iteration on the Hessenberg form instead. Same eigenvalues, far better accuracy.", "");
      }
      ui.html("Eigenvalues", `<p class="mono" style="font-size:15px;line-height:1.9;">` +
        r.e.values.map((z, i) => `λ${i + 1} = ${z.im === 0 ? MatrixUI.format(z.re) : `${MatrixUI.format(z.re)} ${z.im > 0 ? "+" : "−"} ${MatrixUI.format(Math.abs(z.im))}i`}`).join("<br>") + `</p>`);
      r.spaces.forEach((s, i) => {
        ui.vectors(`Eigenspace for λ = ${MatrixUI.format(s.lambda)} — null space of (A − λI)`, s.vectors,
          { prefix: "v", emptyMessage: "no eigenvector found at this tolerance" });
      });
      if (r.e.hasComplex) {
        ui.note("Complex eigenvalues", "This matrix has a complex conjugate pair, so it has no real eigenvectors for those values — it rotates rather than merely stretching. Real eigenvectors are shown above only for the real eigenvalues.", "");
      }
      {
        const realVecs = [];
        const labels = [];
        r.spaces.forEach((s) => s.vectors.forEach((v) => { realVecs.push(v); labels.push(`λ=${MatrixUI.format(s.lambda)}`); }));
        if (realVecs.length) ui.plot("Eigenvectors — the directions A only stretches", (el) => LinAlgViz.vectors(el, realVecs, { labels }), 360);
      }
      ui.note("Cross-check", `The eigenvalues sum to the trace (${MatrixUI.format(trace)}) and multiply to the determinant (${MatrixUI.format(LinAlg.determinant(A))}) — two invariants that hold for every matrix.`, "ok");
    },
  });
})();
