(function () {
  "use strict";

  // ----- DOM grab (once) -----
  const modeRow = document.getElementById("modeRow");
  const data1Input = document.getElementById("data1Input");
  const data2Input = document.getElementById("data2Input");
  const d0Input = document.getElementById("d0Input");
  const alphaInput = document.getElementById("alphaInput");
  const pairedInput = document.getElementById("pairedInput");
  const alphaInputP = document.getElementById("alphaInputP");
  const zDataInput = document.getElementById("zDataInput");
  const mu0Input = document.getElementById("mu0Input");
  const sigmaInput = document.getElementById("sigmaInput");
  const alphaInputZ = document.getElementById("alphaInputZ");

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
  const plotTitle = document.getElementById("plotTitle");
  const formulaNote = document.getElementById("formulaNote");

  const STORE_KEY = "engine-lab:statistics:twosample";
  let shownOnce = false;
  let mode = "two-sample";

  const TEAL = "#c99a3c";
  const ORANGE = "#ed6d40";

  // Parse a pasted textarea of numbers into a number[] — DOM-input handling
  // lives here, not in stats-algorithms.js (per the shared conventions).
  function parseData(raw) {
    return raw.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean).map(Number).filter((n) => !Number.isNaN(n));
  }

  // Parse paired input: one "[before, after]" pair per line. Accepts comma- or
  // whitespace-separated pairs (e.g. "10, 12" or "10 12"). Returns [[b,a]...].
  function parsePairs(raw) {
    const lines = raw.split(/\n+/).map((s) => s.trim()).filter(Boolean);
    const pairs = [];
    for (const line of lines) {
      const parts = line.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean).map(Number).filter((n) => !Number.isNaN(n));
      if (parts.length === 2) pairs.push([parts[0], parts[1]]);
    }
    return pairs;
  }

  function showError(msg) { formError.style.display = "block"; formErrorText.textContent = msg; }
  function clearError() { formError.style.display = "none"; }

  function tile(label, value, accent) {
    return `<div class="result-stat${accent ? " accent" : ""}"><div class="label">${label}</div><div class="value">${value}</div></div>`;
  }

  function alphaFor() {
    if (mode === "two-sample") return parseFloat(alphaInput.value);
    if (mode === "paired") return parseFloat(alphaInputP.value);
    return parseFloat(alphaInputZ.value);
  }

  function render() {
    const alpha = alphaFor();
    if (Number.isNaN(alpha) || alpha <= 0 || alpha >= 1) { showError("Significance α must be between 0 and 1."); return; }
    clearError();

    let stripHtml, statLatex, pLatex, note, verdict, reject;

    if (mode === "two-sample") {
      const d1 = parseData(data1Input.value);
      const d2 = parseData(data2Input.value);
      const d0 = parseFloat(d0Input.value);
      if (d1.length < 2) return showError("Sample 1 needs at least two numeric values.");
      if (d2.length < 2) return showError("Sample 2 needs at least two numeric values.");
      if (Number.isNaN(d0)) return showError("H₀: μ₁ − μ₂ must be a number.");

      let r;
      try { r = StatsAlgorithms.runTwoSampleTTest(d1, d2); } catch (e) { return showError(e.message); }

      // If d0 != 0, adjust t (the reusable se/df are unchanged under the shift).
      const tAdj = d0 !== 0 ? (r.diff - d0) / r.se : r.t;
      const pAdj = StatsAlgorithms.tCDF(Math.abs(tAdj), r.df);
      r.t = tAdj; r.p = pAdj;

      stripHtml =
        tile("n₁, n₂", `${r.n1}, ${r.n2}`) +
        tile("mean₁ − mean₂", Engine.formatNum(r.diff, 3), true) +
        tile("t-statistic", Engine.formatNum(r.t, 3), true) +
        tile("p-value", Engine.formatNum(r.p, 4)) +
        tile("Welch df", Engine.formatNum(r.df, 3));
      note = `Welch's unequal-variance t-test, df ≈ ${Engine.formatNum(r.df, 2)}, se = ${Engine.formatNum(r.se, 3)}`;
      statLatex = `t = \\dfrac{\\bar{x}_1 - \\bar{x}_2 - d_0}{\\sqrt{s_1^2/n_1 + s_2^2/n_2}} = \\dfrac{${Engine.formatNum(r.mean1, 2)} - ${Engine.formatNum(r.mean2, 2)} - ${Engine.formatNum(d0, 2)}}{${Engine.formatNum(r.se, 3)}} \\approx ${Engine.formatNum(r.t, 3)}`;
      pLatex = `p \\approx ${Engine.formatNum(r.p, 4)}\\ \\ (\\text{df} \\approx ${Engine.formatNum(r.df, 2)})`;
      reject = r.p < alpha;
      verdict = reject
        ? `Reject H₀ — the two means differ significantly (p < α = ${Engine.formatNum(alpha, 2)}).`
        : `Fail to reject H₀ — not enough evidence the means differ (p ≥ α = ${Engine.formatNum(alpha, 2)}).`;
      plotTitle.textContent = "Two samples — x̄₁ vs x̄₂";
      drawTwoSamplePlot(d1, d2, r);
    } else if (mode === "paired") {
      const pairs = parsePairs(pairedInput.value);
      if (pairs.length < 2) return showError("Enter at least two [before, after] pairs (one per line).");

      let r;
      try { r = StatsAlgorithms.runPairedTTest(pairs); } catch (e) { return showError(e.message); }

      stripHtml =
        tile("n pairs", String(r.n)) +
        tile("mean diff (after − before)", Engine.formatNum(r.meanDiff, 3), true) +
        tile("t-statistic", Engine.formatNum(r.t, 3), true) +
        tile("p-value", Engine.formatNum(r.p, 4)) +
        tile("df", String(r.df));
      note = `Paired t-test (one-sample on differences), df = ${r.df}, sd of differences = ${Engine.formatNum(r.sdDiff, 3)}`;
      statLatex = `t = \\dfrac{\\bar{d} - 0}{s_d / \\sqrt{n}} = \\dfrac{${Engine.formatNum(r.meanDiff, 2)}}{${Engine.formatNum(r.sdDiff, 3)} / \\sqrt{${r.n}}} \\approx ${Engine.formatNum(r.t, 3)}`;
      pLatex = `p \\approx ${Engine.formatNum(r.p, 4)}\\ \\ (\\text{df} = ${r.df})`;
      reject = r.p < alpha;
      verdict = reject
        ? `Reject H₀ — the paired mean difference differs significantly from 0 (p < α = ${Engine.formatNum(alpha, 2)}).`
        : `Fail to reject H₀ — not enough evidence the mean difference is non-zero (p ≥ α = ${Engine.formatNum(alpha, 2)}).`;
      plotTitle.textContent = "Distribution of paired differences";
      drawPairedPlot(r);
    } else {
      const data = parseData(zDataInput.value);
      const mu0 = parseFloat(mu0Input.value);
      const sigma = parseFloat(sigmaInput.value);
      if (data.length < 1) return showError("Enter at least one numeric value.");
      if (Number.isNaN(mu0)) return showError("H₀: μ must be a number.");
      if (Number.isNaN(sigma) || sigma <= 0) return showError("Known σ must be positive.");

      let r;
      try { r = StatsAlgorithms.runZTest(data, mu0, sigma); } catch (e) { return showError(e.message); }

      stripHtml =
        tile("n", String(r.n)) +
        tile("x̄ (mean)", Engine.formatNum(r.mean, 3), true) +
        tile("z-statistic", Engine.formatNum(r.z, 3), true) +
        tile("p-value", Engine.formatNum(r.p, 4)) +
        tile("σ / √n (se)", Engine.formatNum(r.se, 3));
      note = `One-sample z-test (known σ = ${Engine.formatNum(sigma, 2)}), se = σ/√n = ${Engine.formatNum(r.se, 3)}`;
      statLatex = `z = \\dfrac{\\bar{x} - \\mu_0}{\\sigma / \\sqrt{n}} = \\dfrac{${Engine.formatNum(r.mean, 2)} - ${Engine.formatNum(mu0, 2)}}{${Engine.formatNum(sigma, 2)} / \\sqrt{${r.n}}} \\approx ${Engine.formatNum(r.z, 3)}`;
      pLatex = `p = 2\\bigl(1 - \\Phi(|z|)\\bigr) \\approx ${Engine.formatNum(r.p, 4)}`;
      reject = r.p < alpha;
      verdict = reject
        ? `Reject H₀ — the sample mean differs significantly from ${Engine.formatNum(mu0, 2)} (p < α = ${Engine.formatNum(alpha, 2)}).`
        : `Fail to reject H₀ — not enough evidence the mean differs from ${Engine.formatNum(mu0, 2)} (p ≥ α = ${Engine.formatNum(alpha, 2)}).`;
      plotTitle.textContent = "Sample mean vs H₀ on the standard normal curve";
      drawZTestPlot(r, alpha);
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

  // ----- Plot drawers (one per mode) -----

  function drawTwoSamplePlot(d1, d2, r) {
    Plotly.react("testPlot", [
      { x: d1, type: "histogram", name: "Sample 1", opacity: 0.6, marker: { color: "rgba(201,154,60,0.55)", line: { color: TEAL, width: 1 } } },
      { x: d2, type: "histogram", name: "Sample 2", opacity: 0.6, marker: { color: "rgba(237,109,64,0.45)", line: { color: ORANGE, width: 1 } } }
    ], Engine.plotlyBaseLayout({
      showlegend: true,
      bargap: 0.05,
      bargroupgap: 0.05,
      xaxis: { title: "value" },
      yaxis: { title: "count" },
      shapes: [
        { type: "line", x0: r.mean1, x1: r.mean1, y0: 0, y1: 1, yref: "paper", line: { color: TEAL, width: 2 } },
        { type: "line", x0: r.mean2, x1: r.mean2, y0: 0, y1: 1, yref: "paper", line: { color: ORANGE, width: 2, dash: "dash" } }
      ],
      annotations: [
        { x: r.mean1, y: 1, yref: "paper", text: "x̄₁", showarrow: false, yshift: 12, font: { color: TEAL } },
        { x: r.mean2, y: 1, yref: "paper", text: "x̄₂", showarrow: false, yshift: 12, font: { color: ORANGE } }
      ]
    }), Engine.plotlyConfig);
  }

  function drawPairedPlot(r) {
    Plotly.react("testPlot", [{
      x: r.differences, type: "histogram", name: "differences",
      marker: { color: "rgba(201,154,60,0.55)", line: { color: TEAL, width: 1 } }
    }], Engine.plotlyBaseLayout({
      showlegend: false,
      bargap: 0.05,
      xaxis: { title: "difference (after − before)" },
      yaxis: { title: "count" },
      shapes: [
        { type: "line", x0: 0, x1: 0, y0: 0, y1: 1, yref: "paper", line: { color: ORANGE, width: 2, dash: "dash" } },
        { type: "line", x0: r.meanDiff, x1: r.meanDiff, y0: 0, y1: 1, yref: "paper", line: { color: TEAL, width: 2 } }
      ],
      annotations: [
        { x: 0, y: 1, yref: "paper", text: "H₀: d̄ = 0", showarrow: false, yshift: 12, font: { color: ORANGE } },
        { x: r.meanDiff, y: 1, yref: "paper", text: "d̄", showarrow: false, yshift: 12, font: { color: TEAL } }
      ]
    }), Engine.plotlyConfig);
  }

  function drawZTestPlot(r, alpha) {
    // Standard normal curve over a range centered at mu0, plus the observed
    // mean marked, and the two-tailed rejection region shaded.
    const zCrit = StatsAlgorithms.zCritical(alpha);
    // x axis in the data's units: mean ± 4*se
    const half = Math.max(4 * r.se, Math.abs(r.mean - mu0) * 1.2, 1e-6);
    const xmin = mu0 - half, xmax = mu0 + half;
    const xs = [];
    for (let i = 0; i <= 200; i++) xs.push(xmin + (xmax - xmin) * i / 200);
    const curve = xs.map((x) => StatsAlgorithms.normalPDF((x - mu0) / r.se, 0, 1) / r.se);

    // Shaded rejection regions: x <= mu0 - zCrit*se and x >= mu0 + zCrit*se
    const lowerXs = xs.filter((x) => x <= mu0 - zCrit * r.se);
    const lowerY = lowerXs.map((x) => StatsAlgorithms.normalPDF((x - mu0) / r.se, 0, 1) / r.se);
    const upperXs = xs.filter((x) => x >= mu0 + zCrit * r.se);
    const upperY = upperXs.map((x) => StatsAlgorithms.normalPDF((x - mu0) / r.se, 0, 1) / r.se);

    const traces = [
      { x: lowerXs, y: lowerY, type: "scatter", mode: "lines", fill: "tozeroy", name: "reject (lower)", line: { color: ORANGE, width: 0 }, fillcolor: "rgba(237,109,64,0.25)", hoverinfo: "skip" },
      { x: upperXs, y: upperY, type: "scatter", mode: "lines", fill: "tozeroy", name: "reject (upper)", line: { color: ORANGE, width: 0 }, fillcolor: "rgba(237,109,64,0.25)", hoverinfo: "skip" },
      { x: xs, y: curve, type: "scatter", mode: "lines", name: "normal curve", line: { color: TEAL, width: 2 } },
      { x: [r.mean], y: [StatsAlgorithms.normalPDF((r.mean - mu0) / r.se, 0, 1) / r.se], type: "scatter", mode: "markers", name: "x̄", marker: { color: TEAL, size: 10, line: { color: "#090909", width: 1 } } }
    ];

    Plotly.react("testPlot", traces, Engine.plotlyBaseLayout({
      showlegend: false,
      xaxis: { title: "value" },
      yaxis: { title: "density" },
      shapes: [
        { type: "line", x0: mu0, x1: mu0, y0: 0, y1: 1, yref: "paper", line: { color: ORANGE, width: 2, dash: "dash" } },
        { type: "line", x0: r.mean, x1: r.mean, y0: 0, y1: 1, yref: "paper", line: { color: TEAL, width: 1.5 } }
      ],
      annotations: [
        { x: mu0, y: 1, yref: "paper", text: "μ₀", showarrow: false, yshift: 12, font: { color: ORANGE } },
        { x: r.mean, y: 1, yref: "paper", text: "x̄", showarrow: false, yshift: 12, font: { color: TEAL } }
      ]
    }), Engine.plotlyConfig);
  }

  // ----- Mode switching, state, wiring -----

  function snapshot() {
    return {
      mode,
      data1: data1Input.value, data2: data2Input.value, d0: d0Input.value, alpha: alphaInput.value,
      paired: pairedInput.value, alphaP: alphaInputP.value,
      zData: zDataInput.value, mu0: mu0Input.value, sigma: sigmaInput.value, alphaZ: alphaInputZ.value
    };
  }

  function setMode(next) {
    mode = next;
    modeRow.querySelectorAll(".chip").forEach((c) => c.classList.toggle("is-active", c.dataset.mode === next));
    document.getElementById("twoSampleFields").style.display = next === "two-sample" ? "" : "none";
    document.getElementById("pairedFields").style.display = next === "paired" ? "" : "none";
    document.getElementById("ztestFields").style.display = next === "ztest" ? "" : "none";
    if (shownOnce) render();
  }

  modeRow.addEventListener("click", (e) => { const b = e.target.closest(".chip"); if (b) setMode(b.dataset.mode); });

  const debouncedRender = Engine.debounce(() => { if (shownOnce) render(); }, 200);
  [data1Input, data2Input, d0Input, alphaInput, pairedInput, alphaInputP, zDataInput, mu0Input, sigmaInput, alphaInputZ]
    .forEach((el) => el.addEventListener("input", debouncedRender));

  exampleBtn.addEventListener("click", () => {
    if (mode === "two-sample") {
      data1Input.value = "22, 24, 25, 26, 28, 27, 30, 31, 24, 28";
      data2Input.value = "18, 20, 22, 17, 15, 21, 19, 16";
      d0Input.value = "0"; alphaInput.value = "0.05";
    } else if (mode === "paired") {
      pairedInput.value = "10, 12\n14, 15\n15, 18\n12, 14\n9, 11";
      alphaInputP.value = "0.05";
    } else {
      zDataInput.value = "42, 46, 44, 43, 45, 44, 46, 42, 43, 45, 44, 44, 43, 45, 44, 44";
      mu0Input.value = "40"; sigmaInput.value = "8"; alphaInputZ.value = "0.05";
    }
    render();
  });

  form.addEventListener("submit", (e) => { e.preventDefault(); render(); });

  const saved = Proto.loadState(STORE_KEY);
  if (saved) {
    if (saved.data1 !== undefined) data1Input.value = saved.data1;
    if (saved.data2 !== undefined) data2Input.value = saved.data2;
    if (saved.d0 !== undefined) d0Input.value = saved.d0;
    if (saved.alpha !== undefined) alphaInput.value = saved.alpha;
    if (saved.paired !== undefined) pairedInput.value = saved.paired;
    if (saved.alphaP !== undefined) alphaInputP.value = saved.alphaP;
    if (saved.zData !== undefined) zDataInput.value = saved.zData;
    if (saved.mu0 !== undefined) mu0Input.value = saved.mu0;
    if (saved.sigma !== undefined) sigmaInput.value = saved.sigma;
    if (saved.alphaZ !== undefined) alphaInputZ.value = saved.alphaZ;
    if (saved.mode) setMode(saved.mode); else setMode("two-sample");
  } else {
    setMode("two-sample");
  }
})();