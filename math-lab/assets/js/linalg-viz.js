/* Geometric views for the Linear Algebra Engine — no mathematics, drawing only.
   Linear algebra is the most geometric subject on the site and every page here was
   previously matrices and tables, so these are the pictures that make the numbers mean
   something: what a subspace looks like, what a transformation does to the unit circle,
   how singular values fall off.

   Two renderers, split by dimension:
     2-D  -> Plotly (scatter / bar / log axes)
     3-D  -> Scene3D (three.js), shared with the Calculus Engine

   The 3-D half used to be Plotly `scatter3d` + `surface`, which are only present in the full
   4.4 MB Plotly bundle. Moving it to Scene3D — already vendored and already used by five
   Calculus pages — lets every Linear Algebra page load `plotly-cartesian.min.js` (1.4 MB)
   instead. See docs/ARCHITECTURE_AUDIT.md §1.1.

   Vector convention follows vectors-in-space.js: a math vector [x, y, z] is handed to
   Scene3D's adders unchanged, so the component order matches the labelled axis arrows. */
(function (root) {
  "use strict";
  const Viz = {};

  const ACCENT = "#8570b3";      // engine accent
  const HOT = "#ed6d40";         // --infrared, for the highlighted object
  const MUTED = "#7d858c";
  const LIGHT = "#e7e7e7";

  // Scene3D takes numeric colours; Plotly takes CSS strings. One source of truth above.
  const hex = (s) => parseInt(s.slice(1), 16);

  /* ---- Scene3D lifecycle ----
     linalg-page.js rebuilds its output panels by wiping innerHTML, which drops the canvas but
     does NOT release the WebGL context or stop Scene3D's requestAnimationFrame loop. Browsers
     cap live WebGL contexts (~16), so a user re-running a solve a dozen times would exhaust
     them and every later plot would silently fail to draw. Every scene created here is tracked
     and released by Viz.disposeAll(), which the page calls before each rebuild. */
  const liveScenes = [];

  function scene3d(host) {
    if (typeof Scene3D === "undefined" || typeof THREE === "undefined") return null;
    let s;
    try { s = new Scene3D(host); } catch (e) { return null; }
    if (s.unavailable) return null;
    liveScenes.push(s);
    return s;
  }

  Viz.disposeAll = function () {
    while (liveScenes.length) {
      const s = liveScenes.pop();
      try { s.dispose(); } catch (e) { /* already torn down with the DOM */ }
    }
  };

  // Small HTML key so the 3-D views keep the labels the Plotly traces carried. Scene3D has no
  // text rendering (no FontLoader in the vendored bundle), so labels are DOM, as on the
  // Calculus 3D pages.
  function legend3d(host, entries) {
    if (!entries.length) return;
    const el = document.createElement("div");
    el.style.cssText = "position:absolute;top:10px;left:12px;font-family:var(--font-mono);" +
      "font-size:12px;color:#cfd6cf;background:rgba(20,24,24,.55);padding:6px 10px;" +
      "border-radius:4px;pointer-events:none;max-width:90%;";
    el.innerHTML = entries.map(([label, color]) =>
      `<span style="display:inline-block;width:12px;height:12px;border-radius:2px;` +
      `background:${color};margin-right:4px;vertical-align:middle"></span>${label}`).join(" &nbsp; ");
    host.style.position = "relative";
    host.appendChild(el);
  }

  // Symmetric box — frame() swaps y/z internally, so a symmetric box is orientation-safe.
  function frameCube(s, lim) {
    s.frame([[-lim, lim], [-lim, lim], [-lim, lim]]);
  }

  /* Scene3D's furniture is fixed: the grid spans ±5 and the axis arrows are 5 long. Plotly's
     3-D axes auto-ranged to the data instead, so a basis of unit-ish vectors that filled a
     Plotly scene renders as a speck inside Scene3D's grid. Everything drawn here is therefore
     scaled into that fixed frame — the largest component maps to FIT units.

     This is honest for these particular pictures: Scene3D draws no tick labels (the vendored
     three.js has no FontLoader), so there is no numeric scale on screen to contradict, and
     every 3-D view in this module is about *geometry* — a direction, a plane's orientation,
     whether a basis is orthogonal — not about magnitude. Magnitudes are always shown exactly
     in the matrix/vector tables beside the plot. */
  const FIT = 3.5;

  function fitScale(vecs) {
    const m = Math.max(1e-9, ...vecs.flat().map(Math.abs));
    return FIT / m;
  }
  const scaled = (v, k) => v.map((c) => c * k);

  function layout(overrides) {
    const base = (window.Engine && Engine.plotlyBaseLayout) ? Engine.plotlyBaseLayout({}) : {};
    return Object.assign({}, base, { showlegend: false, margin: { l: 40, r: 20, t: 20, b: 40 } }, overrides || {});
  }
  const config = (window.Engine && Engine.plotlyConfig) ? Engine.plotlyConfig : { displayModeBar: false, responsive: true };
  const has = () => typeof Plotly !== "undefined";

  // Arrow-like trace for a 2-D vector from the origin.
  function vector2(v, color, name, width) {
    return { x: [0, v[0]], y: [0, v[1]], mode: "lines+markers", name: name || "",
      line: { color, width: width || 3 }, marker: { color, size: [0, 8] }, hovertemplate: `${name || ""} (%{x:.3f}, %{y:.3f})<extra></extra>` };
  }
  // Draws a set of vectors in 2-D (Plotly) or 3-D (Scene3D). Returns false when it cannot
  // draw, which tells linalg-page.js's ui.plot to remove the empty panel rather than leave a
  // blank box.
  Viz.vectors = function (el, vecs, opts) {
    if (!el || !vecs || !vecs.length) return false;
    opts = opts || {};
    const dim = vecs[0].length;
    if (dim !== 2 && dim !== 3) return false;
    const colors = opts.colors || vecs.map((_, i) => (i === 0 ? ACCENT : [HOT, LIGHT, MUTED][i % 3]));
    const labels = opts.labels || vecs.map((_, i) => `v${i + 1}`);
    const lim = Math.max(1, ...vecs.flat().map(Math.abs)) * 1.25;

    if (dim === 3) {
      const s = scene3d(el);
      if (!s) return false;
      const k = fitScale(vecs);
      vecs.forEach((v, i) => s.addArrow(scaled(v, k), hex(colors[i])));
      frameCube(s, FIT);
      legend3d(el, vecs.map((_, i) => [labels[i], colors[i]]));
      return true;
    }

    if (!has()) return false;
    const traces = vecs.map((v, i) => vector2(v, colors[i], labels[i]));
    const ax = { range: [-lim, lim], zeroline: true, zerolinecolor: "rgba(255,255,255,.25)", gridcolor: "rgba(255,255,255,.07)" };
    Plotly.react(el, traces, layout({ xaxis: ax, yaxis: Object.assign({}, ax, { scaleanchor: "x" }) }), config);
    return true;
  };

  // A subspace: a line (1-D) or plane (2-D) through the origin, spanned by `basis`,
  // with the spanning vectors drawn on top. This is what "span" actually looks like.
  Viz.span = function (el, basis, opts) {
    if (!el) return false;
    opts = opts || {};
    const dim = basis.length ? basis[0].length : 0;
    if (dim !== 2 && dim !== 3) return false;
    const lim = Math.max(1, ...basis.flat().map(Math.abs)) * 1.6;

    if (dim === 3) {
      const s = scene3d(el);
      if (!s) return false;
      const k = fitScale(basis);
      const B = basis.map((v) => scaled(v, k));
      if (B.length === 1) {
        // A line through the origin: the span of one vector, drawn out to the frame edge in
        // both directions so it reads as an infinite line, not a segment.
        const v = B[0], t = (FIT * 1.3) / (Math.hypot(...v) || 1);
        s.addLine([[-v[0] * t, -v[1] * t, -v[2] * t], [v[0] * t, v[1] * t, v[2] * t]], hex(ACCENT), { opacity: 0.85 });
      } else if (B.length >= 2) {
        // The plane spanned by the first two basis vectors. Sweeping the raw parallelogram
        // u*a + w*b is mathematically right but often a terrible picture: for A = [[1,2,3],
        // [4,5,6],[7,8,9]] the column-space basis vectors sit about 5 degrees apart, so their
        // parallelogram is a sliver that reads as a line, not a plane. Gram-Schmidt gives an
        // orthonormal pair spanning the *same* plane, and sweeping a square over that shows
        // the plane itself — which is what the picture is for.
        const [a, b] = B;
        const na = Math.hypot(...a) || 1;
        const e1 = a.map((c) => c / na);
        const dot = b[0] * e1[0] + b[1] * e1[1] + b[2] * e1[2];
        const perp = b.map((c, i) => c - dot * e1[i]);
        const np = Math.hypot(...perp);
        const e2 = np > 1e-9 ? perp.map((c) => c / np) : null;
        if (e2) {
          const R = FIT * 1.15; // patch half-width, just past the basis arrows
          s.addParametricSurface(
            (u, w) => [R * (u * e1[0] + w * e2[0]), R * (u * e1[1] + w * e2[1]), R * (u * e1[2] + w * e2[2])],
            [-1, 1], [-1, 1], hex(ACCENT), { samples: 14, opacity: 0.45 }
          );
        }
      }
      B.forEach((v, i) => s.addArrow(v, hex(i === 0 ? HOT : LIGHT)));
      frameCube(s, FIT);
      legend3d(el, [[B.length === 1 ? "span (line)" : "span (plane)", ACCENT]]
        .concat(B.map((_, i) => [`b${i + 1}`, i === 0 ? HOT : LIGHT])));
      return true;
    }

    if (!has()) return false;
    const traces = [];
    if (basis.length === 1) {
      const v = basis[0], t = lim / (Math.hypot(...v) || 1);
      traces.push({ x: [-v[0] * t, v[0] * t], y: [-v[1] * t, v[1] * t], mode: "lines", line: { color: ACCENT, width: 2, dash: "dot" }, hoverinfo: "skip" });
    } else if (basis.length >= 2) {
      traces.push({ x: [-lim, lim, lim, -lim], y: [-lim, -lim, lim, lim], fill: "toself",
        fillcolor: "rgba(133,112,179,0.18)", line: { width: 0 }, mode: "none", hoverinfo: "skip" });
    }
    basis.forEach((v, i) => traces.push(vector2(v, i === 0 ? HOT : LIGHT, `b${i + 1}`)));
    const ax = { range: [-lim, lim], zeroline: true, zerolinecolor: "rgba(255,255,255,.25)", gridcolor: "rgba(255,255,255,.07)" };
    Plotly.react(el, traces, layout({ xaxis: ax, yaxis: Object.assign({}, ax, { scaleanchor: "x" }) }), config);
    return true;
  };

  // The unit circle and its image under a 2x2 matrix — an ellipse whose semi-axes are the
  // singular values, pointing along the columns of U. The clearest picture of what a
  // matrix does, and of what the SVD is telling you.
  Viz.unitCircleImage = function (el, A, opts) {
    if (!has() || !el || !A || A.length !== 2 || A[0].length !== 2) return false;
    opts = opts || {};
    const N = 160, cx = [], cy = [], ex = [], ey = [];
    for (let i = 0; i <= N; i++) {
      const th = (2 * Math.PI * i) / N, c = Math.cos(th), s = Math.sin(th);
      cx.push(c); cy.push(s);
      ex.push(A[0][0] * c + A[0][1] * s);
      ey.push(A[1][0] * c + A[1][1] * s);
    }
    const traces = [
      { x: cx, y: cy, mode: "lines", line: { color: MUTED, width: 1.5, dash: "dot" }, name: "unit circle", hoverinfo: "skip" },
      { x: ex, y: ey, mode: "lines", line: { color: ACCENT, width: 2.5 }, name: "image", hoverinfo: "skip" },
    ];
    // Semi-axes: sigma_i * u_i.
    if (opts.U && opts.S) {
      opts.S.forEach((sigma, k) => {
        if (!sigma) return;
        const u = [opts.U[0][k], opts.U[1][k]];
        traces.push({ x: [0, u[0] * sigma], y: [0, u[1] * sigma], mode: "lines+markers",
          line: { color: HOT, width: 3 }, marker: { color: HOT, size: [0, 8] },
          name: `σ${k + 1} = ${sigma.toFixed(3)}`,
          hovertemplate: `σ${k + 1} = ${sigma.toFixed(4)}<extra></extra>` });
      });
    }
    const lim = Math.max(1, ...ex.map(Math.abs), ...ey.map(Math.abs)) * 1.2;
    const ax = { range: [-lim, lim], zeroline: true, zerolinecolor: "rgba(255,255,255,.25)", gridcolor: "rgba(255,255,255,.07)" };
    Plotly.react(el, traces, layout({ xaxis: ax, yaxis: Object.assign({}, ax, { scaleanchor: "x" }) }), config);
    return true;
  };

  // Singular-value spectrum: how fast the matrix's "energy" falls off, which is what
  // decides whether a low-rank approximation will be any good.
  Viz.spectrum = function (el, values, opts) {
    if (!has() || !el || !values || !values.length) return false;
    opts = opts || {};
    const xs = values.map((_, i) => i + 1);
    Plotly.react(el, [{ x: xs, y: values, type: "bar",
      marker: { color: values.map((_, i) => (opts.keep !== undefined && i < opts.keep ? HOT : ACCENT)) },
      hovertemplate: `${opts.label || "σ"}%{x} = %{y:.6g}<extra></extra>` }],
      layout({ xaxis: { title: opts.xTitle || "index", dtick: 1, gridcolor: "rgba(255,255,255,.07)" },
               yaxis: { title: opts.yTitle || "value", gridcolor: "rgba(255,255,255,.07)" } }), config);
    return true;
  };

  // Convergence curves on a log axis — used by the iterative solvers.
  Viz.convergence = function (el, series, opts) {
    if (!has() || !el || !series || !series.length) return false;
    opts = opts || {};
    const colors = [ACCENT, HOT, LIGHT, MUTED];
    const traces = series.filter((s) => s.values && s.values.length).map((s, i) => ({
      x: s.values.map((_, k) => k + 1), y: s.values.map((v) => Math.max(v, 1e-18)),
      mode: "lines+markers", name: s.name,
      line: { color: colors[i % colors.length], width: 2.5 }, marker: { size: 4 },
      hovertemplate: `${s.name} step %{x}: %{y:.3e}<extra></extra>`,
    }));
    Plotly.react(el, traces, layout({ showlegend: true,
      legend: { font: { color: LIGHT, size: 11 }, bgcolor: "rgba(0,0,0,0)" },
      xaxis: { title: opts.xTitle || "iteration", gridcolor: "rgba(255,255,255,.07)" },
      yaxis: { title: opts.yTitle || "residual", type: "log", gridcolor: "rgba(255,255,255,.07)" } }), config);
    return true;
  };

  // A distribution evolving over time — used by Markov chains.
  Viz.evolution = function (el, history, opts) {
    if (!has() || !el || !history || !history.length) return false;
    opts = opts || {};
    const n = history[0].distribution.length;
    const colors = [ACCENT, HOT, LIGHT, MUTED, "#5c939f", "#c99a3c"];
    const traces = Array.from({ length: n }, (_, i) => ({
      x: history.map((h) => h.step), y: history.map((h) => h.distribution[i]),
      mode: "lines", name: (opts.labels && opts.labels[i]) || `state ${i + 1}`,
      line: { color: colors[i % colors.length], width: 2.5 },
      hovertemplate: `state ${i + 1} at step %{x}: %{y:.5f}<extra></extra>`,
    }));
    if (opts.steadyState) {
      opts.steadyState.forEach((v, i) => traces.push({
        x: [history[0].step, history[history.length - 1].step], y: [v, v], mode: "lines",
        line: { color: colors[i % colors.length], width: 1, dash: "dot" }, hoverinfo: "skip", showlegend: false }));
    }
    Plotly.react(el, traces, layout({ showlegend: true,
      legend: { font: { color: LIGHT, size: 11 }, bgcolor: "rgba(0,0,0,0)" },
      xaxis: { title: "step", gridcolor: "rgba(255,255,255,.07)" },
      yaxis: { title: "probability", range: [0, 1], gridcolor: "rgba(255,255,255,.07)" } }), config);
    return true;
  };

  root.LinAlgViz = Viz;
})(typeof self !== "undefined" ? self : this);
