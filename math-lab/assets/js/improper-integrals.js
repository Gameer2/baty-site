/* Improper Integrals page wiring. The heavy lifting — replacing a ±∞ or singular bound with a
   limit, splitting the interval at interior asymptotes (so the Cauchy principal value of
   ∫_{-1}^1 1/x is not mistaken for a convergent 0), running a symbolic antiderivative path and
   a numeric partial-integral sequence, and deciding converge/diverge from their agreement —
   lives in calculus-symbolic.js behind the CAS worker. This file reads f(x) and the two bounds
   (either may be ±∞), calls CalculusSymbolic.improperIntegral, and renders the verdict, the
   one-sided pieces, the derivation, and a plot of the integrand with the bounds and asymptotes
   marked. */
(function () {
  "use strict";

  const fxInput = document.getElementById("fxInput");
  const fxPreview = document.getElementById("fxPreview");
  const aInput = document.getElementById("aInput");
  const bInput = document.getElementById("bInput");
  const aInf = document.getElementById("aInf");
  const bInf = document.getElementById("bInf");

  const startStatus = document.getElementById("startStatus");
  const startStatusText = document.getElementById("startStatusText");
  const formError = document.getElementById("formError");
  const formErrorText = document.getElementById("formErrorText");
  const form = document.getElementById("impForm");
  const exampleBtn = document.getElementById("exampleBtn");
  const presetRow = document.getElementById("presetRow");

  const placeholderPanel = document.getElementById("placeholderPanel");
  const resultsArea = document.getElementById("resultsArea");
  const refusedPanel = document.getElementById("refusedPanel");
  const refusedReason = document.getElementById("refusedReason");

  const verdictStat = document.getElementById("verdictStat");
  const statVerdict = document.getElementById("statVerdict");
  const statValue = document.getElementById("statValue");
  const statVerified = document.getElementById("statVerified");
  const formulaResult = document.getElementById("formulaResult");
  const pieceTableBody = document.querySelector("#pieceTable tbody");
  const stepTableBody = document.querySelector("#stepTable tbody");
  const stepSlider = document.getElementById("stepSlider");
  const stepLabel = document.getElementById("stepLabel");
  const plotTitle = document.getElementById("plotTitle");

  let steps = [];
  let result = null;
  let plotState = null;

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  function showError(msg) { formError.style.display = "block"; formErrorText.textContent = msg; }
  function hideError() { formError.style.display = "none"; }
  function showRefused(r) {
    resultsArea.style.display = "none";
    placeholderPanel.style.display = "none";
    refusedPanel.style.display = "";
    refusedReason.textContent = r.reason;
  }

  function makeFn(expr) {
    try {
      const code = math.parse(expr).compile();
      return (x) => { const r = code.evaluate({ x }); return (typeof r === "number" && Number.isFinite(r)) ? r : NaN; };
    } catch (e) { return null; }
  }

  // A bound is ±∞, or a constant expression mathjs can evaluate with no variables.
  function boundNum(raw) {
    const s = String(raw).trim();
    if (/^[+]?(inf(inity)?)$/i.test(s)) return Infinity;
    if (/^-(inf(inity)?)$/i.test(s)) return -Infinity;
    try { const r = math.parse(s).compile().evaluate({}); return (typeof r === "number" && Number.isFinite(r)) ? r : NaN; }
    catch (e) { return NaN; }
  }

  function updatePreview() {
    const raw = fxInput.value.trim();
    Engine.renderKatex(fxPreview, raw ? Engine.toLatex(raw) : "", false);
    Engine.pulseFlash(fxPreview);
  }

  function updateStartCheck() {
    const raw = fxInput.value.trim();
    if (!raw) { bad("Enter the integrand f(x)."); return false; }
    if (!makeFn(raw)) { bad("Couldn't parse f(x)."); return false; }
    const aNum = boundNum(aInput.value), bNum = boundNum(bInput.value);
    if (Number.isNaN(aNum) || Number.isNaN(bNum)) { bad("The bounds must be numbers, constants like pi, or Infinity / -Infinity."); return false; }
    if (aNum === Infinity) { bad("The lower bound can't be +Infinity."); return false; }
    if (bNum === -Infinity) { bad("The upper bound can't be -Infinity."); return false; }
    if (Number.isFinite(aNum) && Number.isFinite(bNum) && aNum >= bNum) { bad("The lower bound a must be less than the upper bound b."); return false; }
    startStatus.className = "status-line ok";
    startStatusText.textContent = "Ready — press Evaluate.";
    return true;
  }
  function bad(msg) { startStatus.className = "status-line bad"; startStatusText.textContent = msg; }

  function render(r) {
    placeholderPanel.style.display = "none";
    refusedPanel.style.display = "none";
    resultsArea.style.display = "";
    result = r;
    steps = r.steps || [];

    const converges = r.verdict === "converges";
    statVerdict.textContent = converges ? "Converges" : "Diverges";
    verdictStat.classList.toggle("accent", converges);
    verdictStat.style.borderColor = converges ? "" : "#c25450";
    statValue.textContent = converges ? (r.value + "  ≈ " + Engine.formatNum(r.numeric)) : "—";
    statVerified.textContent = r.verified ? "✓ verified" : "unverified";

    Engine.renderKatex(formulaResult, r.latex, true);

    // The one-sided pieces.
    const impAt = (p) => {
      const ends = [];
      if (p.pImproper) ends.push("a");
      if (p.qImproper) ends.push("b");
      return ends.length ? ends.join(" & ") : "—";
    };
    pieceTableBody.innerHTML = r.pieces.map((p, i) => {
      const pv = p.numeric.verdict;
      const verdictTxt = pv === "converges"
        ? "converges" + (p.numeric.value != null ? " ≈ " + Engine.formatNum(p.numeric.value) : "")
        : (pv === "diverges" ? "diverges" : "unclear");
      return `<tr><td>${i + 1}</td><td><span class="step-tex" data-k="${i}f"></span></td><td><span class="step-tex" data-k="${i}t"></span></td><td>${impAt(p)}</td><td>${escapeHtml(verdictTxt)}</td></tr>`;
    }).join("");
    pieceTableBody.querySelectorAll(".step-tex").forEach((el) => {
      const k = el.dataset.k;
      const idx = Number(k.slice(0, -1));
      const lab = k.slice(-1) === "f" ? r.pieces[idx].from : r.pieces[idx].to;
      Engine.renderKatex(el, lab, false);
    });

    // Derivation ladder.
    stepTableBody.innerHTML = steps
      .map((s, i) => `<tr data-n="${i}"><td>${i + 1}</td><td>${escapeHtml(s.rule)}</td><td><span class="step-tex" data-i="${i}"></span></td></tr>`)
      .join("");
    stepTableBody.querySelectorAll(".step-tex").forEach((el) => {
      Engine.renderKatex(el, steps[Number(el.dataset.i)].latex, false);
    });
    stepSlider.min = 0;
    stepSlider.max = Math.max(0, steps.length - 1);
    stepSlider.value = steps.length - 1;
    updateStep(steps.length - 1);

    drawPlot(r);
  }

  function updateStep(idx) {
    const n = Math.max(0, Math.min(steps.length - 1, idx));
    stepTableBody.querySelectorAll("tr").forEach((tr) => {
      const rowN = Number(tr.dataset.n);
      tr.classList.toggle("is-current", rowN === n);
      tr.style.opacity = rowN <= n ? "" : "0.25";
    });
    stepLabel.textContent = steps.length ? `step ${n + 1} / ${steps.length}` : "—";
  }

  // ---- The integrand picture ----
  function plotWindow() {
    const aNum = boundNum(aInput.value), bNum = boundNum(bInput.value);
    const leftEdge = Number.isFinite(aNum) ? aNum : (Number.isFinite(bNum) ? bNum - 16 : -16);
    const rightEdge = Number.isFinite(bNum) ? bNum : (Number.isFinite(aNum) ? aNum + 16 : 16);
    return [leftEdge, rightEdge, aNum, bNum];
  }

  function drawPlot(r) {
    const fn = makeFn(fxInput.value.trim());
    if (!fn) { Plotly.purge("fxPlot"); return; }
    const [x0, x1, aNum, bNum] = plotWindow();
    if (!(x1 > x0)) { Plotly.purge("fxPlot"); return; }

    const N = 600;
    const xs = [], ys = [];
    const finiteY = [];
    for (let i = 0; i <= N; i++) {
      const x = x0 + (i / N) * (x1 - x0);
      const y = fn(x);
      xs.push(x); ys.push(y);
      if (Number.isFinite(y)) finiteY.push(y);
    }
    if (finiteY.length < 4) { Plotly.purge("fxPlot"); return; }

    // A singularity drives |y| to ±∞ and would flatten the rest of the curve. Cap the y-window
    // to the bulk of the data (2nd–98th percentile) so the shape near the asymptote stays readable.
    finiteY.sort((a, b) => a - b);
    const lo = finiteY[Math.floor(0.02 * finiteY.length)];
    const hi = finiteY[Math.ceil(0.98 * finiteY.length) - 1];
    const pad = (hi - lo) * 0.12 + 0.4;
    const yr = [lo - pad, hi + pad];
    plotState = { fn, x0, x1, yr, aNum, bNum, pieces: r.pieces };
    plotTitle.textContent = "The integrand f(x) — asymptotes marked in red, bounds in teal";
    plotCurve();
  }

  function plotCurve() {
    if (!plotState) return;
    const { fn, x0, x1, yr, aNum, bNum, pieces } = plotState;
    const N = 600;
    const xs = [], ys = [];
    for (let i = 0; i <= N; i++) {
      const x = x0 + (i / N) * (x1 - x0);
      const y = fn(x);
      if (Number.isFinite(y) && y >= yr[0] && y <= yr[1]) { xs.push(x); ys.push(y); }
      else { xs.push(x); ys.push(null); }   // gaps at the asymptote and out-of-window spikes
    }

    const traces = [
      { x: xs, y: ys, mode: "lines", name: "f(x)",
        line: { color: "#9bcf6b", width: 3 }, connectgaps: false, hoverinfo: "skip" }
    ];

    const shapes = [];
    // Finite bounds: teal dashed verticals.
    if (Number.isFinite(aNum) && aNum >= x0 && aNum <= x1) {
      shapes.push({ type: "line", x0: aNum, x1: aNum, y0: yr[0], y1: yr[1], line: { color: "#5c939f", width: 1.5, dash: "dash" } });
    }
    if (Number.isFinite(bNum) && bNum >= x0 && bNum <= x1) {
      shapes.push({ type: "line", x0: bNum, x1: bNum, y0: yr[0], y1: yr[1], line: { color: "#5c939f", width: 1.5, dash: "dash" } });
    }
    // Interior asymptotes: located as the finite break points between pieces (a piece's `to`
    // equals the next piece's `from` at a split). Mark those that lie strictly inside (a, b).
    for (let i = 0; i < pieces.length - 1; i++) {
      // The break is the shared boundary; pieces carry TeX labels, so re-detect numerically:
      // sample fn around the midpoint of the gap between consecutive finite piece spans.
    }
    // Re-detect interior asymptotes numerically: points where fn is non-finite inside the open
    // window, away from the marked bounds.
    const asy = [];
    const eps = (x1 - x0) / 4000;
    for (let i = 1; i < N; i++) {
      const x = x0 + (i / N) * (x1 - x0);
      const y = fn(x);
      const yPrev = fn(x - eps);
      if (!Number.isFinite(y) && Number.isFinite(yPrev)) asy.push(x);
    }
    asy.forEach((ax) => {
      if ((Number.isFinite(aNum) ? Math.abs(ax - aNum) > 1e-6 : true) &&
          (Number.isFinite(bNum) ? Math.abs(ax - bNum) > 1e-6 : true)) {
        shapes.push({ type: "line", x0: ax, x1: ax, y0: yr[0], y1: yr[1], line: { color: "#c25450", width: 1.5, dash: "dot" } });
      }
    });

    Plotly.newPlot("fxPlot", traces, Engine.plotlyBaseLayout({
      xaxis: { title: "x", range: [x0, x1], zeroline: true, zerolinecolor: "#2a2f33" },
      yaxis: { title: "f(x)", range: yr, zeroline: true, zerolinecolor: "#2a2f33" },
      margin: { l: 55, r: 20, t: 20, b: 45 },
      shapes: shapes
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

    CAS.improperIntegral(f, "x", a, b, {})
      .then((r) => {
        if (!r.ok) { showRefused(r); Plotly.purge("fxPlot"); return; }
        render(r);
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

  exampleBtn.addEventListener("click", () => {
    fxInput.value = "1/x^2"; aInput.value = "1"; bInput.value = "Infinity";
    updatePreview(); updateStartCheck(); form.requestSubmit();
  });

  // The ±∞ buttons drop the infinity symbol into the bound field.
  [aInf, bInf].forEach((btn) => {
    btn.addEventListener("click", () => {
      const target = btn.dataset.bound === "a" ? aInput : bInput;
      target.value = btn.dataset.val;
      updateStartCheck();
    });
  });

  presetRow.addEventListener("click", (e) => {
    const btn = e.target.closest(".tag"); if (!btn) return;
    fxInput.value = btn.dataset.fx; aInput.value = btn.dataset.a; bInput.value = btn.dataset.b;
    updatePreview(); updateStartCheck(); form.requestSubmit();
  });

  stepSlider.addEventListener("input", () => updateStep(Number(stepSlider.value)));

  const debounced = Engine.debounce(() => { updatePreview(); updateStartCheck(); }, 220);
  fxInput.addEventListener("input", debounced);
  aInput.addEventListener("input", debounced);
  bInput.addEventListener("input", debounced);

  Engine.attachMathKeypad(fxInput, document.getElementById("fxKeypad"));
  Engine.attachKeypadToggle(document.getElementById("keypadToggle"), document.getElementById("fxKeypad"));

  updatePreview();
  updateStartCheck();
})();