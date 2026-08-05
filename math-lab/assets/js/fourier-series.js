/* Fourier Series page wiring. All symbolic work (coefficient computation via Simpson's rule
   + exact π-symbolic forms) lives in calculus-symbolic.js and runs inside the CAS worker —
   this file only reads f(x), L, mode, and N, calls CalculusSymbolic.fourierSeries, and renders:
   the series, the partial sum, the coefficient table, and a plot of the N-term partial sum
   against f. The partial-sum curve is rebuilt on the main thread via
   CalculusSymbolic.fourierSeriesValue (pure, structured-clone-safe — no nerdamer), exactly as
   the heat-equation page rebuilds its series. */
(function () {
  "use strict";

  const fInput = document.getElementById("fInput");
  const fPreview = document.getElementById("fPreview");
  const lInput = document.getElementById("lInput");
  const nInput = document.getElementById("nInput");
  const modeChips = document.getElementById("modeChips");
  const startStatus = document.getElementById("startStatus");
  const startStatusText = document.getElementById("startStatusText");
  const formError = document.getElementById("formError");
  const formErrorText = document.getElementById("formErrorText");
  const form = document.getElementById("fourierForm");
  const exampleBtn = document.getElementById("exampleBtn");
  const presetRow = document.getElementById("presetRow");

  const placeholderPanel = document.getElementById("placeholderPanel");
  const resultsArea = document.getElementById("resultsArea");
  const refusedPanel = document.getElementById("refusedPanel");
  const refusedReason = document.getElementById("refusedReason");

  const statMode = document.getElementById("statMode");
  const statTerms = document.getElementById("statTerms");
  const statVerified = document.getElementById("statVerified");
  const seriesBlock = document.getElementById("seriesBlock");
  const partialBlock = document.getElementById("partialBlock");
  const coefBody = document.querySelector("#coefTable tbody");

  const INDEX = "x";
  let mode = "full";

  function updatePreview() {
    const raw = fInput.value.trim();
    Engine.renderKatex(fPreview, raw ? "f(x)=" + Engine.toLatex(raw) : "", false);
    Engine.pulseFlash(fPreview);
  }

  function updateStartCheck() {
    const raw = fInput.value.trim();
    if (!raw) {
      startStatus.className = "status-line bad";
      startStatusText.textContent = "Enter the function f(x).";
      return null;
    }
    const compiled = Engine.compileFx(raw, INDEX);
    if (!compiled.ok) {
      startStatus.className = "status-line bad";
      startStatusText.textContent = compiled.error;
      return null;
    }
    startStatus.className = "status-line ok";
    startStatusText.textContent = "f(x) parses — press Expand.";
    return compiled;
  }

  function showError(msg) { formError.style.display = "block"; formErrorText.textContent = msg; }
  function hideError() { formError.style.display = "none"; }

  function showRefused(result) {
    resultsArea.style.display = "none";
    placeholderPanel.style.display = "none";
    refusedPanel.style.display = "";
    refusedReason.textContent = result.reason;
  }

  function modeLabel(m) {
    return m === "sine" ? "Half-range sine" : m === "cosine" ? "Half-range cosine" : "Full";
  }

  // numeric value of a coefficient entry, or "—"
  function coefNum(entry) {
    if (!entry) return "—";
    return Engine.formatNum(entry.numeric, 6);
  }
  function coefTex(entry) {
    if (!entry) return "—";
    // entry.value is a clean exact-form string ("2", "-1", "2/3", "0") or null (numeric-only).
    return entry.value ? Engine.toLatex(entry.value) : "\\text{(numeric)}";
  }

  function render(result) {
    placeholderPanel.style.display = "none";
    refusedPanel.style.display = "none";
    resultsArea.style.display = "";

    statMode.textContent = modeLabel(result.mode);
    statTerms.textContent = String(result.N);
    statVerified.textContent = result.verified ? "✓ verified" : "unverified";

    Engine.renderKatex(seriesBlock, result.seriesLatex, true);
    Engine.pulseFlash(seriesBlock);
    Engine.renderKatex(partialBlock, result.partialSumLatex, true);

    // Coefficient table: one row per n up to N. a0 shown as the n=0 row when present.
    let html = "";
    if (result.a0) {
      html += "<tr><td>0</td><td>" + coefTex(result.a0) + "</td><td>" + coefNum(result.a0) +
              "</td><td>—</td><td>—</td></tr>";
    }
    const maxN = result.N;
    for (let n = 1; n <= maxN; n++) {
      const a = result.an[n - 1];
      const b = result.bn[n - 1];
      html += "<tr><td>" + n + "</td>" +
        "<td>" + (a ? coefTex(a) : "—") + "</td>" +
        "<td>" + (a ? coefNum(a) : "—") + "</td>" +
        "<td>" + (b ? coefTex(b) : "—") + "</td>" +
        "<td>" + (b ? coefNum(b) : "—") + "</td></tr>";
    }
    coefBody.innerHTML = html;

    plotSeries(result);
  }

  // Plot f(x) and the N-term partial sum S_N(x) over the expansion interval.
  function plotSeries(result) {
    const fcomp = Engine.compileFx(fInput.value.trim(), INDEX);
    const L = result.L;
    const lo = result.mode === "full" ? -L : 0;
    const hi = L;
    const NPTS = 400;
    const fxs = [], fys = [], sxs = [], sys = [];
    for (let i = 0; i <= NPTS; i++) {
      const x = lo + (hi - lo) * i / NPTS;
      fxs.push(x);
      if (fcomp && fcomp.ok) {
        let y;
        try { y = fcomp.fn(x); } catch { y = null; }
        fys.push((y !== null && Number.isFinite(y)) ? y : null);
      } else fys.push(null);
      let s;
      try { s = CalculusSymbolic.fourierSeriesValue(result, result.mode, L, x, result.N); }
      catch { s = null; }
      sxs.push(x);
      sys.push((s !== null && Number.isFinite(s)) ? s : null);
    }
    Plotly.newPlot("seriesPlot", [
      { x: fxs, y: fys, mode: "lines", name: "f(x)", line: { color: "#6f7d8c", width: 2, dash: "dot" } },
      { x: sxs, y: sys, mode: "lines", name: "S_N(x)", line: { color: "#4f9e82", width: 2.5 } }
    ], Engine.plotlyBaseLayout({
      showlegend: true,
      xaxis: { title: "x", zeroline: true },
      yaxis: { title: "y", zeroline: true }
    }), Engine.plotlyConfig);
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    hideError();
    const compiled = updateStartCheck();
    if (!compiled) return;

    const f = fInput.value.trim();
    const L = lInput.value.trim() || "pi";
    const N = parseInt(nInput.value, 10) || 8;
    const submitBtn = form.querySelector('button[type="submit"] .btn-text');
    const previousLabel = submitBtn ? submitBtn.textContent : null;
    if (submitBtn) submitBtn.textContent = "Expanding…";

    CAS.fourierSeries(f, INDEX, L, mode, N)
      .then((result) => {
        if (!result.ok) { showRefused(result); return; }
        render(result);
      })
      .catch((err) => showError(err.message))
      .then(() => {
        if (submitBtn) submitBtn.textContent = previousLabel;
        if (CAS.mode() === "sync") {
          startStatus.className = "status-line bad";
          startStatusText.textContent =
            "Running without a Web Worker (opened over file://?) — a difficult f can freeze the page. Serve the site over http:// to restore the safety timeout.";
        }
      });
  });

  modeChips.addEventListener("click", (e) => {
    const btn = e.target.closest(".chip");
    if (!btn) return;
    modeChips.querySelectorAll(".chip").forEach((c) => c.classList.remove("is-active"));
    btn.classList.add("is-active");
    mode = btn.dataset.mode;
  });

  exampleBtn.addEventListener("click", () => {
    fInput.value = "x"; lInput.value = "pi"; nInput.value = "6";
    modeChips.querySelectorAll(".chip").forEach((c) => c.classList.toggle("is-active", c.dataset.mode === "full"));
    mode = "full";
    updatePreview(); updateStartCheck(); form.requestSubmit();
  });

  presetRow.addEventListener("click", (e) => {
    const btn = e.target.closest(".tag");
    if (!btn) return;
    fInput.value = btn.dataset.f; lInput.value = btn.dataset.l; nInput.value = btn.dataset.n;
    const m = btn.dataset.mode;
    modeChips.querySelectorAll(".chip").forEach((c) => c.classList.toggle("is-active", c.dataset.mode === m));
    mode = m;
    updatePreview(); updateStartCheck(); form.requestSubmit();
  });

  const debounced = Engine.debounce(() => { updatePreview(); updateStartCheck(); }, 220);
  fInput.addEventListener("input", debounced);

  Engine.attachMathKeypad(fInput, document.getElementById("fKeypad"));
  Engine.attachKeypadToggle(document.getElementById("keypadToggle"), document.getElementById("fKeypad"));

  updatePreview();
  updateStartCheck();
})();