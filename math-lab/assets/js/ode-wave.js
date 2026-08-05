/* Wave Equation page wiring — Phase 5a of the ODE/PDE redesign. Calls CAS.solveWaveEquation
   (-> ODESymbolic.solveWaveEquation: separation of variables -> Dirichlet eigenvalue problem ->
   Fourier sine coefficients via Simpson's rule for BOTH the position and velocity initial
   conditions), then independently reconstructs d'Alembert's traveling-wave form from the same
   f(x)/g(x) and verifies the two agree at a quorum of sample points before rendering anything
   — two independent derivations of the same answer, cross-checked, same discipline as every
   other numeric verification on this site. */
(function () {
  "use strict";

  const form = document.getElementById("pdeForm");
  const pdeL = document.getElementById("pdeL"), pdeC = document.getElementById("pdeC");
  const pdeFx = document.getElementById("pdeFx"), pdeGx = document.getElementById("pdeGx");
  const pdeN = document.getElementById("pdeN"), pdeT = document.getElementById("pdeT");
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

  const SAMPLE_POINTS = [[0.2, 0.3], [0.5, 0.6], [0.7, 1.1], [0.35, 1.7], [0.6, 2.3]];

  function crossCheck(box, f, g) {
    const Fext = ODESymbolic.oddPeriodicExtension(f, box.L);
    const Gext = ODESymbolic.oddPeriodicExtension(g, box.L);
    let usable = 0;
    for (const [x, t] of SAMPLE_POINTS) {
      if (t > box.T * 3) continue; // stay in a sensible time range
      let series, dalembert;
      try {
        series = ODESymbolic.waveSeriesValue(box.An, box.Bn, box.L, box.c, x, t);
        dalembert = ODESymbolic.dAlembertValue(Fext, Gext, box.c, x, t);
      } catch (e) { continue; }
      if (![series, dalembert].every(Number.isFinite)) continue;
      usable++;
      if (Math.abs(series - dalembert) > 5e-2 * Math.max(1, Math.abs(dalembert))) return false;
    }
    return usable >= 3;
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    hideError();
    const L = parseFloat(pdeL.value), c = parseFloat(pdeC.value);
    const N = parseInt(pdeN.value, 10), T = parseFloat(pdeT.value);
    if (!(L > 0)) { setStatus(false, "Length L must be positive."); return; }
    if (!(c > 0)) { setStatus(false, "Wave speed c must be positive."); return; }
    if (!(N >= 1)) { setStatus(false, "Terms N must be at least 1."); return; }
    if (!(T > 0)) { setStatus(false, "Max time T must be positive."); return; }
    if (!pdeFx.value.trim()) { setStatus(false, "Enter an initial position f(x)."); return; }

    const submitBtn = form.querySelector('button[type="submit"] .btn-text');
    if (submitBtn) submitBtn.textContent = "Solving…";

    CAS.solveWaveEquation({ L, c, fxExpr: pdeFx.value.trim(), gxExpr: pdeGx.value.trim() || "0", N, T }).then((box) => {
      let fFn, gFn;
      try {
        fFn = math.parse(pdeFx.value.trim()).compile();
        gFn = math.parse(pdeGx.value.trim() || "0").compile();
      } catch (e) {
        showError("Couldn't evaluate f(x) or g(x): " + e.message);
        setStatus(false, e.message);
        return;
      }
      const f = (x) => fFn.evaluate({ x }), g = (x) => gFn.evaluate({ x });

      if (!crossCheck(box, f, g)) {
        showError("The standing-wave series and d'Alembert's form did not agree — refusing to show an unconfirmed result.");
        setStatus(false, "Verification failed.");
        return;
      }

      placeholderPanel.style.display = "none";
      resultsArea.style.display = "";
      ODERender.bigBox(resultsArea, box);
      plotsWrap.style.display = "";

      const u = (x, t) => ODESymbolic.waveSeriesValue(box.An, box.Bn, box.L, box.c, x, t);
      const NX = 60, NT = 50;
      const xs = Array.from({ length: NX }, (_, i) => (i / (NX - 1)) * L);
      const ts = Array.from({ length: NT }, (_, i) => (i / (NT - 1)) * T);
      const z = ts.map((t) => xs.map((x) => u(x, t)));
      Plotly.newPlot("wavePlot", [{
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

      setStatus(true, "Solved — standing-wave and d'Alembert forms agree.");
    }).catch((err) => {
      showError(err.message || String(err));
      setStatus(false, err.message || String(err));
    }).then(() => {
      if (submitBtn) submitBtn.textContent = "Solve";
    });
  });

  function updatePreviews() {
    Engine.renderKatex(document.getElementById("fxPreview"), pdeFx.value.trim() ? `f(x) = ${Engine.toLatex(pdeFx.value)}` : "", false);
    Engine.renderKatex(document.getElementById("gxPreview"), pdeGx.value.trim() ? `g(x) = ${Engine.toLatex(pdeGx.value)}` : "", false);
  }

  document.querySelectorAll("#presetRow .tag").forEach((btn) => {
    btn.addEventListener("click", () => {
      pdeFx.value = btn.dataset.fx;
      pdeGx.value = btn.dataset.gx;
      updatePreviews();
    });
  });

  Engine.attachMathKeypad(pdeFx, document.getElementById("fxKeypad"));
  Engine.attachKeypadToggle(document.getElementById("keypadToggle"), document.getElementById("fxKeypad"));
  Engine.attachMathKeypad(pdeGx, document.getElementById("gxKeypad"));
  const debounced = Engine.debounce(updatePreviews, 220);
  [pdeFx, pdeGx, pdeL, pdeC, pdeN, pdeT].forEach((el) => el.addEventListener("input", debounced));
  updatePreviews();
})();