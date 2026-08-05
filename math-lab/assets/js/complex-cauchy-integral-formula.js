/* Cauchy Integral Formula page wiring — Complex Analysis Engine.

   Reads f(z), z₀ (Re/Im), a radius r and a derivative order n, calls
   ComplexContourTheorems.cauchyIntegralFormula (assets/js/complex-contour-theorems.js), and
   renders the result. Answer-only, like every other engine page: a result-strip, the formula,
   a table of the independent checks that confirmed it, and a plot of the contour — never a
   step-by-step derivation. The module itself does all the verification (two-radius contour
   independence +, for n=0, a direct f(z₀) evaluation); this file is pure DOM glue. */
(function () {
  "use strict";

  const fzInput = document.getElementById("fzInput");
  const fzPreview = document.getElementById("fzPreview");
  const z0ReInput = document.getElementById("z0ReInput");
  const z0ImInput = document.getElementById("z0ImInput");
  const radiusInput = document.getElementById("radiusInput");
  const orderInput = document.getElementById("orderInput");
  const form = document.getElementById("cifForm");
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
    const n = parseInt(orderInput.value, 10) || 0;
    const lhs = n === 0 ? "f(z_0)" : n === 1 ? "f'(z_0)" : `f^{(${n})}(z_0)`;
    Engine.renderKatex(fzPreview, raw ? lhs + " = \\frac{" + (n === 0 ? "1" : n + "!") + "}{2\\pi i} \\oint_{|z-z_0|=r} \\frac{" + Engine.toLatex(raw) + "}{(z-z_0)^{" + (n + 1) + "}}\\,dz" : "", false);
    Engine.pulseFlash(fzPreview);
  }

  document.querySelectorAll("#exampleChips .chip").forEach((btn) => {
    btn.addEventListener("click", () => {
      fzInput.value = btn.dataset.fz;
      z0ReInput.value = btn.dataset.re;
      z0ImInput.value = btn.dataset.im;
      radiusInput.value = btn.dataset.r;
      orderInput.value = btn.dataset.n;
      updatePreview();
      form.requestSubmit();
    });
  });
  orderInput.addEventListener("change", updatePreview);

  function fmtComplex(c) {
    // Drop near-zero parts (the contour integral leaves ~1e-15 imaginary noise on real answers).
    const re = Math.abs(c.re) < 1e-6 ? 0 : c.re;
    const im = Math.abs(c.im) < 1e-6 ? 0 : c.im;
    if (re === 0 && im === 0) return "0";
    if (im === 0) return Engine.formatNum(re, 4);
    if (re === 0) return Engine.formatNum(im, 4) + "i";
    return Engine.formatNum(re, 4) + (im >= 0 ? " + " : " − ") + Engine.formatNum(Math.abs(im), 4) + "i";
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  function renderChecksTable(r) {
    const rows = [];
    rows.push(`<tr><td class="mono">contour integral</td><td>∮ f(z)/(z−z₀)ⁿ⁺¹ dz on |z−z₀|=r</td><td class="mono">${fmtComplex(r.numericCheck)}</td></tr>`);
    rows.push(`<tr><td class="mono">reference contour</td><td>same formula on |z−z₀|=r/2</td><td class="mono">${fmtComplex(r.referenceCheck)}</td></tr>`);
    if (r.directCheck) {
      rows.push(`<tr><td class="mono">direct evaluation</td><td>f(z₀) evaluated straight at z₀</td><td class="mono">${fmtComplex(r.directCheck)}</td></tr>`);
    }
    document.querySelector("#checksTable tbody").innerHTML = rows.join("");
  }

  function drawContourPlot(z0, radius) {
    const theta = [];
    for (let i = 0; i <= 200; i++) theta.push((i / 200) * 2 * Math.PI);
    const cx = theta.map((t) => z0.re + radius * Math.cos(t));
    const cy = theta.map((t) => z0.im + radius * Math.sin(t));
    const traces = [
      { x: cx, y: cy, mode: "lines", name: "contour |z−z₀|=r", line: { color: "#b45fd0", width: 2.5 } },
      { x: [z0.re], y: [z0.im], mode: "markers", name: "z₀", marker: { color: "#ed6d40", size: 12, symbol: "x" } },
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
    const z0re = parseFloat(z0ReInput.value), z0im = parseFloat(z0ImInput.value), radius = parseFloat(radiusInput.value);
    const order = parseInt(orderInput.value, 10);
    if (!Number.isFinite(z0re) || !Number.isFinite(z0im)) { setStatus(false, "z₀ needs numeric Re and Im parts."); return; }
    if (!(radius > 0)) { setStatus(false, "The radius must be positive."); return; }

    const z0 = { re: z0re, im: z0im };
    const submitBtn = form.querySelector('button[type="submit"] .btn-text');
    const prev = submitBtn ? submitBtn.textContent : null;
    if (submitBtn) submitBtn.textContent = "Evaluating…";
    setStatus(true, "Integrating around z₀…");

    // The module is fully synchronous (pure numeric), but keep the .then-style flow so the
    // "Evaluating…" state actually paints before the (fast) compute blocks the thread.
    Promise.resolve()
      .then(() => ComplexContourTheorems.cauchyIntegralFormula(fz, "z", z0, order, radius))
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

        document.getElementById("statValue").textContent = fmtComplex(r.value);
        document.getElementById("statVerified").textContent = r.verified ? "✓ verified" : "unverified";

        const lhs = order === 0 ? "f(z_0)" : order === 1 ? "f'(z_0)" : `f^{(${order})}(z_0)`;
        const coef = order === 0 ? "1" : order + "!";
        Engine.renderKatex(document.getElementById("formulaResult"),
          lhs + " = \\frac{" + coef + "}{2\\pi i} \\oint_{|z-z_0|=r} \\frac{" + Engine.toLatex(fz) + "}{(z-z_0)^{" + (order + 1) + "}}\\,dz = " + fmtComplex(r.value), true);

        renderChecksTable(r);
        drawContourPlot(z0, radius);

        const label = order === 0 ? "f(z₀)" : order === 1 ? "f′(z₀)" : `f⁽${order}⁾(z₀)`;
        setStatus(true, `Evaluated — ${label} = ${fmtComplex(r.value)}.`);
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