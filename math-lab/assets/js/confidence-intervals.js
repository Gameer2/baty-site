(function () {
  "use strict";

  const ciModeRow = document.getElementById("ciModeRow");
  const confRow = document.getElementById("confRow");
  const ciDataInput = document.getElementById("ciDataInput");
  const ciVarDataInput = document.getElementById("ciVarDataInput");
  const successesInput = document.getElementById("successesInput");
  const nInput = document.getElementById("nInput");
  const formError = document.getElementById("formError");
  const formErrorText = document.getElementById("formErrorText");
  const statusLine = document.getElementById("statusLine");
  const statusText = document.getElementById("statusText");
  const form = document.getElementById("ciForm");
  const exampleBtn = document.getElementById("exampleBtn");

  const placeholderPanel = document.getElementById("placeholderPanel");
  const resultsArea = document.getElementById("resultsArea");
  const ciStrip = document.getElementById("ciStrip");
  const formulaBlock = document.getElementById("formulaBlock");
  const formulaNote = document.getElementById("formulaNote");
  const simCaption = document.getElementById("simCaption");

  const STORE_KEY = "engine-lab:statistics:ci";
  let shownOnce = false;
  let mode = "mean";
  let confidence = 0.95;

  const DEFAULT_DATA = "78, 85, 92, 67, 74, 88, 95, 81, 73, 90, 84, 79";

  function parseData(raw) {
    return raw.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean).map(Number).filter((n) => !Number.isNaN(n));
  }
  function showError(msg) { formError.style.display = "block"; formErrorText.textContent = msg; }
  function clearError() { formError.style.display = "none"; }

  function tile(label, value, accent) {
    return `<div class="result-stat${accent ? " accent" : ""}"><div class="label">${label}</div><div class="value">${value}</div></div>`;
  }

  function render() {
    let r, stripHtml, note, formulaLatex, lower, upper, point, simSims;

    if (mode === "mean") {
      const data = parseData(ciDataInput.value);
      if (data.length < 2) return showError("Enter at least two numeric values for a mean interval.");
      clearError();
      try { r = StatsAlgorithms.confidenceIntervalMean(data, confidence); } catch (e) { return showError(e.message); }
      stripHtml =
        tile("x̄ (point est.)", Engine.formatNum(r.mean, 3), true) +
        tile("margin", Engine.formatNum(r.margin, 3)) +
        tile("lower", Engine.formatNum(r.lower, 3)) +
        tile("upper", Engine.formatNum(r.upper, 3));
      note = `${Engine.formatNum(confidence * 100, 0)}% CI for the mean, df = ${r.df}, t* = ${Engine.formatNum(r.tStar, 4)}`;
      formulaLatex = `\\bar{x} \\pm t^{*}_{${r.df}}\\cdot \\frac{s}{\\sqrt{n}} = ${Engine.formatNum(r.mean, 2)} \\pm ${Engine.formatNum(r.tStar, 3)}\\cdot\\frac{${Engine.formatNum(r.sd, 2)}}{\\sqrt{${r.n}}} \\approx [${Engine.formatNum(r.lower, 2)},\\ ${Engine.formatNum(r.upper, 2)}]`;
      lower = r.lower; upper = r.upper; point = r.mean;
      simSims = buildMeanSims(r, data.length);
    } else if (mode === "proportion") {
      const successes = parseInt(successesInput.value, 10);
      const n = parseInt(nInput.value, 10);
      if (!Number.isInteger(successes) || !Number.isInteger(n) || n < 1 || successes < 0 || successes > n)
        return showError("Successes must be an integer between 0 and n.");
      clearError();
      try { r = StatsAlgorithms.confidenceIntervalProportion(successes, n, confidence); } catch (e) { return showError(e.message); }
      stripHtml =
        tile("p̂ (point est.)", Engine.formatNum(r.phat, 4), true) +
        tile("margin", Engine.formatNum(r.margin, 4)) +
        tile("lower", Engine.formatNum(r.lower, 4)) +
        tile("upper", Engine.formatNum(r.upper, 4));
      note = `${Engine.formatNum(confidence * 100, 0)}% Wald CI for a proportion, z* = ${Engine.formatNum(r.zStar, 4)}`;
      formulaLatex = `\\hat{p} \\pm z^{*}\\cdot\\sqrt{\\frac{\\hat{p}(1-\\hat{p})}{n}} = ${Engine.formatNum(r.phat, 3)} \\pm ${Engine.formatNum(r.zStar, 3)}\\cdot\\sqrt{\\frac{${Engine.formatNum(r.phat, 3)}(1-${Engine.formatNum(r.phat, 3)})}{${n}}} \\approx [${Engine.formatNum(r.lower, 3)},\\ ${Engine.formatNum(r.upper, 3)}]`;
      lower = r.lower; upper = r.upper; point = r.phat;
      simSims = buildProportionSims(r, n);
    } else {
      const data = parseData(ciVarDataInput.value);
      if (data.length < 2) return showError("Enter at least two numeric values for a variance interval.");
      clearError();
      try { r = StatsAlgorithms.confidenceIntervalVariance(data, confidence); } catch (e) { return showError(e.message); }
      stripHtml =
        tile("s² (point est.)", Engine.formatNum(r.variance, 3), true) +
        tile("var lower", Engine.formatNum(r.varLower, 3)) +
        tile("var upper", Engine.formatNum(r.varUpper, 3)) +
        tile("sd interval", `[${Engine.formatNum(r.sdLower, 3)}, ${Engine.formatNum(r.sdUpper, 3)}]`);
      note = `${Engine.formatNum(confidence * 100, 0)}% CI for the variance, df = ${r.df}`;
      formulaLatex = `\\left(\\frac{(n-1)s^2}{\\chi^2_{\\alpha/2}},\\ \\frac{(n-1)s^2}{\\chi^2_{1-\\alpha/2}}\\right) = \\left[${Engine.formatNum(r.varLower, 2)},\\ ${Engine.formatNum(r.varUpper, 2)}\\right] \\quad (\\text{sd } [${Engine.formatNum(r.sdLower, 2)},\\ ${Engine.formatNum(r.sdUpper, 2)}])`;
      lower = r.varLower; upper = r.varUpper; point = r.variance;
      simSims = null;
    }

    placeholderPanel.style.display = "none";
    resultsArea.style.display = "block";
    shownOnce = true;

    ciStrip.innerHTML = stripHtml;
    formulaNote.textContent = note;
    Engine.renderKatex(formulaBlock, formulaLatex, true);

    statusLine.className = "status-line ok";
    statusText.textContent = note;

    drawNumberLine(lower, upper, point, simSims, mode);

    if (simSims) {
      simCaption.style.display = "block";
      simCaption.textContent = `Repeated-interval simulation: ${simSims.contained} of ${simSims.intervals.length} simulated ${confidence * 100}% intervals contained the point estimate (${Engine.formatNum(simSims.fraction * 100, 1)}% — should be near ${Engine.formatNum(confidence * 100, 0)}%).`;
    } else {
      simCaption.style.display = "none";
    }

    Proto.saveState(STORE_KEY, snapshot());
  }

  // Simulate 100 new samples from a normal approximation centered at the sample mean
  // (treating it as the true mean), build each one's CI, and record which contain it.
  // Reuses mulberry32/sampleNormal from the sampling-distributions build.
  function buildMeanSims(r, n) {
    const rng = StatsAlgorithms.mulberry32(7);
    const intervals = [];
    let contained = 0;
    const tStar = r.tStar;
    for (let j = 0; j < 100; j++) {
      const sample = [];
      for (let i = 0; i < n; i++) sample.push(StatsAlgorithms.sampleNormal(rng, r.mean, r.sd));
      const s = StatsAlgorithms.descriptiveStats(sample);
      const m = tStar * s.se;
      const lo = s.mean - m, hi = s.mean + m;
      const has = lo <= r.mean && r.mean <= hi;
      if (has) contained++;
      intervals.push({ lo, hi, has });
    }
    return { intervals, contained, fraction: contained / 100 };
  }

  function buildProportionSims(r, n) {
    const rng = StatsAlgorithms.mulberry32(7);
    const intervals = [];
    let contained = 0;
    const zStar = r.zStar;
    const simSd = Math.sqrt(r.phat * (1 - r.phat) / n);
    for (let j = 0; j < 100; j++) {
      const phatJ = StatsAlgorithms.sampleNormal(rng, r.phat, simSd);
      const seJ = Math.sqrt(phatJ * (1 - phatJ) / n);
      const m = zStar * seJ;
      const lo = phatJ - m, hi = phatJ + m;
      const has = lo <= r.phat && r.phat <= hi;
      if (has) contained++;
      intervals.push({ lo, hi, has });
    }
    return { intervals, contained, fraction: contained / 100 };
  }

  function drawNumberLine(lower, upper, point, simSims, currentMode) {
    const center = (lower + upper) / 2;
    const half = Math.max((upper - lower) / 2, Math.abs(point) * 0.1, 1e-6);
    let xmin = center - half * 1.5, xmax = center + half * 1.5;
    if (currentMode === "proportion") { xmin = Math.max(xmin, -0.05); xmax = Math.min(xmax, 1.05); }

    const shapes = [];
    // baseline number line
    const baseY = simSims ? 0.02 : 0.5;
    shapes.push({ type: "line", x0: xmin, x1: xmax, y0: baseY, y1: baseY, yref: "paper", line: { color: "rgba(255,255,255,0.25)", width: 1 } });
    // main interval
    const mainY = simSims ? 1.0 : 0.5;
    shapes.push({ type: "line", x0: lower, x1: upper, y0: mainY, y1: mainY, yref: "paper", line: { color: "#c99a3c", width: 6 } });
    // true/point reference vertical
    shapes.push({ type: "line", x0: point, x1: point, y0: 0, y1: 1, yref: "paper", line: { color: "#ed6d40", width: 1.5, dash: "dash" } });

    // simulated intervals stacked below the main one
    if (simSims) {
      const N = simSims.intervals.length;
      const top = 0.95, bottom = 0.12;
      simSims.intervals.forEach((iv, j) => {
        const y = top - (j * (top - bottom)) / Math.max(N - 1, 1);
        shapes.push({ type: "line", x0: iv.lo, x1: iv.hi, y0: y, y1: y, yref: "paper", line: { color: iv.has ? "#5c939f" : "#ed6d40", width: 1 } });
      });
    }

    const traces = [{
      x: [point], y: [mainY], mode: "markers", type: "scatter", name: "point estimate",
      marker: { color: "#c99a3c", size: 10, line: { color: "#090909", width: 1 } }, hoverinfo: "x",
    }];

    Plotly.react("ciPlot", traces, Engine.plotlyBaseLayout({
      showlegend: false,
      margin: { l: 30, r: 30, t: 10, b: 30 },
      xaxis: { title: currentMode === "proportion" ? "p" : (currentMode === "variance" ? "variance" : "mean"), range: [xmin, xmax] },
      yaxis: { visible: false, range: [0, 1.08] },
      shapes,
    }), Engine.plotlyConfig);
  }

  function snapshot() {
    return { mode, confidence, data: ciDataInput.value, varData: ciVarDataInput.value, successes: successesInput.value, n: nInput.value };
  }

  function setMode(next) {
    mode = next;
    ciModeRow.querySelectorAll(".chip").forEach((c) => c.classList.toggle("is-active", c.dataset.mode === next));
    document.getElementById("meanFields").style.display = next === "mean" ? "" : "none";
    document.getElementById("proportionFields").style.display = next === "proportion" ? "" : "none";
    document.getElementById("varianceFields").style.display = next === "variance" ? "" : "none";
    if (shownOnce) render();
  }

  function setConf(next) {
    confidence = next;
    confRow.querySelectorAll(".chip").forEach((c) => c.classList.toggle("is-active", parseFloat(c.dataset.conf) === next));
    if (shownOnce) render();
  }

  ciModeRow.addEventListener("click", (e) => { const b = e.target.closest(".chip"); if (b) setMode(b.dataset.mode); });
  confRow.addEventListener("click", (e) => { const b = e.target.closest(".chip"); if (b) setConf(parseFloat(b.dataset.conf)); });

  const debouncedRender = Engine.debounce(() => { if (shownOnce) render(); }, 200);
  [ciDataInput, ciVarDataInput, successesInput, nInput].forEach((el2) => el2.addEventListener("input", debouncedRender));

  exampleBtn.addEventListener("click", () => {
    if (mode === "proportion") { successesInput.value = "64"; nInput.value = "200"; }
    else { ciDataInput.value = DEFAULT_DATA; ciVarDataInput.value = DEFAULT_DATA; }
    setConf(0.95);
    render();
  });

  form.addEventListener("submit", (e) => { e.preventDefault(); render(); });

  const saved = Proto.loadState(STORE_KEY);
  if (saved) {
    if (saved.data !== undefined) ciDataInput.value = saved.data;
    if (saved.varData !== undefined) ciVarDataInput.value = saved.varData;
    if (saved.successes !== undefined) successesInput.value = saved.successes;
    if (saved.n !== undefined) nInput.value = saved.n;
    if (saved.confidence) setConf(saved.confidence);
    if (saved.mode) setMode(saved.mode); else setMode("mean");
  } else {
    setMode("mean");
    setConf(0.95);
  }
})();