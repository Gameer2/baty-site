/* Linear independence and basis — DOM wiring only. Vectors are the COLUMNS of the grid. */
(function () {
  "use strict";
  function columnsOf(A) { return A[0].map((_, j) => A.map((r) => r[j])); }
  LinAlgPage.init({
    square: false,
    example: { A: [[1, 2, 0], [0, 0, 1], [0, 0, 0]] },
    compute: (A) => {
      const vecs = columnsOf(A);
      return { vecs, ind: LinAlg.isLinearlyIndependent(vecs), basis: LinAlg.basisFromSpanningSet(vecs) };
    },
    render: (r, ui) => {
      ui.stat("Independent?", r.ind.independent ? "Yes" : "No", true);
      ui.stat("Vectors given", r.ind.count);
      ui.stat("Rank", r.ind.rank);
      ui.stat("dim(span)", r.basis.dimension);
      ui.vectors("The vectors (columns of your matrix)", r.vecs, { prefix: "v" });
      if (r.ind.independent) {
        ui.note("Conclusion", `The ${r.ind.count} vectors are linearly independent — the rank equals the number of vectors, so none is a combination of the others.`, "ok");
      } else {
        ui.note("Conclusion", `The vectors are dependent: rank ${r.ind.rank} is less than the ${r.ind.count} vectors given.`, "bad");
        const rel = r.ind.relations[0];
        const terms = rel.map((c, i) => (Math.abs(c) < 1e-12 ? null : `${MatrixUI.format(c)}·v${i + 1}`)).filter(Boolean).join(" + ");
        ui.html("An explicit dependency relation",
          `<p class="p1">A non-trivial combination giving the zero vector: <span class="mono">${terms} = 0</span>.` +
          (r.ind.relations.length > 1 ? ` There are ${r.ind.relations.length} independent relations in total.` : "") + `</p>`);
        ui.vectors("All independent dependency relations (null-space basis)", r.ind.relations, { prefix: "rel" });
      }
      ui.vectors(`Basis for the span — original vectors ${r.basis.indices.map((i) => i + 1).join(", ")}`, r.basis.basis, { prefix: "b" });
      ui.plot("The vectors, and the subspace they span", (el) => LinAlgViz.span(el, r.basis.basis), 380);
    },
  });
})();
