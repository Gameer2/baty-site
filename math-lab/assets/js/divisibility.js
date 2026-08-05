(function () {
  "use strict";

  const aInput = document.getElementById("aInput");
  const bInput = document.getElementById("bInput");
  const form = document.getElementById("divForm");
  const exampleBtn = document.getElementById("exampleBtn");
  const formError = document.getElementById("formError");
  const formErrorText = document.getElementById("formErrorText");

  const placeholderPanel = document.getElementById("placeholderPanel");
  const resultsArea = document.getElementById("resultsArea");
  const statQ = document.getElementById("statQ");
  const statR = document.getElementById("statR");
  const statDivides = document.getElementById("statDivides");
  const formulaBlock = document.getElementById("formulaBlock");
  const resultEquation = document.getElementById("resultEquation");

  function showError(msg) {
    formError.style.display = "block";
    formErrorText.textContent = msg;
  }
  function clearError() {
    formError.style.display = "none";
  }

  function parseIntInput(raw, label) {
    const s = String(raw).trim();
    if (!/^-?\d+$/.test(s)) throw new Error(`${label} must be a whole number (digits only, optional leading -).`);
    return BigInt(s);
  }

  exampleBtn.addEventListener("click", () => {
    aInput.value = "17";
    bInput.value = "5";
    clearError();
  });

  function render(a, b, q, r) {
    placeholderPanel.style.display = "none";
    resultsArea.style.display = "block";

    statQ.textContent = q.toString();
    statR.textContent = r.toString();
    const divides = r === 0n;
    statDivides.textContent = divides ? `Yes — ${b} | ${a}` : `No — ${b} ∤ ${a}`;
    statDivides.parentElement.classList.toggle("accent", divides);

    Engine.renderKatex(formulaBlock, "a = b \\cdot q + r, \\qquad 0 \\le r < |b|", true);
    Engine.renderKatex(resultEquation, `${a} = ${b} \\times ${q} + ${r}`, true);
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    clearError();

    let a, b;
    try {
      a = parseIntInput(aInput.value, "a");
      b = parseIntInput(bInput.value, "b");
    } catch (err) {
      return showError(err.message);
    }
    if (b === 0n) return showError("b must be nonzero — division by zero is undefined.");

    const { q, r } = NumberTheory.divide(a, b);
    render(a, b, q, r);
  });
})();
