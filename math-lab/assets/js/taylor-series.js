/* Taylor Series page wiring. All symbolic work lives in calculus-symbolic.js and runs inside
   the CAS worker — this file only reads inputs, calls CAS.taylorSeries, and renders.

   Same derivation-ladder idiom as limits.js and u-substitution.js: the step slider walks the
   argument (order-0, order-1, ... derivative, then the assembled polynomial), not successive
   approximations. */
(function () {
  "use strict";

  const fxInput = document.getElementById("fxInput");
  const fxPreview = document.getElementById("fxPreview");
  const centerInput = document.getElementById("centerInput");
  const degreeSlider = document.getElementById("degreeSlider");
  const degreeVal = document.getElementById("degreeVal");
  const startStatus = document.getElementById("startStatus");
  const startStatusText = document.getElementById("startStatusText");
  const formError = document.getElementById("formError");
  const formErrorText = document.getElementById("formErrorText");
  const form = document.getElementById("taylorForm");
  const presetRow = document.getElementById("presetRow");

  const placeholderPanel = document.getElementById("placeholderPanel");
  const resultsArea = document.getElementById("resultsArea");

  const statDegree = document.getElementById("statDegree");
  const statPa = document.getElementById("statPa");
  const formulaResult = document.getElementById("formulaResult");
  const stepTableBody = document.querySelector("#stepTable tbody");
  const stepSlider = document.getElementById("stepSlider");
  const stepLabel = document.getElementById("stepLabel");

  const VARIABLE = "x";
  const STORE_KEY = "engine-lab:calculus-taylor-series";
  let state = null;

  function updatePreview() {
    const raw = fxInput.value.trim();
    Engine.renderKatex(fxPreview, raw ? Engine.toLatex(raw) : "", false);
    Engine.pulseFlash(fxPreview);
  }

  function updateStartCheck() {
    const raw = fxInput.value.trim();
    if (!raw) {
      startStatus.className = "status-line bad";
      startStatusText.textContent = "Enter a function.";
      return null;
    }
    const compiled = Engine.compileFx(raw, VARIABLE);
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
    startStatusText.textContent = "Ready — press Expand.";
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

  function snapshot() {
    return { fx: fxInput.value, center: centerInput.value, degree: degreeSlider.value };
  }

  function render(result, expr, a) {
    placeholderPanel.style.display = "none";
    resultsArea.style.display = "";
    hideError();
    state = { steps: result.steps };

    statDegree.textContent = result.degree;
    statPa.textContent = Engine.formatNum(result.coeffs[0], 4);

    Engine.renderKatex(formulaResult, "P_{" + result.degree + "}(x) = " + result.latex, true);

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

    plot(expr, result, a);
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  function plot(expr, result, a) {
    const f = Engine.compileFx(expr, VARIABLE);
    const P = Engine.compileFx(result.result, VARIABLE);
    if (!f.ok) { Plotly.purge("fxPlot"); return; }

    const span = Math.max(2, Math.abs(a) * 0.6 + 2);
    const samples = 300;
    const xs = [], ys = [], pys = [];
    for (let i = 0; i <= samples; i++) {
      const x = a - span + (i / samples) * (2 * span);
      let y, py;
      try { y = f.fn(x); } catch { y = null; }
      try { py = P.ok ? P.fn(x) : null; } catch { py = null; }
      xs.push(x);
      ys.push(Number.isFinite(y) ? y : null);
      pys.push(Number.isFinite(py) ? py : null);
    }

    Plotly.newPlot("fxPlot", [
      { x: xs, y: ys, mode: "lines", name: "f(x)", line: { color: "#4f9e82", width: 2.5 } },
      { x: xs, y: pys, mode: "lines", name: `P${result.degree}(x)`, line: { color: "#ed6d40", width: 2, dash: "dash" } }
    ], Engine.plotlyBaseLayout({ legend: { orientation: "h", y: -0.18 } }), Engine.plotlyConfig);
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

    const expr = fxInput.value.trim();
    const a = parseFloat(centerInput.value);
    const degree = parseInt(degreeSlider.value, 10);
    degreeVal.textContent = degree;

    const submitBtn = form.querySelector('button[type="submit"] .btn-text');
    const previousLabel = submitBtn ? submitBtn.textContent : null;
    if (submitBtn) submitBtn.textContent = "Expanding…";

    CAS.taylorSeries(expr, VARIABLE, a, degree)
      .then((result) => {
        if (!result.ok) { showError(result.reason); return; }
        render(result, expr, a);
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

  presetRow.addEventListener("click", (e) => {
    const btn = e.target.closest(".tag");
    if (!btn) return;
    fxInput.value = btn.dataset.fx;
    centerInput.value = btn.dataset.center;
    if (btn.dataset.degree) degreeSlider.value = btn.dataset.degree;
    updatePreview();
    updateStartCheck();
    form.requestSubmit();
  });

  stepSlider.addEventListener("input", () => updateStep(Number(stepSlider.value)));

  const debounced = Engine.debounce(() => { updatePreview(); updateStartCheck(); }, 220);
  fxInput.addEventListener("input", debounced);
  centerInput.addEventListener("input", debounced);
  degreeSlider.addEventListener("input", () => { degreeVal.textContent = degreeSlider.value; });

  Engine.attachMathKeypad(fxInput, document.getElementById("fxKeypad"));
  Engine.attachKeypadToggle(document.getElementById("keypadToggle"), document.getElementById("fxKeypad"));

  const saved = Proto.loadState(STORE_KEY);
  if (saved) {
    if (saved.fx !== undefined) fxInput.value = saved.fx;
    if (saved.center !== undefined) centerInput.value = saved.center;
    if (saved.degree !== undefined) degreeSlider.value = saved.degree;
  }
  degreeVal.textContent = degreeSlider.value;

  updatePreview();
  updateStartCheck();
})();
