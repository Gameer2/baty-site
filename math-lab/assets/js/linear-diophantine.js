(function () {
  "use strict";

  const aInput = document.getElementById("aInput");
  const bInput = document.getElementById("bInput");
  const cInput = document.getElementById("cInput");
  const form = document.getElementById("diophForm");
  const exampleBtn = document.getElementById("exampleBtn");
  const formError = document.getElementById("formError");
  const formErrorText = document.getElementById("formErrorText");

  const placeholderPanel = document.getElementById("placeholderPanel");
  const resultsArea = document.getElementById("resultsArea");
  const unsolvableArea = document.getElementById("unsolvableArea");
  const unsolvableText = document.getElementById("unsolvableText");
  const solvableArea = document.getElementById("solvableArea");

  const statGcd = document.getElementById("statGcd");
  const statX0 = document.getElementById("statX0");
  const statY0 = document.getElementById("statY0");
  const formulaBlock = document.getElementById("formulaBlock");
  const generalSolutionEquation = document.getElementById("generalSolutionEquation");
  const iterTableBody = document.querySelector("#iterTable tbody");
  const stepSlider = document.getElementById("stepSlider");
  const stepLabel = document.getElementById("stepLabel");
  const stepEquation = document.getElementById("stepEquation");

  const T_RANGE = [-3n, -2n, -1n, 0n, 1n, 2n, 3n];

  let state = null; // { a, b, c, x0, y0, xStep, yStep }

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
    aInput.value = "6";
    bInput.value = "15";
    cInput.value = "9";
    clearError();
  });

  function renderUnsolvable(result) {
    placeholderPanel.style.display = "none";
    resultsArea.style.display = "block";
    solvableArea.style.display = "none";
    unsolvableArea.style.display = "block";
    unsolvableText.textContent = `No solution exists. ${result.reason}`;
  }

  function render(a, b, c, result) {
    placeholderPanel.style.display = "none";
    resultsArea.style.display = "block";
    unsolvableArea.style.display = "none";
    solvableArea.style.display = "block";

    statGcd.textContent = result.gcd.toString();
    statX0.textContent = result.x0.toString();
    statY0.textContent = result.y0.toString();

    Engine.renderKatex(
      formulaBlock,
      "x = x_0 + \\dfrac{b}{g}\\,t, \\qquad y = y_0 - \\dfrac{a}{g}\\,t, \\qquad g = \\gcd(a,b),\\ t \\in \\mathbb{Z}",
      true
    );
    Engine.renderKatex(
      generalSolutionEquation,
      `x = ${result.x0} + (${result.xStep})t, \\qquad y = ${result.y0} - (${result.yStep})t`,
      true
    );

    const rows = T_RANGE.map((t) => {
      const x = result.x0 + result.xStep * t;
      const y = result.y0 - result.yStep * t;
      return { t, x, y };
    });

    iterTableBody.innerHTML = rows
      .map(
        (row) => `<tr data-t="${row.t}">
          <td>${row.t}</td>
          <td>${row.x}</td>
          <td>${row.y}</td>
        </tr>`
      )
      .join("");

    stepSlider.min = 0;
    stepSlider.max = rows.length - 1;
    stepSlider.value = Math.floor(rows.length / 2); // start at t = 0
    state = { a, b, c, rows };
    updateStep(Number(stepSlider.value));
  }

  function updateStep(idx) {
    if (!state) return;
    const row = state.rows[idx];
    stepLabel.textContent = `t = ${row.t}`;
    document.querySelectorAll("#iterTable tbody tr").forEach((tr) => {
      tr.classList.toggle("is-current", tr.dataset.t === row.t.toString());
    });
    const rowEl = document.querySelector(`#iterTable tbody tr[data-t="${row.t}"]`);
    if (rowEl) rowEl.scrollIntoView({ block: "nearest" });
    const lhs = state.a * row.x + state.b * row.y;
    Engine.renderKatex(
      stepEquation,
      `${state.a}(${row.x}) + ${state.b}(${row.y}) = ${lhs} ${lhs === state.c ? "\\checkmark" : ""}`,
      true
    );
  }

  stepSlider.addEventListener("input", (e) => updateStep(Number(e.target.value)));

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    clearError();

    let a, b, c;
    try {
      a = parseIntInput(aInput.value, "a");
      b = parseIntInput(bInput.value, "b");
      c = parseIntInput(cInput.value, "c");
    } catch (err) {
      return showError(err.message);
    }
    if (a === 0n && b === 0n) return showError("a and b cannot both be zero.");

    const result = NumberTheory.solveLinearDiophantine(a, b, c);
    if (!result.solvable) return renderUnsolvable(result);
    render(a, b, c, result);
  });
})();
