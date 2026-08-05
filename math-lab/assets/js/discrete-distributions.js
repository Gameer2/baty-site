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

  // Parameter fields
  const binomialFields = document.getElementById("binomialFields");
  const poissonFields = document.getElementById("poissonFields");
  const geometricFields = document.getElementById("geometricFields");
  const hypergeometricFields = document.getElementById("hypergeometricFields");

  // Inputs
  const binomN = document.getElementById("binomN");
  const binomP = document.getElementById("binomP");
  const poissonLambda = document.getElementById("poissonLambda");
  const geometricP = document.getElementById("geometricP");
  const hyperN = document.getElementById("hyperN");
  const hyperK = document.getElementById("hyperK");
  const hyperN_draw = document.getElementById("hyperN_draw");
  const highlightK = document.getElementById("highlightK");

  const STORE_KEY = "engine-lab:statistics:discrete-distributions";
  let currentDist = "binomial";
  let shownOnce = false;

  function showError(msg) {
    formError.style.display = "block";
    formErrorText.textContent = msg;
  }
  function clearError() { formError.style.display = "none"; }

  function showFields(dist) {
    binomialFields.style.display = dist === "binomial" ? "flex" : "none";
    poissonFields.style.display = dist === "poisson" ? "flex" : "none";
    geometricFields.style.display = dist === "geometric" ? "flex" : "none";
    hypergeometricFields.style.display = dist === "hypergeometric" ? "flex" : "none";
  }

  function getParams() {
    switch (currentDist) {
      case "binomial":
        return { n: parseInt(binomN.value, 10), p: parseFloat(binomP.value) };
      case "poisson":
        return { lambda: parseFloat(poissonLambda.value) };
      case "geometric":
        return { p: parseFloat(geometricP.value) };
      case "hypergeometric":
        return { N: parseInt(hyperN.value, 10), K: parseInt(hyperK.value, 10), n: parseInt(hyperN_draw.value, 10) };
      default:
        return {};
    }
  }

  function validateParams() {
    switch (currentDist) {
      case "binomial": {
        const n = parseInt(binomN.value, 10);
        const p = parseFloat(binomP.value);
        if (!Number.isInteger(n) || n < 0) return "n must be a non-negative integer.";
        if (p < 0 || p > 1) return "p must be between 0 and 1.";
        return null;
      }
      case "poisson": {
        const lambda = parseFloat(poissonLambda.value);
        if (lambda <= 0) return "lambda must be positive.";
        return null;
      }
      case "geometric": {
        const p = parseFloat(geometricP.value);
        if (p <= 0 || p > 1) return "p must be in (0, 1].";
        return null;
      }
      case "hypergeometric": {
        const N = parseInt(hyperN.value, 10);
        const K = parseInt(hyperK.value, 10);
        const n = parseInt(hyperN_draw.value, 10);
        if (!Number.isInteger(N) || N < 0) return "N must be a non-negative integer.";
        if (!Number.isInteger(K) || K < 0 || K > N) return "K must be between 0 and N.";
        if (!Number.isInteger(n) || n < 0 || n > N) return "n must be between 0 and N.";
        return null;
      }
      default:
        return "Unknown distribution.";
    }
  }

  function getFormula(dist) {
    switch (dist) {
      case "binomial":
        return "P(X=k) = \\binom{n}{k} p^k (1-p)^{n-k}";
      case "poisson":
        return "P(X=k) = e^{-\\lambda} \\frac{\\lambda^k}{k!}";
      case "geometric":
        return "P(X=k) = (1-p)^{k-1} p";
      case "hypergeometric":
        return "P(X=k) = \\frac{\\binom{K}{k}\\binom{N-K}{n-k}}{\\binom{N}{n}}";
      default:
        return "";
    }
  }

  function getKRange(dist, params) {
    switch (dist) {
      case "binomial":
        return { min: 0, max: params.n };
      case "poisson": {
        // Show up to lambda + 4*sqrt(lambda), at least 10
        const maxK = Math.max(10, Math.ceil(params.lambda + 4 * Math.sqrt(params.lambda)));
        return { min: 0, max: maxK };
      }
      case "geometric":
        return { min: 1, max: 20 }; // Show first 20 trials
      case "hypergeometric": {
        const kMin = Math.max(0, params.n - (params.N - params.K));
        const kMax = Math.min(params.n, params.K);
        return { min: kMin, max: kMax };
      }
      default:
        return { min: 0, max: 10 };
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
    const kVal = parseInt(highlightK.value, 10);
    const kRange = getKRange(currentDist, params);

    let mean, variance, pmf, cdf;
    const Stats = StatsAlgorithms;

    switch (currentDist) {
      case "binomial":
        mean = Stats.binomialMean(params.n, params.p);
        variance = Stats.binomialVariance(params.n, params.p);
        pmf = Stats.binomialPMF(kVal, params.n, params.p);
        cdf = Stats.binomialCDF(kVal, params.n, params.p);
        break;
      case "poisson":
        mean = Stats.poissonMean(params.lambda);
        variance = Stats.poissonVariance(params.lambda);
        pmf = Stats.poissonPMF(kVal, params.lambda);
        cdf = Stats.poissonCDF(kVal, params.lambda);
        break;
      case "geometric":
        mean = Stats.geometricMean(params.p);
        variance = Stats.geometricVariance(params.p);
        pmf = Stats.geometricPMF(kVal, params.p);
        cdf = Stats.geometricCDF(kVal, params.p);
        break;
      case "hypergeometric":
        mean = Stats.hypergeometricMean(params.N, params.K, params.n);
        variance = Stats.hypergeometricVariance(params.N, params.K, params.n);
        pmf = Stats.hypergeometricPMF(kVal, params.N, params.K, params.n);
        cdf = Stats.hypergeometricCDF(kVal, params.N, params.K, params.n);
        break;
    }

    return { mean, variance, pmf, cdf, params, kVal, kRange };
  }

  function render() {
    const result = compute();
    if (!result) return;

    placeholderPanel.style.display = "none";
    resultsArea.style.display = "block";
    shownOnce = true;

    document.getElementById("statMean").textContent = Engine.formatNum(result.mean, 4);
    document.getElementById("statVar").textContent = Engine.formatNum(result.variance, 4);
    document.getElementById("statPMF").textContent = Engine.formatNum(result.pmf, 6);
    document.getElementById("statCDF").textContent = Engine.formatNum(result.cdf, 6);

    Engine.renderKatex(document.getElementById("formulaBlock"), getFormula(currentDist), true);

    statusLine.className = "status-line ok";
    statusText.textContent = `${currentDist.charAt(0).toUpperCase() + currentDist.slice(1)} distribution computed.`;

    // Build PMF data
    const pmfX = [], pmfY = [], colors = [];
    for (let k = result.kRange.min; k <= result.kRange.max; k++) {
      pmfX.push(k);
      let pk;
      switch (currentDist) {
        case "binomial": pk = StatsAlgorithms.binomialPMF(k, result.params.n, result.params.p); break;
        case "poisson": pk = StatsAlgorithms.poissonPMF(k, result.params.lambda); break;
        case "geometric": pk = StatsAlgorithms.geometricPMF(k, result.params.p); break;
        case "hypergeometric": pk = StatsAlgorithms.hypergeometricPMF(k, result.params.N, result.params.K, result.params.n); break;
      }
      pmfY.push(pk);
      colors.push(k === result.kVal ? "#ed6d40" : "#c99a3c");
    }

    // PMF Plot
    Plotly.react("pmfPlot", [{
      x: pmfX, y: pmfY, type: "bar", marker: { color: colors, line: { color: "#c99a3c", width: 1 } }, name: "PMF"
    }], Engine.plotlyBaseLayout({
      showlegend: false,
      xaxis: { title: "k", dtick: 1 },
      yaxis: { title: "P(X=k)", range: [0, Math.max(...pmfY) * 1.2] },
      shapes: [{ type: "line", x0: result.mean, x1: result.mean, y0: 0, y1: 1, yref: "paper", line: { color: "#ed6d40", width: 2, dash: "dash" } }],
      annotations: [{ x: result.mean, y: 1, yref: "paper", text: "μ", showarrow: false, yshift: 12, font: { color: "#ed6d40" } }]
    }), Engine.plotlyConfig);

    // Build CDF data
    const cdfX = [], cdfY = [];
    for (let k = result.kRange.min; k <= result.kRange.max; k++) {
      cdfX.push(k);
      let ck;
      switch (currentDist) {
        case "binomial": ck = StatsAlgorithms.binomialCDF(k, result.params.n, result.params.p); break;
        case "poisson": ck = StatsAlgorithms.poissonCDF(k, result.params.lambda); break;
        case "geometric": ck = StatsAlgorithms.geometricCDF(k, result.params.p); break;
        case "hypergeometric": ck = StatsAlgorithms.hypergeometricCDF(k, result.params.N, result.params.K, result.params.n); break;
      }
      cdfY.push(ck);
    }

    // CDF Plot (step function)
    const cdfStepX = [], cdfStepY = [];
    for (let i = 0; i < cdfX.length; i++) {
      cdfStepX.push(cdfX[i], cdfX[i]);
      cdfStepY.push(i === 0 ? 0 : cdfY[i - 1], cdfY[i]);
    }

    Plotly.react("cdfPlot", [{
      x: cdfStepX, y: cdfStepY, type: "scatter", mode: "lines", line: { color: "#c99a3c", width: 2 }, name: "CDF"
    }, {
      x: [result.kVal], y: [result.cdf], type: "scatter", mode: "markers", marker: { color: "#ed6d40", size: 10 }, name: "k"
    }], Engine.plotlyBaseLayout({
      showlegend: false,
      xaxis: { title: "k", dtick: 1 },
      yaxis: { title: "P(X ≤ k)", range: [0, 1.05] }
    }), Engine.plotlyConfig);

    Proto.saveState(STORE_KEY, { dist: currentDist, params: getParams(), k: result.kVal });
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

      // Update highlightK default based on distribution
      const params = getParams();
      let defaultK;
      switch (currentDist) {
        case "binomial": defaultK = Math.round(params.n * params.p); break;
        case "poisson": defaultK = Math.round(params.lambda); break;
        case "geometric": defaultK = Math.ceil(1 / params.p); break;
        case "hypergeometric": defaultK = Math.round(params.n * params.K / params.N); break;
      }
      highlightK.value = defaultK;

      if (shownOnce) render();
    });
  });

  // Parameter inputs
  [binomN, binomP, poissonLambda, geometricP, hyperN, hyperK, hyperN_draw, highlightK].forEach((input) => {
    input.addEventListener("input", debouncedRender);
  });

  exampleBtn.addEventListener("click", () => {
    currentDist = "binomial";
    distButtons.forEach((b) => {
      b.classList.toggle("active", b.getAttribute("data-dist") === "binomial");
      b.setAttribute("aria-selected", b.getAttribute("data-dist") === "binomial" ? "true" : "false");
    });
    showFields("binomial");
    binomN.value = 10;
    binomP.value = 0.5;
    highlightK.value = 5;
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
      if (saved.params.n !== undefined) { binomN.value = saved.params.n; binomP.value = saved.params.p ?? 0.5; }
      if (saved.params.lambda !== undefined) { poissonLambda.value = saved.params.lambda; }
      if (saved.params.p !== undefined && currentDist === "geometric") { geometricP.value = saved.params.p; }
      if (saved.params.N !== undefined) { hyperN.value = saved.params.N; hyperK.value = saved.params.K ?? 13; hyperN_draw.value = saved.params.n ?? 5; }
    }
    if (saved.k !== undefined) highlightK.value = saved.k;
  }
})();
