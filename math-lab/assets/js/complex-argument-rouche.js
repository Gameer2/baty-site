/* Argument Principle & Rouché page wiring — Complex Analysis Engine.

   Two modes share one form. Argument-principle mode calls
   ComplexContourTheorems.argumentPrinciple (N − P, verified by winding-number vs
   logarithmic-derivative agreement); Rouché mode calls ComplexContourTheorems.rouche (the
   |f−g|<|f| condition plus equal zero counts). Both draw the image curve f(γ) — and, in Rouché
   mode, g(γ) — in the w-plane via ComplexContourTheorems.sampleImage, so the winding about 0 is
   visible. This file is pure DOM glue; all the math and verification live in
   complex-contour-theorems.js. */
(function () {
  "use strict";

  const modeInput = document.getElementById("modeInput");
  const fzInput = document.getElementById("fzInput");
  const fzPreview = document.getElementById("fzPreview");
  const gzField = document.getElementById("gzField");
  const gzInput = document.getElementById("gzInput");
  const gzPreview = document.getElementById("gzPreview");
  const centerReInput = document.getElementById("centerReInput");
  const centerImInput = document.getElementById("centerImInput");
  const radiusInput = document.getElementById("radiusInput");
  const form = document.getElementById("arForm");
  const formError = document.getElementById("formError");
  const formErrorText = document.getElementById("formErrorText");
  const startStatus = document.getElementById("startStatus");
  const startStatusText = document.getElementById("startStatusText");
  const placeholderPanel = document.getElementById("placeholderPanel");
  const resultsArea = document.getElementById("resultsArea");
  const refusedPanel = document.getElementById("refusedPanel");
  const refusedReason = document.getElementById("refusedReason");
  const argChips = document.getElementById("argChips");
  const roucheChips = document.getElementById("roucheChips");

  function showError(msg) { formError.style.display = "block"; formErrorText.textContent = msg; }
  function hideError() { formError.style.display = "none"; }
  function setStatus(ok, msg) {
    startStatus.className = "status-line " + (ok ? "ok" : "bad");
    startStatusText.textContent = msg;
  }

  function isRouche() { return modeInput.value === "rouche"; }

  function syncMode() {
    const rouche = isRouche();
    gzField.style.display = rouche ? "" : "none";
    argChips.style.display = rouche ? "none" : "";
    roucheChips.style.display = rouche ? "" : "none";
    document.getElementById("statLabel").textContent = rouche ? "zeros (f, g)" : "N − P";
    document.getElementById("plotTitle").textContent = rouche
      ? "Image curves f(γ) and g(γ) in the w-plane"
      : "The image curve f(γ) in the w-plane";
    updatePreview();
  }

  function updatePreview() {
    const raw = fzInput.value.trim();
    if (isRouche()) {
      const gz = gzInput.value.trim();
      Engine.renderKatex(fzPreview, raw ? "\\frac{f-g}{f} \\text{ on } \\gamma, \\quad f=" + Engine.toLatex(raw) + ",\\ g=" + Engine.toLatex(gz || "") : "", false);
      Engine.renderKatex(gzPreview, gz ? "g(z) = " + Engine.toLatex(gz) : "", false);
    } else {
      Engine.renderKatex(fzPreview, raw ? "\\frac{1}{2\\pi i}\\oint_\\gamma \\frac{f'(z)}{f(z)}\\,dz = N - P, \\quad f=" + Engine.toLatex(raw) : "", false);
    }
    Engine.pulseFlash(fzPreview);
  }

  modeInput.addEventListener("change", syncMode);
  gzInput.addEventListener("input", Engine.debounce(updatePreview, 200));

  function wireChips(row) {
    row.querySelectorAll(".chip").forEach((btn) => {
      btn.addEventListener("click", () => {
        fzInput.value = btn.dataset.fz;
        if (btn.dataset.gz !== undefined) gzInput.value = btn.dataset.gz;
        centerReInput.value = btn.dataset.cre;
        centerImInput.value = btn.dataset.cim;
        radiusInput.value = btn.dataset.radius;
        updatePreview();
        form.requestSubmit();
      });
    });
  }
  wireChips(argChips);
  wireChips(roucheChips);

  function fmtComplex(c) {
    const re = Math.abs(c.re) < 1e-6 ? 0 : c.re;
    const im = Math.abs(c.im) < 1e-6 ? 0 : c.im;
    if (re === 0 && im === 0) return "0";
    if (im === 0) return Engine.formatNum(re, 4);
    if (re === 0) return Engine.formatNum(im, 4) + "i";
    return Engine.formatNum(re, 4) + (im >= 0 ? " + " : " − ") + Engine.formatNum(Math.abs(im), 4) + "i";
  }

  function drawImagePlot(curves) {
    // curves: [{ points:[{re,im}...], name, color }]
    const traces = curves.map((c) => ({
      x: c.points.map((p) => p.re),
      y: c.points.map((p) => p.im),
      mode: "lines",
      name: c.name,
      line: { color: c.color, width: 2.5 },
    }));
    // Mark the origin — the point the image curve winds around (or doesn't).
    traces.push({ x: [0], y: [0], mode: "markers", name: "0", marker: { color: "#ed6d40", size: 11, symbol: "x" } });
    Plotly.newPlot("imagePlot", traces, Engine.plotlyBaseLayout({
      xaxis: { title: "Re(w)", scaleanchor: "y" },
      yaxis: { title: "Im(w)" },
      legend: { orientation: "h", y: -0.18 },
    }), Engine.plotlyConfig);
  }

  function renderArgChecks(r) {
    const rows = [
      `<tr><td class="mono">winding number</td><td>unwrapped arg of f(γ) about 0</td><td class="mono">${r.winding}</td></tr>`,
      `<tr><td class="mono">log-derivative integral</td><td>(1/2πi) ∮ f′/f dz</td><td class="mono">${fmtComplex(r.logDeriv)}</td></tr>`,
    ];
    document.querySelector("#checksTable tbody").innerHTML = rows.join("");
  }

  function renderRoucheChecks(r) {
    const rows = [
      `<tr><td class="mono">condition</td><td>max |f−g|/|f| on γ (must be &lt; 1)</td><td class="mono">${Engine.formatNum(r.maxRatio, 4)}</td></tr>`,
      `<tr><td class="mono">zeros of f</td><td>winding of f(γ) about 0</td><td class="mono">${r.nF}</td></tr>`,
      `<tr><td class="mono">zeros of g</td><td>winding of g(γ) about 0</td><td class="mono">${r.nG}</td></tr>`,
    ];
    document.querySelector("#checksTable tbody").innerHTML = rows.join("");
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    hideError();
    refusedPanel.style.display = "none";
    const fz = fzInput.value.trim();
    if (!fz) { setStatus(false, "Enter f(z)."); return; }
    const cre = parseFloat(centerReInput.value), cim = parseFloat(centerImInput.value), radius = parseFloat(radiusInput.value);
    if (!Number.isFinite(cre) || !Number.isFinite(cim)) { setStatus(false, "The contour center needs numeric Re and Im parts."); return; }
    if (!(radius > 0)) { setStatus(false, "The radius must be positive."); return; }
    const contour = { type: "circle", center: { re: cre, im: cim }, radius };

    const rouche = isRouche();
    const gz = gzInput.value.trim();
    if (rouche && !gz) { setStatus(false, "Enter g(z) for Rouché mode."); return; }

    const submitBtn = form.querySelector('button[type="submit"] .btn-text');
    const prev = submitBtn ? submitBtn.textContent : null;
    if (submitBtn) submitBtn.textContent = "Solving…";
    setStatus(true, rouche ? "Checking Rouché's condition…" : "Counting zeros and poles…");

    Promise.resolve()
      .then(() => rouche
        ? ComplexContourTheorems.rouche(fz, gz, "z", contour)
        : ComplexContourTheorems.argumentPrinciple(fz, "z", contour))
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

        if (rouche) {
          document.getElementById("statValue").textContent = r.applies ? `${r.nF} = ${r.nG}` : "—";
          document.getElementById("statVerified").textContent = r.applies && r.verified ? "✓ verified" : "n/a";
          if (r.applies) {
            Engine.renderKatex(document.getElementById("formulaResult"),
              `|f-g| < |f| \\text{ on } \\gamma \\;\\Longrightarrow\\; N_f = N_g = ${r.nF}`, true);
            setStatus(true, `Rouché applies — f and g each have ${r.nF} zero${r.nF === 1 ? "" : "s"} inside γ.`);
          } else {
            Engine.renderKatex(document.getElementById("formulaResult"),
              `\\max_\\gamma \\frac{|f-g|}{|f|} = ${Engine.formatNum(r.maxRatio, 4)} \\geq 1 \\;\\Longrightarrow\\; \\text{Rouché does not apply}`, true);
            setStatus(false, "Rouché's condition doesn't hold on this contour.");
          }
          renderRoucheChecks(r);
          const fImg = ComplexContourTheorems.sampleImage(fz, "z", contour, 600);
          const gImg = ComplexContourTheorems.sampleImage(gz, "z", contour, 600);
          const curves = [];
          if (fImg) curves.push({ points: fImg, name: "f(γ)", color: "#b45fd0" });
          if (gImg) curves.push({ points: gImg, name: "g(γ)", color: "#59a993" });
          if (curves.length) drawImagePlot(curves);
        } else {
          document.getElementById("statValue").textContent = String(r.nMinusP);
          document.getElementById("statVerified").textContent = r.verified ? "✓ verified" : "unverified";
          const sign = r.nMinusP;
          const gloss = sign > 0 ? `${sign} more zero${sign === 1 ? "" : "s"} than poles`
            : sign < 0 ? `${-sign} more pole${-sign === 1 ? "" : "s"} than zeros`
            : "as many zeros as poles";
          Engine.renderKatex(document.getElementById("formulaResult"),
            `\\frac{1}{2\\pi i}\\oint_\\gamma \\frac{f'(z)}{f(z)}\\,dz = N - P = ${sign} \\quad \\text{(${gloss})}`, true);
          renderArgChecks(r);
          const fImg = ComplexContourTheorems.sampleImage(fz, "z", contour, 800);
          if (fImg) drawImagePlot([{ points: fImg, name: "f(γ)", color: "#b45fd0" }]);
          setStatus(true, `N − P = ${sign} — ${gloss}.`);
        }
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
  syncMode();
})();