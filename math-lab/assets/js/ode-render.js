/* Shared renderer for the ODE/PDE method pages. The backends — classifyFirstOrder,
   classifySecondOrder, solveHeatEquation, and the SymPy dsolve fallback — all return the same
   "box" shape: { classificationLine, generalSolution, particularSolution|null }. One renderer
   serves all of them.

   Answer-only, matching the Calculus Engine's Integral Calculator: a result-strip (method +
   verified) and the formula itself — no derivation table. Every box reaching this renderer has
   already passed its own differentiate-back/finite-difference check before being returned, so
   "Verified" here is a trust signal, not a hedge. */
(function () {
  "use strict";

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  // classificationLine is always "<short method name> — <one-line detail>."; the part before
  // the dash is exactly the short tag a result-strip tile wants (e.g. "First-order, separable",
  // "Second-order, ... nonhomogeneous"). Falls back to the whole line if there's no dash.
  function methodLabel(classificationLine) {
    const s = (classificationLine || "Solved").split(/\s+—\s+/)[0];
    return s.length > 64 ? s.slice(0, 61) + "…" : s;
  }

  function bigBox(container, box) {
    container.innerHTML = "";

    const strip = document.createElement("div");
    strip.className = "result-strip";
    strip.innerHTML =
      '<div class="result-stat accent"><div class="label">Method</div><div class="value" data-role="method"></div></div>' +
      '<div class="result-stat"><div class="label">Verified</div><div class="value">✓ verified</div></div>';
    strip.querySelector('[data-role="method"]').textContent = methodLabel(box.classificationLine);
    container.appendChild(strip);

    const genLabel = document.createElement("span");
    genLabel.className = "field-note";
    genLabel.style.display = "block";
    genLabel.style.marginTop = "16px";
    genLabel.textContent = "General solution";
    container.appendChild(genLabel);
    const gen = document.createElement("div");
    gen.className = "formula-block formula-block--result";
    container.appendChild(gen);
    Engine.renderKatex(gen, box.generalSolution, true);

    if (box.particularSolution) {
      const partLabel = document.createElement("span");
      partLabel.className = "field-note";
      partLabel.style.display = "block";
      partLabel.style.marginTop = "14px";
      partLabel.textContent = "Particular solution — using your initial condition";
      container.appendChild(partLabel);
      const part = document.createElement("div");
      part.className = "formula-block formula-block--result";
      container.appendChild(part);
      Engine.renderKatex(part, box.particularSolution, true);
    }
  }

  window.ODERender = { bigBox: bigBox, escapeHtml: escapeHtml };
})();
