(function () {
  "use strict";

  const coeffsInput = document.getElementById("coeffsInput");
  const degreeInput = document.getElementById("degreeInput");
  const statusLine = document.getElementById("statusLine");
  const formError = document.getElementById("formError");
  const formErrorText = document.getElementById("formErrorText");
  const form = document.getElementById("chebyshevEconForm");
  const exampleBtn = document.getElementById("exampleBtn");

  const placeholderPanel = document.getElementById("placeholderPanel");
  const resultsArea = document.getElementById("resultsArea");
  const statOrigDeg = document.getElementById("statOrigDeg");
  const statEconDeg = document.getElementById("statEconDeg");
  const formulaBlock = document.getElementById("formulaBlock");
  const origCoeffsDiv = document.getElementById("origCoeffsDiv");
  const econCoeffsDiv = document.getElementById("econCoeffsDiv");

  function parseCoeffs() {
    return coeffsInput.value.split(",").map((s) => parseFloat(s.trim())).filter((s) => !Number.isNaN(s));
  }

  function updateStatus() {
    const coeffs = parseCoeffs();
    const d = parseInt(degreeInput.value, 10);
    if (coeffs.length === 0) {
      statusLine.className = "status-line bad";
      statusLine.textContent = "Enter polynomial coefficients.";
      return null;
    }
    if (Number.isNaN(d) || d < 0) {
      statusLine.className = "status-line bad";
      statusLine.textContent = "Enter a non-negative target degree.";
      return null;
    }
    if (d >= coeffs.length - 1) {
      statusLine.className = "status-line bad";
      statusLine.textContent = `Target degree must be less than original degree (${coeffs.length - 1}).`;
      return null;
    }
    statusLine.className = "status-line ok";
    statusLine.textContent = `Degree ${coeffs.length - 1} polynomial, economizing to degree ${d}`;
    return { coeffs, d };
  }

  const debouncedUpdate = Engine.debounce(updateStatus, 200);
  coeffsInput.addEventListener("input", debouncedUpdate);
  degreeInput.addEventListener("input", updateStatus);

  exampleBtn.addEventListener("click", () => {
    coeffsInput.value = "0, 0, 0, 0, 1";
    degreeInput.value = "2";
    updateStatus();
  });

  function showError(msg) {
    formError.style.display = "block";
    formErrorText.textContent = msg;
  }
  function clearError() {
    formError.style.display = "none";
  }

  function render(result) {
    placeholderPanel.style.display = "none";
    resultsArea.style.display = "block";

    statOrigDeg.textContent = String(result.originalDegree);
    statEconDeg.textContent = String(result.economizedDegree);

    const origLatex = result.origCoeffs.map((c, i) => {
      const sign = i > 0 && c >= 0 ? " + " : (i > 0 ? " - " : "");
      const absC = Math.abs(c);
      if (absC === 0) return "";
      if (i === 0) return `${sign}${absC}`;
      if (i === 1) return `${sign}${absC === 1 ? "" : absC}x`;
      return `${sign}${absC === 1 ? "" : absC}x^{${i}}`;
    }).filter((s) => s !== "").join("") || "0";

    const econLatex = result.econCoeffs.map((c, i) => {
      const sign = i > 0 && c >= 0 ? " + " : (i > 0 ? " - " : "");
      const absC = Math.abs(c);
      if (absC === 0) return "";
      if (i === 0) return `${sign}${absC.toFixed(6)}`;
      if (i === 1) return `${sign}${absC.toFixed(6)}x`;
      return `${sign}${absC.toFixed(6)}x^{${i}}`;
    }).filter((s) => s !== "").join("") || "0";

    Engine.renderKatex(formulaBlock, `p_{\\text{econ}}(x) = ${econLatex}`, true);

    origCoeffsDiv.innerHTML = result.origCoeffs.map((c, i) =>
      `<div class="result-stat"><div class="label">${i === 0 ? "const" : i === 1 ? "x" : `x^{${i}}`}</div><div class="value">${Engine.formatNum(c, 8)}</div></div>`
    ).join("");

    econCoeffsDiv.innerHTML = result.econCoeffs.map((c, i) =>
      `<div class="result-stat"><div class="label">${i === 0 ? "const" : i === 1 ? "x" : `x^{${i}}`}</div><div class="value">${Engine.formatNum(c, 8)}</div></div>`
    ).join("");
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    clearError();
    const coeffs = parseCoeffs();
    const d = parseInt(degreeInput.value, 10);
    if (coeffs.length === 0) return showError("Enter at least one coefficient.");
    if (Number.isNaN(d) || d < 0) return showError("Target degree must be non-negative.");
    if (d >= coeffs.length - 1) return showError(`Target degree must be less than original degree (${coeffs.length - 1}).`);
    try {
      const result = Algorithms.runChebyshevEcon(coeffs, d);
      result.origCoeffs = coeffs;
      render(result);
    } catch (err) {
      showError(err.message);
    }
  });

  updateStatus();
})();
