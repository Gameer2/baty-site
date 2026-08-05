/* Laurent Series & Singularity Classification page wiring — Complex Analysis Engine.

   Reads f(z) and an expansion point z0, then calls the two SymPy ops the shared
   complex-residues.js module already exposes:
     - ComplexResidues.classifySingularity  → analytic / removable / pole of order m / essential
     - ComplexResidues.laurentSeries        → the Laurent series about z0 (truncated to `order`)
   Answer-only, like every other engine page built after the no-derivation redesign: a
   classification verdict, the residue when the singularity is a pole, and the series — never
   a step-by-step derivation. The classification is limit-based (see sympy-worker.js's
   _classify_singularity) precisely because a series-parse would misclassify the cases SymPy's
   sp.series leaves unexpanded (e^{1/z}) or errors on (sin(1/z)); here we only DISPLAY the series. */
(function () {
  "use strict";

  const fzInput = document.getElementById("fzInput");
  const fzPreview = document.getElementById("fzPreview");
  const pointReInput = document.getElementById("pointReInput");
  const pointImInput = document.getElementById("pointImInput");
  const orderInput = document.getElementById("orderInput");
  const form = document.getElementById("laurentForm");
  const formError = document.getElementById("formError");
  const formErrorText = document.getElementById("formErrorText");
  const startStatus = document.getElementById("startStatus");
  const startStatusText = document.getElementById("startStatusText");
  const placeholderPanel = document.getElementById("placeholderPanel");
  const resultsArea = document.getElementById("resultsArea");
  const refusedPanel = document.getElementById("refusedPanel");
  const refusedReason = document.getElementById("refusedReason");
  const statKind = document.getElementById("statKind");
  const statResidue = document.getElementById("statResidue");
  const verdictBlock = document.getElementById("verdictBlock");
  const seriesBlock = document.getElementById("seriesBlock");

  function showError(msg) { formError.style.display = "block"; formErrorText.textContent = msg; }
  function hideError() { formError.style.display = "none"; }
  function setStatus(ok, msg) {
    startStatus.className = "status-line " + (ok ? "ok" : "bad");
    startStatusText.textContent = msg;
  }

  function updatePreview() {
    const raw = fzInput.value.trim();
    Engine.renderKatex(fzPreview, raw ? "f(z) = " + Engine.toLatex(raw) : "", false);
    Engine.pulseFlash(fzPreview);
  }

  document.querySelectorAll("#exampleChips .chip").forEach((btn) => {
    btn.addEventListener("click", () => {
      fzInput.value = btn.dataset.fz;
      pointReInput.value = btn.dataset.pre;
      pointImInput.value = btn.dataset.pim;
      orderInput.value = btn.dataset.order;
      updatePreview();
      form.requestSubmit();
    });
  });

  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  function mono(s) { return '<span class="mono">' + esc(s) + "</span>"; }

  // Build a SymPy point string from Re/Im. sympify maps "I" → sp.I, so "I", "1+2*I", "-I", "3"
  // all parse correctly.
  function sympyPoint(re, im) {
    if (im === 0) return String(re);
    if (re === 0) return im === 1 ? "I" : im === -1 ? "-I" : im + "*I";
    return re + (im >= 0 ? "+" : "-") + Math.abs(im) + "*I";
  }

  // Readable point label, e.g. "z₀ = 1 + 2i", "z₀ = −i".
  function pointLabel(re, im) {
    const sub = "z₀"; // z₀
    if (im === 0) return sub + " = " + re;
    if (re === 0) return sub + " = " + (im === 1 ? "i" : im === -1 ? "−i" : im + "i");
    return sub + " = " + re + (im >= 0 ? " + " : " − ") + Math.abs(im) + "i";
  }

  function kindLabel(c) {
    switch (c.kind) {
      case "analytic": return "Analytic";
      case "removable": return "Removable";
      case "pole": return "Pole (order " + c.order + ")";
      case "essential": return "Essential";
      default: return c.kind;
    }
  }

  // Verdict as HTML (prose-heavy, so HTML is cleaner than interleaving \text/math in KaTeX).
  function verdictHTML(c, label) {
    const p = esc(label);
    switch (c.kind) {
      case "analytic":
        return p + " is a regular point — f is analytic there (no singularity).";
      case "removable":
        return "Removable singularity at " + p + ": lim<sub>z→z₀</sub> f(z) = " + mono(c.value) +
          " (finite — redefine f(z₀) = " + esc(c.value) + " and the singularity vanishes).";
      case "pole":
        return "Pole of order " + c.order + " at " + p + (c.residue ? ". Residue = " + mono(c.residue) : ".");
      case "essential":
        return "Essential singularity at " + p + ": the Laurent series has infinitely many negative-power terms (no finite pole order).";
      default:
        return "Unknown classification.";
    }
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    hideError();
    refusedPanel.style.display = "none";
    resultsArea.style.display = "none";
    const fz = fzInput.value.trim();
    if (!fz) { setStatus(false, "Enter f(z)."); return; }
    const re = parseFloat(pointReInput.value), im = parseFloat(pointImInput.value);
    if (!Number.isFinite(re) || !Number.isFinite(im)) { setStatus(false, "z₀ needs numeric Re and Im parts."); return; }
    let order = parseInt(orderInput.value, 10);
    if (!Number.isFinite(order) || order < 2) order = 6;
    if (order > 20) order = 20;
    const ptStr = sympyPoint(re, im);
    const label = pointLabel(re, im);

    const submitBtn = form.querySelector('button[type="submit"] .btn-text');
    const prev = submitBtn ? submitBtn.textContent : null;
    if (submitBtn) submitBtn.textContent = "Solving…";
    setStatus(true, "Classifying the singularity and expanding the Laurent series…");

    Promise.all([
      ComplexResidues.classifySingularity(fz, "z", ptStr),
      ComplexResidues.laurentSeries(fz, "z", ptStr, order),
    ]).then(([classRes, seriesRes]) => {
      placeholderPanel.style.display = "none";

      if (!classRes.ok) {
        refusedPanel.style.display = "";
        refusedReason.textContent = classRes.reason;
        setStatus(false, "Couldn't classify this singularity.");
        return;
      }

      resultsArea.style.display = "";
      const c = classRes.classification;
      statKind.textContent = kindLabel(c);
      statResidue.textContent = (c.kind === "pole" && c.residue) ? c.residue
        : (c.kind === "removable" ? "0" : "—");

      verdictBlock.innerHTML = verdictHTML(c, label);
      Engine.pulseFlash(verdictBlock);

      // Reset the series block to a KaTeX formula block each solve (a previous solve may have
      // swapped it to plain text).
      seriesBlock.className = "formula-block formula-block--result";
      if (seriesRes.ok && seriesRes.series && seriesRes.series.trim()) {
        const series = seriesRes.series.trim();
        const tex = Engine.toLatex(series);
        if (tex === series) {
          // math.parse couldn't read SymPy's output — fall back to plain mono text rather than a
          // KaTeX parse error. Rare (only for odd SymPy str() forms).
          seriesBlock.textContent = series;
        } else {
          Engine.renderKatex(seriesBlock, "\\sum_{n} a_n (z-z_0)^n = " + tex, true);
        }
        Engine.pulseFlash(seriesBlock);
        setStatus(true, "Solved — " + kindLabel(c) + ".");
      } else {
        seriesBlock.textContent = "SymPy could not produce a truncated Laurent series about z₀ here — for an essential singularity the principal part is infinite and does not truncate. The classification above is still exact (it is limit-based, not series-based).";
        setStatus(true, "Solved — " + kindLabel(c) + " (no closed-form truncated series).");
      }
    }).catch((err) => {
      placeholderPanel.style.display = "none";
      resultsArea.style.display = "none";
      refusedPanel.style.display = "";
      refusedReason.textContent = err.message || String(err);
      setStatus(false, err.message || String(err));
    }).then(() => { if (submitBtn) submitBtn.textContent = prev; });
  });

  fzInput.addEventListener("input", Engine.debounce(updatePreview, 200));
  updatePreview();
})();