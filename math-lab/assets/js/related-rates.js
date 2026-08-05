/* Related Rates page wiring. All symbolic work lives in calculus-symbolic.js and runs
   inside the CAS worker — this file only reads the relationship, the time-dependent
   variables, their values and known rates, and which rate to find; calls
   CalculusSymbolic.relatedRates; and renders the differentiated equation, the solved rate,
   the derivation ladder, and a 2D picture of the constraint.

   The picture: the relationship is plotted as an implicit contour (lhs - rhs = 0) in the
   plane of the driving variable (the one whose rate is known) and the unknown variable,
   with every other symbol substituted to its given value. The instant point is marked on
   the curve and a velocity arrow shows (dDriving/dt, dUnknown/dt); a time slider advances
   the point by its rates so you can watch it peel away from the constraint — the whole
   point of related rates is that the rates only maintain the relationship *at the
   instant*. */
(function () {
  "use strict";

  const eqInput = document.getElementById("eqInput");
  const eqPreview = document.getElementById("eqPreview");
  const varsInput = document.getElementById("varsInput");
  const valuesInput = document.getElementById("valuesInput");
  const ratesInput = document.getElementById("ratesInput");
  const unknownInput = document.getElementById("unknownInput");
  const startStatus = document.getElementById("startStatus");
  const startStatusText = document.getElementById("startStatusText");
  const formError = document.getElementById("formError");
  const formErrorText = document.getElementById("formErrorText");
  const form = document.getElementById("rrForm");
  const exampleBtn = document.getElementById("exampleBtn");
  const presetRow = document.getElementById("presetRow");

  const placeholderPanel = document.getElementById("placeholderPanel");
  const resultsArea = document.getElementById("resultsArea");
  const refusedPanel = document.getElementById("refusedPanel");
  const refusedReason = document.getElementById("refusedReason");

  const statRate = document.getElementById("statRate");
  const statVerified = document.getElementById("statVerified");
  const formulaResult = document.getElementById("formulaResult");
  const stepTableBody = document.querySelector("#stepTable tbody");
  const stepSlider = document.getElementById("stepSlider");
  const stepLabel = document.getElementById("stepLabel");
  const timeSlider = document.getElementById("timeSlider");
  const timeLabel = document.getElementById("timeLabel");

  let state = null;       // { result, driving, unknown, vals, rates }
  let plotState = null;   // { eqFn, x0, y0, vx, vy, xName, yName }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  function showError(msg) { formError.style.display = "block"; formErrorText.textContent = msg; }
  function hideError() { formError.style.display = "none"; }

  function showRefused(result) {
    resultsArea.style.display = "none";
    placeholderPanel.style.display = "none";
    refusedPanel.style.display = "";
    refusedReason.textContent = result.reason;
  }

  // "x = 3, y = 4, L = 5" -> { x: "3", y: "4", L: "5" }
  function parseAssignments(raw) {
    const out = {};
    if (!raw) return out;
    for (const part of raw.split(/[,;\n]/)) {
      const m = part.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.+?)\s*$/);
      if (m) out[m[1]] = m[2].trim();
    }
    return out;
  }

  // "dx/dt = 2, dy/dt = -1" -> { x: "2", y: "-1" }; also accepts "dxdt = 2".
  function parseRates(raw) {
    const out = {};
    if (!raw) return out;
    for (const part of raw.split(/[,;\n]/)) {
      const m = part.match(/^\s*d([A-Za-z_][A-Za-z0-9_]*)\s*\/?\s*dt\s*=\s*(.+?)\s*$/i)
              || part.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.+?)\s*$/);
      if (m) out[m[1]] = m[2].trim();
    }
    return out;
  }

  function varsList() {
    return varsInput.value.split(/[, \n]+/).map((s) => s.trim()).filter(Boolean);
  }

  function updatePreview() {
    const raw = eqInput.value.trim();
    Engine.renderKatex(eqPreview, raw ? Engine.toLatex(raw) : "", false);
    Engine.pulseFlash(eqPreview);
  }

  function updateStartCheck() {
    const raw = eqInput.value.trim();
    if (!raw) {
      startStatus.className = "status-line bad";
      startStatusText.textContent = "Enter the relationship (e.g. x^2 + y^2 = 25).";
      return false;
    }
    if (!raw.includes("=")) {
      startStatus.className = "status-line bad";
      startStatusText.textContent = "The relationship needs one '=' sign.";
      return false;
    }
    if (varsList().length === 0) {
      startStatus.className = "status-line bad";
      startStatusText.textContent = "Name the time-dependent quantities (e.g. x, y).";
      return false;
    }
    startStatus.className = "status-line ok";
    startStatusText.textContent = "Ready — press Solve.";
    return true;
  }

  function render(result) {
    placeholderPanel.style.display = "none";
    refusedPanel.style.display = "none";
    resultsArea.style.display = "";
    state = { result, steps: result.steps };

    statRate.textContent = result.rateLabel + " = " + result.result;
    statVerified.textContent = result.verified ? "✓ verified" : "unverified";

    Engine.renderKatex(formulaResult, result.latex, true);

    stepTableBody.innerHTML = result.steps
      .map((s, i) => `<tr data-n="${i}"><td>${i + 1}</td><td>${escapeHtml(s.rule)}</td><td><span class="step-tex" data-i="${i}"></span></td></tr>`)
      .join("");
    stepTableBody.querySelectorAll(".step-tex").forEach((el) => {
      Engine.renderKatex(el, result.steps[Number(el.dataset.i)].latex, false);
    });

    stepSlider.min = 0;
    stepSlider.max = Math.max(0, result.steps.length - 1);
    stepSlider.value = result.steps.length - 1;
    updateStep(result.steps.length - 1);

    drawPlot(result);
  }

  function updateStep(idx) {
    if (!state) return;
    const n = Math.max(0, Math.min(state.steps.length - 1, idx));
    stepTableBody.querySelectorAll("tr").forEach((tr) => {
      const rowN = Number(tr.dataset.n);
      tr.classList.toggle("is-current", rowN === n);
      tr.style.opacity = rowN <= n ? "" : "0.25";
    });
    stepLabel.textContent = `step ${n + 1} / ${state.steps.length}`;
  }

  // ---- The constraint picture ----
  function drawPlot(result) {
    const vars = varsList();
    const vals = parseAssignments(valuesInput.value);
    const rates = parseRates(ratesInput.value);
    const unknown = result.unknown;
    // The driving variable: a variable with a known rate that isn't the unknown.
    const driving = vars.find((v) => v !== unknown && (v in rates)) || vars.find((v) => v !== unknown);
    if (!driving) { Plotly.purge("fxPlot"); return; }

    // eq = lhs - rhs with every symbol substituted to its value EXCEPT the two axes.
    const parts = result.equation.split("=");
    const eqStr = "((" + parts[0].trim() + ")-(" + parts[1].trim() + "))";
    let compiled;
    try { compiled = math.parse(eqStr).compile(); } catch (e) { Plotly.purge("fxPlot"); return; }

    const scope = {};
    for (const k in vals) if (k !== driving && k !== unknown) scope[k] = Number(vals[k]);
    // Any remaining free symbol (other than the axes) without a value -> can't plot.
    for (const v of vars) if (v !== driving && v !== unknown && !(v in scope)) { Plotly.purge("fxPlot"); return; }

    function eqAt(x, y) {
      try {
        const r = compiled.evaluate(Object.assign({}, scope, { [driving]: x, [unknown]: y }));
        return (typeof r === "number" && Number.isFinite(r)) ? r : NaN;
      } catch (e) { return NaN; }
    }

    const x0 = Number(vals[driving]);
    const y0 = Number(vals[unknown]);
    const vx = Number(rates[driving]);
    const vy = result.numeric;
    if (!Number.isFinite(x0) || !Number.isFinite(y0) || !Number.isFinite(vx) || !Number.isFinite(vy)) {
      Plotly.purge("fxPlot"); return;
    }

    plotState = { eqAt, x0, y0, vx, vy, xName: driving, yName: unknown };
    timeSlider.value = 0;
    timeLabel.textContent = "t = 0 (the instant)";
    plotContour();
  }

  function plotContour() {
    if (!plotState) return;
    const { eqAt, x0, y0, vx, vy, xName, yName } = plotState;

    // Window around the instant point, sized to the velocity so the arrow is legible.
    const span = Math.max(1.5, Math.abs(x0) * 0.6, Math.abs(y0) * 0.6, Math.abs(vx) * 1.5, Math.abs(vy) * 1.5);
    const xr = [x0 - span, x0 + span];
    const yr = [y0 - span, y0 + span];
    const N = 60;
    const xs = [], ys = [], zs = [];
    for (let i = 0; i < N; i++) { xs.push(xr[0] + (i / (N - 1)) * (xr[1] - xr[0])); }
    for (let j = 0; j < N; j++) { ys.push(yr[0] + (j / (N - 1)) * (yr[1] - yr[0])); }
    for (let j = 0; j < N; j++) {
      const row = [];
      for (let i = 0; i < N; i++) row.push(eqAt(xs[i], ys[j]));
      zs.push(row);
    }

    const tau = Number(timeSlider.value);
    const px = x0 + vx * tau, py = y0 + vy * tau;

    const traces = [
      {
        type: "contour", x: xs, y: ys, z: zs,
        contours: { start: 0, end: 0, size: 1, coloring: "lines" },
        line: { color: "#5c939f", width: 2.2 },
        showscale: false, name: "constraint", hoverinfo: "skip"
      },
      { x: [x0], y: [y0], mode: "markers", name: "instant",
        marker: { size: 11, color: "#ed6d40", symbol: "circle" }, hoverinfo: "skip" },
      { x: [px], y: [py], mode: "markers", name: "now",
        marker: { size: 11, color: "#ed6d40", symbol: "circle-open", line: { width: 2 } }, hoverinfo: "skip" },
      { x: [x0, x0 + vx], y: [y0, y0 + vy], mode: "lines",
        line: { color: "#9bcf6b", width: 3 }, name: "velocity", hoverinfo: "skip" }
    ];

    Plotly.newPlot("fxPlot", traces, Engine.plotlyBaseLayout({
      xaxis: { title: xName, range: xr, zeroline: false },
      yaxis: { title: yName, range: yr, zeroline: false, scaleanchor: "x", scaleratio: 1 },
      margin: { l: 50, r: 20, t: 20, b: 45 }
    }), Engine.plotlyConfig);
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    hideError();
    if (!updateStartCheck()) return;

    const equation = eqInput.value.trim();
    const vars = varsList();
    const values = parseAssignments(valuesInput.value);
    const knownRates = parseRates(ratesInput.value);
    let unknown = unknownInput.value.trim();
    if (!unknown) {
      const auto = vars.find((v) => !(v in knownRates));
      if (auto) unknown = auto;
    }
    if (!unknown) { showError("Pick which quantity's rate to find (it must be one of the variables you named)."); return; }

    const submitBtn = form.querySelector('button[type="submit"] .btn-text');
    const prev = submitBtn ? submitBtn.textContent : null;
    if (submitBtn) submitBtn.textContent = "Solving…";

    CAS.relatedRates(equation, vars, values, knownRates, unknown)
      .then((result) => {
        if (!result.ok) { showRefused(result); Plotly.purge("fxPlot"); return; }
        render(result);
      })
      .catch((err) => showError(err.message))
      .then(() => {
        if (submitBtn) submitBtn.textContent = prev;
        if (CAS.mode() === "sync") {
          startStatus.className = "status-line bad";
          startStatusText.textContent =
            "Running without a Web Worker (opened over file://?) — a hard relationship can freeze the page. Serve over http:// to restore the safety timeout.";
        }
      });
  });

  exampleBtn.addEventListener("click", () => {
    eqInput.value = "x^2+y^2=25";
    varsInput.value = "x, y";
    valuesInput.value = "x = 3, y = 4";
    ratesInput.value = "dx/dt = 2";
    unknownInput.value = "y";
    updatePreview(); updateStartCheck(); form.requestSubmit();
  });

  presetRow.addEventListener("click", (e) => {
    const btn = e.target.closest(".tag");
    if (!btn) return;
    eqInput.value = btn.dataset.eq;
    varsInput.value = btn.dataset.vars;
    valuesInput.value = btn.dataset.values;
    ratesInput.value = btn.dataset.rates;
    unknownInput.value = btn.dataset.unknown;
    updatePreview(); updateStartCheck(); form.requestSubmit();
  });

  stepSlider.addEventListener("input", () => updateStep(Number(stepSlider.value)));
  timeSlider.addEventListener("input", () => {
    if (!plotState) return;
    const tau = Number(timeSlider.value);
    timeLabel.textContent = "t = " + tau + "  (point advanced by its rates)";
    plotContour();
  });

  const debounced = Engine.debounce(() => { updatePreview(); updateStartCheck(); }, 220);
  eqInput.addEventListener("input", debounced);
  varsInput.addEventListener("input", debounced);

  Engine.attachMathKeypad(eqInput, document.getElementById("eqKeypad"));
  Engine.attachKeypadToggle(document.getElementById("keypadToggle"), document.getElementById("eqKeypad"));

  updatePreview();
  updateStartCheck();
})();