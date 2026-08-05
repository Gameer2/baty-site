/* Fourier Series page wiring. Reads f(x), the half-length L (a constant like "pi" is allowed),
   the term count N, and a series type (full / half-range sine / half-range cosine), then calls
   CAS.fourierSeries (→ CalculusSymbolic.fourierSeries: Simpson coefficients for every n, exact
   forms via gatedIntegral with π kept symbolic for the first few n). The numeric coefficient
   arrays come back as plain data; the partial sum is rebuilt here via
   CalculusSymbolic.fourierSeriesValue (pure, no nerdamer) and plotted against f(x) — the Gibbs
   overshoot at a jump is the point of the picture. */
(function () {
  "use strict";

  const fxInput = document.getElementById("fxInput");
  const fxPreview = document.getElementById("fxPreview");
  const LInput = document.getElementById("LInput");
  const NInput = document.getElementById("NInput");
  const modeRow = document.getElementById("modeRow");
  const presetRow = document.getElementById("presetRow");
  const form = document.getElementById("ffForm");
  const formError = document.getElementById("formError");
  const formErrorText = document.getElementById("formErrorText");
  const startStatus = document.getElementById("startStatus");
  const startStatusText = document.getElementById("startStatusText");
  const placeholderPanel = document.getElementById("placeholderPanel");
  const resultsArea = document.getElementById("resultsArea");
  const refusedPanel = document.getElementById("refusedPanel");
  const refusedReason = document.getElementById("refusedReason");

  let mode = "full";

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  function showError(msg) { formError.style.display = "block"; formErrorText.textContent = msg; }
  function hideError() { formError.style.display = "none"; }
  function setStatus(ok, msg) {
    startStatus.className = "status-line " + (ok ? "ok" : "bad");
    startStatusText.textContent = msg;
  }
  function showRefused(r) {
    placeholderPanel.style.display = "none";
    resultsArea.style.display = "none";
    refusedPanel.style.display = "";
    refusedReason.textContent = r.reason;
  }

  function makeFn(expr) {
    try {
      const code = math.parse(expr).compile();
      return (x) => { const r = code.evaluate({ x }); return (typeof r === "number" && Number.isFinite(r)) ? r : NaN; };
    } catch (e) { return null; }
  }

  function updatePreview() {
    const raw = fxInput.value.trim();
    Engine.renderKatex(fxPreview, raw ? `f(x) = ${Engine.toLatex(raw)}` : "", false);
    Engine.pulseFlash(fxPreview);
  }

  function updateStartCheck() {
    const raw = fxInput.value.trim();
    if (!raw) { setStatus(false, "Enter the function f(x)."); return false; }
    if (!makeFn(raw)) { setStatus(false, "Couldn't parse f(x)."); return false; }
    const Lstr = LInput.value.trim();
    if (!Lstr) { setStatus(false, "Enter the half-length L (a number or a constant like pi)."); return false; }
    const N = parseInt(NInput.value, 10);
    if (!(N >= 1)) { setStatus(false, "Terms N must be at least 1."); return false; }
    setStatus(true, "Ready — press Expand.");
    return true;
  }

  modeRow.addEventListener("click", (e) => {
    const btn = e.target.closest(".tag"); if (!btn) return;
    modeRow.querySelectorAll(".tag").forEach((t) => t.classList.remove("is-active"));
    btn.classList.add("is-active");
    mode = btn.dataset.mode;
  });

  presetRow.addEventListener("click", (e) => {
    const btn = e.target.closest(".tag"); if (!btn) return;
    fxInput.value = btn.dataset.fx; LInput.value = btn.dataset.l;
    mode = btn.dataset.mode;
    modeRow.querySelectorAll(".tag").forEach((t) => t.classList.toggle("is-active", t.dataset.mode === mode));
    updatePreview(); updateStartCheck(); form.requestSubmit();
  });

  function renderCoeffTable(r) {
    const tbody = document.querySelector("#coeffTable tbody");
    const rows = [];
    const fmt = (x) => (x == null || !Number.isFinite(x)) ? "—" : Engine.formatNum(x, 6);
    if (r.a0) rows.push({ type: "a", n: 0, value: r.a0.value, numeric: r.a0.numeric });
    r.an.forEach((a) => rows.push({ type: "a", n: a.n, value: a.value, numeric: a.numeric }));
    r.bn.forEach((b) => rows.push({ type: "b", n: b.n, value: b.value, numeric: b.numeric }));
    tbody.innerHTML = rows.map((row) =>
      `<tr><td>${row.type === "a" ? "aₙ" : "bₙ"}</td><td>${row.n}</td>` +
      `<td><span class="step-tex" data-v="${escapeHtml(row.value || "")}"></span></td>` +
      `<td>${fmt(row.numeric)}</td></tr>`).join("");
    tbody.querySelectorAll(".step-tex").forEach((el) => {
      const v = el.dataset.v;
      Engine.renderKatex(el, v ? Engine.toLatex(v) : "—", false);
    });
  }

  function drawPlot(r) {
    const fn = makeFn(fxInput.value.trim());
    if (!fn) { Plotly.purge("ffPlot"); return; }
    const L = r.L;
    const x0 = -L, x1 = L;
    const N = r.N;
    const M = 500;
    const xs = [], fys = [], sys = [];
    for (let i = 0; i <= M; i++) {
      const x = x0 + (i / M) * (x1 - x0);
      xs.push(x);
      const fy = fn(x); fys.push(Number.isFinite(fy) ? fy : null);
      sys.push(CalculusSymbolic.fourierSeriesValue(r, r.mode, L, x, N));
    }
    const traces = [
      { x: xs, y: fys, mode: "lines", name: "f(x)", line: { color: "#5c939f", width: 2.5, dash: "dot" }, connectgaps: false },
      { x: xs, y: sys, mode: "lines", name: "S_N(x)", line: { color: "#ed6d40", width: 2.5 } }
    ];
    const finite = sys.filter((y) => Number.isFinite(y)).concat(fys.filter((y) => Number.isFinite(y)));
    let lo = Math.min.apply(null, finite), hi = Math.max.apply(null, finite);
    if (!Number.isFinite(lo) || !Number.isFinite(hi)) { lo = -1; hi = 1; }
    const pad = (hi - lo) * 0.12 + 0.2;
    Plotly.newPlot("ffPlot", traces, Engine.plotlyBaseLayout({
      xaxis: { title: "x", range: [x0, x1], zeroline: true, zerolinecolor: "#2a2f33" },
      yaxis: { title: "y", range: [lo - pad, hi + pad], zeroline: true, zerolinecolor: "#2a2f33" },
      legend: { orientation: "h", y: -0.18 },
      margin: { l: 55, r: 20, t: 20, b: 45 }
    }), Engine.plotlyConfig);
  }

  function render(r) {
    placeholderPanel.style.display = "none";
    refusedPanel.style.display = "none";
    resultsArea.style.display = "";
    const modeLabel = { full: "full · [-L, L]", sine: "sine · [0, L]", cosine: "cosine · [0, L]" }[r.mode];
    document.getElementById("statMode").textContent = modeLabel;
    document.getElementById("statN").textContent = r.N;
    document.getElementById("statVerified").textContent = r.verified ? "✓ verified" : "unverified";
    Engine.renderKatex(document.getElementById("seriesResult"), r.seriesLatex, true);
    Engine.renderKatex(document.getElementById("partialSumResult"), r.partialSumLatex, true);
    renderCoeffTable(r);
    document.getElementById("plotTitle").textContent = "f(x) vs the " + r.N + "-term partial sum" + (r.mode !== "full" ? " (extension shown on [-L, L])" : "");
    drawPlot(r);
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    hideError();
    refusedPanel.style.display = "none";
    if (!updateStartCheck()) return;
    const submitBtn = form.querySelector('button[type="submit"] .btn-text');
    const prev = submitBtn ? submitBtn.textContent : null;
    if (submitBtn) submitBtn.textContent = "Expanding…";

    CAS.fourierSeries(fxInput.value.trim(), "x", LInput.value.trim(), mode, parseInt(NInput.value, 10))
      .then((r) => {
        if (!r.ok) { showRefused(r); return; }
        render(r);
        setStatus(true, "Expanded — " + r.N + " terms.");
      })
      .catch((err) => { showError(err.message || String(err)); setStatus(false, err.message || String(err)); })
      .then(() => {
        if (submitBtn) submitBtn.textContent = prev;
        if (CAS.mode() === "sync") {
          setStatus(false, "Running without a Web Worker (opened over file://?) — a hard f(x) can freeze the page. Serve over http:// to restore the safety timeout.");
        }
      });
  });

  Engine.attachMathKeypad(fxInput, document.getElementById("fxKeypad"));
  Engine.attachKeypadToggle(document.getElementById("keypadToggle"), document.getElementById("fxKeypad"));
  const debounced = Engine.debounce(() => { updatePreview(); updateStartCheck(); }, 220);
  fxInput.addEventListener("input", debounced);
  LInput.addEventListener("input", debounced);
  NInput.addEventListener("input", debounced);
  updatePreview();
  updateStartCheck();
})();