/* Contour Integration & Residues page wiring — Complex Analysis Engine Phase 3.

   Reads f(z) and a circular contour (center + radius), calls ComplexResidues.contourIntegral
   (assets/js/complex-residues.js — the shared residue-theorem module, reused later by the ODE
   Engine's Laplace-transform inversion), and renders the result. Answer-only, matching every
   other engine page built after the no-derivation redesign: a result-strip, the value, a table
   of the singularities that actually contributed, and a plot of the contour in the plane —
   never a step-by-step derivation. */
(function () {
  "use strict";

  const fzInput = document.getElementById("fzInput");
  const fzPreview = document.getElementById("fzPreview");
  const centerReInput = document.getElementById("centerReInput");
  const centerImInput = document.getElementById("centerImInput");
  const radiusInput = document.getElementById("radiusInput");
  const form = document.getElementById("contourForm");
  const formError = document.getElementById("formError");
  const formErrorText = document.getElementById("formErrorText");
  const startStatus = document.getElementById("startStatus");
  const startStatusText = document.getElementById("startStatusText");
  const placeholderPanel = document.getElementById("placeholderPanel");
  const resultsArea = document.getElementById("resultsArea");
  const refusedPanel = document.getElementById("refusedPanel");
  const refusedReason = document.getElementById("refusedReason");

  function showError(msg) { formError.style.display = "block"; formErrorText.textContent = msg; }
  function hideError() { formError.style.display = "none"; }
  function setStatus(ok, msg) {
    startStatus.className = "status-line " + (ok ? "ok" : "bad");
    startStatusText.textContent = msg;
  }

  function updatePreview() {
    const raw = fzInput.value.trim();
    Engine.renderKatex(fzPreview, raw ? "\\oint_{\\gamma} " + Engine.toLatex(raw) + "\\,dz" : "", false);
    Engine.pulseFlash(fzPreview);
  }

  document.querySelectorAll("#exampleChips .chip").forEach((btn) => {
    btn.addEventListener("click", () => {
      fzInput.value = btn.dataset.fz;
      centerReInput.value = btn.dataset.cre;
      centerImInput.value = btn.dataset.cim;
      radiusInput.value = btn.dataset.radius;
      updatePreview();
      form.requestSubmit();
    });
  });

  function fmtComplex(c) {
    const re = Math.abs(c.re) < 1e-6 ? 0 : c.re;
    const im = Math.abs(c.im) < 1e-6 ? 0 : c.im;
    if (re === 0 && im === 0) return "0";
    if (im === 0) return Engine.formatNum(re, 4);
    if (re === 0) return Engine.formatNum(im, 4) + "i";
    return Engine.formatNum(re, 4) + (im >= 0 ? " + " : " − ") + Engine.formatNum(Math.abs(im), 4) + "i";
  }

  function renderSingularityTable(rows) {
    const tbody = document.querySelector("#singTable tbody");
    tbody.innerHTML = rows.map((s) =>
      `<tr><td class="mono">${ODERender_escapeHtml(s.locationExact)}</td>` +
      `<td class="mono">${Engine.formatNum(s.location.re, 3)} + ${Engine.formatNum(s.location.im, 3)}i</td>` +
      `<td class="mono">${ODERender_escapeHtml(s.residueExact)}</td>` +
      `<td class="mono">${fmtComplex(s.residue)}</td></tr>`
    ).join("") || "<tr><td colspan=\"4\">No singularities of f(z) lie inside this contour — the integral is 0 by Cauchy's theorem.</td></tr>";
  }

  // Local copy — this page doesn't load ode-render.js, and the escape is one line.
  function ODERender_escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  function drawContourPlot(contour, singularities) {
    const theta = [];
    for (let i = 0; i <= 200; i++) theta.push((i / 200) * 2 * Math.PI);
    const contourX = theta.map((t) => contour.center.re + contour.radius * Math.cos(t));
    const contourY = theta.map((t) => contour.center.im + contour.radius * Math.sin(t));

    const inside = singularities.filter((s) => s.position === "inside");
    const outside = singularities.filter((s) => s.position === "outside");

    const traces = [
      { x: contourX, y: contourY, mode: "lines", name: "contour γ", line: { color: "#ed6d40", width: 2.5 } },
      { x: inside.map((s) => s.location.re), y: inside.map((s) => s.location.im), mode: "markers", name: "pole (inside)", marker: { color: "#59a993", size: 11, symbol: "x" } },
      { x: outside.map((s) => s.location.re), y: outside.map((s) => s.location.im), mode: "markers", name: "pole (outside)", marker: { color: "#7d858c", size: 9, symbol: "circle-open" } },
    ];
    Plotly.newPlot("contourPlot", traces, Engine.plotlyBaseLayout({
      xaxis: { title: "Re(z)", scaleanchor: "y" },
      yaxis: { title: "Im(z)" },
      legend: { orientation: "h", y: -0.18 },
    }), Engine.plotlyConfig);
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    hideError();
    refusedPanel.style.display = "none";
    const fz = fzInput.value.trim();
    if (!fz) { setStatus(false, "Enter f(z)."); return; }
    const centerRe = parseFloat(centerReInput.value), centerIm = parseFloat(centerImInput.value), radius = parseFloat(radiusInput.value);
    if (!Number.isFinite(centerRe) || !Number.isFinite(centerIm)) { setStatus(false, "The contour center needs numeric Re and Im parts."); return; }
    if (!(radius > 0)) { setStatus(false, "The radius must be positive."); return; }

    const contour = { type: "circle", center: { re: centerRe, im: centerIm }, radius };

    const submitBtn = form.querySelector('button[type="submit"] .btn-text');
    const prev = submitBtn ? submitBtn.textContent : null;
    if (submitBtn) submitBtn.textContent = "Solving…";
    setStatus(true, "Finding singularities and residues…");

    ComplexResidues.contourIntegral(fz, "z", contour)
      .then((r) => {
        placeholderPanel.style.display = "none";
        if (!r.ok) {
          resultsArea.style.display = "none";
          refusedPanel.style.display = "";
          refusedReason.textContent = r.reason;
          setStatus(false, "Couldn't confirm a result.");
          return;
        }
        resultsArea.style.display = "";

        document.getElementById("statCount").textContent = r.insideSingularities.length;
        document.getElementById("statVerified").textContent = r.verified ? "✓ verified" : "unverified";
        Engine.renderKatex(document.getElementById("integralResult"),
          "\\oint_{\\gamma} " + Engine.toLatex(fz) + "\\,dz = 2\\pi i \\sum \\text{Res} = " + fmtComplex(r.value), true);

        renderSingularityTable(r.insideSingularities);
        drawContourPlot(contour, r.allSingularities);

        setStatus(true, "Solved — " + r.insideSingularities.length + " pole" + (r.insideSingularities.length === 1 ? "" : "s") + " inside γ.");
      })
      .catch((err) => {
        placeholderPanel.style.display = "none";
        resultsArea.style.display = "none";
        refusedPanel.style.display = "";
        refusedReason.textContent = err.message || String(err);
        setStatus(false, err.message || String(err));
      })
      .then(() => { if (submitBtn) submitBtn.textContent = prev; });
  });

  fzInput.addEventListener("input", Engine.debounce(updatePreview, 200));
  updatePreview();
})();
