/* Linear Transformations (2x2) — DOM wiring only.
   Every number on this page (determinant, trace, rank, eigenvalues) now comes from
   LinAlg rather than from formulas written inline in the page, which is what the rest
   of the engine does. The 2x2 quadratic-formula eigenvalue code this replaced could not
   report multiplicity and duplicated maths that LinAlg already does for any n. */
(function () {
  "use strict";
  const ids = ["m00", "m01", "m10", "m11"];
  const inputs = ids.map((id) => document.getElementById(id));
  const matPreview = document.getElementById("matPreview");
  const statDet = document.getElementById("statDet");
  const statTrace = document.getElementById("statTrace");
  const statRank = document.getElementById("statRank");
  const formulaEigen = document.getElementById("formulaEigen");
  const singularNote = document.getElementById("singularNote");
  const canvas = document.getElementById("matrixCanvas");
  const STORE_KEY = "engine-lab:linear-algebra";

  let scene = null;
  const fmt = (x) => Engine.formatNum(x, 3);

  function readMatrix() {
    const [a, b, c, d] = inputs.map((el) => parseFloat(el.value) || 0);
    return [[a, b], [c, d]];
  }

  function recompute() {
    const M = readMatrix();
    const [[a, b], [c, d]] = M;

    Engine.renderKatex(matPreview,
      `A = \\begin{bmatrix} ${fmt(a)} & ${fmt(b)} \\\\ ${fmt(c)} & ${fmt(d)} \\end{bmatrix}`, false);

    const det = LinAlg.determinant(M);
    const trace = a + d;
    const rank = LinAlg.rank(M);

    statDet.textContent = fmt(det);
    statTrace.textContent = fmt(trace);
    statRank.textContent = String(rank);
    singularNote.style.display = Math.abs(det) < 1e-9 ? "flex" : "none";

    // Eigenvalues from the shared routine, so this page agrees with the eigenvalue page
    // rather than having its own opinion.
    const e = LinAlg.eigenvalues(M);
    let latex;
    if (e.hasComplex) {
      const z = e.values[0];
      latex = `\\lambda_{1,2} \\approx ${fmt(z.re)} \\pm ${fmt(Math.abs(z.im))}i`;
    } else if (e.values.length === 2 && Math.abs(e.values[0].re - e.values[1].re) < 1e-9) {
      const g = LinAlg.eigenvectorsFor(M, e.values[0].re).length;
      latex = `\\lambda_1 = \\lambda_2 \\approx ${fmt(e.values[0].re)}` +
        `\\quad (\\text{repeated, } ${g} \\text{ independent eigenvector${g === 1 ? "" : "s"}})`;
    } else {
      latex = `\\lambda_1 \\approx ${fmt(e.values[0].re)}, \\quad \\lambda_2 \\approx ${fmt(e.values[1].re)}`;
    }
    Engine.renderKatex(formulaEigen, latex, true);

    // Proto.initMatrixScene returns only { dispose } — there is no update method — so a new
    // matrix means disposing the old scene and rebuilding, exactly as the original page did.
    if (canvas && window.Proto && Proto.initMatrixScene && typeof THREE !== "undefined") {
      if (scene) scene.dispose();
      scene = Proto.initMatrixScene(canvas, M, 0x8570b3);
    }
    Proto.saveState(STORE_KEY, { m: M });
  }

  const debounced = Engine.debounce(recompute, 120);
  inputs.forEach((el) => el.addEventListener("input", debounced));

  document.getElementById("presetRow").addEventListener("click", (ev) => {
    const btn = ev.target.closest(".chip");
    if (!btn) return;
    document.querySelectorAll("#presetRow .chip").forEach((c) => c.classList.toggle("is-active", c === btn));
    const vals = (btn.dataset.preset || "1,0,0,1").split(",").map(Number);
    inputs.forEach((el, i) => { el.value = String(vals[i]); });
    recompute();
  });

  document.addEventListener("DOMContentLoaded", () => {
    const saved = Proto.loadState(STORE_KEY);
    if (saved && Array.isArray(saved.m)) {
      inputs[0].value = saved.m[0][0]; inputs[1].value = saved.m[0][1];
      inputs[2].value = saved.m[1][0]; inputs[3].value = saved.m[1][1];
    }
    recompute(); // builds the scene itself
  });
})();
