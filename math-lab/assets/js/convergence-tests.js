/* Convergence Tests page wiring. All symbolic work lives in calculus-symbolic.js and runs
   inside the CAS worker — this file only reads the general term, calls
   CalculusSymbolic.convergenceTests, and renders: the verdict, the test that concluded, the
   derivation ladder, and a plot of the partial sums S_N closing in on (or running away from)
   a limit. The term is indexed by n. */
(function () {
  "use strict";

  const termInput = document.getElementById("termInput");
  const termPreview = document.getElementById("termPreview");
  const startStatus = document.getElementById("startStatus");
  const startStatusText = document.getElementById("startStatusText");
  const formError = document.getElementById("formError");
  const formErrorText = document.getElementById("formErrorText");
  const form = document.getElementById("convForm");
  const exampleBtn = document.getElementById("exampleBtn");
  const presetRow = document.getElementById("presetRow");

  const placeholderPanel = document.getElementById("placeholderPanel");
  const resultsArea = document.getElementById("resultsArea");
  const refusedPanel = document.getElementById("refusedPanel");
  const refusedReason = document.getElementById("refusedReason");

  const statVerdict = document.getElementById("statVerdict");
  const statTest = document.getElementById("statTest");
  const statVerified = document.getElementById("statVerified");
  const formulaResult = document.getElementById("formulaResult");
  const stepTableBody = document.querySelector("#stepTable tbody");
  const stepSlider = document.getElementById("stepSlider");
  const stepLabel = document.getElementById("stepLabel");

  const INDEX = "n";
  let state = null;

  function updatePreview() {
    const raw = termInput.value.trim();
    Engine.renderKatex(termPreview, raw ? "\\sum_{n=1}^{\\infty} " + Engine.toLatex(raw) : "", false);
    Engine.pulseFlash(termPreview);
  }

  function updateStartCheck() {
    const raw = termInput.value.trim();
    if (!raw) {
      startStatus.className = "status-line bad";
      startStatusText.textContent = "Enter the general term aₙ.";
      return null;
    }
    const compiled = Engine.compileFx(raw, INDEX);
    if (!compiled.ok) {
      startStatus.className = "status-line bad";
      startStatusText.textContent = compiled.error;
      return null;
    }
    startStatus.className = "status-line ok";
    startStatusText.textContent = "Term parses — press Classify.";
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

  function render(result, term) {
    placeholderPanel.style.display = "none";
    refusedPanel.style.display = "none";
    resultsArea.style.display = "";
    state = { steps: result.steps };

    statVerdict.textContent = result.verdict === "converges" ? "Converges" : "Diverges";
    statVerdict.className = "value " + (result.verdict === "converges" ? "ok" : "bad");
    statTest.textContent = result.test;
    statVerified.textContent = result.verified ? "✓ verified" : "unverified";
    if (result.sum !== undefined && result.sum !== null)
      statVerified.textContent += " · Σ = " + Engine.formatNum(result.sum, 6);

    Engine.renderKatex(formulaResult, "\\sum_{n=1}^{\\infty} " + Engine.toLatex(term) + " \\;\\Rightarrow\\; " + result.latex, true);

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

    plotSums(term, result.verdict);
  }

  // Plot the partial sums S_N = Σ_{n=1}^{N} aₙ for N = 1..200. A convergent series settles to a
  // horizontal asymptote; a divergent one runs away. This is the evidence behind the gate.
  function plotSums(term, verdict) {
    const f = Engine.compileFx(term, INDEX);
    if (!f.ok) { Plotly.purge("fxPlot"); return; }

    const N = 200;
    const xs = [], ys = [];
    let S = 0;
    for (let n = 1; n <= N; n++) {
      let t;
      try { t = f.fn(n); } catch { t = null; }
      if (t === null || !Number.isFinite(t)) {
        // The term overflowed (or went non-finite); stop the curve where the series stops being
        // numerically trackable rather than drawing a meaningless vertical line.
        break;
      }
      S += t;
      xs.push(n);
      ys.push(Number.isFinite(S) ? S : null);
    }

    const color = verdict === "converges" ? "#4f9e82" : "#ed6d40";
    Plotly.newPlot("fxPlot", [
      { x: xs, y: ys, mode: "lines", name: "S_N", line: { color, width: 2.5 } }
    ], Engine.plotlyBaseLayout({
      xaxis: { title: "N (number of terms summed)", tickformat: "d" },
      yaxis: { title: "S_N = Σ aₙ", zeroline: true }
    }), Engine.plotlyConfig);
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

    const term = termInput.value.trim();
    const submitBtn = form.querySelector('button[type="submit"] .btn-text');
    const previousLabel = submitBtn ? submitBtn.textContent : null;
    if (submitBtn) submitBtn.textContent = "Classifying…";

    CAS.convergenceTests(term, INDEX)
      .then((result) => {
        if (!result.ok) { showRefused(result); return; }
        render(result, term);
      })
      .catch((err) => showError(err.message))
      .then(() => {
        if (submitBtn) submitBtn.textContent = previousLabel;
        if (CAS.mode() === "sync") {
          startStatus.className = "status-line bad";
          startStatusText.textContent =
            "Running without a Web Worker (opened over file://?) — a difficult term can freeze the page. Serve the site over http:// to restore the safety timeout.";
        }
      });
  });

  exampleBtn.addEventListener("click", () => {
    termInput.value = "1/n^2";
    updatePreview();
    updateStartCheck();
    form.requestSubmit();
  });

  presetRow.addEventListener("click", (e) => {
    const btn = e.target.closest(".tag");
    if (!btn) return;
    termInput.value = btn.dataset.term;
    updatePreview();
    updateStartCheck();
    form.requestSubmit();
  });

  stepSlider.addEventListener("input", () => updateStep(Number(stepSlider.value)));

  const debounced = Engine.debounce(() => { updatePreview(); updateStartCheck(); }, 220);
  termInput.addEventListener("input", debounced);

  Engine.attachMathKeypad(termInput, document.getElementById("termKeypad"));
  Engine.attachKeypadToggle(document.getElementById("keypadToggle"), document.getElementById("termKeypad"));

  updatePreview();
  updateStartCheck();
})();