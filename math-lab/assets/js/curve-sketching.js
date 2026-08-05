/* Curve Sketching page wiring. All symbolic work (differentiation, root location, and the
   trustworthy-vs-numeric root strategy) lives in calculus-symbolic.js and runs inside the CAS
   worker — this file only reads inputs, calls CAS.curveAnalysis, and renders three linked
   plots: f, f', f''. Critical points are marked on all three at the same x, so a max on the
   f(x) plot lines up visually with the zero-crossing on the f'(x) plot directly below it. */
(function () {
  "use strict";

  const fxInput = document.getElementById("fxInput");
  const fxPreview = document.getElementById("fxPreview");
  const aInput = document.getElementById("aInput");
  const bInput = document.getElementById("bInput");
  const startStatus = document.getElementById("startStatus");
  const startStatusText = document.getElementById("startStatusText");
  const formError = document.getElementById("formError");
  const formErrorText = document.getElementById("formErrorText");
  const form = document.getElementById("curveForm");
  const presetRow = document.getElementById("presetRow");

  const placeholderPanel = document.getElementById("placeholderPanel");
  const resultsArea = document.getElementById("resultsArea");

  const statCritical = document.getElementById("statCritical");
  const statInflection = document.getElementById("statInflection");
  const formulaFp = document.getElementById("formulaFp");
  const formulaFpp = document.getElementById("formulaFpp");
  const stepTableBody = document.querySelector("#stepTable tbody");
  const stepSlider = document.getElementById("stepSlider");
  const stepLabel = document.getElementById("stepLabel");
  const criticalTableBody = document.querySelector("#criticalTable tbody");
  const inflectionTableBody = document.querySelector("#inflectionTable tbody");
  const monotonicText = document.getElementById("monotonicText");
  const concavityText = document.getElementById("concavityText");

  const VARIABLE = "x";
  const STORE_KEY = "engine-lab:calculus-curve-sketching";
  const MAX_MARK = 12; // guards against marking an implausible flood of points on the plot
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
    const a = parseFloat(aInput.value), b = parseFloat(bInput.value);
    if (!Number.isFinite(a) || !Number.isFinite(b) || !(b > a)) {
      startStatus.className = "status-line bad";
      startStatusText.textContent = "The interval [a, b] must be finite with b > a.";
      return null;
    }
    startStatus.className = "status-line ok";
    startStatusText.textContent = "Ready — press Analyze.";
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

  function fmtX(p) {
    return p.exact !== null ? p.exact : "≈" + Engine.formatNum(p.x, 4);
  }

  function snapshot() {
    return { fx: fxInput.value, a: aInput.value, b: bInput.value };
  }

  function render(result, expr, a, b) {
    placeholderPanel.style.display = "none";
    resultsArea.style.display = "";
    hideError();
    state = { steps: result.steps };

    statCritical.textContent = result.criticalPoints.length;
    statInflection.textContent = result.inflectionPoints.length;

    Engine.renderKatex(formulaFp, "f'(x) = " + result.derivativeLatex, true);
    Engine.renderKatex(formulaFpp, "f''(x) = " + result.secondDerivativeLatex, true);

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

    const kindLabel = { max: "local max", min: "local min", neither: "neither (horizontal tangent)" };
    criticalTableBody.innerHTML = result.criticalPoints.length
      ? result.criticalPoints.map((c) => `<tr><td class="mono">${escapeHtml(fmtX(c))}</td><td class="mono">${c.fValue === null ? "—" : Engine.formatNum(c.fValue, 4)}</td><td>${kindLabel[c.kind]}</td></tr>`).join("")
      : `<tr><td colspan="3">None in this interval — f is monotonic here.</td></tr>`;
    inflectionTableBody.innerHTML = result.inflectionPoints.length
      ? result.inflectionPoints.map((p) => `<tr><td class="mono">${escapeHtml(fmtX(p))}</td><td class="mono">${p.fValue === null ? "—" : Engine.formatNum(p.fValue, 4)}</td></tr>`).join("")
      : `<tr><td colspan="2">None in this interval — concavity doesn't change.</td></tr>`;

    monotonicText.innerHTML = result.monotonic
      .map((iv) => `<span class="tag">${iv.sign === "+" ? "increasing" : "decreasing"} on [${Engine.formatNum(iv.from, 3)}, ${Engine.formatNum(iv.to, 3)}]</span>`)
      .join(" ");
    concavityText.innerHTML = result.concavity
      .map((iv) => `<span class="tag">concave ${iv.sign === "+" ? "up" : "down"} on [${Engine.formatNum(iv.from, 3)}, ${Engine.formatNum(iv.to, 3)}]</span>`)
      .join(" ");

    plot(result, expr, a, b);
  }

  function samples(fn, a, b, n) {
    const xs = [], ys = [];
    for (let i = 0; i <= n; i++) {
      const x = a + (i / n) * (b - a);
      let y;
      try { y = fn(x); } catch { y = null; }
      xs.push(x);
      ys.push(Number.isFinite(y) ? y : null);
    }
    return { xs, ys };
  }

  // Vertical dashed lines at every critical/inflection x, repeated identically on all three
  // plots — the visual link the roadmap calls for between a feature on f and its cause on
  // f' or f''.
  function linkShapes(xs, color) {
    return xs.map((x) => ({
      type: "line", x0: x, x1: x, yref: "paper", y0: 0, y1: 1,
      line: { color: color || "#7d858c", width: 1, dash: "dot" }
    }));
  }

  function plot(result, expr, a, b) {
    const f = Engine.compileFx(expr, VARIABLE);
    const fp = Engine.compileFx(result.derivative, VARIABLE);
    const fpp = Engine.compileFx(result.secondDerivative, VARIABLE);
    if (!f.ok) { ["fPlot", "fpPlot", "fppPlot"].forEach((id) => Plotly.purge(id)); return; }

    const N = 400;
    const F = samples(f.fn, a, b, N);
    const Fp = fp.ok ? samples(fp.fn, a, b, N) : { xs: [], ys: [] };
    const Fpp = fpp.ok ? samples(fpp.fn, a, b, N) : { xs: [], ys: [] };

    const crit = result.criticalPoints.slice(0, MAX_MARK);
    const infl = result.inflectionPoints.slice(0, MAX_MARK);
    const allX = crit.map((c) => c.x).concat(infl.map((p) => p.x));

    const colorFor = { max: "#ed6d40", min: "#4f9e82", neither: "#7d858c" };

    Plotly.newPlot("fPlot", [
      { x: F.xs, y: F.ys, mode: "lines", name: "f(x)", line: { color: "#5c939f", width: 2.5 } },
      { x: crit.map((c) => c.x), y: crit.map((c) => c.fValue), mode: "markers", name: "critical points",
        marker: { color: crit.map((c) => colorFor[c.kind]), size: 10 } },
      { x: infl.map((p) => p.x), y: infl.map((p) => p.fValue), mode: "markers", name: "inflection points",
        marker: { color: "#c99a3c", size: 9, symbol: "diamond" } }
    ], Engine.plotlyBaseLayout({ shapes: linkShapes(allX), showlegend: false }), Engine.plotlyConfig);

    Plotly.newPlot("fpPlot", [
      { x: Fp.xs, y: Fp.ys, mode: "lines", name: "f'(x)", line: { color: "#8570b3", width: 2 } },
      { x: crit.map((c) => c.x), y: crit.map(() => 0), mode: "markers", name: "f'=0",
        marker: { color: crit.map((c) => colorFor[c.kind]), size: 9 } }
    ], Engine.plotlyBaseLayout({ shapes: linkShapes(allX).concat([{ type: "line", xref: "paper", x0: 0, x1: 1, y0: 0, y1: 0, line: { color: "#555", width: 1 } }]), showlegend: false }), Engine.plotlyConfig);

    Plotly.newPlot("fppPlot", [
      { x: Fpp.xs, y: Fpp.ys, mode: "lines", name: "f''(x)", line: { color: "#c99a3c", width: 2 } },
      { x: infl.map((p) => p.x), y: infl.map(() => 0), mode: "markers", name: "f''=0",
        marker: { color: "#c99a3c", size: 9, symbol: "diamond" } }
    ], Engine.plotlyBaseLayout({ shapes: linkShapes(allX).concat([{ type: "line", xref: "paper", x0: 0, x1: 1, y0: 0, y1: 0, line: { color: "#555", width: 1 } }]), showlegend: false }), Engine.plotlyConfig);
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
    const a = parseFloat(aInput.value), b = parseFloat(bInput.value);

    const submitBtn = form.querySelector('button[type="submit"] .btn-text');
    const previousLabel = submitBtn ? submitBtn.textContent : null;
    if (submitBtn) submitBtn.textContent = "Analyzing…";

    CAS.curveAnalysis(expr, VARIABLE, a, b)
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

  presetRow.addEventListener("click", (e) => {
    const btn = e.target.closest(".tag");
    if (!btn) return;
    fxInput.value = btn.dataset.fx;
    aInput.value = btn.dataset.a;
    bInput.value = btn.dataset.b;
    updatePreview();
    updateStartCheck();
    form.requestSubmit();
  });

  stepSlider.addEventListener("input", () => updateStep(Number(stepSlider.value)));

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
  }

  updatePreview();
  updateStartCheck();
})();
