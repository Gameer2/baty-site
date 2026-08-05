/* Complex Trigonometric & Hyperbolic Functions — page wiring.
   Deliberately numeric, same division of labour as complex-functions.js and domain-coloring.js:
   math.js's native complex sin/cos/tan/sinh/cosh/tanh (and their reciprocals) are correct and
   fast per-pixel, no CAS needed for entire/meromorphic functions with no branch to choose.
   The signature visual is the growth comparison: |f(x)| along the real axis stays bounded for
   sin/cos while |f(iy)| along the imaginary axis grows exponentially — the concrete picture of
   "sin z is unbounded". */
(function () {
  "use strict";

  const fnSelect = document.getElementById("fnSelect");
  const fzPreview = document.getElementById("fzPreview");
  const rangeInput = document.getElementById("rangeInput");
  const form = document.getElementById("trigForm");

  const placeholderPanel = document.getElementById("placeholderPanel");
  const resultsArea = document.getElementById("resultsArea");
  const canvas = document.getElementById("domainCanvas");
  const legendCanvas = document.getElementById("legendCanvas");
  const probeBox = document.getElementById("probeBox");
  const probeZ = document.getElementById("probeZ");
  const probeFz = document.getElementById("probeFz");
  const probeAbs = document.getElementById("probeAbs");
  const probeIdentity1 = document.getElementById("probeIdentity1");
  const probeIdentity2 = document.getElementById("probeIdentity2");
  const renderTime = document.getElementById("renderTime");

  const CANVAS_SIZE = 380;
  let bounds = null;

  // LaTeX macro per function — sech/csch/coth have no KaTeX built-in, so \operatorname{}.
  const LATEX = {
    sin: "\\sin", cos: "\\cos", tan: "\\tan", sec: "\\sec", csc: "\\csc", cot: "\\cot",
    sinh: "\\sinh", cosh: "\\cosh", tanh: "\\tanh",
    sech: "\\operatorname{sech}", csch: "\\operatorname{csch}", coth: "\\operatorname{coth}",
  };

  function updatePreview() {
    const fn = fnSelect.value;
    Engine.renderKatex(fzPreview, `f(z) = ${LATEX[fn]}(z)`, false);
    Engine.pulseFlash(fzPreview);
  }

  function makeEvalFn(fn) {
    const code = math.parse(`${fn}(z)`).compile();
    return (re, im) => {
      const w = code.evaluate({ z: math.complex(re, im) });
      if (typeof w === "number") return { re: w, im: 0 };
      return { re: w.re, im: w.im };
    };
  }

  const identity1Code = math.parse("sin(z)^2+cos(z)^2").compile(); // = 1 everywhere in ℂ
  const identity2Code = math.parse("cosh(z)^2-sinh(z)^2").compile(); // = 1 everywhere in ℂ

  function updateProbe(re, im, evalFn) {
    probeBox.style.display = "block";
    probeZ.textContent = Complex.format({ re, im }, 4);

    let w;
    try { w = evalFn(re, im); } catch (err) { w = null; }
    if (!w || !Number.isFinite(w.re) || !Number.isFinite(w.im)) {
      probeFz.textContent = "undefined here";
      probeAbs.textContent = "—";
    } else {
      probeFz.textContent = Complex.format(w, 4);
      probeAbs.textContent = Number(Complex.abs(w).toFixed(4)).toString();
    }

    try {
      const i1 = identity1Code.evaluate({ z: math.complex(re, im) });
      probeIdentity1.textContent = Complex.format({ re: i1.re, im: i1.im }, 6);
    } catch (e) { probeIdentity1.textContent = "—"; }
    try {
      const i2 = identity2Code.evaluate({ z: math.complex(re, im) });
      probeIdentity2.textContent = Complex.format({ re: i2.re, im: i2.im }, 6);
    } catch (e) { probeIdentity2.textContent = "—"; }
  }

  function drawGrowthPlot(evalFn, range) {
    const N = 240;
    const xs = [], realAbs = [], imagAbs = [];
    for (let i = 0; i < N; i++) {
      const t = -range + (2 * range * i) / (N - 1);
      xs.push(t);
      let wr = null, wi = null;
      try { wr = evalFn(t, 0); } catch (e) { /* pole */ }
      try { wi = evalFn(0, t); } catch (e) { /* pole */ }
      realAbs.push(wr && Number.isFinite(wr.re) && Number.isFinite(wr.im) ? Complex.abs(wr) : null);
      imagAbs.push(wi && Number.isFinite(wi.re) && Number.isFinite(wi.im) ? Complex.abs(wi) : null);
    }

    const traceReal = { x: xs, y: realAbs, mode: "lines", type: "scatter", name: "|f(x)|, real axis", line: { color: "#5c939f", width: 2.5 }, connectgaps: false };
    const traceImag = { x: xs, y: imagAbs, mode: "lines", type: "scatter", name: "|f(iy)|, imaginary axis", line: { color: "#ed6d40", width: 2.5 }, connectgaps: false };

    const layout = Engine.plotlyBaseLayout({
      xaxis: { title: "distance along the axis (x or y)" },
      yaxis: { title: "|f|" },
      showlegend: false,
    });
    Plotly.newPlot("growthPlot", [traceReal, traceImag], layout, Engine.plotlyConfig);
  }

  function compute() {
    const fn = fnSelect.value;
    const evalFn = makeEvalFn(fn);

    const range = parseFloat(rangeInput.value);
    bounds = { xmin: -range, xmax: range, ymin: -range, ymax: range };

    placeholderPanel.style.display = "none";
    resultsArea.style.display = "block";

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const size = Math.round(CANVAS_SIZE * dpr);
    canvas.width = size; canvas.height = size;
    canvas.style.width = CANVAS_SIZE + "px"; canvas.style.height = CANVAS_SIZE + "px";
    const ctx = canvas.getContext("2d");

    const t0 = performance.now();
    DomainColoring.render(ctx, evalFn, bounds, { mode: "modulus" });
    const elapsed = performance.now() - t0;
    renderTime.textContent = `${size}×${size} px in ${elapsed.toFixed(0)} ms`;

    drawLegend();
    drawGrowthPlot(evalFn, range);
    updateProbe(1, 1, evalFn);

    canvas.onclick = (e) => {
      const rect = canvas.getBoundingClientRect();
      const px = ((e.clientX - rect.left) / rect.width) * canvas.width;
      const py = ((e.clientY - rect.top) / rect.height) * canvas.height;
      const re = bounds.xmin + ((bounds.xmax - bounds.xmin) * px) / (canvas.width - 1);
      const im = bounds.ymax - ((bounds.ymax - bounds.ymin) * py) / (canvas.height - 1);
      updateProbe(re, im, evalFn);
    };
  }

  function drawLegend() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const size = Math.round(120 * dpr);
    legendCanvas.width = size; legendCanvas.height = size;
    legendCanvas.style.width = "120px"; legendCanvas.style.height = "120px";
    const ctx = legendCanvas.getContext("2d");
    DomainColoring.renderLegend(ctx, size / 2, size / 2, size / 2 - 2 * dpr);
  }

  form.addEventListener("submit", (e) => { e.preventDefault(); compute(); });
  fnSelect.addEventListener("change", () => { updatePreview(); compute(); });

  updatePreview();
  compute();
})();
