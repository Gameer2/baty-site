(function () {
  "use strict";

  const pxInput = document.getElementById("pxInput");
  const qxInput = document.getElementById("qxInput");
  const rxInput = document.getElementById("rxInput");
  const pxPreview = document.getElementById("pxPreview");
  const qxPreview = document.getElementById("qxPreview");
  const rxPreview = document.getElementById("rxPreview");
  const aInput = document.getElementById("aInput");
  const bInput = document.getElementById("bInput");
  const alphaInput = document.getElementById("alphaInput");
  const betaInput = document.getElementById("betaInput");
  const nInput = document.getElementById("nInput");
  const startStatus = document.getElementById("startStatus");
  const startStatusText = document.getElementById("startStatusText");
  const formError = document.getElementById("formError");
  const formErrorText = document.getElementById("formErrorText");
  const form = document.getElementById("shootingForm");
  const exampleBtn = document.getElementById("exampleBtn");

  const placeholderPanel = document.getElementById("placeholderPanel");
  const resultsArea = document.getElementById("resultsArea");
  const statYbCheck = document.getElementById("statYbCheck");
  const statC = document.getElementById("statC");
  const statSteps = document.getElementById("statSteps");
  const statH = document.getElementById("statH");
  const formulaBlock = document.getElementById("formulaBlock");
  const iterTableBody = document.querySelector("#iterTable tbody");
  const stepSlider = document.getElementById("stepSlider");
  const stepLabel = document.getElementById("stepLabel");

  let state = null; // { path, a, alpha, b, beta }
  const TRACE = { y1: 0, y2: 1, combined: 2, markers: 3, current: 4 };

  function updatePreview() {
    Engine.renderKatex(pxPreview, `p(x) = ${Engine.toLatex(pxInput.value)}`, false);
    Engine.pulseFlash(pxPreview);
    Engine.renderKatex(qxPreview, `q(x) = ${Engine.toLatex(qxInput.value)}`, false);
    Engine.pulseFlash(qxPreview);
    Engine.renderKatex(rxPreview, `r(x) = ${Engine.toLatex(rxInput.value)}`, false);
    Engine.pulseFlash(rxPreview);
  }

  function updateStartCheck() {
    const cp = Engine.compileFx(pxInput.value);
    const cq = Engine.compileFx(qxInput.value);
    const cr = Engine.compileFx(rxInput.value);
    if (!cp.ok || !cq.ok || !cr.ok) {
      startStatus.className = "status-line bad";
      startStatusText.textContent = !cp.ok ? `p(x): ${cp.error}`
        : !cq.ok ? `q(x): ${cq.error}`
        : `r(x): ${cr.error}`;
      return null;
    }
    const a = parseFloat(aInput.value);
    const b = parseFloat(bInput.value);
    const alpha = parseFloat(alphaInput.value);
    const beta = parseFloat(betaInput.value);
    const n = parseInt(nInput.value, 10);
    if ([a, b, alpha, beta].some(Number.isNaN)) {
      startStatus.className = "status-line bad";
      startStatusText.textContent = "Enter numeric values for a, b, y(a) and y(b).";
      return null;
    }
    if (a === b) {
      startStatus.className = "status-line bad";
      startStatusText.textContent = "a and b must be distinct endpoints.";
      return null;
    }
    if (!Number.isInteger(n) || n < 1) {
      startStatus.className = "status-line bad";
      startStatusText.textContent = "n (steps) must be a positive integer.";
      return null;
    }
    try {
      const pa = cp.fn(a), qa = cq.fn(a), ra = cr.fn(a);
      startStatus.className = "status-line ok";
      startStatusText.textContent = `p(a)=${Engine.formatNum(pa,4)}, q(a)=${Engine.formatNum(qa,4)}, r(a)=${Engine.formatNum(ra,4)}`;
      return { cp, cq, cr };
    } catch {
      startStatus.className = "status-line bad";
      startStatusText.textContent = "Could not evaluate p, q, or r at x = a.";
      return null;
    }
  }

  const debouncedUpdate = Engine.debounce(() => {
    updatePreview();
    updateStartCheck();
  }, 200);

  [pxInput, qxInput, rxInput, aInput, bInput, alphaInput, betaInput, nInput].forEach((el) =>
    el.addEventListener("input", debouncedUpdate)
  );

  exampleBtn.addEventListener("click", () => {
    pxInput.value = "0";
    qxInput.value = "-1";
    rxInput.value = "0";
    aInput.value = "0";
    bInput.value = "1.5707963267948966";
    alphaInput.value = "0";
    betaInput.value = "1";
    nInput.value = "200";
    updatePreview();
    updateStartCheck();
  });

  function showError(msg) {
    formError.style.display = "block";
    formErrorText.textContent = msg;
  }
  function clearError() {
    formError.style.display = "none";
  }

  function render(result, a, alpha, b, beta) {
    placeholderPanel.style.display = "none";
    resultsArea.style.display = "block";

    const path = result.path;
    const last = path[path.length - 1];
    statYbCheck.textContent = Engine.formatNum(last.y, 8);
    statC.textContent = Engine.formatNum(result.c, 8);
    statSteps.textContent = String(path.length - 1);
    statH.textContent = Engine.formatNum(result.h, 8);

    Engine.renderKatex(
      formulaBlock,
      "c = \\dfrac{\\beta - y_1(b)}{y_2(b)}, \\quad y(x) = y_1(x) + c\\,y_2(x)",
      true
    );

    iterTableBody.innerHTML = path
      .map(
        (row, i) => `<tr data-n="${i}">
          <td>${i}</td>
          <td>${Engine.formatNum(row.x, 6)}</td>
          <td>${Engine.formatNum(row.y1, 6)}</td>
          <td>${Engine.formatNum(row.y2, 6)}</td>
          <td>${Engine.formatNum(row.y, 6)}</td>
        </tr>`
      )
      .join("");

    const xs = path.map((p) => p.x);
    const y1s = path.map((p) => p.y1);
    const y2s = path.map((p) => p.y2);
    const ys = path.map((p) => p.y);

    const y1Trace = { x: xs, y: y1s, mode: "lines", type: "scatter", name: "y₁(x) particular", line: { color: "#5c939f", width: 2, dash: "dash" } };
    const y2Trace = { x: xs, y: y2s, mode: "lines", type: "scatter", name: "y₂(x) homogeneous", line: { color: "#7d858c", width: 2, dash: "dash" } };
    const combinedTrace = { x: xs, y: ys, mode: "lines", type: "scatter", name: "y(x) combined", line: { color: "#ed6d40", width: 3 } };
    const markersTrace = {
      x: [a, b], y: [alpha, beta], mode: "markers", type: "scatter", name: "BCs",
      marker: { size: 10, color: "#e7e7e7", symbol: "circle", line: { width: 2, color: "#ed6d40" } },
    };
    const currentTrace = {
      x: [a], y: [alpha], mode: "markers", type: "scatter", name: "current step",
      marker: { size: 13, color: "#ed6d40", symbol: "circle-open", line: { width: 2, color: "#ed6d40" } },
    };

    Plotly.newPlot(
      "fxPlot",
      [y1Trace, y2Trace, combinedTrace, markersTrace, currentTrace],
      Engine.plotlyBaseLayout({ xaxis: { title: "x" }, yaxis: { title: "y" } }),
      Engine.plotlyConfig
    );

    stepSlider.min = 0;
    stepSlider.max = path.length - 1;
    stepSlider.value = 0;
    state = { path, a, alpha, b, beta };
    updateStep(0);
  }

  function updateStep(idx) {
    if (!state) return;
    const row = state.path[idx];
    stepLabel.textContent = `step ${idx} / ${state.path.length - 1}`;
    document.querySelectorAll("#iterTable tbody tr").forEach((tr) => {
      tr.classList.toggle("is-current", Number(tr.dataset.n) === idx);
    });
    const rowEl = document.querySelector(`#iterTable tbody tr[data-n="${idx}"]`);
    if (rowEl) rowEl.scrollIntoView({ block: "nearest" });

    Plotly.restyle(
      "fxPlot",
      { x: [[row.x]], y: [[row.y]] },
      [TRACE.current]
    );
  }

  stepSlider.addEventListener("input", (e) => updateStep(Number(e.target.value)));

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    clearError();

    const cp = Engine.compileFx(pxInput.value);
    if (!cp.ok) return showError(`Invalid p(x): ${cp.error}`);
    const cq = Engine.compileFx(qxInput.value);
    if (!cq.ok) return showError(`Invalid q(x): ${cq.error}`);
    const cr = Engine.compileFx(rxInput.value);
    if (!cr.ok) return showError(`Invalid r(x): ${cr.error}`);

    const a = parseFloat(aInput.value);
    const b = parseFloat(bInput.value);
    const alpha = parseFloat(alphaInput.value);
    const beta = parseFloat(betaInput.value);
    const n = parseInt(nInput.value, 10);

    if ([a, b, alpha, beta].some(Number.isNaN)) return showError("a, b, y(a), y(b) must all be numbers.");
    if (a === b) return showError("a and b must be distinct endpoints.");
    if (!Number.isInteger(n) || n < 1) return showError("n (steps) must be a positive integer.");

    let result;
    try {
      result = Algorithms.runShooting(cp.fn, cq.fn, cr.fn, a, b, alpha, beta, n);
    } catch (err) {
      return showError(err.message);
    }

    render(result, a, alpha, b, beta);
  });

  Engine.attachMathKeypad(pxInput, document.getElementById("pxKeypad"));
  Engine.attachKeypadToggle(document.getElementById("pxKeypadToggle"), document.getElementById("pxKeypad"));
  Engine.attachMathKeypad(qxInput, document.getElementById("qxKeypad"));
  Engine.attachKeypadToggle(document.getElementById("qxKeypadToggle"), document.getElementById("qxKeypad"));
  Engine.attachMathKeypad(rxInput, document.getElementById("rxKeypad"));
  Engine.attachKeypadToggle(document.getElementById("rxKeypadToggle"), document.getElementById("rxKeypad"));

  updatePreview();
  updateStartCheck();
})();