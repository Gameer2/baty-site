/* Arc Length & Surface Area page wiring. All symbolic work lives in calculus-symbolic.js and
   runs inside the CAS worker — this file reads f(x), the interval [a, b], and whether to
   compute the arc length L or the surface area S; calls CalculusSymbolic.arcLengthSurfaceArea;
   and renders the value, the derivation ladder, and a plot of the curve.

   The picture: f(x) drawn across [a, b], the interval marked on the axis, and — for arc
   length — the curve overlaid with the polygonal chain of n sampled chords whose total
   converges to L (drag the slider to watch the chain tighten onto the curve); for surface
   area, the region under f (down to the x-axis) is shaded, since that is what gets revolved. */
(function () {
  "use strict";

  const fxInput = document.getElementById("fxInput");
  const fxPreview = document.getElementById("fxPreview");
  const aInput = document.getElementById("aInput");
  const bInput = document.getElementById("bInput");
  const modeRow = document.getElementById("modeRow");
  const startStatus = document.getElementById("startStatus");
  const startStatusText = document.getElementById("startStatusText");
  const formError = document.getElementById("formError");
  const formErrorText = document.getElementById("formErrorText");
  const form = document.getElementById("arcForm");
  const exampleBtn = document.getElementById("exampleBtn");
  const presetRow = document.getElementById("presetRow");

  const placeholderPanel = document.getElementById("placeholderPanel");
  const resultsArea = document.getElementById("resultsArea");
  const refusedPanel = document.getElementById("refusedPanel");
  const refusedReason = document.getElementById("refusedReason");

  const statLabel = document.getElementById("statLabel");
  const statValue = document.getElementById("statValue");
  const statVerified = document.getElementById("statVerified");
  const formulaResult = document.getElementById("formulaResult");
  const stepTableBody = document.querySelector("#stepTable tbody");
  const stepSlider = document.getElementById("stepSlider");
  const stepLabel = document.getElementById("stepLabel");
  const plotTitle = document.getElementById("plotTitle");

  let mode = "arc-length";
  let state = null;     // { result, steps }
  let plotState = null; // { fn, aNum, bNum, mode }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  // Bounds may be constants like "pi", "2*pi/3", "sqrt(2)" — the backend already evaluates
  // these fine; plain Number() only understood bare decimals, so it rejected valid input the
  // field's own placeholder text tells users to enter.
  function boundNum(raw) {
    try { const r = math.parse(String(raw).trim()).compile().evaluate({}); return (typeof r === "number" && Number.isFinite(r)) ? r : NaN; }
    catch (e) { return NaN; }
  }
  function showError(msg) { formError.style.display = "block"; formErrorText.textContent = msg; }
  function hideError() { formError.style.display = "none"; }
  function showRefused(result) {
    resultsArea.style.display = "none";
    placeholderPanel.style.display = "none";
    refusedPanel.style.display = "";
    refusedReason.textContent = result.reason;
  }

  function makeFn(expr) {
    try { const code = math.parse(expr).compile(); return (x) => { const r = code.evaluate({ x }); return (typeof r === "number" && Number.isFinite(r)) ? r : NaN; }; }
    catch (e) { return null; }
  }

  function updatePreview() {
    const raw = fxInput.value.trim();
    Engine.renderKatex(fxPreview, raw ? Engine.toLatex(raw) : "", false);
    Engine.pulseFlash(fxPreview);
  }

  function updateStartCheck() {
    const raw = fxInput.value.trim();
    if (!raw) { startStatus.className = "status-line bad"; startStatusText.textContent = "Enter the curve f(x)."; return false; }
    const fn = makeFn(raw);
    if (!fn) { startStatus.className = "status-line bad"; startStatusText.textContent = "Couldn't parse f(x)."; return false; }
    const aNum = boundNum(aInput.value), bNum = boundNum(bInput.value);
    if (!Number.isFinite(aNum) || !Number.isFinite(bNum)) { startStatus.className = "status-line bad"; startStatusText.textContent = "The bounds a and b must be numbers (or constants like pi)."; return false; }
    if (aNum >= bNum) { startStatus.className = "status-line bad"; startStatusText.textContent = "The lower bound a must be less than the upper bound b."; return false; }
    startStatus.className = "status-line ok";
    startStatusText.textContent = "Ready — press Evaluate.";
    return true;
  }

  function render(result) {
    placeholderPanel.style.display = "none";
    refusedPanel.style.display = "none";
    resultsArea.style.display = "";
    state = { result, steps: result.steps };

    const sym = result.mode === "surface-area" ? "S" : "L";
    statLabel.textContent = result.mode === "surface-area" ? "Surface area S" : "Length L";
    statValue.textContent = sym + " = " + result.value + "  ≈ " + Engine.formatNum(result.numeric);
    statVerified.textContent = result.verified ? "✓ verified" : "unverified";

    Engine.renderKatex(formulaResult, result.latex, true);

    stepTableBody.innerHTML = result.steps
      .map((s, i) => `<tr data-n="${i}"><td>${i + 1}</td><td>${escapeHtml(s.rule)}</td><td><span class="step-tex" data-i="${i}"></span></td></tr>`)
      .join("");
    stepTableBody.querySelectorAll(".step-tex").forEach((el) => {
      Engine.renderKatex(el, result.steps[Number(el.dataset.i)].latex, false);
    });

    stepSlider.min = 0;
    stepSlider.max = Math.max(0, result.steps.length - 1);
    stepSlider.value = result.steps.length - 1;
    updateStep(result.steps.length - 1);

    drawPlot(result);
  }

  function updateStep(idx) {
    if (!state) return;
    const n = Math.max(0, Math.min(state.steps.length - 1, idx));
    stepTableBody.querySelectorAll("tr").forEach((tr) => {
      const rowN = Number(tr.dataset.n);
      tr.classList.toggle("is-current", rowN === n);
      tr.style.opacity = rowN <= n ? "" : "0.25";
    });
    stepLabel.textContent = `step ${n + 1} / ${state.steps.length}`;
  }

  // ---- The curve picture ----
  function drawPlot(result) {
    const fn = makeFn(fxInput.value.trim());
    if (!fn) { Plotly.purge("fxPlot"); return; }
    const aNum = boundNum(aInput.value), bNum = boundNum(bInput.value);
    if (!Number.isFinite(aNum) || !Number.isFinite(bNum) || aNum >= bNum) { Plotly.purge("fxPlot"); return; }

    plotState = { fn, aNum, bNum, mode: result.mode };
    plotTitle.textContent = result.mode === "surface-area"
      ? "The region revolved about the x-axis"
      : "The curve and the polygonal approximation to its length";
    plotCurve();
  }

  function plotCurve() {
    if (!plotState) return;
    const { fn, aNum, bNum, mode: pmode } = plotState;

    // Vertical window from the curve's range on [a, b].
    let yMin = Infinity, yMax = -Infinity;
    const SMOOTH = 240;
    const xs = [], ys = [];
    for (let i = 0; i <= SMOOTH; i++) {
      const x = aNum + (i / SMOOTH) * (bNum - aNum);
      const y = fn(x);
      xs.push(x); ys.push(y);
      if (Number.isFinite(y)) { yMin = Math.min(yMin, y); yMax = Math.max(yMax, y); }
    }
    if (!Number.isFinite(yMin) || !Number.isFinite(yMax)) { Plotly.purge("fxPlot"); return; }
    const yPad = (yMax - yMin) * 0.12 + 0.4;
    const yr = [yMin - yPad, yMax + yPad];
    const xr = [aNum, bNum];

    const traces = [
      { x: xs, y: ys, mode: "lines", name: "f(x)",
        line: { color: "#9bcf6b", width: 3 }, hoverinfo: "skip" }
    ];

    if (pmode === "surface-area") {
      // Shade the region under f down to the axis — what gets revolved.
      const sx = [aNum].concat(xs).concat([bNum]);
      const sy = [0].concat(ys).concat([0]);
      traces.push({ x: sx, y: sy, mode: "lines", fill: "tozeroy",
        fillcolor: "rgba(79,158,130,0.18)", line: { color: "transparent" },
        name: "region", hoverinfo: "skip" });
    } else {
      // Polygonal chain of n chords along the curve — its total → L as n grows.
      const n = Math.max(2, Math.round(Number(stepSlider.max ? stepSlider.value : 8)) + 2);
      const cx = [], cy = [];
      for (let i = 0; i <= n; i++) {
        const x = aNum + (i / n) * (bNum - aNum);
        cx.push(x); cy.push(fn(x));
      }
      traces.push({ x: cx, y: cy, mode: "lines+markers",
        line: { color: "#ed6d40", width: 2, dash: "dot" },
        marker: { size: 5, color: "#ed6d40" }, name: "chords", hoverinfo: "skip" });
    }

    // Bound markers.
    traces.push({ x: [aNum, bNum], y: [0, 0], mode: "markers",
      marker: { size: 10, color: "#5c939f", symbol: "circle" }, name: "a, b", hoverinfo: "skip" });

    Plotly.newPlot("fxPlot", traces, Engine.plotlyBaseLayout({
      xaxis: { title: "x", range: xr, zeroline: true, zerolinecolor: "#2a2f33" },
      yaxis: { title: "f(x)", range: yr, zeroline: true, zerolinecolor: "#2a2f33", scaleanchor: "x", scaleratio: 1 },
      margin: { l: 55, r: 20, t: 20, b: 45 },
      shapes: [
        { type: "line", x0: aNum, x1: aNum, y0: yr[0], y1: yr[1], line: { color: "#5c939f", width: 1, dash: "dot" } },
        { type: "line", x0: bNum, x1: bNum, y0: yr[0], y1: yr[1], line: { color: "#5c939f", width: 1, dash: "dot" } }
      ]
    }), Engine.plotlyConfig);
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    hideError();
    if (!updateStartCheck()) return;

    const f = fxInput.value.trim();
    const a = aInput.value.trim(), b = bInput.value.trim();
    const submitBtn = form.querySelector('button[type="submit"] .btn-text');
    const prev = submitBtn ? submitBtn.textContent : null;
    if (submitBtn) submitBtn.textContent = "Evaluating…";

    CAS.arcLengthSurfaceArea(f, "x", a, b, { mode })
      .then((result) => {
        if (!result.ok) { showRefused(result); Plotly.purge("fxPlot"); return; }
        render(result);
      })
      .catch((err) => showError(err.message))
      .then(() => {
        if (submitBtn) submitBtn.textContent = prev;
        if (CAS.mode() === "sync") {
          startStatus.className = "status-line bad";
          startStatusText.textContent =
            "Running without a Web Worker (opened over file://?) — a hard integrand can freeze the page. Serve over http:// to restore the safety timeout.";
        }
      });
  });

  function setMode(m) {
    mode = m;
    modeRow.querySelectorAll(".tag").forEach((t) => t.classList.toggle("is-active", t.dataset.mode === m));
  }

  exampleBtn.addEventListener("click", () => {
    fxInput.value = "x^(3/2)"; aInput.value = "0"; bInput.value = "4"; setMode("arc-length");
    updatePreview(); updateStartCheck(); form.requestSubmit();
  });

  modeRow.addEventListener("click", (e) => {
    const btn = e.target.closest(".tag"); if (!btn) return;
    setMode(btn.dataset.mode); updateStartCheck();
  });

  presetRow.addEventListener("click", (e) => {
    const btn = e.target.closest(".tag"); if (!btn) return;
    fxInput.value = btn.dataset.fx; aInput.value = btn.dataset.a; bInput.value = btn.dataset.b;
    setMode(btn.dataset.mode);
    updatePreview(); updateStartCheck(); form.requestSubmit();
  });

  stepSlider.addEventListener("input", () => {
    updateStep(Number(stepSlider.value));
    if (plotState && plotState.mode === "arc-length") plotCurve();
  });

  const debounced = Engine.debounce(() => { updatePreview(); updateStartCheck(); }, 220);
  fxInput.addEventListener("input", debounced);
  aInput.addEventListener("input", debounced);
  bInput.addEventListener("input", debounced);

  Engine.attachMathKeypad(fxInput, document.getElementById("fxKeypad"));
  Engine.attachKeypadToggle(document.getElementById("keypadToggle"), document.getElementById("fxKeypad"));

  setMode("arc-length");
  updatePreview();
  updateStartCheck();
})();