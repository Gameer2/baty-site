/* Linear Systems Ax = b — DOM wiring only. */
(function () {
  "use strict";
  LinAlgPage.init({
    square: false, vector: true,
    example: { A: [[1, 2, 3], [2, 4, 6], [1, 1, 1]], b: [6, 12, 3] },
    compute: (A, b) => LinAlg.solveSystem(A, b),
    render: (s, ui, A) => {
      const labels = { unique: "Exactly one solution", infinite: "Infinitely many solutions", none: "No solution" };
      ui.stat("Result", labels[s.type], true);
      ui.stat("rank(A)", s.rank);
      ui.stat("rank([A|b])", s.augmentedRank);
      ui.stat("Unknowns", A[0].length);

      if (s.type === "none") {
        ui.note("Why there is no solution", s.reason, "bad");
        ui.matrix("Reduced augmented matrix [A | b]", s.rref, { highlightCols: s.pivots });
      } else if (s.type === "unique") {
        ui.vectors("Solution x", [s.solution], { prefix: "x" });
        ui.matrix("Reduced augmented matrix [A | b]", s.rref, { highlightCols: s.pivots });
      } else {
        ui.html("Solution set",
          `<p class="p1" style="margin-bottom:14px;">Every solution has the form <span class="mono">x = p + ` +
          s.nullBasis.map((_, i) => `t${i + 1}·n${i + 1}`).join(" + ") +
          `</span>, with the free parameter${s.nullBasis.length > 1 ? "s" : ""} ` +
          s.nullBasis.map((_, i) => `<span class="mono">t${i + 1}</span>`).join(", ") +
          ` ranging over all real numbers. The solution set is ${s.dimensionOfSolutionSet}-dimensional.</p>`);
        ui.vectors("Particular solution p (free variables set to 0)", [s.particular], { prefix: "p" });
        ui.vectors("Null-space directions", s.nullBasis, { prefix: "n" });
        ui.matrix("Reduced augmented matrix [A | b]", s.rref, { highlightCols: s.pivots });
      }
      ui.steps(s.steps, s.stepsOmitted);
    },
  });
})();
