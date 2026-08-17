(function () {
  "use strict";

  const pointsInput = document.getElementById("pointsInput");
  const degreeInput = document.getElementById("degreeInput");
  const statusLine = document.getElementById("statusLine");
  const formError = document.getElementById("formError");
  const formErrorText = document.getElementById("formErrorText");
  const form = document.getElementById("leastSquaresForm");
  const exampleBtn = document.getElementById("exampleBtn");

  const placeholderPanel = document.getElementById("placeholderPanel");
  const resultsArea = document.getElementById("resultsArea");
  const formulaBlock = document.getElementById("formulaBlock");
  const coeffsDiv = document.getElementById("coeffsDiv");
  const tableBody = document.querySelector("#tableBody tbody");

  const STORE_KEY = "engine-lab:numerical-least-squares";

  function snapshot() {
    return { points: pointsInput.value, d: degreeInput.value };
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
    const d = parseInt(degreeInput.value, 10);
    if (points.length < 2) {
      statusLine.className = "status-line bad";
      statusLine.textContent = "Enter at least 2 points.";
      return null;
    }
    if (Number.isNaN(d) || d < 1) {
      statusLine.className = "status-line bad";
      statusLine.textContent = "Enter a polynomial degree >= 1.";
      return null;
    }
    if (points.length <= d) {
      statusLine.className = "status-line bad";
      statusLine.textContent = `Need more points than coefficients (have ${points.length}, need > ${d}).`;
      return null;
    }
    statusLine.className = "status-line ok";
    statusLine.textContent = `${points.length} points, fitting degree ${d} polynomial`;
    return { points, d };
  }

  const debouncedUpdate = Engine.debounce(updateStatus, 200);
  pointsInput.addEventListener("input", debouncedUpdate);
  degreeInput.addEventListener("input", updateStatus);

  exampleBtn.addEventListener("click", () => {
    pointsInput.value = "0, 1\n1, 3\n2, 5\n3, 7";
    degreeInput.value = "1";
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

    const polyLatex = result.coeffs.map((c, i) => {
      const sign = i > 0 && c >= 0 ? " + " : (i > 0 ? " - " : "");
      const absC = Math.abs(c);
      if (i === 0) return `${absC.toFixed(6)}`;
      if (i === 1) return `${sign}${absC.toFixed(6)}x`;
      return `${sign}${absC.toFixed(6)}x^{${i}}`;
    }).join("");
    Engine.renderKatex(formulaBlock, `p(x) = ${polyLatex}`, true);

    coeffsDiv.innerHTML = result.coeffs.map((c, i) =>
      `<div class="result-stat"><div class="label">${i === 0 ? "const" : i === 1 ? "x" : `x^{${i}}`}</div><div class="value">${Engine.formatNum(c, 8)}</div></div>`
    ).join("");

    const residuals = [];
    for (const p of result.points) {
      let pred = 0;
      for (let i = 0; i <= result.d; i++) pred += result.coeffs[i] * Math.pow(p.x, i);
      residuals.push({ x: p.x, y: p.y, pred, resid: p.y - pred });
    }
    tableBody.innerHTML = residuals.map((r) =>
      `<tr><td>${Engine.formatNum(r.x, 4)}</td><td>${Engine.formatNum(r.y, 4)}</td><td>${Engine.formatNum(r.pred, 6)}</td><td>${Engine.formatNum(r.resid, 6)}</td></tr>`
    ).join("");
  }

  function runCompute() {
    clearError();
    const points = parsePoints();
    const d = parseInt(degreeInput.value, 10);
    if (points.length < 2) return showError("Enter at least 2 points.");
    if (Number.isNaN(d) || d < 1) return showError("Degree must be >= 1.");
    if (points.length <= d) return showError(`Need more than ${d} points for degree ${d}.`);
    try {
      const result = Algorithms.runDiscreteLeastSquares(points, d);
      result.points = points;
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
    if (saved.d !== undefined) degreeInput.value = saved.d;
    runCompute();
  }

  updateStatus();
})();
