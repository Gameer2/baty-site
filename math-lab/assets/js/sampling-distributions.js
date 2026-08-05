(function () {
  "use strict";

  const distRow = document.getElementById("distRow");
  const nInput = document.getElementById("nInput");
  const numSamplesInput = document.getElementById("numSamplesInput");
  const seedInput = document.getElementById("seedInput");
  const rerollBtn = document.getElementById("rerollBtn");
  const formError = document.getElementById("formError");
  const formErrorText = document.getElementById("formErrorText");
  const statusLine = document.getElementById("statusLine");
  const statusText = document.getElementById("statusText");
  const form = document.getElementById("cltForm");
  const exampleBtn = document.getElementById("exampleBtn");

  const placeholderPanel = document.getElementById("placeholderPanel");
  const resultsArea = document.getElementById("resultsArea");
  const el = (id) => document.getElementById(id);

  const STORE_KEY = "engine-lab:statistics:clt";
  let shownOnce = false;
  let dist = "uniform";

  // Preset population parameters: {mean, sd} for each distribution, plus a factory that
  // binds a draw() closure to a given rng. Parameters are fixed for this first build.
  const PRESETS = {
    uniform: { mean: 0.5, sd: 1 / Math.sqrt(12), make: (rng) => () => StatsAlgorithms.sampleUniform(rng, 0, 1) },
    exponential: { mean: 1, sd: 1, make: (rng) => () => StatsAlgorithms.sampleExponential(rng, 1) },
    normal: { mean: 0, sd: 1, make: (rng) => () => StatsAlgorithms.sampleNormal(rng, 0, 1) },
  };

  function showError(msg) { formError.style.display = "block"; formErrorText.textContent = msg; }
  function clearError() { formError.style.display = "none"; }

  function render() {
    const n = parseInt(nInput.value, 10);
    const numSamples = parseInt(numSamplesInput.value, 10);
    const seed = parseInt(seedInput.value, 10);

    if (!Number.isInteger(n) || n < 1 || n > 500) return showError("Sample size n must be an integer between 1 and 500.");
    if (!Number.isInteger(numSamples) || numSamples < 2 || numSamples > 5000) return showError("Number of samples must be an integer between 2 and 5000.");
    if (!Number.isInteger(seed)) return showError("Seed must be an integer.");
    clearError();

    const preset = PRESETS[dist];

    // One raw sample for display: a fresh rng with the same seed, so its n draws are
    // identical to the first sample of the means simulation (same seed, same draw order).
    // This is an explicit step in the per-method file — drawSampleMeans' return shape
    // is untouched (no side channel for the first sample's raw values).
    const displayRng = StatsAlgorithms.mulberry32(seed);
    const displayDraw = preset.make(displayRng);
    const rawSample = [];
    for (let i = 0; i < n; i++) rawSample.push(displayDraw());

    const simRng = StatsAlgorithms.mulberry32(seed);
    const simDraw = preset.make(simRng);
    let result;
    try { result = StatsAlgorithms.drawSampleMeans(simDraw, n, numSamples); }
    catch (err) { return showError(err.message); }

    placeholderPanel.style.display = "none";
    resultsArea.style.display = "block";
    shownOnce = true;

    const theoreticalSE = preset.sd / Math.sqrt(n);
    el("statGrandMean").textContent = Engine.formatNum(result.grandMean, 5);
    el("statPopMean").textContent = Engine.formatNum(preset.mean, 5);
    el("statEmpSE").textContent = Engine.formatNum(result.se, 5);
    el("statTheSE").textContent = Engine.formatNum(theoreticalSE, 5);

    Engine.renderKatex(el("formulaBlock"),
      `\\text{SE}(\\bar{X}) = \\frac{\\sigma}{\\sqrt{n}} \\qquad \\bar{X} \\xrightarrow{d} N\\!\\left(\\mu, \\frac{\\sigma^2}{n}\\right) \\text{ as } n \\to \\infty`, true);

    statusLine.className = "status-line ok";
    statusText.textContent = `${numSamples} samples of size n = ${n} drawn (seed = ${seed}).`;

    Plotly.react("meansPlot", [{
      x: result.means, type: "histogram", marker: { color: "rgba(201,154,60,0.5)", line: { color: "#c99a3c", width: 1 } }, name: "sample means"
    }], Engine.plotlyBaseLayout({
      showlegend: false,
      shapes: [{ type: "line", x0: preset.mean, x1: preset.mean, y0: 0, y1: 1, yref: "paper", line: { color: "#ed6d40", width: 2, dash: "dash" } }],
      annotations: [{ x: preset.mean, y: 1, yref: "paper", text: "μ", showarrow: false, yshift: 12, font: { color: "#ed6d40" } }],
      xaxis: { title: "sample mean" }
    }), Engine.plotlyConfig);

    Plotly.react("rawSamplePlot", [{
      x: rawSample, type: "histogram", marker: { color: "rgba(201,154,60,0.5)", line: { color: "#c99a3c", width: 1 } }, name: "raw draws"
    }], Engine.plotlyBaseLayout({ showlegend: false, xaxis: { title: "value" } }), Engine.plotlyConfig);

    Proto.saveState(STORE_KEY, snapshot());
  }

  function snapshot() {
    return { dist, n: nInput.value, numSamples: numSamplesInput.value, seed: seedInput.value };
  }

  function setDist(next) {
    dist = next;
    distRow.querySelectorAll(".chip").forEach((c) => c.classList.toggle("is-active", c.dataset.dist === next));
    if (shownOnce) render();
  }

  distRow.addEventListener("click", (e) => {
    const btn = e.target.closest(".chip");
    if (btn) setDist(btn.dataset.dist);
  });

  rerollBtn.addEventListener("click", () => {
    // One-time UI choice of a fresh seed — not the simulation math, which stays reproducible
    // once a seed is fixed (per the plan's note on the no-bare-Math.random rule).
    seedInput.value = String(Math.floor(Date.now() % 2147483647));
    if (shownOnce) render();
  });

  const debouncedRender = Engine.debounce(() => { if (shownOnce) render(); }, 200);
  [nInput, numSamplesInput, seedInput].forEach((el2) => el2.addEventListener("input", debouncedRender));

  exampleBtn.addEventListener("click", () => {
    setDist("uniform");
    nInput.value = "30";
    numSamplesInput.value = "2000";
    seedInput.value = "42";
    render();
  });

  form.addEventListener("submit", (e) => { e.preventDefault(); render(); });

  const saved = Proto.loadState(STORE_KEY);
  if (saved) {
    if (saved.dist && PRESETS[saved.dist]) { dist = saved.dist; setDist(saved.dist); }
    if (saved.n !== undefined) nInput.value = saved.n;
    if (saved.numSamples !== undefined) numSamplesInput.value = saved.numSamples;
    if (saved.seed !== undefined) seedInput.value = saved.seed;
  } else {
    setDist("uniform");
  }
})();