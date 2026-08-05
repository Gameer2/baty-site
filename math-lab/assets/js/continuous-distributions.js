(function () {
  "use strict";

  // DOM elements
  const form = document.getElementById("distForm");
  const distRow = document.getElementById("distRow");
  const distButtons = distRow.querySelectorAll(".chip");
  const statusLine = document.getElementById("statusLine");
  const statusText = document.getElementById("statusText");
  const formError = document.getElementById("formError");
  const formErrorText = document.getElementById("formErrorText");
  const placeholderPanel = document.getElementById("placeholderPanel");
  const resultsArea = document.getElementById("resultsArea");
  const exampleBtn = document.getElementById("exampleBtn");

  // Parameter field groups
  const normalFields = document.getElementById("normalFields");
  const exponentialFields = document.getElementById("exponentialFields");
  const uniformFields = document.getElementById("uniformFields");
  const gammaFields = document.getElementById("gammaFields");

  // Inputs
  const normMean = document.getElementById("normMean");
  const normSd = document.getElementById("normSd");
  const expRate = document.getElementById("expRate");
  const unifA = document.getElementById("unifA");
  const unifB = document.getElementById("unifB");
  const gammaShape = document.getElementById("gammaShape");
  const gammaScale = document.getElementById("gammaScale");
  const highlightX = document.getElementById("highlightX");

  const STORE_KEY = "engine-lab:statistics:continuous";
  let currentDist = "normal";
  let shownOnce = false;

  function showError(msg) {
    formError.style.display = "block";
    formErrorText.textContent = msg;
  }
  function clearError() { formError.style.display = "none"; }

  function showFields(dist) {
    normalFields.style.display = dist === "normal" ? "flex" : "none";
    exponentialFields.style.display = dist === "exponential" ? "flex" : "none";
    uniformFields.style.display = dist === "uniform" ? "flex" : "none";
    gammaFields.style.display = dist === "gamma" ? "flex" : "none";
  }

  function getParams() {
    switch (currentDist) {
      case "normal":
        return { mean: parseFloat(normMean.value), sd: parseFloat(normSd.value) };
      case "exponential":
        return { rate: parseFloat(expRate.value) };
      case "uniform":
        return { a: parseFloat(unifA.value), b: parseFloat(unifB.value) };
      case "gamma":
        return { shape: parseFloat(gammaShape.value), scale: parseFloat(gammaScale.value) };
      default:
        return {};
    }
  }

  function validateParams() {
    switch (currentDist) {
      case "normal": {
        const sd = parseFloat(normSd.value);
        if (!(sd > 0)) return "sd must be positive.";
        return null;
      }
      case "exponential": {
        const rate = parseFloat(expRate.value);
        if (!(rate > 0)) return "rate must be positive.";
        return null;
      }
      case "uniform": {
        const a = parseFloat(unifA.value), b = parseFloat(unifB.value);
        if (!(a < b)) return "a must be less than b.";
        return null;
      }
      case "gamma": {
        const shape = parseFloat(gammaShape.value), scale = parseFloat(gammaScale.value);
        if (!(shape > 0)) return "shape must be positive.";
        if (!(scale > 0)) return "scale must be positive.";
        return null;
      }
      default:
        return "Unknown distribution.";
    }
  }

  function getFormula(dist) {
    switch (dist) {
      case "normal":
        return "f(x) = \\frac{1}{\\sigma\\sqrt{2\\pi}}\\, e^{-\\frac{(x-\\mu)^2}{2\\sigma^2}}";
      case "exponential":
        return "f(x) = \\lambda\\, e^{-\\lambda x}, \\quad x \\ge 0";
      case "uniform":
        return "f(x) = \\frac{1}{b-a}, \\quad a \\le x \\le b";
      case "gamma":
        return "f(x) = \\frac{x^{k-1} e^{-x/\\theta}}{\\Gamma(k)\\, \\theta^k}, \\quad x > 0";
      default:
        return "";
    }
  }

  // x-axis range for plotting, per distribution. Returns {min, max}.
  function getXRange(dist, params) {
    switch (dist) {
      case "normal":
        return { min: params.mean - 4 * params.sd, max: params.mean + 4 * params.sd };
      case "exponential":
        return { min: 0, max: 5 / params.rate }; // ~mean + 4*sd = 5/rate
      case "uniform":
        return { min: params.a, max: params.b };
      case "gamma": {
        const mean = params.shape * params.scale;
        const sd = params.scale * Math.sqrt(params.shape);
        // For shape < 1 (singularity at 0), start just above 0 to avoid the asymptote.
        const min = params.shape < 1 ? 1e-3 : 0;
        return { min, max: mean + 4 * sd };
      }
      default:
        return { min: 0, max: 1 };
    }
  }

  function pdfAt(x, dist, params) {
    const S = StatsAlgorithms;
    switch (dist) {
      case "normal": return S.normalPDF(x, params.mean, params.sd);
      case "exponential": return S.exponentialPDF(x, params.rate);
      case "uniform": return S.uniformPDF(x, params.a, params.b);
      case "gamma": return S.gammaPDF(x, params.shape, params.scale);
      default: return 0;
    }
  }

  function cdfAt(x, dist, params) {
    const S = StatsAlgorithms;
    switch (dist) {
      case "normal": return S.normalCDFValue(x, params.mean, params.sd);
      case "exponential": return S.exponentialCDF(x, params.rate);
      case "uniform": return S.uniformCDF(x, params.a, params.b);
      case "gamma": return S.gammaCDF(x, params.shape, params.scale);
      default: return 0;
    }
  }

  function meanVarOf(dist, params) {
    const S = StatsAlgorithms;
    switch (dist) {
      case "normal": return { mean: S.normalMean(params.mean, params.sd), variance: S.normalVariance(params.mean, params.sd) };
      case "exponential": return { mean: S.exponentialMean(params.rate), variance: S.exponentialVariance(params.rate) };
      case "uniform": return { mean: S.uniformMean(params.a, params.b), variance: S.uniformVariance(params.a, params.b) };
      case "gamma": return { mean: S.gammaMean(params.shape, params.scale), variance: S.gammaVariance(params.shape, params.scale) };
      default: return { mean: 0, variance: 0 };
    }
  }

  function compute() {
    const error = validateParams();
    if (error) {
      showError(error);
      statusLine.className = "status-line";
      statusText.textContent = "Invalid parameters.";
      return null;
    }
    clearError();

    const params = getParams();
    const xVal = parseFloat(highlightX.value);
    const xRange = getXRange(currentDist, params);
    const { mean, variance } = meanVarOf(currentDist, params);
    const pdf = pdfAt(xVal, currentDist, params);
    const cdf = cdfAt(xVal, currentDist, params);

    return { mean, variance, pdf, cdf, params, xVal, xRange };
  }

  function render() {
    const result = compute();
    if (!result) return;

    placeholderPanel.style.display = "none";
    resultsArea.style.display = "block";
    shownOnce = true;

    document.getElementById("statMean").textContent = Engine.formatNum(result.mean, 4);
    document.getElementById("statVar").textContent = Engine.formatNum(result.variance, 4);
    document.getElementById("statPDF").textContent = Engine.formatNum(result.pdf, 6);
    document.getElementById("statCDF").textContent = Engine.formatNum(result.cdf, 6);

    Engine.renderKatex(document.getElementById("formulaBlock"), getFormula(currentDist), true);

    statusLine.className = "status-line ok";
    statusText.textContent = `${currentDist.charAt(0).toUpperCase() + currentDist.slice(1)} distribution computed.`;

    // Build PDF curve — 200 sample points across the x range.
    const N = 200;
    const pdfX = [], pdfY = [];
    for (let i = 0; i <= N; i++) {
      const x = result.xRange.min + (result.xRange.max - result.xRange.min) * i / N;
      pdfX.push(x);
      pdfY.push(pdfAt(x, currentDist, result.params));
    }
    // Clamp infinite/NaN values (Gamma shape<1 near 0) so Plotly doesn't choke.
    const safePdfY = pdfY.map((y) => Number.isFinite(y) ? y : null);
    const pdfYMax = Math.max(...pdfY.filter((y) => Number.isFinite(y))) * 1.2 || 1;

    Plotly.react("pdfPlot", [
      { x: pdfX, y: safePdfY, type: "scatter", mode: "lines", line: { color: "#c99a3c", width: 2 }, name: "PDF" },
      { x: [result.xVal], y: [result.pdf], type: "scatter", mode: "markers", marker: { color: "#ed6d40", size: 10 }, name: "x" }
    ], Engine.plotlyBaseLayout({
      showlegend: false,
      xaxis: { title: "x" },
      yaxis: { title: "f(x)", range: [0, pdfYMax] },
      shapes: [{ type: "line", x0: result.mean, x1: result.mean, y0: 0, y1: 1, yref: "paper", line: { color: "#ed6d40", width: 2, dash: "dash" } }],
      annotations: [{ x: result.mean, y: 1, yref: "paper", text: "μ", showarrow: false, yshift: 12, font: { color: "#ed6d40" } }]
    }), Engine.plotlyConfig);

    // Build CDF curve — same x grid.
    const cdfX = [], cdfY = [];
    for (let i = 0; i <= N; i++) {
      const x = result.xRange.min + (result.xRange.max - result.xRange.min) * i / N;
      cdfX.push(x);
      cdfY.push(cdfAt(x, currentDist, result.params));
    }

    Plotly.react("cdfPlot", [
      { x: cdfX, y: cdfY, type: "scatter", mode: "lines", line: { color: "#c99a3c", width: 2 }, name: "CDF" },
      { x: [result.xVal], y: [result.cdf], type: "scatter", mode: "markers", marker: { color: "#ed6d40", size: 10 }, name: "x" }
    ], Engine.plotlyBaseLayout({
      showlegend: false,
      xaxis: { title: "x" },
      yaxis: { title: "F(x)", range: [0, 1.05] },
      shapes: [
        { type: "line", x0: result.xRange.min, x1: result.xVal, y0: result.cdf, y1: result.cdf, line: { color: "#ed6d40", width: 1, dash: "dot" } },
        { type: "line", x0: result.xVal, x1: result.xVal, y0: 0, y1: result.cdf, line: { color: "#ed6d40", width: 1, dash: "dot" } }
      ]
    }), Engine.plotlyConfig);

    Proto.saveState(STORE_KEY, { dist: currentDist, params: getParams(), x: result.xVal });
  }

  const debouncedRender = Engine.debounce(() => { if (shownOnce) render(); }, 200);

  // Distribution selector
  distButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      distButtons.forEach((b) => { b.classList.remove("active"); b.setAttribute("aria-selected", "false"); });
      btn.classList.add("active");
      btn.setAttribute("aria-selected", "true");
      currentDist = btn.getAttribute("data-dist");
      showFields(currentDist);

      // Update highlightX default to the mean of the new distribution.
      const params = getParams();
      let defaultX;
      switch (currentDist) {
        case "normal": defaultX = params.mean; break;
        case "exponential": defaultX = 1 / params.rate; break;
        case "uniform": defaultX = (params.a + params.b) / 2; break;
        case "gamma": defaultX = params.shape * params.scale; break;
      }
      highlightX.value = defaultX;

      if (shownOnce) render();
    });
  });

  // Parameter inputs
  [normMean, normSd, expRate, unifA, unifB, gammaShape, gammaScale, highlightX].forEach((input) => {
    input.addEventListener("input", debouncedRender);
  });

  exampleBtn.addEventListener("click", () => {
    currentDist = "normal";
    distButtons.forEach((b) => {
      b.classList.toggle("active", b.getAttribute("data-dist") === "normal");
      b.setAttribute("aria-selected", b.getAttribute("data-dist") === "normal" ? "true" : "false");
    });
    showFields("normal");
    normMean.value = 0;
    normSd.value = 1;
    highlightX.value = 1.96;
    render();
  });

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    render();
  });

  // Load saved state
  const saved = Proto.loadState(STORE_KEY);
  if (saved && saved.dist) {
    currentDist = saved.dist;
    distButtons.forEach((b) => {
      b.classList.toggle("active", b.getAttribute("data-dist") === currentDist);
      b.setAttribute("aria-selected", b.getAttribute("data-dist") === currentDist ? "true" : "false");
    });
    showFields(currentDist);
    if (saved.params) {
      if (saved.params.mean !== undefined) { normMean.value = saved.params.mean; normSd.value = saved.params.sd ?? 1; }
      if (saved.params.rate !== undefined) { expRate.value = saved.params.rate; }
      if (saved.params.a !== undefined) { unifA.value = saved.params.a; unifB.value = saved.params.b ?? 1; }
      if (saved.params.shape !== undefined) { gammaShape.value = saved.params.shape; gammaScale.value = saved.params.scale ?? 1; }
    }
    if (saved.x !== undefined) highlightX.value = saved.x;
  }
})();