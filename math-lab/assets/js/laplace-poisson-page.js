/* Laplace's and Poisson's Equations page wiring — Phase 5b of the ODE/PDE redesign. Both
   sections are pure JS, synchronous — no CAS worker, no SymPy worker needed. Laplace is
   cross-checked two independent ways (sinh-series vs relaxation); Poisson is verified by its
   discrete residual. */
(function () {
  "use strict";

  const M = 20;
  const SAMPLE_FRACS = [[0.3, 0.3], [0.5, 0.5], [0.7, 0.2], [0.2, 0.7]];

  document.querySelectorAll("#sectionTabs .tag").forEach((tab) => {
    tab.addEventListener("click", () => {
      document.querySelectorAll("#sectionTabs .tag").forEach((t) => t.classList.remove("is-active"));
      tab.classList.add("is-active");
      document.getElementById("laplaceSection").style.display = tab.dataset.section === "laplace" ? "" : "none";
      document.getElementById("poissonSection").style.display = tab.dataset.section === "poisson" ? "" : "none";
    });
  });

  function compile(exprText) {
    try { return { ok: true, fn: math.parse(exprText || "0").compile() }; }
    catch (e) { return { ok: false, error: e.message || String(e) }; }
  }

  function plotHeatmap(divId, a, b, hx, hy, valueAt) {
    const NX = 40, NY = 40;
    const xs = Array.from({ length: NX }, (_, i) => (i / (NX - 1)) * a);
    const ys = Array.from({ length: NY }, (_, i) => (i / (NY - 1)) * b);
    const z = ys.map((y) => xs.map((x) => valueAt(x, y)));
    Plotly.newPlot(divId, [{ x: xs, y: ys, z, type: "heatmap", colorscale: [[0, "#090909"], [0.5, "#4f8fc0"], [1, "#e7e7e7"]] }],
      Engine.plotlyBaseLayout({ xaxis: { title: "x" }, yaxis: { title: "y" }, margin: { l: 55, r: 20, t: 20, b: 45 } }),
      Engine.plotlyConfig);
  }

  // ---- Laplace ----
  document.getElementById("laplaceForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const a = parseFloat(document.getElementById("laplaceA").value);
    const b = parseFloat(document.getElementById("laplaceB").value);
    const N = parseInt(document.getElementById("laplaceN").value, 10);
    const statusEl = document.getElementById("laplaceStatus"), statusText = document.getElementById("laplaceStatusText");
    const errEl = document.getElementById("laplaceError"), errText = document.getElementById("laplaceErrorText");
    errEl.style.display = "none";
    if (!(a > 0) || !(b > 0) || !(N >= 1)) { statusEl.className = "status-line bad"; statusText.textContent = "a, b must be positive and N at least 1."; return; }

    const edgeSpecs = {
      bottom: document.getElementById("bottomExpr").value.trim(),
      top: document.getElementById("topExpr").value.trim(),
      left: document.getElementById("leftExpr").value.trim(),
      right: document.getElementById("rightExpr").value.trim(),
    };
    const compiled = {};
    for (const [edge, text] of Object.entries(edgeSpecs)) {
      const c = compile(text);
      if (!c.ok) { statusEl.className = "status-line bad"; statusText.textContent = `Couldn't parse the ${edge} edge: ${c.error}`; return; }
      compiled[edge] = c.fn;
    }

    function simpson(fn, lo, hi, n) {
      if (n % 2) n++;
      const h = (hi - lo) / n;
      let s = fn(lo) + fn(hi);
      for (let i = 1; i < n; i++) s += (i % 2 ? 4 : 2) * fn(lo + i * h);
      return (h / 3) * s;
    }

    const edges = {};
    for (const edge of ["bottom", "top", "left", "right"]) {
      const text = edgeSpecs[edge];
      if (!text || text === "0") { edges[edge] = null; continue; }
      const along = edge === "left" || edge === "right" ? "y" : "x";
      const fn = (s) => compiled[edge].evaluate({ [along]: s });
      const coeffs = PoissonEngine.laplaceEdgeCoeffs({ a, b, edge, fFn: fn, N, simpsonIntegrate: simpson });
      edges[edge] = { coeffs };
    }

    function boundaryFn(x, y) {
      if (Math.abs(y) < 1e-9) return compiled.bottom.evaluate({ x });
      if (Math.abs(y - b) < 1e-9) return compiled.top.evaluate({ x });
      if (Math.abs(x) < 1e-9) return compiled.left.evaluate({ y });
      if (Math.abs(x - a) < 1e-9) return compiled.right.evaluate({ y });
      return 0;
    }
    const { A, b: rhs, hx, hy } = PoissonEngine.buildGridSystem({ a, b, M, boundaryFn, sourceFn: () => 0 });
    const { U: flat, converged } = PoissonEngine.solveGrid(A, rhs, "jacobi");
    if (!converged) { statusEl.className = "status-line bad"; statusText.textContent = "The relaxation solve did not converge — try fewer terms or a different boundary function."; return; }

    let usable = 0, agree = true;
    for (const [fx, fy] of SAMPLE_FRACS) {
      const x = fx * a, y = fy * b;
      const i = Math.round(x / hx), j = Math.round(y / hy);
      if (i < 1 || i > M - 1 || j < 1 || j > M - 1) continue;
      const series = PoissonEngine.laplaceSeriesValue(edges, a, b, x, y);
      const relax = flat[PoissonEngine.flatIndex(i, j, M)];
      if (![series, relax].every(Number.isFinite)) continue;
      usable++;
      if (Math.abs(series - relax) > 5e-2 * Math.max(1, Math.abs(relax))) { agree = false; break; }
    }
    if (!agree || usable < 3) {
      errEl.style.display = "block";
      errText.textContent = "The sinh-series and relaxation solutions did not agree — refusing to show an unconfirmed result.";
      statusEl.className = "status-line bad"; statusText.textContent = "Verification failed.";
      return;
    }

    document.getElementById("laplacePlaceholder").style.display = "none";
    document.getElementById("laplaceResultsArea").style.display = "";
    document.getElementById("laplacePlotWrap").style.display = "";
    ODERender.bigBox(document.getElementById("laplaceResultsArea"), {
      classificationLine: "Elliptic PDE (Laplace's equation), Dirichlet boundary conditions — sinh-series, cross-checked against relaxation.",
      generalSolution: "u(x,y) = \\sum_n c_n \\sin\\frac{n\\pi\\xi}{\\ell}\\sinh\\frac{n\\pi\\eta}{\\ell} \\text{ (one term per nonzero edge)}",
      particularSolution: null,
    });
    plotHeatmap("laplacePlot", a, b, hx, hy, (x, y) => PoissonEngine.laplaceSeriesValue(edges, a, b, x, y));
    statusEl.className = "status-line ok"; statusText.textContent = "Solved — sinh-series and relaxation agree.";
  });

  // ---- Poisson ----
  document.getElementById("poissonForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const a = parseFloat(document.getElementById("poissonA").value);
    const b = parseFloat(document.getElementById("poissonB").value);
    const statusEl = document.getElementById("poissonStatus"), statusText = document.getElementById("poissonStatusText");
    const errEl = document.getElementById("poissonError"), errText = document.getElementById("poissonErrorText");
    errEl.style.display = "none";
    if (!(a > 0) || !(b > 0)) { statusEl.className = "status-line bad"; statusText.textContent = "a, b must be positive."; return; }

    const sourceText = document.getElementById("sourceExpr").value.trim();
    const compiled = compile(sourceText);
    if (!compiled.ok) { statusEl.className = "status-line bad"; statusText.textContent = "Couldn't parse f(x,y): " + compiled.error; return; }
    const sourceFn = (x, y) => compiled.fn.evaluate({ x, y });

    const { A, b: rhs, hx, hy } = PoissonEngine.buildGridSystem({ a, b, M, boundaryFn: () => 0, sourceFn });
    const { U: flat, converged } = PoissonEngine.solveGrid(A, rhs, "jacobi");
    if (!converged) { statusEl.className = "status-line bad"; statusText.textContent = "The relaxation solve did not converge."; return; }

    const grid = Array.from({ length: M + 1 }, () => new Array(M + 1).fill(0));
    for (let i = 1; i <= M - 1; i++) for (let j = 1; j <= M - 1; j++) grid[i][j] = flat[PoissonEngine.flatIndex(i, j, M)];

    if (!PoissonEngine.gridResidual(grid, M, hx, hy, sourceFn)) {
      errEl.style.display = "block";
      errText.textContent = "The relaxed solution did not satisfy the discrete Poisson equation — refusing to show an unconfirmed result.";
      statusEl.className = "status-line bad"; statusText.textContent = "Verification failed.";
      return;
    }

    document.getElementById("poissonPlaceholder").style.display = "none";
    document.getElementById("poissonResultsArea").style.display = "";
    document.getElementById("poissonPlotWrap").style.display = "";
    ODERender.bigBox(document.getElementById("poissonResultsArea"), {
      classificationLine: "Elliptic PDE (Poisson's equation), zero Dirichlet boundary — solved by relaxation, verified against the discrete equation.",
      // "\times" is a math-mode command -- invalid (renders as literal red error text) inside a
      // \text{} block, which is why this uses the literal Unicode "×" character instead.
      generalSolution: "u_{xx} + u_{yy} = f(x,y) \\text{ (solved numerically on a " + M + "×" + M + " grid)}",
      particularSolution: null,
    });
    plotHeatmap("poissonPlot", a, b, hx, hy, (x, y) => {
      const i = Math.round(x / hx), j = Math.round(y / hy);
      return (i >= 1 && i <= M - 1 && j >= 1 && j <= M - 1) ? grid[i][j] : 0;
    });
    statusEl.className = "status-line ok"; statusText.textContent = "Solved — verified against the discrete equation.";
  });
})();