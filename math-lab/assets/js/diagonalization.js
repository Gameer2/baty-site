/* Diagonalization A = P D P^-1 — DOM wiring only. */
(function () {
  "use strict";
  LinAlgPage.init({
    square: true,
    example: { A: [[4, -2, 1], [-2, 4, -2], [1, -2, 4]] },
    compute: (A) => LinAlg.diagonalize(A),
    render: (d, ui, A) => {
      ui.stat("Diagonalizable", d.diagonalizable ? "Yes" : "No", true);
      ui.stat("Distinct eigenvalues", d.eigenpairs.length || "—");
      ui.stat("Independent eigenvectors", d.eigenpairs.reduce((s, p) => s + p.geometricMultiplicity, 0));
      ui.stat("Size n", A.length);

      if (!d.diagonalizable) {
        ui.note("Why not", d.reason, "bad");
      }
      if (d.eigenpairs.length) {
        ui.html("Multiplicities",
          `<div class="data-table-wrap"><table class="data-table"><thead><tr><th>λ</th><th>algebraic</th><th>geometric</th><th></th></tr></thead><tbody>` +
          d.eigenpairs.map((p) => {
            const okPair = p.geometricMultiplicity === p.algebraicMultiplicity;
            return `<tr><td class="mono">${MatrixUI.format(p.eigenvalue)}</td><td>${p.algebraicMultiplicity}</td><td>${p.geometricMultiplicity}</td>` +
              `<td class="mono">${okPair ? "matched" : "deficient"}</td></tr>`;
          }).join("") + `</tbody></table></div>` +
          `<p class="p1" style="margin-top:12px;">A matrix is diagonalizable exactly when every eigenvalue's geometric multiplicity matches its algebraic multiplicity.</p>`);
      }
      if (d.diagonalizable) {
        const Pinv = LinAlg.inverse(d.P).inverse;
        const recon = Algorithms.matMul(Algorithms.matMul(d.P, d.D), Pinv);
        let worst = 0;
        for (let i = 0; i < A.length; i++) for (let j = 0; j < A.length; j++) worst = Math.max(worst, Math.abs(recon[i][j] - A[i][j]));
        ui.matrix("P — eigenvectors as columns", d.P);
        ui.matrix("D — eigenvalues on the diagonal", d.D);
        ui.matrix("P⁻¹", Pinv);
        ui.matrix("P · D · P⁻¹ (should reproduce A)", recon);
        ui.note("Verification", `‖PDP⁻¹ − A‖ = ${worst.toExponential(2)} — the factorization reproduces A.`, "ok");
      }
    },
  });
})();
