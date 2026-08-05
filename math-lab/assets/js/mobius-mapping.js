/* Conformal & Möbius Mappings page wiring — Complex Analysis Engine.

   Reads the four complex coefficients a,b,c,d and calls Mobius.classify (assets/js/mobius.js, the
   pure Complex-arithmetic core), which returns the fixed points, pole, multiplier, geometric
   classification, and a re-substitution verification. Then draws an orthogonal grid in the
   z-plane next to its image in the w-plane so the conformality (angle preservation) is visible.
   Answer-only, like the rest of the engine's post-redesign pages: a classification, the geometry,
   and a picture — never a derivation. No symbolic backend on this page; Möbius is closed-form. */
(function () {
  "use strict";

  const form = document.getElementById("mobiusForm");
  const formError = document.getElementById("formError");
  const formErrorText = document.getElementById("formErrorText");
  const startStatus = document.getElementById("startStatus");
  const startStatusText = document.getElementById("startStatusText");
  const wPreview = document.getElementById("wPreview");
  const placeholderPanel = document.getElementById("placeholderPanel");
  const resultsArea = document.getElementById("resultsArea");
  const refusedPanel = document.getElementById("refusedPanel");
  const refusedReason = document.getElementById("refusedReason");
  const statKind = document.getElementById("statKind");
  const statK = document.getElementById("statK");
  const statVerified = document.getElementById("statVerified");
  const resultBlock = document.getElementById("resultBlock");
  const ids = ["aRe", "aIm", "bRe", "bIm", "cRe", "cIm", "dRe", "dIm"];

  function showError(msg) { formError.style.display = "block"; formErrorText.textContent = msg; }
  function hideError() { formError.style.display = "none"; }
  function setStatus(ok, msg) {
    startStatus.className = "status-line " + (ok ? "ok" : "bad");
    startStatusText.textContent = msg;
  }

  function val(id) { return parseFloat(document.getElementById(id).value); }
  function coeff(reId, imId) { return { re: val(reId), im: val(imId) }; }

  // Format a complex coefficient for KaTeX, parenthesizing only when it has an imaginary part.
  function coeffTex(z) {
    const re = Math.abs(z.re) < 1e-9 ? 0 : z.re;
    const im = Math.abs(z.im) < 1e-9 ? 0 : z.im;
    if (im === 0) return String(re);
    if (re === 0) return (im === 1 ? "i" : im === -1 ? "-i" : im + "i");
    const s = im > 0 ? "+" : "-";
    const mag = Math.abs(im) === 1 ? "" : String(Math.abs(im));
    return "\\left(" + re + s + mag + "i\\right)";
  }

  function updatePreview() {
    const a = coeff("aRe", "aIm"), b = coeff("bRe", "bIm"), c = coeff("cRe", "cIm"), d = coeff("dRe", "dIm");
    const tex = "\\displaystyle w(z)=\\frac{" + coeffTex(a) + "\\,z+" + coeffTex(b) + "}{" + coeffTex(c) + "\\,z+" + coeffTex(d) + "}";
    Engine.renderKatex(wPreview, tex, false);
    Engine.pulseFlash(wPreview);
  }

  document.querySelectorAll("#exampleChips .chip").forEach((btn) => {
    btn.addEventListener("click", () => {
      const parse = (s) => s.split(",").map(Number);
      const [are, aim] = parse(btn.dataset.a); const [bre, bim] = parse(btn.dataset.b);
      const [cre, cim] = parse(btn.dataset.c); const [dre, dim] = parse(btn.dataset.d);
      const map = { aRe: are, aIm: aim, bRe: bre, bIm: bim, cRe: cre, cIm: cim, dRe: dre, dIm: dim };
      ids.forEach((id) => { document.getElementById(id).value = map[id]; });
      updatePreview();
      form.requestSubmit();
    });
  });

  function esc(s) { return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
  function row(label, value) { return '<tr><td>' + esc(label) + '</td><td class="mono">' + esc(value) + "</td></tr>"; }

  function renderGeometry(r, a, b, c, d) {
    const tbody = document.querySelector("#geomTable tbody");
    const T = { a, b, c, d };
    let html = "";
    if (r.classification === "identity") {
      html += row("fixed points", "every point (identity)");
    } else {
      if (r.fixed.points.length) {
        r.fixed.points.forEach((p, i) => { html += row("fixed point " + (i + 1), Mobius.fmt(p)); });
      } else {
        html += row("fixed point", "∞ (none finite)");
      }
      if (r.fixed.infinityFixed && r.classification !== "identity") html += row("fixed point", "∞");
    }
    html += row("pole (maps to ∞)", r.pole === null ? "none — affine (∞ maps to ∞)" : Mobius.fmt(r.pole));
    html += row("w(0)", Mobius.fmt(Mobius.apply(T, { re: 0, im: 0 })));
    html += row("w(1)", Mobius.fmt(Mobius.apply(T, { re: 1, im: 0 })));
    html += row("w(∞)", (c.re === 0 && c.im === 0) ? "∞" : Mobius.fmt(Complex.div(a, c)));
    html += row("multiplier k", r.k ? Mobius.fmt(r.k) : "—");
    tbody.innerHTML = html;
  }

  // Build the z-plane grid and its w-plane image as Plotly line traces. Vertical grid lines are
  // purple, horizontal ones green — the same colors in both plots so a line and its image match.
  const GRID = 3, EXTENT = 5, N = 80, CAP = 60, VERT = "#b45fd0", HORZ = "#59a993";
  function gridTraces(T) {
    const coords = [];
    for (let i = -GRID; i <= GRID; i++) coords.push(i);
    const domain = [], image = [];
    function addLine(zOf, label, color) {
      const dx = [], dy = [], ix = [], iy = [];
      for (let k = 0; k <= N; k++) {
        const t = -EXTENT + (2 * EXTENT * k) / N;
        const z = zOf(t);
        dx.push(z.re); dy.push(z.im);
        const w = Mobius.apply(T, z);
        if (w === null || !Number.isFinite(w.re) || !Number.isFinite(w.im) || Math.hypot(w.re, w.im) > CAP) {
          ix.push(NaN); iy.push(NaN); // break the curve at the pole / at infinity
        } else {
          ix.push(w.re); iy.push(w.im);
        }
      }
      const base = { mode: "lines", line: { color, width: 1.6 }, showlegend: false, name: label };
      domain.push(Object.assign({}, base, { x: dx, y: dy }));
      image.push(Object.assign({}, base, { x: ix, y: iy }));
    }
    for (const x0 of coords) addLine((t) => ({ re: x0, im: t }), "x=" + x0, VERT);          // verticals
    for (const y0 of coords) addLine((t) => ({ re: t, im: y0 }), "y=" + y0, HORZ);          // horizontals
    return { domain, image };
  }

  function drawGrids(T) {
    const { domain, image } = gridTraces(T);
    const base = (title) => Engine.plotlyBaseLayout({
      title: { text: title, font: { size: 13 } },
      xaxis: { title: "Re", scaleanchor: "y", zeroline: true, zerolinecolor: "#333", gridcolor: "#222" },
      yaxis: { title: "Im", zeroline: true, zerolinecolor: "#333", gridcolor: "#222" },
      margin: { l: 48, r: 16, t: 30, b: 36 },
    });
    Plotly.newPlot("domainPlot", domain, base("z-plane (domain)"), Engine.plotlyConfig);
    Plotly.newPlot("imagePlot", image, base("w-plane (image)"), Engine.plotlyConfig);
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    hideError();
    refusedPanel.style.display = "none";
    resultsArea.style.display = "none";
    const a = coeff("aRe", "aIm"), b = coeff("bRe", "bIm"), c = coeff("cRe", "cIm"), d = coeff("dRe", "dIm");
    for (const id of ids) {
      if (!Number.isFinite(val(id))) { setStatus(false, "All eight coefficient parts must be numeric."); return; }
    }

    const r = Mobius.classify(a, b, c, d);
    placeholderPanel.style.display = "none";
    if (!r.ok) {
      refusedPanel.style.display = "";
      refusedReason.textContent = r.reason;
      setStatus(false, "Not a valid Möbius transformation.");
      return;
    }
    resultsArea.style.display = "";

    statKind.textContent = r.classification.charAt(0).toUpperCase() + r.classification.slice(1);
    statK.textContent = r.k ? Engine.formatNum(Math.hypot(r.k.re, r.k.im), 4) : "—";
    statVerified.textContent = r.verified ? "✓ verified" : "unverified";

    const tex = "\\displaystyle w(z)=\\frac{" + coeffTex(a) + "\\,z+" + coeffTex(b) + "}{" + coeffTex(c) + "\\,z+" + coeffTex(d) + "}";
    Engine.renderKatex(resultBlock, tex, true);
    Engine.pulseFlash(resultBlock);

    renderGeometry(r, a, b, c, d);
    drawGrids({ a, b, c, d });
    setStatus(true, "Solved — " + r.classification + ". Fixed points re-checked by substitution.");
  });

  // Live preview as the coefficients change; no auto-solve (the grid solve is the explicit step).
  ids.forEach((id) => {
    document.getElementById(id).addEventListener("input", Engine.debounce(updatePreview, 200));
  });
  updatePreview();
})();