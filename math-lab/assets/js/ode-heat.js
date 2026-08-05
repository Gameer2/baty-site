/* Heat Equation page wiring. Reads L, k, the initial profile f(x), the term count N and the time
   horizon T, then calls CAS.solveHeatEquation (→ ODESymbolic.solveHeatEquation: separation of
   variables → Dirichlet eigenvalue problem → Fourier sine coefficients via Simpson's rule). The
   coefficients bn are plain numbers, structured-clone-safe across the worker boundary; u(x,t) is
   rebuilt here via ODESymbolic.heatSeriesValue(bn, L, k, x, t) rather than shipped as a closure.
   Renders the derivation box (ODERender.bigBox), a u(x,t) heatmap, and time-slice snapshots. */
(function () {
  "use strict";

  const form = document.getElementById("pdeForm");
  const pdeL = document.getElementById("pdeL"), pdeK = document.getElementById("pdeK"), pdeFx = document.getElementById("pdeFx");
  const pdeN = document.getElementById("pdeN"), pdeT = document.getElementById("pdeT");
  const fxPreview = document.getElementById("fxPreview");
  const formError = document.getElementById("formError"), formErrorText = document.getElementById("formErrorText");
  const startStatus = document.getElementById("startStatus"), startStatusText = document.getElementById("startStatusText");
  const placeholderPanel = document.getElementById("placeholderPanel");
  const resultsArea = document.getElementById("resultsArea");
  const plotsWrap = document.getElementById("plotsWrap");

  function showError(msg) { formError.style.display = "block"; formErrorText.textContent = msg; }
  function hideError() { formError.style.display = "none"; }
  function setStatus(ok, msg) {
    startStatus.className = "status-line " + (ok ? "ok" : "bad");
    startStatusText.textContent = msg;
  }

  function updatePreview() {
    const raw = pdeFx.value.trim();
    Engine.renderKatex(fxPreview, raw ? `f(x) = ${Engine.toLatex(raw)}` : "", false);
    Engine.pulseFlash(fxPreview);
  }

  function updateStartCheck() {
    const L = parseFloat(pdeL.value), k = parseFloat(pdeK.value), N = parseInt(pdeN.value, 10), T = parseFloat(pdeT.value);
    if (!(L > 0)) return setStatus(false, "Length L must be positive."), false;
    if (!(k > 0)) return setStatus(false, "Diffusivity k must be positive."), false;
    if (!(N >= 1)) return setStatus(false, "Fourier terms N must be at least 1."), false;
    if (!(T > 0)) return setStatus(false, "Max time T must be positive."), false;
    if (!pdeFx.value.trim()) return setStatus(false, "Enter an initial profile f(x)."), false;
    setStatus(true, "Ready — press Solve.");
    return true;
  }

  document.querySelectorAll("#presetRow .tag").forEach((btn) => {
    btn.addEventListener("click", () => { pdeFx.value = btn.dataset.fx; updatePreview(); updateStartCheck(); });
  });

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    hideError();
    if (!updateStartCheck()) return;
    const L = parseFloat(pdeL.value), k = parseFloat(pdeK.value), N = parseInt(pdeN.value, 10), T = parseFloat(pdeT.value);

    const submitBtn = form.querySelector('button[type="submit"] .btn-text');
    const prev = submitBtn ? submitBtn.textContent : null;
    if (submitBtn) submitBtn.textContent = "Solving…";

    CAS.solveHeatEquation({ L, k, fxExpr: pdeFx.value.trim(), N, T }).then((box) => {
      placeholderPanel.style.display = "none";
      resultsArea.style.display = "";
      ODERender.bigBox(resultsArea, box);
      plotsWrap.style.display = "";

      // bn are plain numbers; u(x,t) is reconstructed here, not sent as a closure.
      const u = (x, t) => ODESymbolic.heatSeriesValue(box.bn, box.L, box.k, x, t);

      const NX = 60, NT = 50;
      const xs = Array.from({ length: NX }, (_, i) => (i / (NX - 1)) * L);
      const ts = Array.from({ length: NT }, (_, i) => (i / (NT - 1)) * T);
      const z = ts.map((t) => xs.map((x) => u(x, t)));
      Plotly.newPlot("heatPlot", [{
        x: xs, y: ts, z, type: "heatmap",
        colorscale: [[0, "#090909"], [0.5, "#4f8fc0"], [1, "#e7e7e7"]]
      }], Engine.plotlyBaseLayout({
        xaxis: { title: "x" }, yaxis: { title: "t" }, margin: { l: 55, r: 20, t: 20, b: 45 }
      }), Engine.plotlyConfig);

      const snapTimes = [0, T * 0.1, T * 0.3, T * 0.6, T].filter((v, i, arr) => arr.indexOf(v) === i);
      const snapTraces = snapTimes.map((t, i) => ({
        x: xs, y: xs.map((x) => u(x, t)), mode: "lines", name: `t=${Engine.formatNum(t, 3)}`,
        line: { width: 2, color: ["#4f8fc0", "#5c939f", "#59a993", "#ed6d40", "#c15a86"][i % 5] }
      }));
      Plotly.newPlot("snapshotsPlot", snapTraces, Engine.plotlyBaseLayout({
        xaxis: { title: "x" }, yaxis: { title: "u(x,t)" }, legend: { orientation: "h", y: -0.2 }
      }), Engine.plotlyConfig);

      setStatus(true, "Solved — separation of variables, " + box.bn.length + " Fourier terms.");
    }).catch((err) => {
      showError("Couldn't evaluate f(x): " + (err.message || err));
      setStatus(false, err.message || String(err));
    }).then(() => {
      if (submitBtn) submitBtn.textContent = prev;
      if (CAS.mode() === "sync") {
        setStatus(false, "Running without a Web Worker (opened over file://?) — serve over http:// to restore the safety timeout.");
      }
    });
  });

  Engine.attachMathKeypad(pdeFx, document.getElementById("fxKeypad"));
  Engine.attachKeypadToggle(document.getElementById("keypadToggle"), document.getElementById("fxKeypad"));
  const debounced = Engine.debounce(() => { updatePreview(); updateStartCheck(); }, 220);
  [pdeFx, pdeL, pdeK, pdeN, pdeT].forEach((el) => el.addEventListener("input", debounced));
  updatePreview();
  updateStartCheck();

  // ---- Numerical schemes vs. the analytic solution (Phase 5c) ----
  const schemeSelect = document.getElementById("schemeSelect");
  const schemeR = document.getElementById("schemeR");
  const schemeSteps = document.getElementById("schemeSteps");
  const schemeStatus = document.getElementById("schemeStatus"), schemeStatusText = document.getElementById("schemeStatusText");

  document.getElementById("runSchemeBtn").addEventListener("click", () => {
    const L = parseFloat(pdeL.value), k = parseFloat(pdeK.value);
    if (!(L > 0) || !(k > 0) || !pdeFx.value.trim()) {
      schemeStatus.className = "status-line bad";
      schemeStatusText.textContent = "Set a valid length, diffusivity, and initial profile above first.";
      return;
    }
    const r = parseFloat(schemeR.value), steps = parseInt(schemeSteps.value, 10);
    if (!(r > 0) || !(steps >= 1)) {
      schemeStatus.className = "status-line bad";
      schemeStatusText.textContent = "r must be positive and steps at least 1.";
      return;
    }

    let fFn;
    try { fFn = math.parse(pdeFx.value.trim()).compile(); } catch (e) {
      schemeStatus.className = "status-line bad";
      schemeStatusText.textContent = "Couldn't evaluate f(x): " + e.message;
      return;
    }

    const M = 20, h = L / M;
    const f0 = Array.from({ length: M + 1 }, (_, i) => fFn.evaluate({ x: i * h }));
    const dt = (r * h * h) / k;
    const tFinal = steps * dt;

    let out;
    try {
      out = schemeSelect.value === "explicit" ? ODESymbolic.heatFTCS(f0, r, steps)
        : schemeSelect.value === "implicit" ? ODESymbolic.heatBTCS(f0, r, steps)
        : ODESymbolic.heatCrankNicolson(f0, r, steps);
    } catch (e) {
      schemeStatus.className = "status-line bad";
      schemeStatusText.textContent = e.message || String(e);
      return;
    }

    const xs = Array.from({ length: M + 1 }, (_, i) => i * h);
    const N = 40; // matches solveHeatEquation's default term count closely enough for a comparison curve
    const bn = [];
    for (let n = 1; n <= N; n++) {
      const integrand = (x) => fFn.evaluate({ x }) * Math.sin((n * Math.PI * x) / L);
      bn.push((2 / L) * (function simpsonLocal(fn, a, b, nSub) { if (nSub % 2) nSub++; const hh = (b - a) / nSub; let s = fn(a) + fn(b); for (let i = 1; i < nSub; i++) s += (i % 2 ? 4 : 2) * fn(a + i * hh); return (hh / 3) * s; })(integrand, 0, L, 120));
    }
    const analyticYs = xs.map((x) => ODESymbolic.heatSeriesValue(bn, L, k, x, tFinal));

    const traces = [
      { x: xs, y: out.profile, mode: "lines+markers", name: schemeSelect.value, line: { color: "#ed6d40", width: 2.5 } },
      { x: xs, y: analyticYs, mode: "lines", name: "analytic (series)", line: { color: "#59a993", width: 2, dash: "dot" } },
    ];
    Plotly.react("schemePlot", traces, Engine.plotlyBaseLayout({ xaxis: { title: "x" }, yaxis: { title: `u(x, t=${Engine.formatNum(tFinal, 3)})` }, legend: { orientation: "h", y: -0.2 } }), Engine.plotlyConfig);

    const stable = r <= 0.5;
    const maxVal = Math.max(...out.profile.map(Math.abs));
    schemeStatus.className = "status-line " + (schemeSelect.value !== "explicit" || stable || maxVal < 10 ? "ok" : "bad");
    schemeStatusText.textContent = `r = ${Engine.formatNum(r, 3)} (CFL limit for explicit: r ≤ 0.5, ${stable ? "stable" : "UNSTABLE"} regime) — max|u| = ${Engine.formatNum(maxVal, 4)}`;
  });
})();