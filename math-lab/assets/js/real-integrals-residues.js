/* Real Integrals by Residues page wiring — Complex Analysis Engine.

   Reads a rational R(x) and a domain (whole real line, or the half-line for an even
   integrand), then calls ComplexResidues.realIntegralByResidues (assets/js/complex-residues.js),
   which closes the contour with an upper semicircle, sums the upper-half-plane residues, and —
   same gate as the contour page — independently re-checks the result by a direct numeric
   integration (tangent substitution) before showing it. Answer-only: a value, the poles that
   produced it, and the numeric check, never a step-by-step derivation. */
(function () {
  "use strict";

  const fxInput = document.getElementById("fxInput");
  const fxPreview = document.getElementById("fxPreview");
  const form = document.getElementById("realForm");
  const formError = document.getElementById("formError");
  const formErrorText = document.getElementById("formErrorText");
  const startStatus = document.getElementById("startStatus");
  const startStatusText = document.getElementById("startStatusText");
  const placeholderPanel = document.getElementById("placeholderPanel");
  const resultsArea = document.getElementById("resultsArea");
  const refusedPanel = document.getElementById("refusedPanel");
  const refusedReason = document.getElementById("refusedReason");
  const statValue = document.getElementById("statValue");
  const statCount = document.getElementById("statCount");
  const statVerified = document.getElementById("statVerified");
  const integralResult = document.getElementById("integralResult");

  let mode = "whole";

  function showError(msg) { formError.style.display = "block"; formErrorText.textContent = msg; }
  function hideError() { formError.style.display = "none"; }
  function setStatus(ok, msg) {
    startStatus.className = "status-line " + (ok ? "ok" : "bad");
    startStatusText.textContent = msg;
  }

  function updatePreview() {
    const raw = fxInput.value.trim();
    const limits = mode === "whole" ? "\\int_{-\\infty}^{\\infty}" : "\\int_{0}^{\\infty}";
    Engine.renderKatex(fxPreview, limits + " " + Engine.toLatex(raw) + "\\,dx", false);
    Engine.pulseFlash(fxPreview);
  }

  // Mode chips: toggle active state, remember the choice, refresh the preview's limits.
  document.querySelectorAll("#modeChips .chip").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("#modeChips .chip").forEach((b) => b.classList.remove("is-active"));
      btn.classList.add("is-active");
      mode = btn.dataset.mode;
      updatePreview();
    });
  });

  document.querySelectorAll("#exampleChips .chip").forEach((btn) => {
    btn.addEventListener("click", () => {
      fxInput.value = btn.dataset.fx;
      const wantMode = btn.dataset.mode;
      mode = wantMode;
      document.querySelectorAll("#modeChips .chip").forEach((b) => {
        b.classList.toggle("is-active", b.dataset.mode === wantMode);
      });
      updatePreview();
      form.requestSubmit();
    });
  });

  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  function renderPoleTable(poles) {
    const tbody = document.querySelector("#poleTable tbody");
    if (!poles.length) {
      tbody.innerHTML = '<tr><td colspan="3">No poles in the upper half-plane — R is entire and decays, so the integral is 0.</td></tr>';
      return;
    }
    tbody.innerHTML = poles.map((p) =>
      '<tr><td class="mono">' + esc(p.location) + "</td>" +
      '<td class="mono">' + Engine.formatNum(p.location_numeric.re, 4) + (p.location_numeric.im >= 0 ? " + " : " − ") + Engine.formatNum(Math.abs(p.location_numeric.im), 4) + "i</td>" +
      '<td class="mono">' + esc(p.residue) + "</td></tr>"
    ).join("");
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    hideError();
    refusedPanel.style.display = "none";
    resultsArea.style.display = "none";
    const fx = fxInput.value.trim();
    if (!fx) { setStatus(false, "Enter R(x)."); return; }

    const submitBtn = form.querySelector('button[type="submit"] .btn-text');
    const prev = submitBtn ? submitBtn.textContent : null;
    if (submitBtn) submitBtn.textContent = "Solving…";
    setStatus(true, "Closing the contour and summing upper-half-plane residues…");

    ComplexResidues.realIntegralByResidues(fx, "x", mode)
      .then((r) => {
        placeholderPanel.style.display = "none";
        if (!r.ok) {
          refusedPanel.style.display = "";
          refusedReason.textContent = r.reason;
          setStatus(false, "Couldn't confirm a result.");
          return;
        }
        resultsArea.style.display = "";

        // Prefer the exact symbolic value for display; fall back to the numeric check.
        const displayVal = r.valueExact && r.valueExact !== "0" ? r.valueExact : Engine.formatNum(r.numericCheck, 6);
        statValue.textContent = displayVal;
        statCount.textContent = r.poles.length;
        statVerified.textContent = r.verified ? "✓ verified" : "unverified";

        const limits = r.mode === "whole" ? "\\int_{-\\infty}^{\\infty}" : "\\int_{0}^{\\infty}";
        Engine.renderKatex(integralResult,
          limits + " " + Engine.toLatex(fx) + "\\,dx = " + Engine.toLatex(String(r.valueExact)),
          true);
        Engine.pulseFlash(integralResult);

        renderPoleTable(r.poles);
        setStatus(true, "Solved — " + r.poles.length + " pole" + (r.poles.length === 1 ? "" : "s") + " in the upper half-plane.");
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

  fxInput.addEventListener("input", Engine.debounce(updatePreview, 200));
  updatePreview();
})();