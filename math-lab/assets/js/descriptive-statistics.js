(function () {
  "use strict";

  const dataInput = document.getElementById("dataInput");
  const formError = document.getElementById("formError");
  const formErrorText = document.getElementById("formErrorText");
  const statusLine = document.getElementById("statusLine");
  const statusText = document.getElementById("statusText");
  const form = document.getElementById("descForm");
  const exampleBtn = document.getElementById("exampleBtn");

  const placeholderPanel = document.getElementById("placeholderPanel");
  const resultsArea = document.getElementById("resultsArea");
  const el = (id) => document.getElementById(id);

  const STORE_KEY = "engine-lab:statistics:descriptive";
  let shownOnce = false;

  function parseData(raw) {
    return raw.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean).map(Number).filter((n) => !Number.isNaN(n));
  }

  function showError(msg) {
    formError.style.display = "block";
    formErrorText.textContent = msg;
  }
  function clearError() { formError.style.display = "none"; }

  function render() {
    const data = parseData(dataInput.value);
    if (data.length < 1) {
      showError("Enter at least one numeric value.");
      statusLine.className = "status-line";
      statusText.textContent = "Enter at least one numeric value, then compute.";
      return;
    }
    clearError();

    let r;
    try { r = StatsAlgorithms.descriptiveStats(data); }
    catch (err) { return showError(err.message); }

    placeholderPanel.style.display = "none";
    resultsArea.style.display = "block";
    shownOnce = true;

    el("statN").textContent = String(r.n);
    el("statMean").textContent = Engine.formatNum(r.mean, 3);
    el("statSd").textContent = Engine.formatNum(r.sd, 3);
    el("statVar").textContent = Engine.formatNum(r.variance, 3);
    el("statMedian").textContent = Engine.formatNum(r.median, 3);
    el("statQ1").textContent = Engine.formatNum(r.q1, 3);
    el("statQ3").textContent = Engine.formatNum(r.q3, 3);
    el("statIqr").textContent = Engine.formatNum(r.iqr, 3);
    el("statMin").textContent = Engine.formatNum(r.min, 3);
    el("statMax").textContent = Engine.formatNum(r.max, 3);
    el("statRange").textContent = Engine.formatNum(r.range, 3);
    el("statMode").textContent = r.modes.length === 0 ? "No mode" : r.modes.map((m) => Engine.formatNum(m, 4)).join(", ");

    Engine.renderKatex(el("formulaBlock"),
      `\\bar{x} = \\frac{1}{n}\\sum x_i \\qquad s^2 = \\frac{1}{n-1}\\sum (x_i-\\bar{x})^2 \\qquad \\text{IQR} = Q_3 - Q_1`, true);

    statusLine.className = "status-line ok";
    statusText.textContent = `n = ${r.n} values entered.`;

    Plotly.react("histPlot", [{
      x: data, type: "histogram", marker: { color: "rgba(201,154,60,0.5)", line: { color: "#c99a3c", width: 1 } }, name: "data"
    }], Engine.plotlyBaseLayout({
      showlegend: false,
      shapes: [
        { type: "line", x0: r.mean, x1: r.mean, y0: 0, y1: 1, yref: "paper", line: { color: "#c99a3c", width: 2 } },
        { type: "line", x0: r.median, x1: r.median, y0: 0, y1: 1, yref: "paper", line: { color: "#ed6d40", width: 2, dash: "dash" } }
      ],
      annotations: [
        { x: r.mean, y: 1, yref: "paper", text: "x̄", showarrow: false, yshift: 12, font: { color: "#c99a3c" } },
        { x: r.median, y: 1, yref: "paper", text: "median", showarrow: false, yshift: 12, font: { color: "#ed6d40" } }
      ]
    }), Engine.plotlyConfig);

    Plotly.react("boxPlot", [{
      y: data, type: "box", boxpoints: "all", marker: { color: "#c99a3c" }, line: { color: "#c99a3c" }, name: "data"
    }], Engine.plotlyBaseLayout({ showlegend: false }), Engine.plotlyConfig);

    Proto.saveState(STORE_KEY, { data: dataInput.value });
  }

  const debouncedRender = Engine.debounce(() => { if (shownOnce) render(); }, 200);
  dataInput.addEventListener("input", debouncedRender);

  exampleBtn.addEventListener("click", () => {
    dataInput.value = "78, 85, 92, 67, 74, 88, 95, 81, 73, 90, 84, 79";
    render();
  });

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    render();
  });

  const saved = Proto.loadState(STORE_KEY);
  if (saved && saved.data !== undefined) dataInput.value = saved.data;
})();