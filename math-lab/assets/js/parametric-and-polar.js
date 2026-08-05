/* Parametric & Polar page wiring. The symbolic work (differentiate x(t)/y(t) or r(θ),
   integrate the arc-length / area integrands with π kept symbolic, check each against
   Simpson) lives in calculus-symbolic.js behind the CAS worker. This file collects the
   curve definition and parameter range, calls CalculusSymbolic.parametricAndPolar, and
   renders the three quantities (slope, arc length, area) — each independently ok or
   refused — plus the combined derivation ladder and a plot of the traced curve.

   The picture: the curve drawn point by point as the parameter runs [a, b]; the start and
   end marked; and — when the slope resolved — a short tangent segment drawn at the
   midpoint, so the reported dy/dx is visible against the curve. */
(function () {
  "use strict";

  const modeRow = document.getElementById("modeRow");
  const paramFields = document.getElementById("paramFields");
  const polarFields = document.getElementById("polarFields");
  const xInput = document.getElementById("xInput");
  const yInput = document.getElementById("yInput");
  const rInput = document.getElementById("rInput");
  const xPreview = document.getElementById("xPreview");
  const yPreview = document.getElementById("yPreview");
  const rPreview = document.getElementById("rPreview");
  const aInput = document.getElementById("aInput");
  const bInput = document.getElementById("bInput");

  const startStatus = document.getElementById("startStatus");
  const startStatusText = document.getElementById("startStatusText");
  const formError = document.getElementById("formError");
  const formErrorText = document.getElementById("formErrorText");
  const form = document.getElementById("ppForm");
  const exampleBtn = document.getElementById("exampleBtn");
  const presetRow = document.getElementById("presetRow");

  const placeholderPanel = document.getElementById("placeholderPanel");
  const resultsArea = document.getElementById("resultsArea");
  const refusedPanel = document.getElementById("refusedPanel");
  const refusedReason = document.getElementById("refusedReason");

  const statLabelSlope = document.getElementById("statLabelSlope");
  const statSlope = document.getElementById("statSlope");
  const statArc = document.getElementById("statArc");
  const statArea = document.getElementById("statArea");
  const formulaResult = document.getElementById("formulaResult");
  const stepTableBody = document.querySelector("#stepTable tbody");
  const stepSlider = document.getElementById("stepSlider");
  const stepLabel = document.getElementById("stepLabel");
  const plotTitle = document.getElementById("plotTitle");

  let mode = "parametric";
  let steps = [];     // combined derivation ladder across quantities
  let result = null;  // last rendered bundle
  let plotState = null;

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  function showError(msg) { formError.style.display = "block"; formErrorText.textContent = msg; }
  function hideError() { formError.style.display = "none"; }
  function showRefused(r) {
    resultsArea.style.display = "none";
    placeholderPanel.style.display = "none";
    refusedPanel.style.display = "";
    refusedReason.textContent = r.reason;
  }

  // Compile an expression in one variable to a numeric fn(u).
  function makeFn(expr, varName) {
    try {
      const code = math.parse(expr).compile();
      const scope = {}; scope[varName] = 0;
      return (u) => { scope[varName] = u; const r = code.evaluate(scope); return (typeof r === "number" && Number.isFinite(r)) ? r : NaN; };
    } catch (e) { return null; }
  }

  function updatePreview() {
    if (mode === "parametric") {
      Engine.renderKatex(xPreview, xInput.value.trim() ? Engine.toLatex(xInput.value.trim()) : "", false);
      Engine.renderKatex(yPreview, yInput.value.trim() ? Engine.toLatex(yInput.value.trim()) : "", false);
      Engine.pulseFlash(xPreview); Engine.pulseFlash(yPreview);
    } else {
      Engine.renderKatex(rPreview, rInput.value.trim() ? Engine.toLatex(rInput.value.trim()) : "", false);
      Engine.pulseFlash(rPreview);
    }
  }

  function updateStartCheck() {
    const aNum = Number(aInput.value), bNum = Number(bInput.value);
    if (!Number.isFinite(aNum) || !Number.isFinite(bNum)) { startStatus.className = "status-line bad"; startStatusText.textContent = "The bounds a and b must be numbers (or constants like pi)."; return false; }
    if (aNum >= bNum) { startStatus.className = "status-line bad"; startStatusText.textContent = "The lower bound a must be less than the upper bound b."; return false; }
    let expr, v;
    if (mode === "parametric") {
      if (!xInput.value.trim() || !yInput.value.trim()) { startStatus.className = "status-line bad"; startStatusText.textContent = "Enter both x(t) and y(t)."; return false; }
      expr = xInput.value.trim(); v = "t";
    } else {
      if (!rInput.value.trim()) { startStatus.className = "status-line bad"; startStatusText.textContent = "Enter r(θ)."; return false; }
      expr = rInput.value.trim(); v = "theta";
    }
    const fn = makeFn(expr, v);
    if (!fn) { startStatus.className = "status-line bad"; startStatusText.textContent = "Couldn't parse " + (mode === "parametric" ? "x(t)" : "r(θ)") + "."; return false; }
    startStatus.className = "status-line ok";
    startStatusText.textContent = "Ready — press Evaluate.";
    return true;
  }

  function qtyCell(q) {
    if (!q.ok) return "refused";
    if (q.symbol === "dy/dx") return (Number.isFinite(q.numeric) ? Engine.formatNum(q.numeric) : q.value);
    return q.value + "  ≈ " + Engine.formatNum(q.numeric);
  }

  function render(r) {
    placeholderPanel.style.display = "none";
    refusedPanel.style.display = "none";
    resultsArea.style.display = "";
    result = r;

    const q = r.quantities;
    statLabelSlope.textContent = "Slope " + q.slope.symbol;
    statSlope.textContent = qtyCell(q.slope);
    statSlope.style.opacity = q.slope.ok ? "" : "0.55";
    statArc.textContent = qtyCell(q.arcLength);
    statArc.style.opacity = q.arcLength.ok ? "" : "0.55";
    statArea.textContent = qtyCell(q.area);
    statArea.style.opacity = q.area.ok ? "" : "0.55";

    Engine.renderKatex(formulaResult, r.latex, true);

    // Build one combined ladder across the quantities, in qOrder. Each row carries the
    // quantity name in the rule column so the reader can see which result a step belongs to.
    steps = [];
    r.qOrder.forEach((key) => {
      const qty = q[key];
      const head = qty.name + (qty.symbol ? " (" + qty.symbol + ")" : "");
      if (!qty.ok) {
        steps.push({ head, rule: "—" + qty.name + "—", text: qty.reason, latex: qty.latex || "" });
        return;
      }
      qty.steps.forEach((s) => steps.push({ head, rule: s.rule, text: s.text, latex: s.latex }));
    });

    stepTableBody.innerHTML = steps
      .map((s, i) => `<tr data-n="${i}"><td>${i + 1}</td><td>${escapeHtml(s.head)}<br><span class="field-note">${escapeHtml(s.rule)}</span></td><td><span class="step-tex" data-i="${i}"></span></td></tr>`)
      .join("");
    stepTableBody.querySelectorAll(".step-tex").forEach((el) => {
      Engine.renderKatex(el, steps[Number(el.dataset.i)].latex, false);
    });

    stepSlider.min = 0;
    stepSlider.max = Math.max(0, steps.length - 1);
    stepSlider.value = steps.length - 1;
    updateStep(steps.length - 1);

    drawPlot(r);
  }

  function updateStep(idx) {
    const n = Math.max(0, Math.min(steps.length - 1, idx));
    stepTableBody.querySelectorAll("tr").forEach((tr) => {
      const rowN = Number(tr.dataset.n);
      tr.classList.toggle("is-current", rowN === n);
      tr.style.opacity = rowN <= n ? "" : "0.25";
    });
    stepLabel.textContent = steps.length ? `step ${n + 1} / ${steps.length}` : "—";
  }

  // ---- The curve picture ----
  function curvePoint(u) {
    if (mode === "parametric") {
      const xFn = makeFn(xInput.value.trim(), "t");
      const yFn = makeFn(yInput.value.trim(), "t");
      if (!xFn || !yFn) return null;
      return (p) => { const x = xFn(p), y = yFn(p); return (Number.isFinite(x) && Number.isFinite(y)) ? [x, y] : null; };
    }
    const rFn = makeFn(rInput.value.trim(), "theta");
    if (!rFn) return null;
    return (p) => { const rv = rFn(p); if (!Number.isFinite(rv)) return null; return [rv * Math.cos(p), rv * Math.sin(p)]; };
  }

  function drawPlot(r) {
    const aNum = Number(aInput.value), bNum = Number(bInput.value);
    const pt = curvePoint(0);
    if (!pt || !Number.isFinite(aNum) || !Number.isFinite(bNum) || aNum >= bNum) { Plotly.purge("fxPlot"); return; }

    const N = 300;
    const xs = [], ys = [];
    let xMin = Infinity, xMax = -Infinity, yMin = Infinity, yMax = -Infinity;
    for (let i = 0; i <= N; i++) {
      const u = aNum + (i / N) * (bNum - aNum);
      const p = pt(u);
      if (p) { xs.push(p[0]); ys.push(p[1]); xMin = Math.min(xMin, p[0]); xMax = Math.max(xMax, p[0]); yMin = Math.min(yMin, p[1]); yMax = Math.max(yMax, p[1]); }
      else { xs.push(null); ys.push(null); }
    }
    if (!Number.isFinite(xMin)) { Plotly.purge("fxPlot"); return; }

    const pad = Math.max(0.3, (Math.max(xMax - xMin, yMax - yMin)) * 0.12);
    const xr = [xMin - pad, xMax + pad], yr = [yMin - pad, yMax + pad];

    plotState = { pt, aNum, bNum, slope: r.quantities.slope };

    const traces = [
      { x: xs, y: ys, mode: "lines", name: "curve",
        line: { color: "#9bcf6b", width: 3 }, connectgaps: false, hoverinfo: "skip" }
    ];

    // Tangent at the midpoint, if the slope resolved there.
    const slope = r.quantities.slope;
    if (slope.ok && Number.isFinite(slope.numeric)) {
      const uMid = (plotState.aNum + plotState.bNum) / 2;
      const pm = pt(uMid);
      if (pm) {
        const m = slope.numeric;
        const span = Math.max(xMax - xMin, yMax - yMin) * 0.18;
        const dx = span / Math.sqrt(1 + m * m);
        traces.push({ x: [pm[0] - dx, pm[0] + dx], y: [pm[1] - m * dx, pm[1] + m * dx],
          mode: "lines", line: { color: "#ed6d40", width: 2 }, name: "tangent", hoverinfo: "skip" });
        traces.push({ x: [pm[0]], y: [pm[1]], mode: "markers",
          marker: { size: 9, color: "#ed6d40", symbol: "star" }, name: "midpoint", hoverinfo: "skip" });
      }
    }

    // Start & end markers.
    const ps = pt(plotState.aNum), pe = pt(plotState.bNum);
    if (ps) traces.push({ x: [ps[0]], y: [ps[1]], mode: "markers", marker: { size: 8, color: "#5c939f" }, name: "start", hoverinfo: "skip" });
    if (pe) traces.push({ x: [pe[0]], y: [pe[1]], mode: "markers", marker: { size: 8, color: "#2f6f7f" }, name: "end", hoverinfo: "skip" });

    plotTitle.textContent = mode === "parametric" ? "The parametric curve (x(t), y(t))" : "The polar curve r(θ) in the plane";

    Plotly.newPlot("fxPlot", traces, Engine.plotlyBaseLayout({
      xaxis: { title: "x", range: xr, zeroline: true, zerolinecolor: "#2a2f33", scaleanchor: "y", scaleratio: 1 },
      yaxis: { title: "y", range: yr, zeroline: true, zerolinecolor: "#2a2f33" },
      margin: { l: 55, r: 20, t: 20, b: 45 }
    }), Engine.plotlyConfig);
  }

  function buildSpec() {
    const a = aInput.value.trim(), b = bInput.value.trim();
    if (mode === "parametric") return { x: xInput.value.trim(), y: yInput.value.trim(), a, b };
    return { r: rInput.value.trim(), a, b };
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    hideError();
    if (!updateStartCheck()) return;
    const submitBtn = form.querySelector('button[type="submit"] .btn-text');
    const prev = submitBtn ? submitBtn.textContent : null;
    if (submitBtn) submitBtn.textContent = "Evaluating…";

    CAS.parametricAndPolar(mode, buildSpec(), {})
      .then((r) => {
        if (!r.ok) { showRefused(r); Plotly.purge("fxPlot"); return; }
        render(r);
      })
      .catch((err) => showError(err.message))
      .then(() => {
        if (submitBtn) submitBtn.textContent = prev;
        if (CAS.mode() === "sync") {
          startStatus.className = "status-line bad";
          startStatusText.textContent =
            "Running without a Web Worker (opened over file://?) — a hard integrand can freeze the page. Serve over http:// to restore the safety timeout.";
        }
      });
  });

  function setMode(m) {
    mode = m;
    modeRow.querySelectorAll(".tag").forEach((t) => t.classList.toggle("is-active", t.dataset.mode === m));
    paramFields.style.display = m === "parametric" ? "" : "none";
    polarFields.style.display = m === "polar" ? "" : "none";
  }

  exampleBtn.addEventListener("click", () => {
    setMode("parametric");
    xInput.value = "cos(t)"; yInput.value = "sin(t)"; aInput.value = "0"; bInput.value = "2*pi";
    updatePreview(); updateStartCheck(); form.requestSubmit();
  });

  modeRow.addEventListener("click", (e) => {
    const btn = e.target.closest(".tag"); if (!btn) return;
    setMode(btn.dataset.mode); updatePreview(); updateStartCheck();
  });

  presetRow.addEventListener("click", (e) => {
    const btn = e.target.closest(".tag"); if (!btn) return;
    setMode(btn.dataset.mode);
    if (btn.dataset.mode === "parametric") { xInput.value = btn.dataset.x; yInput.value = btn.dataset.y; }
    else { rInput.value = btn.dataset.r; }
    aInput.value = btn.dataset.a; bInput.value = btn.dataset.b;
    updatePreview(); updateStartCheck(); form.requestSubmit();
  });

  stepSlider.addEventListener("input", () => updateStep(Number(stepSlider.value)));

  const debounced = Engine.debounce(() => { updatePreview(); updateStartCheck(); }, 220);
  xInput.addEventListener("input", debounced);
  yInput.addEventListener("input", debounced);
  rInput.addEventListener("input", debounced);
  aInput.addEventListener("input", debounced);
  bInput.addEventListener("input", debounced);

  // The keypad binds to whichever visible input the user is focused on; attach to both
  // parametric and polar primary inputs and let the keypad follow focus.
  Engine.attachMathKeypad(yInput, document.getElementById("ppKeypad"));
  Engine.attachKeypadToggle(document.getElementById("keypadToggle"), document.getElementById("ppKeypad"));
  Engine.attachMathKeypad(rInput, document.getElementById("ppKeypadP"));
  Engine.attachKeypadToggle(document.getElementById("keypadToggleP"), document.getElementById("ppKeypadP"));

  setMode("parametric");
  updatePreview();
  updateStartCheck();
})();