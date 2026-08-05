(function () {
  "use strict";

  const pairsInput = document.getElementById("pairsInput");
  const formError = document.getElementById("formError");
  const formErrorText = document.getElementById("formErrorText");
  const statusLine = document.getElementById("statusLine");
  const statusText = document.getElementById("statusText");
  const form = document.getElementById("regressionForm");
  const exampleBtn = document.getElementById("exampleBtn");

  const placeholderPanel = document.getElementById("placeholderPanel");
  const resultsArea = document.getElementById("resultsArea");
  const statR2 = document.getElementById("statR2");
  const statSlope = document.getElementById("statSlope");
  const statIntercept = document.getElementById("statIntercept");
  const statN = document.getElementById("statN");
  const formulaRegression = document.getElementById("formulaRegression");

  const STORE_KEY = "engine-lab:statistics:regression";
  let shownOnce = false;

  // Parse a pasted textarea of "x, y" pairs (one per line) into a [number, number][].
  function parsePairs(raw) {
    const pts = [];
    raw.split(/\n/).forEach((line) => {
      const nums = line.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean).map(Number);
      if (nums.length >= 2 && !Number.isNaN(nums[0]) && !Number.isNaN(nums[1])) pts.push([nums[0], nums[1]]);
    });
    return pts;
  }

  function showError(msg) {
    formError.style.display = "block";
    formErrorText.textContent = msg;
  }
  function clearError() { formError.style.display = "none"; }

  function render() {
    const pts = parsePairs(pairsInput.value);
    if (pts.length < 2) {
      showError("Enter at least two (x, y) pairs, one per line.");
      statusLine.className = "status-line";
      statusText.textContent = "Enter at least two (x, y) pairs, then compute.";
      return;
    }
    clearError();

    let result;
    try { result = StatsAlgorithms.runLinearRegression(pts); }
    catch (err) { return showError(err.message); }

    placeholderPanel.style.display = "none";
    resultsArea.style.display = "block";
    shownOnce = true;

    statR2.textContent = Engine.formatNum(result.r2, 4);
    statSlope.textContent = Engine.formatNum(result.slope, 4);
    statIntercept.textContent = Engine.formatNum(result.intercept, 4);
    statN.textContent = String(result.n);

    Engine.renderKatex(formulaRegression,
      `\\hat{y} = ${Engine.formatNum(result.slope, 4)}x ${result.intercept >= 0 ? "+" : "-"} ${Engine.formatNum(Math.abs(result.intercept), 4)}`, true);

    statusLine.className = "status-line ok";
    statusText.textContent = `Fit through ${result.n} points — R² = ${Engine.formatNum(result.r2, 4)}.`;

    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    const xMin = Math.min(...xs), xMax = Math.max(...xs);
    const pad = (xMax - xMin) * 0.1 || 1;
    const lineXs = [xMin - pad, xMax + pad];
    const lineYs = lineXs.map((x) => result.slope * x + result.intercept);

    Plotly.react("regressionPlot", [
      { x: xs, y: ys, mode: "markers", name: "data", marker: { color: "#c99a3c", size: 9 } },
      { x: lineXs, y: lineYs, mode: "lines", name: "fit", line: { color: "#ed6d40", width: 2.5 } }
    ], Engine.plotlyBaseLayout({ showlegend: false, xaxis: { title: "x" }, yaxis: { title: "y" } }), Engine.plotlyConfig);

    Proto.saveState(STORE_KEY, snapshot());
  }

  function snapshot() { return { pairs: pairsInput.value }; }

  const debouncedRender = Engine.debounce(() => { if (shownOnce) render(); }, 200);
  pairsInput.addEventListener("input", debouncedRender);

  exampleBtn.addEventListener("click", () => {
    pairsInput.value = "1, 2\n2, 4\n3, 5\n4, 4\n5, 5";
    render();
  });

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    render();
  });

  const saved = Proto.loadState(STORE_KEY);
  if (saved && saved.pairs !== undefined) pairsInput.value = saved.pairs;
})();