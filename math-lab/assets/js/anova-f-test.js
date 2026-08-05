(function () {
  "use strict";

  // ----- DOM grab (once) -----
  const groupsInput = document.getElementById("groupsInput");
  const alphaInput = document.getElementById("alphaInput");
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
  const groupTable = document.getElementById("groupTable");

  const STORE_KEY = "engine-lab:statistics:anova";
  let shownOnce = false;

  const TEAL = "#c99a3c";
  const ORANGE = "#ed6d40";

  // Parse groups: one group per line, values comma- or space-separated. Returns
  // a number[][]. DOM-input handling lives here, not in stats-algorithms.js
  // (per the shared conventions — same as chi-square-tests.js parseMatrix).
  function parseGroups(raw) {
    const lines = raw.split(/\n+/).map((s) => s.trim()).filter(Boolean);
    return lines.map((line) =>
      line.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean).map(Number).filter((n) => !Number.isNaN(n)));
  }

  function showError(msg) { formError.style.display = "block"; formErrorText.textContent = msg; }
  function clearError() { formError.style.display = "none"; }

  function tile(label, value, accent) {
    return `<div class="result-stat${accent ? " accent" : ""}"><div class="label">${label}</div><div class="value">${value}</div></div>`;
  }

  function render() {
    const alpha = parseFloat(alphaInput.value);
    if (Number.isNaN(alpha) || alpha <= 0 || alpha >= 1) { showError("Significance α must be between 0 and 1."); return; }
    clearError();

    const groups = parseGroups(groupsInput.value);
    if (groups.length < 2) return showError("Need at least two groups (one per line).");
    if (groups.some((g) => g.length < 1)) return showError("Every group must contain at least one value.");

    let r;
    try { r = StatsAlgorithms.runOneWayANOVA(groups); } catch (e) { return showError(e.message); }

    const crit = StatsAlgorithms.fCritical(1 - alpha, r.df1, r.df2);
    const reject = r.p < alpha;
    const verdict = reject
      ? `Reject H₀ — at least one group mean differs (p < α = ${Engine.formatNum(alpha, 2)}).`
      : `Fail to reject H₀ — no significant difference among group means (p ≥ α = ${Engine.formatNum(alpha, 2)}).`;

    const stripHtml =
      tile("k groups", String(r.k)) +
      tile("F statistic", Engine.formatNum(r.F, 3), true) +
      tile("df₁, df₂", `${r.df1}, ${r.df2}`) +
      tile("p-value", Engine.formatNum(r.p, 4), true) +
      tile(`F_crit (α)`, Engine.formatNum(crit, 3));
    const note = `One-way ANOVA, df = (${r.df1}, ${r.df2}), N = ${r.n}, α = ${Engine.formatNum(alpha, 2)} (critical F = ${Engine.formatNum(crit, 3)})`;
    const statLatex = `F = \\frac{\\mathrm{SSB}/(k-1)}{\\mathrm{SSW}/(N-k)} = \\frac{${Engine.formatNum(r.ssb, 3)}/${r.df1}}{${Engine.formatNum(r.ssw, 3)}/${r.df2}} \\approx ${Engine.formatNum(r.F, 3)}`;
    const pLatex = `p = 1 - F_{F_{${r.df1},${r.df2}}}(F) \\approx ${Engine.formatNum(r.p, 4)}`;

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

    drawGroupPlot(r);
    drawDistPlot(r.F, r.df1, r.df2, crit);
    renderGroupTable(r);

    Proto.saveState(STORE_KEY, snapshot());
  }

  // ----- Plot drawers -----

  // Group means as bars, with a ±1 SD error range per group (SD = sqrt(variance)).
  function drawGroupPlot(r) {
    const x = r.groupMeans.map((_, i) => `group ${i + 1}`);
    const sd = r.groupVariances.map((v) => Math.sqrt(Math.max(v, 0)));
    Plotly.react("barPlot", [
      { x, y: r.groupMeans, type: "bar", name: "mean",
        marker: { color: "rgba(201,154,60,0.7)", line: { color: TEAL, width: 1 } },
        error_y: { type: "data", array: sd, visible: true, color: ORANGE, thickness: 1.5, width: 4 } }
    ], Engine.plotlyBaseLayout({
      showlegend: false,
      bargap: 0.3,
      xaxis: { title: "group" },
      yaxis: { title: "value (mean ± 1 SD)" }
    }), Engine.plotlyConfig);
  }

  // F-distribution curve for (df1, df2), with the observed F marked (teal-gold
  // vertical line) and the upper-tail rejection region [crit, ∞) shaded orange.
  // Mirrors the chi-square density plot.
  function drawDistPlot(F, df1, df2, crit) {
    const upper = Math.max(crit, F) * 1.4;
    const xs = [];
    const N = 240;
    for (let i = 0; i <= N; i++) xs.push((upper * i) / N);
    const ys = xs.map((x) => fPdf(x, df1, df2));
    const rejectXs = xs.filter((x) => x >= crit);
    const rejectYs = rejectXs.map((x) => fPdf(x, df1, df2));

    const traces = [
      { x: rejectXs, y: rejectYs, type: "scatter", mode: "lines", fill: "tozeroy",
        name: `reject (F ≥ ${Engine.formatNum(crit, 2)})`, line: { color: ORANGE, width: 0 },
        fillcolor: "rgba(237,109,64,0.25)", hoverinfo: "skip" },
      { x: xs, y: ys, type: "scatter", mode: "lines", name: `F df₁=${df1},df₂=${df2}`, line: { color: TEAL, width: 2 } },
      { x: [F], y: [fPdf(F, df1, df2)], type: "scatter", mode: "markers",
        name: "observed F", marker: { color: TEAL, size: 10, line: { color: "#090909", width: 1 } } }
    ];

    Plotly.react("distPlot", traces, Engine.plotlyBaseLayout({
      showlegend: true,
      xaxis: { title: "F" },
      yaxis: { title: "density" },
      shapes: [
        { type: "line", x0: crit, x1: crit, y0: 0, y1: 1, yref: "paper", line: { color: ORANGE, width: 2, dash: "dash" } },
        { type: "line", x0: F, x1: F, y0: 0, y1: 1, yref: "paper", line: { color: TEAL, width: 1.5 } }
      ],
      annotations: [
        { x: crit, y: 1, yref: "paper", text: "critical", showarrow: false, yshift: 12, font: { color: ORANGE } },
        { x: F, y: 1, yref: "paper", text: "observed", showarrow: false, yshift: 12, font: { color: TEAL } }
      ]
    }), Engine.plotlyConfig);
  }

  // F-distribution PDF (df1, df2). Delegates to the core fPDF.
  function fPdf(x, df1, df2) { return StatsAlgorithms.fPDF(x, df1, df2); }

  // Per-group n / mean / variance table.
  function renderGroupTable(r) {
    let html = '<table class="mono" style="width:100%;border-collapse:collapse;font-size:13px;">';
    html += "<thead><tr><th style=\"padding:4px 8px;\">group</th><th style=\"padding:4px 8px;\">n</th><th style=\"padding:4px 8px;\">mean</th><th style=\"padding:4px 8px;\">variance</th><th style=\"padding:4px 8px;\">Σ(x−x̄)²</th></tr></thead><tbody>";
    for (let i = 0; i < r.k; i++) {
      const ss = (r.groupNs[i] - 1) * r.groupVariances[i];
      html += `<tr><td style="padding:4px 8px;font-weight:600;">${i + 1}</td>` +
        `<td style="padding:4px 8px;">${r.groupNs[i]}</td>` +
        `<td style="padding:4px 8px;">${Engine.formatNum(r.groupMeans[i], 4)}</td>` +
        `<td style="padding:4px 8px;">${Engine.formatNum(r.groupVariances[i], 4)}</td>` +
        `<td style="padding:4px 8px;">${Engine.formatNum(ss, 4)}</td></tr>`;
    }
    html += "</tbody></table>";
    groupTable.innerHTML = html;
  }

  // ----- State, wiring -----
  function snapshot() { return { groups: groupsInput.value, alpha: alphaInput.value }; }

  const debouncedRender = Engine.debounce(() => { if (shownOnce) render(); }, 200);
  [groupsInput, alphaInput].forEach((el) => el.addEventListener("input", debouncedRender));

  exampleBtn.addEventListener("click", () => {
    groupsInput.value = "49, 47, 51, 49, 50\n48, 50, 52, 51, 49\n54, 56, 52, 55, 53";
    alphaInput.value = "0.05";
    render();
  });

  form.addEventListener("submit", (e) => { e.preventDefault(); render(); });

  const saved = Proto.loadState(STORE_KEY);
  if (saved) {
    if (saved.groups !== undefined) groupsInput.value = saved.groups;
    if (saved.alpha !== undefined) alphaInput.value = saved.alpha;
  }
})();