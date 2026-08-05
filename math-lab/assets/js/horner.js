(function () {
  "use strict";

  const coeffsInput = document.getElementById("coeffsInput");
  const xInput = document.getElementById("xInput");
  const statusLine = document.getElementById("statusLine");
  const formError = document.getElementById("formError");
  const formErrorText = document.getElementById("formErrorText");
  const form = document.getElementById("hornerForm");
  const exampleBtn = document.getElementById("exampleBtn");

  const placeholderPanel = document.getElementById("placeholderPanel");
  const resultsArea = document.getElementById("resultsArea");
  const statValue = document.getElementById("statValue");
  const statDegree = document.getElementById("statDegree");
  const formulaBlock = document.getElementById("formulaBlock");
  const deflatedTableBody = document.querySelector("#deflatedTable tbody");

  let state = null;

  function updatePreview() {
    const coeffs = coeffsInput.value.split(",").map((s) => s.trim()).filter((s) => s !== "");
    if (coeffs.length === 0) {
      statusLine.className = "status-line bad";
      statusLine.textContent = "Enter polynomial coefficients.";
      return;
    }
    const polyLatex = coeffs.map((c, i) => {
      const power = coeffs.length - 1 - i;
      const sign = i > 0 && parseFloat(c) >= 0 ? " + " : (i > 0 ? " - " : "");
      const absC = Math.abs(parseFloat(c) || 0);
      if (power === 0) return `${sign}${absC}`;
      if (power === 1) return `${sign}${absC === 1 ? "" : absC}x`;
      return `${sign}${absC === 1 ? "" : absC}x^{${power}}`;
    }).join("");
    Engine.renderKatex(document.getElementById("polyPreview"), `p(x) = ${polyLatex}`, false);
    Engine.pulseFlash(document.getElementById("polyPreview"));
  }

  function updateStatus() {
    const coeffs = coeffsInput.value.split(",").map((s) => parseFloat(s.trim())).filter((s) => !Number.isNaN(s));
    const x = parseFloat(xInput.value);
    if (coeffs.length === 0) {
      statusLine.className = "status-line bad";
      statusLine.textContent = "Enter at least one coefficient.";
      return null;
    }
    if (Number.isNaN(x)) {
      statusLine.className = "status-line bad";
      statusLine.textContent = "Enter a numeric evaluation point x.";
      return null;
    }
    statusLine.className = "status-line ok";
    statusLine.textContent = `Degree ${coeffs.length - 1} polynomial, evaluating at x = ${x}`;
    return { coeffs, x };
  }

  const debouncedUpdate = Engine.debounce(() => {
    updatePreview();
    updateStatus();
  }, 200);

  coeffsInput.addEventListener("input", debouncedUpdate);
  xInput.addEventListener("input", updateStatus);

  exampleBtn.addEventListener("click", () => {
    coeffsInput.value = "2, -3, 4, -5";
    xInput.value = "2";
    updatePreview();
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
    state = result;

    statValue.textContent = Engine.formatNum(result.value, 8);
    statDegree.textContent = String(result.deflated.length);

    Engine.renderKatex(formulaBlock, "p(x) = (x - x_0) \\cdot q(x) + r", true);

    deflatedTableBody.innerHTML = result.deflated
      .map((c, i) => {
        const power = result.deflated.length - 1 - i;
        return `<tr><td>${power === 0 ? "const" : power === 1 ? "x" : `x^{${power}}`}</td><td>${Engine.formatNum(c, 6)}</td></tr>`;
      })
      .join("");
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    clearError();

    const coeffs = coeffsInput.value.split(",").map((s) => parseFloat(s.trim())).filter((s) => !Number.isNaN(s));
    const x = parseFloat(xInput.value);

    if (coeffs.length === 0) return showError("Enter at least one coefficient.");
    if (Number.isNaN(x)) return showError("x must be a number.");

    try {
      const result = Algorithms.runHorner(coeffs, x);
      render(result);
    } catch (err) {
      showError(err.message);
    }
  });

  updatePreview();
  updateStatus();
})();
