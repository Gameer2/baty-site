(function () {
  "use strict";

  const dataInput = document.getElementById("dataInput");
  const formError = document.getElementById("formError");
  const formErrorText = document.getElementById("formErrorText");
  const statusLine = document.getElementById("statusLine");
  const statusText = document.getElementById("statusText");
  const form = document.getElementById("regressionForm");
  const exampleBtn = document.getElementById("exampleBtn");
  const noisyBtn = document.getElementById("noisyBtn");

  const placeholderPanel = document.getElementById("placeholderPanel");
  const resultsArea = document.getElementById("resultsArea");
  const statR2 = document.getElementById("statR2");
  const statAdjR2 = document.getElementById("statAdjR2");
  const statS = document.getElementById("statS");
  const statP = document.getElementById("statP");
  const statN = document.getElementById("statN");
  const dfNote = document.getElementById("dfNote");
  const formulaRegression = document.getElementById("formulaRegression");
  const coefBody = document.getElementById("coefBody");
  const plotTitle = document.getElementById("plotTitle");

  const STORE_KEY = "engine-lab:statistics:multipleregression";
  let shownOnce = false;

  /* ---- 3-D rendering (two predictors) ----
     The p = 2 view — data cloud plus fitted plane — used to be Plotly `scatter3d` + `surface`,
     which live only in the full 4.4 MB Plotly bundle. Drawing it with Scene3D (three.js,
     already vendored and shared with the Calculus and Linear Algebra engines) lets this page
     load `plotly-cartesian.min.js` instead. See docs/ARCHITECTURE_AUDIT.md §1.1.

     Two things this view needs that the Linear Algebra migration did not:

     1. PER-AXIS normalisation. Scene3D's grid and axes are fixed at ±5, and regression data has
        no reason to be near that — x1 might be 0..100 while y is 0..1e6, and the three axes
        carry different units entirely. A single uniform scale (which is right for vectors,
        where relative length is the point) would flatten this to a line. Each axis is therefore
        mapped independently onto [-FIT, FIT], exactly as Plotly's auto-ranged 3-D axes did.
     2. Mode switching. One container serves p=1 and p>=3 (Plotly 2-D) as well as p=2 (Scene3D),
        and render() re-runs on every debounced keystroke. Handing a Plotly-owned div to
        Scene3D — or the reverse — leaves a canvas with the wrong context type, so each path
        tears the other down first, and the scene is reused across re-renders rather than
        rebuilt (a fresh WebGLRenderer per keystroke would exhaust the browser's context cap
        within seconds). */
  const FIT = 3.5;
  let scene = null;

  function disposeScene() {
    if (scene) { try { scene.dispose(); } catch (e) { /* already gone with the DOM */ } scene = null; }
  }

  /* Hand the container to Plotly, tearing down any live 3-D scene first.

     Plotly.purge is required, not optional: Plotly keeps internal state (_fullLayout and
     friends) attached to the element, so clearing innerHTML behind its back leaves it
     believing the plot is still mounted — the next Plotly.react then reconciles against a DOM
     that no longer exists and renders nothing at all. That is exactly what happened switching
     p=1 -> p=3 (both Plotly paths) before this call was added. */
  function plotlyHost(el) {
    disposeScene();
    if (typeof Plotly !== "undefined") { try { Plotly.purge(el); } catch (e) { /* never was a plot */ } }
    el.innerHTML = "";   // also clears a leftover Scene3D canvas + legend
    return el;
  }

  // Hand the container to Scene3D, purging any Plotly plot first. Reuses the existing scene.
  function sceneHost(el) {
    if (scene) { scene.clear(); return scene; }
    if (typeof Scene3D === "undefined" || typeof THREE === "undefined") return null;
    if (typeof Plotly !== "undefined") { try { Plotly.purge(el); } catch (e) { /* wasn't a plot */ } }
    el.innerHTML = "";
    let s;
    try { s = new Scene3D(el); } catch (e) { return null; }
    if (s.unavailable) { scene = null; return null; }
    // Scene3D's default orbit (theta +45 degrees) looks straight down the edge of a typical
    // regression plane, which reads as a line rather than a surface. The Plotly version set a
    // deliberate three-quarter camera (eye 1.6, -1.6, 0.9); converting that to Scene3D's
    // spherical parameters gives theta = -45 degrees, phi ~ 68 degrees. Set once, at creation,
    // so a re-render triggered by typing does not yank the view back from wherever the user
    // has orbited to.
    s.orbit.theta = -Math.PI * 0.25;
    s.orbit.phi = 1.19;
    scene = s;
    return s;
  }

  // Maps a data range onto [-FIT, FIT]; a degenerate range (all values equal) centres at 0.
  function axisMap(lo, hi) {
    const span = hi - lo;
    if (!Number.isFinite(span) || Math.abs(span) < 1e-12) return () => 0;
    return (v) => (2 * FIT * (v - lo)) / span - FIT;
  }

  /* The legend is a DOM sibling of the canvas, so Scene3D.clear() — which only removes objects
     from the three.js scene graph — does not touch it. This host is persistent (unlike the
     Linear Algebra pages, which build a fresh plot div per render), so without an explicit
     sweep every re-render stacks another legend on top of the last: 16 of them after 16
     keystroke-triggered renders, observed. */
  function legend3d(el, entries) {
    el.querySelectorAll("[data-viz-legend]").forEach((n) => n.remove());
    const d = document.createElement("div");
    d.setAttribute("data-viz-legend", "");
    d.style.cssText = "position:absolute;top:10px;left:12px;font-family:var(--font-mono);" +
      "font-size:12px;color:#cfd6cf;background:rgba(20,24,24,.55);padding:6px 10px;" +
      "border-radius:4px;pointer-events:none;max-width:92%;line-height:1.7;";
    d.innerHTML = entries.map(([label, color]) =>
      `<span style="display:inline-block;width:12px;height:12px;border-radius:2px;` +
      `background:${color};margin-right:4px;vertical-align:middle"></span>${label}`).join(" &nbsp; ");
    el.style.position = "relative";
    el.appendChild(d);
  }

  const EXAMPLE_PLANE = "0, 0, 2\n1, 0, 5\n0, 1, 1\n1, 1, 4\n2, 1, 7\n3, 2, 9";
  const EXAMPLE_NOISY = "1, 2, 5\n2, 1, 6\n3, 2, 8\n4, 5, 11\n5, 3, 12\n6, 7, 14\n7, 4, 16\n8, 6, 18";

  // Parse a pasted textarea of observations (one per line) into a number[][].
  // Each row is [x1, x2, ..., xp, y]. Columns split on commas or whitespace.
  function parseRows(raw) {
    const rows = [];
    raw.split(/\n/).forEach((line) => {
      const nums = line.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean).map(Number);
      if (nums.length >= 2 && nums.every((n) => !Number.isNaN(n) && Number.isFinite(n))) rows.push(nums);
    });
    return rows;
  }

  function showError(msg) {
    formError.style.display = "block";
    formErrorText.textContent = msg;
  }
  function clearError() { formError.style.display = "none"; }

  // Build the LaTeX fitted-equation string from the coefficient vector.
  function equationLatex(beta) {
    const termNames = ["\\beta_0"].concat(
      beta.slice(1).map((_, i) => `\\beta_{${i + 1}} x_{${i + 1}}`)
    );
    const parts = [`\\hat{y} = ${Engine.formatNum(beta[0], 4)}`];
    for (let j = 1; j < beta.length; j++) {
      const b = beta[j];
      const sign = b >= 0 ? "+" : "-";
      parts.push(` ${sign} ${Engine.formatNum(Math.abs(b), 4)} x_{${j}}`);
    }
    return parts.join("");
  }

  function renderCoefTable(result) {
    coefBody.innerHTML = "";
    const termLabels = ["Intercept"].concat(
      result.coefficients.slice(1).map((_, i) => `x${i + 1}`)
    );
    result.coefficients.forEach((b, j) => {
      const tr = document.createElement("tr");
      tr.style.borderBottom = "1px solid rgba(255,255,255,.06)";
      const fmtT = Number.isFinite(result.tStats[j]) ? Engine.formatNum(result.tStats[j], 3) : "∞";
      const fmtP = result.pValues[j] === 0 ? "0" : Engine.formatNum(result.pValues[j], 4);
      tr.innerHTML =
        `<td style="padding:6px 10px;">${termLabels[j]}</td>` +
        `<td style="padding:6px 10px;text-align:right;">${Engine.formatNum(b, 4)}</td>` +
        `<td style="padding:6px 10px;text-align:right;">${Engine.formatNum(result.coefSE[j], 4)}</td>` +
        `<td style="padding:6px 10px;text-align:right;">${fmtT}</td>` +
        `<td style="padding:6px 10px;text-align:right;">${fmtP}</td>`;
      coefBody.appendChild(tr);
    });
  }

  function renderPlot(rows, result) {
    const p = result.p;
    const y = rows.map((r) => r[r.length - 1]);

    if (p === 2) {
      // 3-D scatter + fitted plane surface.
      plotTitle.textContent = "3-D scatter & fitted plane";
      const x1 = rows.map((r) => r[0]);
      const x2 = rows.map((r) => r[1]);
      const x1Min = Math.min(...x1), x1Max = Math.max(...x1);
      const x2Min = Math.min(...x2), x2Max = Math.max(...x2);
      const pad1 = (x1Max - x1Min) * 0.1 || 1;
      const pad2 = (x2Max - x2Min) * 0.1 || 1;
      const nGrid = 20;
      const el = document.getElementById("regressionPlot");
      const s = sceneHost(el);
      if (!s) {
        // No WebGL / no three.js — say so rather than leaving an empty box.
        plotlyHost(el).innerHTML =
          '<p class="p1" style="padding:1.5rem;color:var(--off-white)">3D rendering is unavailable here.</p>';
        return;
      }

      // Plane bounds (padded) and the y-range spanned by BOTH the data and the fitted plane,
      // so neither is clipped by the other.
      const x1Lo = x1Min - pad1, x1Hi = x1Max + pad1;
      const x2Lo = x2Min - pad2, x2Hi = x2Max + pad2;
      const planeAt = (a, b) => result.coefficients[0] + result.coefficients[1] * a + result.coefficients[2] * b;
      const corners = [planeAt(x1Lo, x2Lo), planeAt(x1Lo, x2Hi), planeAt(x1Hi, x2Lo), planeAt(x1Hi, x2Hi)];
      const yLo = Math.min(...y, ...corners), yHi = Math.max(...y, ...corners);

      const mx1 = axisMap(x1Lo, x1Hi), mx2 = axisMap(x2Lo, x2Hi), my = axisMap(yLo, yHi);

      // The fitted plane. addSurface's callback works in the plotted (normalised) domain and
      // returns the height, so denormalise -> evaluate the fit -> renormalise.
      const denorm = (u, lo, hi) => lo + ((u + FIT) / (2 * FIT)) * (hi - lo);
      s.addSurface(
        (u, w) => my(planeAt(denorm(u, x1Lo, x1Hi), denorm(w, x2Lo, x2Hi))),
        [-FIT, FIT], [-FIT, FIT], 0xed6d40, { samples: nGrid }
      );

      // The observations. addSurface maps (domain-x, domain-y, height) -> three (x, height, y),
      // so a point at (x1, x2, y) goes to three coords (mx1, my, mx2) to sit on the same frame.
      for (let i = 0; i < y.length; i++) {
        s.addPoint([mx1(x1[i]), my(y[i]), mx2(x2[i])], 0xc99a3c, 0.13);
      }

      s.frame([[-FIT, FIT], [-FIT, FIT], [-FIT, FIT]]);
      legend3d(el, [
        ["observations", "#c99a3c"],
        ["fitted plane", "#ed6d40"],
        ["x₁ →", "#ed6d40"], ["y ↑", "#9bcf6b"], ["x₂ ↗", "#5c939f"]
      ]);
    } else if (p === 1) {
      // 2-D scatter + fit line (degenerate plane).
      plotTitle.textContent = "Scatter & fit line";
      const xs = rows.map((r) => r[0]);
      const xMin = Math.min(...xs), xMax = Math.max(...xs);
      const pad = (xMax - xMin) * 0.1 || 1;
      const lineXs = [xMin - pad, xMax + pad];
      const lineYs = lineXs.map((x) => result.coefficients[0] + result.coefficients[1] * x);
      Plotly.react(plotlyHost(document.getElementById("regressionPlot")), [
        { x: xs, y: y, mode: "markers", name: "data", marker: { color: "#c99a3c", size: 9 } },
        { x: lineXs, y: lineYs, mode: "lines", name: "fit", line: { color: "#ed6d40", width: 2.5 } }
      ], Engine.plotlyBaseLayout({ showlegend: false, xaxis: { title: "x1" }, yaxis: { title: "y" } }), Engine.plotlyConfig);
    } else {
      // p >= 3: fitted-vs-actual scatter with y=x reference line.
      plotTitle.textContent = "Fitted vs actual";
      const lo = Math.min(...y, ...result.fitted);
      const hi = Math.max(...y, ...result.fitted);
      Plotly.react(plotlyHost(document.getElementById("regressionPlot")), [
        { x: result.fitted, y: y, mode: "markers", name: "observations", marker: { color: "#c99a3c", size: 7 } },
        { x: [lo, hi], y: [lo, hi], mode: "lines", name: "y = x", line: { color: "#ed6d40", width: 2, dash: "dash" } }
      ], Engine.plotlyBaseLayout({ showlegend: false, xaxis: { title: "fitted ŷ" }, yaxis: { title: "actual y" } }), Engine.plotlyConfig);
    }
  }

  function render() {
    const rows = parseRows(dataInput.value);
    if (rows.length < 2) {
      showError("Enter at least two observations, one per line.");
      statusLine.className = "status-line";
      statusText.textContent = "Enter at least p + 2 observations, then compute.";
      return;
    }
    clearError();

    let result;
    try { result = StatsAlgorithms.runMultipleRegression(rows); }
    catch (err) { return showError(err.message); }

    placeholderPanel.style.display = "none";
    resultsArea.style.display = "block";
    shownOnce = true;

    statR2.textContent = Engine.formatNum(result.r2, 4);
    statAdjR2.textContent = Engine.formatNum(result.adjR2, 4);
    statS.textContent = Engine.formatNum(result.s, 4);
    statP.textContent = String(result.p);
    statN.textContent = String(result.n);
    dfNote.textContent = String(result.df);

    Engine.renderKatex(formulaRegression, equationLatex(result.coefficients), true);
    renderCoefTable(result);
    renderPlot(rows, result);

    statusLine.className = "status-line ok";
    statusText.textContent = `Fit through ${result.n} observations with ${result.p} predictor${result.p === 1 ? "" : "s"} — R² = ${Engine.formatNum(result.r2, 4)}, df = ${result.df}.`;

    Proto.saveState(STORE_KEY, snapshot());
  }

  function snapshot() { return { data: dataInput.value }; }

  const debouncedRender = Engine.debounce(() => { if (shownOnce) render(); }, 200);
  dataInput.addEventListener("input", debouncedRender);

  exampleBtn.addEventListener("click", () => {
    dataInput.value = EXAMPLE_PLANE;
    render();
  });

  noisyBtn.addEventListener("click", () => {
    dataInput.value = EXAMPLE_NOISY;
    render();
  });

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    render();
  });

  const saved = Proto.loadState(STORE_KEY);
  if (saved && saved.data !== undefined) dataInput.value = saved.data;
})();