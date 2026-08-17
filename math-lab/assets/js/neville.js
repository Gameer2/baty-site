(function () {
  "use strict";

  const pointsInput = document.getElementById("pointsInput");
  const xInput = document.getElementById("xInput");
  const statusLine = document.getElementById("statusLine");
  const formError = document.getElementById("formError");
  const formErrorText = document.getElementById("formErrorText");
  const form = document.getElementById("nevilleForm");
  const exampleBtn = document.getElementById("exampleBtn");

  const placeholderPanel = document.getElementById("placeholderPanel");
  const resultsArea = document.getElementById("resultsArea");
  const statValue = document.getElementById("statValue");
  const formulaBlock = document.getElementById("formulaBlock");
  const tableBody = document.querySelector("#tableBody tbody");

  const STORE_KEY = "engine-lab:numerical-neville";

  function snapshot() {
    return { points: pointsInput.value, x: xInput.value };
  }

  function parsePoints() {
    const lines = pointsInput.value.trim().split("\n").filter((l) => l.trim() !== "");
    const points = [];
    for (const line of lines) {
      const [xs, ys] = line.split(",").map((s) => parseFloat(s.trim()));
      if (Number.isFinite(xs) && Number.isFinite(ys)) points.push({ x: xs, y: ys });
    }
    return points;
  }

  function updateStatus() {
    const points = parsePoints();
    const x = parseFloat(xInput.value);
    if (points.length < 2) {
      statusLine.className = "status-line bad";
      statusLine.textContent = "Enter at least 2 points.";
      return null;
    }
    if (Number.isNaN(x)) {
      statusLine.className = "status-line bad";
      statusLine.textContent = "Enter a numeric evaluation point x.";
      return null;
    }
    statusLine.className = "status-line ok";
    statusLine.textContent = `${points.length} points, evaluating at x = ${x}`;
    return { points, x };
  }

  const debouncedUpdate = Engine.debounce(updateStatus, 200);
  pointsInput.addEventListener("input", debouncedUpdate);
  xInput.addEventListener("input", updateStatus);

  exampleBtn.addEventListener("click", () => {
    pointsInput.value = "1, 2\n2, 3\n3, 5";
    xInput.value = "2.5";
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
    statValue.textContent = Engine.formatNum(result.value, 8);
    Engine.renderKatex(formulaBlock, "P_{i,j}(x) = \\dfrac{(x - x_{i-j})P_{i,j-1} - (x - x_i)P_{i-1,j-1}}{x_i - x_{i-j}}", true);

    const rows = [];
    for (let i = 0; i < result.table.length; i++) {
      const rowSpans = {};
      for (let j = 0; j <= i && j < result.table[i].length; j++) {
        rows.push(`<tr><td>${i}</td><td>${j}</td><td>${Engine.formatNum(result.table[i][j], 6)}</td></tr>`);
      }
    }
    tableBody.innerHTML = rows.join("");
  }

  function runCompute() {
    clearError();
    const points = parsePoints();
    const x = parseFloat(xInput.value);
    if (points.length < 2) return showError("Enter at least 2 points.");
    if (Number.isNaN(x)) return showError("x must be a number.");
    try {
      const result = Algorithms.runNeville(points, x);
      render(result);
      Proto.saveState(STORE_KEY, snapshot());
    } catch (err) {
      showError(err.message);
    }
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    runCompute();
  });

  const saved = Proto.loadState(STORE_KEY);
  if (saved) {
    if (saved.points !== undefined) pointsInput.value = String(saved.points).split(";").join("\n");
    if (saved.x !== undefined) xInput.value = saved.x;
    runCompute();
  }

  updateStatus();
})();
