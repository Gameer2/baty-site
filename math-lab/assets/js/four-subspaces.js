/* Rank and the fundamental subspaces — DOM wiring only. */
(function () {
  "use strict";
  LinAlgPage.init({
    square: false,
    example: { A: [[1, 2, 3], [4, 5, 6], [7, 8, 9]] },
    compute: (A) => ({
      rn: LinAlg.rankNullity(A),
      nul: LinAlg.nullSpaceBasis(A),
      col: LinAlg.columnSpaceBasis(A),
      row: LinAlg.rowSpaceBasis(A),
      rref: LinAlg.rref(A),
    }),
    render: (r, ui) => {
      ui.stat("Rank", r.rn.rank, true);
      ui.stat("Nullity", r.rn.nullity);
      ui.stat("Columns", r.rn.cols);
      ui.stat("rank + nullity", r.rn.rank + r.rn.nullity);
      ui.html("Rank–nullity theorem",
        `<p class="p1"><span class="mono">rank + nullity = ${r.rn.rank} + ${r.rn.nullity} = ${r.rn.cols}</span>, ` +
        `which is the number of columns — as the theorem requires.</p>`);
      ui.vectors("Basis for the column space (original columns of A at pivot positions)", r.col, { prefix: "c", emptyMessage: "the zero subspace" });
      ui.vectors("Basis for the row space (nonzero rows of the RREF)", r.row, { prefix: "r", emptyMessage: "the zero subspace" });
      ui.vectors("Basis for the null space", r.nul, { prefix: "n", emptyMessage: "only the zero vector — A has full column rank" });
      ui.plot("The column space — the subspace A can reach", (el) => LinAlgViz.span(el, r.col), 360);
      ui.plot("The null space — the directions A collapses to zero", (el) => LinAlgViz.span(el, r.nul), 360);
      ui.matrix("Reduced row echelon form", r.rref.R, { highlightCols: r.rref.pivots });
    },
  });
})();
