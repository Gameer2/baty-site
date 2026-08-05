/* Series Solutions page wiring — homogeneous linear 2nd-order ODEs with variable coefficients,
   expanded around an ordinary or regular singular point (Boyce & DiPrima ch. 5). Calls
   SeriesSolutionFallback.solve, which wraps SymPy's power-series dsolve hints behind an
   indicial-root safety gate (see sympy-worker.js's _series_solution) and an independent
   residual-decay check (see series-solution-fallback.js) before anything is shown.

   No hand-rolled tier: unlike the First-Order/Second-Order Solvers, there's no textbook
   technique to hand-derive here beyond what the safety gate already encodes — this page IS
   the SymPy tier, themed for this topic, matching the Laplace Transform Solver's shape. */
(function () {
  "use strict";

  const odeInput = document.getElementById("odeInput");
  const odePreview = document.getElementById("odePreview");
  const pointInput = document.getElementById("pointInput");
  const termsInput = document.getElementById("termsInput");
  const form = document.getElementById("solverForm");
  const formError = document.getElementById("formError");
  const formErrorText = document.getElementById("formErrorText");
  const startStatus = document.getElementById("startStatus");
  const startStatusText = document.getElementById("startStatusText");
  const placeholderPanel = document.getElementById("placeholderPanel");
  const resultsArea = document.getElementById("resultsArea");
  const refusedPanel = document.getElementById("refusedPanel");
  const refusedReason = document.getElementById("refusedReason");

  function showError(msg) { formError.style.display = "block"; formErrorText.textContent = msg; }
  function hideError() { formError.style.display = "none"; }
  function setStatus(ok, msg) {
    startStatus.className = "status-line " + (ok ? "ok" : "bad");
    startStatusText.textContent = msg;
  }

  function updatePreview() {
    const raw = odeInput.value.trim();
    Engine.renderKatex(odePreview, raw ? (raw.includes("=") ? raw : `${raw} = 0`) : "", false);
    Engine.pulseFlash(odePreview);
  }

  document.querySelectorAll("#exampleChips .tag").forEach((btn) => {
    btn.addEventListener("click", () => {
      odeInput.value = btn.dataset.eq;
      pointInput.value = btn.dataset.point;
      updatePreview();
      form.requestSubmit();
    });
  });

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    hideError();
    refusedPanel.style.display = "none";
    const raw = odeInput.value.trim();
    if (!raw) { setStatus(false, "Enter an equation."); return; }
    const point = parseFloat(pointInput.value);
    const terms = parseInt(termsInput.value, 10);
    if (Number.isNaN(point)) { setStatus(false, "The expansion point needs a numeric value."); return; }
    if (!(terms >= 4 && terms <= 12)) { setStatus(false, "Terms should be between 4 and 12."); return; }

    const submitBtn = form.querySelector('button[type="submit"] .btn-text');
    const prev = submitBtn ? submitBtn.textContent : null;
    if (submitBtn) submitBtn.textContent = "Solving…";
    setStatus(true, "Checking the expansion point, then solving via SymPy…");

    SeriesSolutionFallback.solve(raw, point, terms)
      .then((out) => {
        placeholderPanel.style.display = "none";
        if (!out.ok) {
          resultsArea.style.display = "none";
          refusedPanel.style.display = "";
          refusedReason.textContent = out.reason;
          setStatus(false, "Couldn't confirm a series here.");
          return;
        }
        resultsArea.style.display = "";
        const kindLabel = out.kind === "ordinary" ? "Ordinary point"
          : out.kind === "regular-singular-log" ? "Regular singular point (logarithmic case)"
          : "Regular singular point";
        ODERender.bigBox(resultsArea, {
          classificationLine: `${kindLabel} — ${terms}-term series around x = ${Engine.formatNum(point, 3)}.`,
          generalSolution: `y = ${ODESymbolic.toLatex(out.series)} + O\\!\\left((x-${Engine.formatNum(point, 3)})^{${terms}}\\right)`,
          particularSolution: null,
        });
        setStatus(true, "Solved.");
      })
      .catch((err) => {
        placeholderPanel.style.display = "none";
        resultsArea.style.display = "none";
        refusedPanel.style.display = "";
        refusedReason.textContent = err.message || String(err);
        setStatus(false, err.message || String(err));
      })
      .then(() => { if (submitBtn) submitBtn.textContent = prev; });
  });

  Engine.attachMathKeypad(odeInput, document.getElementById("odeKeypad"));
  Engine.attachKeypadToggle(document.getElementById("keypadToggle"), document.getElementById("odeKeypad"));
  odeInput.addEventListener("input", Engine.debounce(updatePreview, 200));
  updatePreview();
})();
