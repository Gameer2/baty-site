/* Applied Optimization page wiring. All symbolic work lives in calculus-symbolic.js and runs
   inside the CAS worker — this file only reads inputs, calls CAS.appliedOptimization, and
   renders. The Extreme-Value-Theorem procedure (candidates = critical points + endpoints,
   keep the best) means the result table IS the derivation, more than a rule-by-rule ladder is. */
(function () {
  "use strict";

  const fxInput = document.getElementById("fxInput");
  const fxPreview = document.getElementById("fxPreview");
  const aInput = document.getElementById("aInput");
  const bInput = document.getElementById("bInput");
  const goalRow = document.getElementById("goalRow");
  const startStatus = document.getElementById("startStatus");
  const startStatusText = document.getElementById("startStatusText");
  const formError = document.getElementById("formError");
  const formErrorText = document.getElementById("formErrorText");
  const form = document.getElementById("optimForm");
  const presetRow = document.getElementById("presetRow");

  const placeholderPanel = document.getElementById("placeholderPanel");
  const resultsArea = document.getElementById("resultsArea");

  const statX = document.getElementById("statX");
  const statValue = document.getElementById("statValue");
  const formulaFp = document.getElementById("formulaFp");
  const stepTableBody = document.querySelector("#stepTable tbody");
  const candidateTableBody = document.querySelector("#candidateTable tbody");
  const xSlider = document.getElementById("xSlider");
  const xSliderVal = document.getElementById("xSliderVal");
  const sliderFVal = document.getElementById("sliderFVal");
  const sliderFpVal = document.getElementById("sliderFpVal");

  const VARIABLE = "x";
  const STORE_KEY = "engine-lab:calculus-applied-optimization";
  let goal = "max";
  let liveF = null, liveFp = null, liveResult = null;

  function updatePreview() {
    const raw = fxInput.value.trim();
    Engine.renderKatex(fxPreview, raw ? Engine.toLatex(raw) : "", false);
    Engine.pulseFlash(fxPreview);
  }

  function updateStartCheck() {
    const raw = fxInput.value.trim();
    if (!raw) {
      startStatus.className = "status-line bad";
      startStatusText.textContent = "Enter an objective function.";
      return null;
    }
    const compiled = Engine.compileFx(raw, VARIABLE);
    if (!compiled.ok) {
      startStatus.className = "status-line bad";
      startStatusText.textContent = compiled.error;
      return null;
    }
    const a = parseFloat(aInput.value), b = parseFloat(bInput.value);
    if (!Number.isFinite(a) || !Number.isFinite(b) || !(b > a)) {
      startStatus.className = "status-line bad";
      startStatusText.textContent = "The interval [a, b] must be finite with b > a.";
      return null;
    }
    startStatus.className = "status-line ok";
    startStatusText.textContent = "Ready — press Optimize.";
    return compiled;
  }

  function showError(msg) {
    resultsArea.style.display = "none";
    placeholderPanel.style.display = "";
    formError.style.display = "block";
    formErrorText.textContent = msg;
  }

  function hideError() {
    formError.style.display = "none";
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  function fmtX(c) {
    return c.exact !== null ? c.exact : "≈" + Engine.formatNum(c.x, 4);
  }

  function snapshot() {
    return { fx: fxInput.value, a: aInput.value, b: bInput.value, goal };
  }

  function render(result, expr, a, b) {
    placeholderPanel.style.display = "none";
    resultsArea.style.display = "";
    hideError();
    statX.textContent = fmtX(result);
    statValue.textContent = Engine.formatNum(result.value, 4);

    Engine.renderKatex(formulaFp, "f'(x) = " + result.derivativeLatex, true);

    stepTableBody.innerHTML = result.steps
      .map((s, i) => `<tr><td>${i + 1}</td><td>${escapeHtml(s.rule)}</td><td><span class="step-tex" data-i="${i}"></span></td></tr>`)
      .join("");
    stepTableBody.querySelectorAll(".step-tex").forEach((el) => {
      Engine.renderKatex(el, result.steps[Number(el.dataset.i)].latex, false);
    });

    candidateTableBody.innerHTML = result.candidates.map((c) => {
      const isWinner = Math.abs(c.x - result.x) < 1e-9;
      return `<tr class="${isWinner ? "is-current" : ""}"><td class="mono">${escapeHtml(fmtX(c))}</td><td>${escapeHtml(c.label)}</td><td class="mono">${Engine.formatNum(c.fValue, 4)}</td><td>${isWinner ? "✓ optimum" : ""}</td></tr>`;
    }).join("");

    const compiledF = Engine.compileFx(expr, VARIABLE);
    const compiledFp = Engine.compileFx(result.derivative, VARIABLE);
    liveF = compiledF.ok ? compiledF.fn : null;
    liveFp = compiledFp.ok ? compiledFp.fn : null;
    liveResult = result;

    xSlider.min = a;
    xSlider.max = b;
    xSlider.step = (b - a) / 500;
    xSlider.value = result.x;
    updateLive(result.x);

    plot(expr, result, a, b);
  }

  function updateLive(x) {
    xSliderVal.textContent = Engine.formatNum(x, 4);
    sliderFVal.textContent = liveF ? Engine.formatNum(safeEval(liveF, x), 4) : "—";
    sliderFpVal.textContent = liveFp ? Engine.formatNum(safeEval(liveFp, x), 4) : "—";
  }

  function safeEval(fn, x) {
    try { const y = fn(x); return Number.isFinite(y) ? y : null; } catch { return null; }
  }

  function plot(expr, result, a, b) {
    const f = Engine.compileFx(expr, VARIABLE);
    if (!f.ok) { Plotly.purge("fxPlot"); return; }

    const n = 400;
    const xs = [], ys = [];
    for (let i = 0; i <= n; i++) {
      const x = a + (i / n) * (b - a);
      let y; try { y = f.fn(x); } catch { y = null; }
      xs.push(x);
      ys.push(Number.isFinite(y) ? y : null);
    }

    Plotly.newPlot("fxPlot", [
      { x: xs, y: ys, mode: "lines", name: "f(x)", line: { color: "#5c939f", width: 2.5 } },
      { x: [result.x], y: [result.value], mode: "markers", name: goal === "max" ? "maximum" : "minimum",
        marker: { color: "#ed6d40", size: 12, symbol: "star" } }
    ], Engine.plotlyBaseLayout({ showlegend: false }), Engine.plotlyConfig);
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    hideError();
    const compiled = updateStartCheck();
    if (!compiled) return;

    const expr = fxInput.value.trim();
    const a = parseFloat(aInput.value), b = parseFloat(bInput.value);

    const submitBtn = form.querySelector('button[type="submit"] .btn-text');
    const previousLabel = submitBtn ? submitBtn.textContent : null;
    if (submitBtn) submitBtn.textContent = "Optimizing…";

    CAS.appliedOptimization(expr, VARIABLE, a, b, goal)
      .then((result) => {
        if (!result.ok) { showError(result.reason); return; }
        render(result, expr, a, b);
        Proto.saveState(STORE_KEY, snapshot());
      })
      .catch((err) => showError(err.message))
      .then(() => {
        if (submitBtn) submitBtn.textContent = previousLabel;
        if (CAS.mode() === "sync") {
          startStatus.className = "status-line bad";
          startStatusText.textContent =
            "Running without a Web Worker (opened over file://?) — a difficult expression can freeze the page. Serve the site over http:// to restore the safety timeout.";
        }
      });
  });

  goalRow.addEventListener("click", (e) => {
    const btn = e.target.closest(".chip");
    if (!btn) return;
    goal = btn.dataset.goal;
    goalRow.querySelectorAll(".chip").forEach((c) => c.classList.toggle("is-active", c.dataset.goal === goal));
  });

  presetRow.addEventListener("click", (e) => {
    const btn = e.target.closest(".tag");
    if (!btn) return;
    fxInput.value = btn.dataset.fx;
    aInput.value = btn.dataset.a;
    bInput.value = btn.dataset.b;
    goal = btn.dataset.goal || "max";
    goalRow.querySelectorAll(".chip").forEach((c) => c.classList.toggle("is-active", c.dataset.goal === goal));
    updatePreview();
    updateStartCheck();
    form.requestSubmit();
  });

  xSlider.addEventListener("input", () => updateLive(parseFloat(xSlider.value)));

  const debounced = Engine.debounce(() => { updatePreview(); updateStartCheck(); }, 220);
  fxInput.addEventListener("input", debounced);
  aInput.addEventListener("input", debounced);
  bInput.addEventListener("input", debounced);

  Engine.attachMathKeypad(fxInput, document.getElementById("fxKeypad"));
  Engine.attachKeypadToggle(document.getElementById("keypadToggle"), document.getElementById("fxKeypad"));

  const saved = Proto.loadState(STORE_KEY);
  if (saved) {
    if (saved.fx !== undefined) fxInput.value = saved.fx;
    if (saved.a !== undefined) aInput.value = saved.a;
    if (saved.b !== undefined) bInput.value = saved.b;
    if (saved.goal !== undefined) {
      goal = saved.goal;
      goalRow.querySelectorAll(".chip").forEach((c) => c.classList.toggle("is-active", c.dataset.goal === goal));
    }
  }

  updatePreview();
  updateStartCheck();
})();
