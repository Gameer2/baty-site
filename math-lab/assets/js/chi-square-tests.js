(function () {
  "use strict";

  // ----- DOM grab (once) -----
  const modeRow = document.getElementById("modeRow");
  const gofObservedInput = document.getElementById("gofObservedInput");
  const gofExpectedInput = document.getElementById("gofExpectedInput");
  const dfAdjustInput = document.getElementById("dfAdjustInput");
  const alphaInputG = document.getElementById("alphaInputG");
  const indepMatrixInput = document.getElementById("indepMatrixInput");
  const alphaInputI = document.getElementById("alphaInputI");

  const formError = document.getElementById("formError");
  const formErrorText = document.getElementById("formErrorText");
  const verdictLine = document.getElementById("verdictLine");
  const verdictText = document.getElementById("verdictText");
  const form = document.getElementById("testForm");
  const exampleBtn = document.getElementById("exampleBtn");

  const placeholderPanel = document.getElementById("placeholderPanel");
  const resultsArea = document.getElementById("resultsArea");
  const resultStrip = document.getElementById("resultStrip");
  const formulaStat = document.getElementById("formulaStat");
  const formulaP = document.getElementById("formulaP");
  const formulaNote = document.getElementById("formulaNote");
  const barPlotTitle = document.getElementById("barPlotTitle");
  const expectedPanel = document.getElementById("expectedPanel");
  const expectedTable = document.getElementById("expectedTable");

  const STORE_KEY = "engine-lab:statistics:chisquare";
  let shownOnce = false;
  let mode = "gof";

  const TEAL = "#c99a3c";
  const ORANGE = "#ed6d40";

  // Parse a pasted textarea of numbers into a number[] — DOM-input handling
  // lives here, not in stats-algorithms.js (per the shared conventions).
  function parseData(raw) {
    return raw.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean).map(Number).filter((n) => !Number.isNaN(n));
  }

  // Parse a contingency table: one row per line, columns separated by commas or
  // whitespace. Returns a 2D number[][] with rectangular shape (rows may have
  // differing lengths; the validator in stats-algorithms.js will reject them).
  function parseMatrix(raw) {
    const lines = raw.split(/\n+/).map((s) => s.trim()).filter(Boolean);
    return lines.map((line) =>
      line.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean).map(Number).filter((n) => !Number.isNaN(n)));
  }

  function showError(msg) { formError.style.display = "block"; formErrorText.textContent = msg; }
  function clearError() { formError.style.display = "none"; }

  function tile(label, value, accent) {
    return `<div class="result-stat${accent ? " accent" : ""}"><div class="label">${label}</div><div class="value">${value}</div></div>`;
  }

  function alphaFor() {
    return mode === "gof" ? parseFloat(alphaInputG.value) : parseFloat(alphaInputI.value);
  }

  function render() {
    const alpha = alphaFor();
    if (Number.isNaN(alpha) || alpha <= 0 || alpha >= 1) { showError("Significance α must be between 0 and 1."); return; }
    clearError();

    let stripHtml, statLatex, pLatex, note, verdict, reject, stat, df, p, crit;

    if (mode === "gof") {
      const observed = parseData(gofObservedInput.value);
      const expected = parseData(gofExpectedInput.value);
      const dfAdjust = parseInt(dfAdjustInput.value, 10);
      if (observed.length < 2) return showError("Need at least two observed categories.");
      if (expected.length < 2) return showError("Need at least two expected categories.");
      if (observed.length !== expected.length) return showError("Observed and expected must have the same number of categories.");
      if (Number.isNaN(dfAdjust) || dfAdjust < 0 || dfAdjust >= observed.length - 1)
        return showError("df adjust must be an integer in [0, categories - 1).");

      let r;
      try { r = StatsAlgorithms.chiSquareGoodnessOfFit(observed, expected, dfAdjust); } catch (e) { return showError(e.message); }

      stat = r.stat; df = r.df; p = r.p;
      crit = StatsAlgorithms.chiSquareCritical(1 - alpha, df);

      stripHtml =
        tile("categories", String(r.categories)) +
        tile("χ² statistic", Engine.formatNum(r.stat, 3), true) +
        tile("df", String(r.df)) +
        tile("p-value", Engine.formatNum(r.p, 4), true) +
        tile(`χ²_{α, df}`, Engine.formatNum(crit, 3));
      note = `Goodness-of-fit, df = ${r.df}, α = ${Engine.formatNum(alpha, 2)} (critical χ² = ${Engine.formatNum(crit, 3)})`;
      statLatex = `\\chi^2 = \\sum_i \\frac{(O_i - E_i)^2}{E_i} = ${Engine.formatNum(r.stat, 3)},\\quad df = ${r.df}`;
      pLatex = `p = 1 - F_{\\chi^2_{${r.df}}}(\\chi^2) \\approx ${Engine.formatNum(r.p, 4)}`;
      reject = r.p < alpha;
      verdict = reject
        ? `Reject H₀ — the observed distribution differs significantly from expected (p < α = ${Engine.formatNum(alpha, 2)}).`
        : `Fail to reject H₀ — the observed distribution is consistent with expected (p ≥ α = ${Engine.formatNum(alpha, 2)}).`;
      barPlotTitle.textContent = "Observed vs Expected by category";
      drawGoFBarPlot(r);
      drawDistPlot(r.stat, r.df, crit);
      renderExpectedTable(r.expected, null);
    } else {
      const matrix = parseMatrix(indepMatrixInput.value);
      if (matrix.length < 2) return showError("Need at least two rows in the contingency table.");

      let r;
      try { r = StatsAlgorithms.chiSquareIndependence(matrix); } catch (e) { return showError(e.message); }

      stat = r.stat; df = r.df; p = r.p;
      crit = StatsAlgorithms.chiSquareCritical(1 - alpha, df);

      stripHtml =
        tile("rows × cols", `${r.rows} × ${r.cols}`) +
        tile("χ² statistic", Engine.formatNum(r.stat, 3), true) +
        tile("df", String(r.df)) +
        tile("p-value", Engine.formatNum(r.p, 4), true) +
        tile(`χ²_{α, df}`, Engine.formatNum(crit, 3));
      note = `Test of independence, df = (r−1)(c−1) = ${r.df}, N = ${r.grandTotal}, α = ${Engine.formatNum(alpha, 2)}`;
      statLatex = `\\chi^2 = \\sum_{i,j} \\frac{(O_{ij} - E_{ij})^2}{E_{ij}} = ${Engine.formatNum(r.stat, 3)},\\quad df = (r-1)(c-1) = ${r.df}`;
      pLatex = `p = 1 - F_{\\chi^2_{${r.df}}}(\\chi^2) \\approx ${Engine.formatNum(r.p, 4)}`;
      reject = r.p < alpha;
      verdict = reject
        ? `Reject H₀ — the two variables are associated (p < α = ${Engine.formatNum(alpha, 2)}).`
        : `Fail to reject H₀ — not enough evidence of association (p ≥ α = ${Engine.formatNum(alpha, 2)}).`;
      barPlotTitle.textContent = "Observed counts by cell";
      drawIndepBarPlot(r);
      drawDistPlot(r.stat, r.df, crit);
      renderExpectedTable(r.expected, r);
    }

    placeholderPanel.style.display = "none";
    resultsArea.style.display = "block";
    shownOnce = true;

    resultStrip.innerHTML = stripHtml;
    formulaNote.textContent = note;
    Engine.renderKatex(formulaStat, statLatex, true);
    Engine.renderKatex(formulaP, pLatex, true);

    verdictLine.classList.toggle("bad", reject);
    verdictLine.classList.toggle("ok", !reject);
    verdictText.textContent = verdict;

    Proto.saveState(STORE_KEY, snapshot());
  }

  // ----- Plot drawers -----

  // Goodness-of-Fit: grouped bar chart of observed (teal-gold) vs expected
  // (orange) per category.
  function drawGoFBarPlot(r) {
    const x = r.observed.map((_, i) => `cat ${i + 1}`);
    Plotly.react("barPlot", [
      { x, y: r.observed, type: "bar", name: "Observed", marker: { color: "rgba(201,154,60,0.7)", line: { color: TEAL, width: 1 } } },
      { x, y: r.expected, type: "bar", name: "Expected", marker: { color: "rgba(237,109,64,0.55)", line: { color: ORANGE, width: 1 } } }
    ], Engine.plotlyBaseLayout({
      showlegend: true,
      barmode: "group",
      bargap: 0.2,
      xaxis: { title: "category" },
      yaxis: { title: "count" }
    }), Engine.plotlyConfig);
  }

  // Independence: grouped bar chart of observed counts per cell, one trace per
  // row. Reads cleanly for both 2×2 and r×c tables.
  function drawIndepBarPlot(r) {
    const x = r.observed[0].map((_, j) => `col ${j + 1}`);
    const traces = r.observed.map((row, i) => ({
      x, y: row, type: "bar", name: `row ${i + 1}`,
      marker: i === 0 ? { color: "rgba(201,154,60,0.7)", line: { color: TEAL, width: 1 } }
        : { color: "rgba(237,109,64,0.6)", line: { color: ORANGE, width: 1 } }
    }));
    Plotly.react("barPlot", traces, Engine.plotlyBaseLayout({
      showlegend: true,
      barmode: "group",
      bargap: 0.2,
      xaxis: { title: "column" },
      yaxis: { title: "count" }
    }), Engine.plotlyConfig);
  }

  // Chi-square distribution curve for the current df, with the observed stat
  // marked (teal-gold vertical line) and the upper-tail rejection region
  // [crit, ∞) shaded orange.
  function drawDistPlot(stat, df, crit) {
    // x range: 0 .. max(crit, stat) * 1.4 (or 10 for very small stats)
    const upper = Math.max(crit, stat) * 1.4;
    const xs = [];
    const N = 240;
    for (let i = 0; i <= N; i++) xs.push((upper * i) / N);
    const ys = xs.map((x) => chisqPdf(x, df));
    // Rejection region: x >= crit
    const rejectXs = xs.filter((x) => x >= crit);
    const rejectYs = rejectXs.map((x) => chisqPdf(x, df));

    const traces = [
      { x: rejectXs, y: rejectYs, type: "scatter", mode: "lines", fill: "tozeroy",
        name: `reject (χ² ≥ ${Engine.formatNum(crit, 2)})`, line: { color: ORANGE, width: 0 },
        fillcolor: "rgba(237,109,64,0.25)", hoverinfo: "skip" },
      { x: xs, y: ys, type: "scatter", mode: "lines", name: `χ² df=${df}`, line: { color: TEAL, width: 2 } },
      { x: [stat], y: [chisqPdf(stat, df)], type: "scatter", mode: "markers",
        name: "observed χ²", marker: { color: TEAL, size: 10, line: { color: "#090909", width: 1 } } }
    ];

    Plotly.react("distPlot", traces, Engine.plotlyBaseLayout({
      showlegend: true,
      xaxis: { title: "χ²" },
      yaxis: { title: "density" },
      shapes: [
        { type: "line", x0: crit, x1: crit, y0: 0, y1: 1, yref: "paper", line: { color: ORANGE, width: 2, dash: "dash" } },
        { type: "line", x0: stat, x1: stat, y0: 0, y1: 1, yref: "paper", line: { color: TEAL, width: 1.5 } }
      ],
      annotations: [
        { x: crit, y: 1, yref: "paper", text: "critical", showarrow: false, yshift: 12, font: { color: ORANGE } },
        { x: stat, y: 1, yref: "paper", text: "observed", showarrow: false, yshift: 12, font: { color: TEAL } }
      ]
    }), Engine.plotlyConfig);
  }

  // Chi-square PDF with k df: f(x) = (1 / (2^(k/2) Γ(k/2))) * x^(k/2-1) * e^(-x/2)
  // for x > 0. Uses the existing lgamma for Γ(k/2).
  function chisqPdf(x, k) {
    if (x <= 0) return 0;
    const a = k / 2;
    return Math.exp((a - 1) * Math.log(x) - x / 2 - a * Math.log(2) - StatsAlgorithms.lgamma(a));
  }

  // Render the expected-counts table. For GoF, a flat array. For Independence,
  // a 2D matrix (r passed). Plain HTML, Engine.formatNum on every value.
  function renderExpectedTable(expected, r) {
    if (r && Array.isArray(expected[0])) {
      let html = '<table class="mono" style="width:100%;border-collapse:collapse;font-size:13px;">';
      html += "<thead><tr><th></th>";
      for (let j = 0; j < r.cols; j++) html += `<th style="padding:4px 8px;">col ${j + 1}</th>`;
      html += `<th style="padding:4px 8px;">row total</th></tr></thead><tbody>`;
      for (let i = 0; i < r.rows; i++) {
        html += `<tr><td style="padding:4px 8px;font-weight:600;">row ${i + 1}</td>`;
        for (let j = 0; j < r.cols; j++)
          html += `<td style="padding:4px 8px;">${Engine.formatNum(expected[i][j], 3)}</td>`;
        html += `<td style="padding:4px 8px;">${Engine.formatNum(r.rowTotals[i], 3)}</td></tr>`;
      }
      html += "<tr><td style=\"padding:4px 8px;font-weight:600;\">col total</td>";
      for (let j = 0; j < r.cols; j++)
        html += `<td style="padding:4px 8px;">${Engine.formatNum(r.colTotals[j], 3)}</td>`;
      html += `<td style="padding:4px 8px;font-weight:600;">${Engine.formatNum(r.grandTotal, 3)}</td></tr>`;
      html += "</tbody></table>";
      expectedTable.innerHTML = html;
    } else {
      let html = '<table class="mono" style="width:100%;border-collapse:collapse;font-size:13px;"><thead><tr>';
      expected.forEach((_, i) => { html += `<th style="padding:4px 8px;">cat ${i + 1}</th>`; });
      html += "</tr></thead><tbody><tr>";
      expected.forEach((e) => { html += `<td style="padding:4px 8px;">${Engine.formatNum(e, 3)}</td>`; });
      html += "</tr></tbody></table>";
      expectedTable.innerHTML = html;
    }
  }

  // ----- Mode switching, state, wiring -----

  function snapshot() {
    return {
      mode,
      gofObserved: gofObservedInput.value, gofExpected: gofExpectedInput.value,
      dfAdjust: dfAdjustInput.value, alphaG: alphaInputG.value,
      indepMatrix: indepMatrixInput.value, alphaI: alphaInputI.value
    };
  }

  function setMode(next) {
    mode = next;
    modeRow.querySelectorAll(".chip").forEach((c) => c.classList.toggle("is-active", c.dataset.mode === next));
    document.getElementById("gofFields").style.display = next === "gof" ? "" : "none";
    document.getElementById("indepFields").style.display = next === "indep" ? "" : "none";
    if (shownOnce) render();
  }

  modeRow.addEventListener("click", (e) => { const b = e.target.closest(".chip"); if (b) setMode(b.dataset.mode); });

  const debouncedRender = Engine.debounce(() => { if (shownOnce) render(); }, 200);
  [gofObservedInput, gofExpectedInput, dfAdjustInput, alphaInputG, indepMatrixInput, alphaInputI]
    .forEach((el) => el.addEventListener("input", debouncedRender));

  exampleBtn.addEventListener("click", () => {
    if (mode === "gof") {
      gofObservedInput.value = "315, 108, 101, 32";
      gofExpectedInput.value = "312.75, 104.25, 104.25, 34.75";
      dfAdjustInput.value = "0"; alphaInputG.value = "0.05";
    } else {
      indepMatrixInput.value = "20, 30\n30, 20";
      alphaInputI.value = "0.05";
    }
    render();
  });

  form.addEventListener("submit", (e) => { e.preventDefault(); render(); });

  const saved = Proto.loadState(STORE_KEY);
  if (saved) {
    if (saved.gofObserved !== undefined) gofObservedInput.value = saved.gofObserved;
    if (saved.gofExpected !== undefined) gofExpectedInput.value = saved.gofExpected;
    if (saved.dfAdjust !== undefined) dfAdjustInput.value = saved.dfAdjust;
    if (saved.alphaG !== undefined) alphaInputG.value = saved.alphaG;
    if (saved.indepMatrix !== undefined) indepMatrixInput.value = saved.indepMatrix;
    if (saved.alphaI !== undefined) alphaInputI.value = saved.alphaI;
    if (saved.mode) setMode(saved.mode); else setMode("gof");
  } else {
    setMode("gof");
  }
})();