/* Completing-the-Square page wiring. All symbolic work lives in integration-advanced.js — this
   file only reads inputs, calls CAS.completeTheSquare, and renders the result. Structurally
   identical to algebraic-substitution.js/u-substitution.js (same result shape: {ok, u,
   completedSquare, result, latex, verified, rejected, steps}) since
   IntegrationAdvanced.completeTheSquare was built to the same contract. */
(function () {
  "use strict";

  const fxInput = document.getElementById("fxInput");
  const fxPreview = document.getElementById("fxPreview");
  const startStatus = document.getElementById("startStatus");
  const startStatusText = document.getElementById("startStatusText");
  const formError = document.getElementById("formError");
  const formErrorText = document.getElementById("formErrorText");
  const form = document.getElementById("squareForm");
  const exampleBtn = document.getElementById("exampleBtn");
  const presetRow = document.getElementById("presetRow");

  const placeholderPanel = document.getElementById("placeholderPanel");
  const resultsArea = document.getElementById("resultsArea");
  const refusedPanel = document.getElementById("refusedPanel");
  const refusedReason = document.getElementById("refusedReason");
  const refusedTableBody = document.querySelector("#refusedTable tbody");

  const statU = document.getElementById("statU");
  const statSquare = document.getElementById("statSquare");
  const statVerified = document.getElementById("statVerified");
  const formulaResult = document.getElementById("formulaResult");
  const stepTableBody = document.querySelector("#stepTable tbody");
  const stepSlider = document.getElementById("stepSlider");
  const stepLabel = document.getElementById("stepLabel");

  const VARIABLE = "x";
  let state = null; // { steps }

  function updatePreview() {
    const raw = fxInput.value.trim();
    Engine.renderKatex(fxPreview, raw ? "\\int " + Engine.toLatex(raw) + "\\,dx" : "", false);
    Engine.pulseFlash(fxPreview);
  }

  function updateStartCheck() {
    const raw = fxInput.value.trim();
    if (!raw) {
      startStatus.className = "status-line bad";
      startStatusText.textContent = "Enter an integrand.";
      return null;
    }
    const compiled = Engine.compileFx(raw, VARIABLE);
    if (!compiled.ok) {
      startStatus.className = "status-line bad";
      startStatusText.textContent = compiled.error;
      return null;
    }
    startStatus.className = "status-line ok";
    startStatusText.textContent = "Integrand parses — press Derive to search for a quadratic to complete.";
    return compiled;
  }

  function showError(msg) {
    // Hide any stale success/refusal panel from a prior run so it can't sit underneath
    // the error banner looking like part of the current result.
    resultsArea.style.display = "none";
    refusedPanel.style.display = "none";
    formError.style.display = "block";
    formErrorText.textContent = msg;
  }

  function hideError() {
    formError.style.display = "none";
  }

  function showRefused(result) {
    resultsArea.style.display = "none";
    placeholderPanel.style.display = "none";
    refusedPanel.style.display = "";
    refusedReason.textContent = result.reason;
    refusedTableBody.innerHTML = (result.rejected || [])
      .map((r) => `<tr><td class="mono">${escapeHtml(r.u)}</td><td>${escapeHtml(r.why)}</td></tr>`)
      .join("") || `<tr><td colspan="2">No candidate quadratic could even be formed.</td></tr>`;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  function render(result, integrand) {
    placeholderPanel.style.display = "none";
    refusedPanel.style.display = "none";
    resultsArea.style.display = "";
    state = { steps: result.steps };

    statU.textContent = result.u;
    statSquare.textContent = result.completedSquare;
    statVerified.textContent = result.verified ? "✓ verified" : "unverified";

    Engine.renderKatex(formulaResult, "\\int " + Engine.toLatex(integrand) + "\\,dx = " + result.latex, true);

    stepTableBody.innerHTML = result.steps
      .map((s, i) => `<tr data-n="${i}"><td>${i + 1}</td><td>${escapeHtml(s.rule)}</td><td><span class="step-tex" data-i="${i}"></span></td></tr>`)
      .join("");
    stepTableBody.querySelectorAll(".step-tex").forEach((el) => {
      Engine.renderKatex(el, result.steps[Number(el.dataset.i)].latex, false);
    });

    stepSlider.min = 0;
    stepSlider.max = result.steps.length - 1;
    stepSlider.value = result.steps.length - 1;

    plot(integrand, result.result);
    updateStep(result.steps.length - 1);
  }

  function plot(integrand, antiderivative) {
    const f = Engine.compileFx(integrand, VARIABLE);
    const F = Engine.compileFx(antiderivative, VARIABLE);
    if (!f.ok || !F.ok) {
      Plotly.purge("fxPlot");
      return;
    }
    const xs = [], fs = [], Fs = [];
    for (let i = 0; i <= 300; i++) {
      const x = -4 + (i / 300) * 8;
      let yf, yF;
      try { yf = f.fn(x); } catch { yf = null; }
      try { yF = F.fn(x); } catch { yF = null; }
      xs.push(x);
      fs.push(Number.isFinite(yf) ? yf : null);
      Fs.push(Number.isFinite(yF) ? yF : null);
    }
    Plotly.newPlot("fxPlot", [
      { x: xs, y: fs, mode: "lines", name: "f(x)", line: { color: "#5c939f", width: 2.5 } },
      { x: xs, y: Fs, mode: "lines", name: "F(x)", line: { color: "#ed6d40", width: 2, dash: "dash" } }
    ], Engine.plotlyBaseLayout({}), Engine.plotlyConfig);
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

  // Synthetic result matching this page's own render() contract, used only when this
  // page's specific technique refuses and the general-purpose SymPy fallback answers instead.
  // The technique-specific fields (u, completedSquare) don't apply to a SymPy answer, so they're
  // blanked rather than filled with something misleading.
  function buildSympyResult(antiderivative, integrand) {
    const latex = Engine.toLatex(antiderivative);
    return {
      u: "—",
      completedSquare: "—",
      result: antiderivative,
      latex,
      verified: true,
      rejected: [],
      steps: [{
        rule: "Solved via SymPy (general CAS) — this page's own technique didn't match",
        latex: "\\int " + Engine.toLatex(integrand) + "\\,dx = " + latex + " + C"
      }]
    };
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    hideError();
    const compiled = updateStartCheck();
    if (!compiled) return;

    const integrand = fxInput.value.trim();
    const submitBtn = form.querySelector('button[type="submit"] .btn-text');
    const previousLabel = submitBtn ? submitBtn.textContent : null;
    if (submitBtn) submitBtn.textContent = "Deriving…";

    CAS.completeTheSquare(integrand, VARIABLE)
      .then((result) => {
        if (!result.ok) {
          startStatusText.textContent = "This page's technique didn't match — trying the general-purpose SymPy solver…";
          return SympyIntegrateFallback.solve(integrand, VARIABLE).then((sresult) => {
            if (!sresult.ok) {
              showRefused(Object.assign({}, result, {
                reason: result.reason + " The general-purpose SymPy solver couldn't close it either: " + sresult.reason
              }));
              return;
            }
            render(buildSympyResult(sresult.result, integrand), integrand);
          });
        }
        render(result, integrand);
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

  exampleBtn.addEventListener("click", () => {
    fxInput.value = "1/(x^2+2*x+5)";
    updatePreview();
    updateStartCheck();
    form.requestSubmit();
  });

  presetRow.addEventListener("click", (e) => {
    const btn = e.target.closest(".tag");
    if (!btn) return;
    fxInput.value = btn.dataset.fx;
    updatePreview();
    updateStartCheck();
    form.requestSubmit();
  });

  stepSlider.addEventListener("input", () => updateStep(Number(stepSlider.value)));

  const debounced = Engine.debounce(() => { updatePreview(); updateStartCheck(); }, 220);
  fxInput.addEventListener("input", debounced);

  Engine.attachMathKeypad(fxInput, document.getElementById("fxKeypad"));
  Engine.attachKeypadToggle(document.getElementById("keypadToggle"), document.getElementById("fxKeypad"));

  updatePreview();
  updateStartCheck();
})();
