/* Power Series & Radius of Convergence page wiring. All symbolic work lives in
   calculus-symbolic.js and runs inside the CAS worker — this file only reads the
   coefficient formula cₙ (in the index n), the series variable, and the center a, calls
   CalculusSymbolic.powerSeries, and renders: the radius, the interval of convergence, the
   endpoint verdicts, the derivation ladder, and a number-line plot of the interval. */
(function () {
  "use strict";

  const coeffsInput = document.getElementById("coeffsInput");
  const coeffsPreview = document.getElementById("coeffsPreview");
  const centerInput = document.getElementById("centerInput");
  const startStatus = document.getElementById("startStatus");
  const startStatusText = document.getElementById("startStatusText");
  const formError = document.getElementById("formError");
  const formErrorText = document.getElementById("formErrorText");
  const form = document.getElementById("psForm");
  const exampleBtn = document.getElementById("exampleBtn");
  const presetRow = document.getElementById("presetRow");

  const placeholderPanel = document.getElementById("placeholderPanel");
  const resultsArea = document.getElementById("resultsArea");
  const refusedPanel = document.getElementById("refusedPanel");
  const refusedReason = document.getElementById("refusedReason");

  const statRadius = document.getElementById("statRadius");
  const statInterval = document.getElementById("statInterval");
  const statVerified = document.getElementById("statVerified");
  const formulaResult = document.getElementById("formulaResult");
  const stepTableBody = document.querySelector("#stepTable tbody");
  const stepSlider = document.getElementById("stepSlider");
  const stepLabel = document.getElementById("stepLabel");
  const endpointTableBody = document.querySelector("#endpointTable tbody");

  const VARIABLE = "x";
  const INDEX = "n";
  let state = null;

  function updatePreview() {
    const raw = coeffsInput.value.trim();
    const a = centerInput.value.trim() || "0";
    Engine.renderKatex(coeffsPreview, raw ? "\\sum_{n=0}^{\\infty} " + Engine.toLatex(raw) + "(" + VARIABLE + "-" + a + ")^n" : "", false);
    Engine.pulseFlash(coeffsPreview);
  }

  function updateStartCheck() {
    const raw = coeffsInput.value.trim();
    if (!raw) {
      startStatus.className = "status-line bad";
      startStatusText.textContent = "Enter the coefficient formula cₙ.";
      return null;
    }
    const compiled = Engine.compileFx(raw, INDEX);
    if (!compiled.ok) {
      startStatus.className = "status-line bad";
      startStatusText.textContent = compiled.error;
      return null;
    }
    if (!Number.isFinite(parseFloat(centerInput.value))) {
      startStatus.className = "status-line bad";
      startStatusText.textContent = "The center a must be a number.";
      return null;
    }
    startStatus.className = "status-line ok";
    startStatusText.textContent = "Ready — press Find Radius.";
    return compiled;
  }

  function showError(msg) {
    formError.style.display = "block";
    formErrorText.textContent = msg;
  }

  function hideError() {
    formError.style.display = "none";
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  function showRefused(result) {
    resultsArea.style.display = "none";
    placeholderPanel.style.display = "none";
    refusedPanel.style.display = "";
    refusedReason.textContent = result.reason;
  }

  function fmtNum(x) {
    if (!Number.isFinite(x)) return x > 0 ? "∞" : "−∞";
    const r = Math.round(x);
    if (Math.abs(x - r) < 1e-6) return String(r);
    return String(Number(x.toFixed(4)));
  }

  function render(result, coeffs, a) {
    placeholderPanel.style.display = "none";
    refusedPanel.style.display = "none";
    resultsArea.style.display = "";
    state = { steps: result.steps };

    statRadius.textContent = result.radiusText;
    statInterval.textContent = result.interval;
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

    // Endpoint table (empty for R = 0 and R = ∞).
    endpointTableBody.innerHTML = (result.endpoints || [])
      .map((ep) => `<tr><td class="mono">${escapeHtml(fmtNum(ep.x))}</td><td>${escapeHtml(ep.verdict)}</td><td>${escapeHtml(ep.test)}</td></tr>`)
      .join("") || `<tr><td colspan="3">No endpoints — the series ${result.radius === Infinity ? "converges everywhere" : "converges only at the centre"}.</td></tr>`;

    plotInterval(result, a);
  }

  // A number line with the interval of convergence shaded. Brackets mark whether each
  // endpoint is included (converges, filled) or excluded (diverges, open).
  function plotInterval(result, a) {
    const R = result.radius;
    const traces = [{ x: [], y: [], mode: "markers+text", text: [], textposition: "top center",
      marker: { size: 14, color: [] }, hoverinfo: "skip" }];
    const shapes = [];
    const ann = [];

    if (R === Infinity) {
      // Converges everywhere: shade the whole visible span.
      shapes.push({ type: "rect", x0: -5, x1: 5, y0: -0.4, y1: 0.4, fillcolor: "rgba(79,158,130,0.25)", line: { width: 0 } });
      ann.push({ x: 0, y: 0.9, text: "converges for all x", showarrow: false, font: { color: "#4f9e82" } });
    } else if (R === 0) {
      traces[0].x.push(a); traces[0].y.push(0); traces[0].text.push(String(a));
      traces[0].marker.color.push("#4f9e82");
      ann.push({ x: a, y: 0.9, text: "converges only at x = " + a, showarrow: false, font: { color: "#4f9e82" } });
    } else {
      const left = a - R, right = a + R;
      shapes.push({ type: "rect", x0: left, x1: right, y0: -0.4, y1: 0.4, fillcolor: "rgba(79,158,130,0.25)", line: { width: 0 } });
      // center point
      traces[0].x.push(a); traces[0].y.push(0); traces[0].text.push(""); traces[0].marker.color.push("#333");
      // endpoints: filled (converges) or open (diverges)
      const epL = result.endpoints[0] || {}, epR = result.endpoints[1] || {};
      traces[0].x.push(left); traces[0].y.push(0); traces[0].text.push(fmtNum(left)); traces[0].marker.color.push(epL.verdict === "converges" ? "#4f9e82" : "#ed6d40");
      traces[0].x.push(right); traces[0].y.push(0); traces[0].text.push(fmtNum(right)); traces[0].marker.color.push(epR.verdict === "converges" ? "#4f9e82" : "#ed6d40");
      ann.push({ x: 0, y: 0.9, text: result.interval, showarrow: false, font: { color: "#4f9e82" } });
    }

    const span = (R === Infinity || R === 0) ? 6 : Math.max(R * 1.6, 2);
    Plotly.newPlot("fxPlot", traces, Engine.plotlyBaseLayout({
      xaxis: { title: VARIABLE, range: [Math.min(a, a - span) - 1, Math.max(a, a + span) + 1], zeroline: false },
      yaxis: { visible: false, range: [-1, 1.4], fixedrange: true },
      shapes, annotations: ann,
      margin: { l: 20, r: 20, t: 30, b: 40 }
    }), Object.assign({}, Engine.plotlyConfig, { displayModeBar: false }));
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

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    hideError();
    const compiled = updateStartCheck();
    if (!compiled) return;

    const coeffs = coeffsInput.value.trim();
    const a = parseFloat(centerInput.value);
    const submitBtn = form.querySelector('button[type="submit"] .btn-text');
    const previousLabel = submitBtn ? submitBtn.textContent : null;
    if (submitBtn) submitBtn.textContent = "Finding…";

    CAS.powerSeries(coeffs, VARIABLE, a)
      .then((result) => {
        if (!result.ok) { showRefused(result); return; }
        render(result, coeffs, a);
      })
      .catch((err) => showError(err.message))
      .then(() => {
        if (submitBtn) submitBtn.textContent = previousLabel;
        if (CAS.mode() === "sync") {
          startStatus.className = "status-line bad";
          startStatusText.textContent =
            "Running without a Web Worker (opened over file://?) — difficult coefficients can freeze the page. Serve the site over http:// to restore the safety timeout.";
        }
      });
  });

  exampleBtn.addEventListener("click", () => {
    coeffsInput.value = "1/n";
    centerInput.value = "0";
    updatePreview();
    updateStartCheck();
    form.requestSubmit();
  });

  presetRow.addEventListener("click", (e) => {
    const btn = e.target.closest(".tag");
    if (!btn) return;
    coeffsInput.value = btn.dataset.coeffs;
    centerInput.value = btn.dataset.center || "0";
    updatePreview();
    updateStartCheck();
    form.requestSubmit();
  });

  stepSlider.addEventListener("input", () => updateStep(Number(stepSlider.value)));

  const debounced = Engine.debounce(() => { updatePreview(); updateStartCheck(); }, 220);
  coeffsInput.addEventListener("input", debounced);
  centerInput.addEventListener("input", debounced);

  Engine.attachMathKeypad(coeffsInput, document.getElementById("coeffsKeypad"));
  Engine.attachKeypadToggle(document.getElementById("keypadToggle"), document.getElementById("coeffsKeypad"));

  updatePreview();
  updateStartCheck();
})();