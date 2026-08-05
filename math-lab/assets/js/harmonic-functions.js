/* Harmonic Functions & Conjugates — page wiring.
   Symbolic work (the harmonic check, the u_x-integrate / isolate-phi'(x) / integrate-back
   recipe for v, the finite-difference cross-check) lives in complex-symbolic.js and runs in
   the CAS worker via CAS.harmonicConjugate. This file reads u(x, y) and a base point, calls
   it, renders the exact v and the derivation, and draws the signature visual: the level
   curves of u and v overlaid — by Cauchy-Riemann they always cross at right angles, which is
   a more direct visual proof of the conjugate relationship than domain colouring alone. */
(function () {
  "use strict";

  const uInput = document.getElementById("uInput");
  const uPreview = document.getElementById("uPreview");
  const x0Input = document.getElementById("x0Input");
  const y0Input = document.getElementById("y0Input");
  const rangeInput = document.getElementById("rangeInput");
  const form = document.getElementById("hfForm");
  const exampleChips = document.getElementById("exampleChips");
  const startStatus = document.getElementById("startStatus");
  const startStatusText = document.getElementById("startStatusText");
  const formError = document.getElementById("formError");
  const formErrorText = document.getElementById("formErrorText");

  const placeholderPanel = document.getElementById("placeholderPanel");
  const resultsArea = document.getElementById("resultsArea");
  const verdictStatus = document.getElementById("verdictStatus");
  const verdictText = document.getElementById("verdictText");
  const statU = document.getElementById("statU");
  const statV = document.getElementById("statV");
  const statLaplacian = document.getElementById("statLaplacian");
  const stepTableBody = document.querySelector("#stepTable tbody");
  const stepSlider = document.getElementById("stepSlider");
  const stepLabel = document.getElementById("stepLabel");

  let state = null;

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  function setStatus(el, textEl, cls, msg) {
    el.className = "status-line " + cls;
    textEl.textContent = msg;
  }

  function updatePreview() {
    const raw = uInput.value.trim();
    if (!raw) { uPreview.textContent = "Enter an expression in x and y."; uPreview.classList.add("preview-invalid"); return; }
    uPreview.classList.remove("preview-invalid");
    try {
      const tex = math.parse(raw).toTex({ parenthesis: "auto" });
      Engine.renderKatex(uPreview, `u(x,y) = ${tex}`, false);
      Engine.pulseFlash(uPreview);
    } catch (err) {
      uPreview.textContent = "Not a valid expression yet — check parentheses and operators.";
      uPreview.classList.add("preview-invalid");
    }
  }

  function updateStartCheck() {
    const raw = uInput.value.trim();
    if (!raw) { setStatus(startStatus, startStatusText, "bad", "Enter u(x, y)."); return false; }
    try {
      const code = math.parse(raw).compile();
      code.evaluate({ x: 1, y: 1 });
    } catch (e) {
      const msg = (e && e.message) || String(e);
      if (/undefined symbol/i.test(msg) || /syntax|unexpected|expected/i.test(msg)) {
        setStatus(startStatus, startStatusText, "bad", "u(x, y) doesn't parse: " + msg);
        return false;
      }
      // otherwise just undefined at the smoke-test point — not a reason to block
    }
    for (const inp of [x0Input, y0Input]) {
      if (!/^-?\d+(\.\d+)?$/.test(inp.value.trim())) {
        setStatus(startStatus, startStatusText, "bad", "The base point coordinates must be plain numbers.");
        return false;
      }
    }
    setStatus(startStatus, startStatusText, "ok", "Ready — press Find the conjugate.");
    return true;
  }

  function showError(msg) {
    resultsArea.style.display = "none";
    placeholderPanel.style.display = "";
    formError.style.display = "block";
    formErrorText.textContent = msg;
  }

  function render(result) {
    placeholderPanel.style.display = "none";
    resultsArea.style.display = "";
    formError.style.display = "none";
    state = { steps: result.steps };

    setStatus(verdictStatus, verdictText, result.verified ? "ok" : "bad",
      result.verified
        ? "Harmonic — the conjugate below is exact and verified against an independent finite-difference check."
        : "Computed, but the independent finite-difference cross-check didn't confirm it — treat with caution.");

    Engine.renderKatex(statU, result.latex.u, false);
    Engine.renderKatex(statV, result.latex.v, false);
    Engine.renderKatex(statLaplacian, result.latex.laplacian + " = 0", false);

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

    drawContours(result);
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

  const GRID_N = 70;

  function sampleGrid(fn, range) {
    const xs = [], ys = [];
    for (let i = 0; i < GRID_N; i++) xs.push(-range + (2 * range * i) / (GRID_N - 1));
    for (let j = 0; j < GRID_N; j++) ys.push(-range + (2 * range * j) / (GRID_N - 1));
    const z = ys.map((y) => xs.map((x) => {
      try { const v = fn.evaluate({ x, y }); return Number.isFinite(v) ? v : null; }
      catch (e) { return null; }
    }));
    return { xs, ys, z };
  }

  function drawContours(result) {
    const range = parseFloat(rangeInput.value) || 2.5;
    const uFn = CalcCore.compileFn(result.u);
    const vFn = CalcCore.compileFn(result.v);
    if (!uFn || !vFn) return;

    const gu = sampleGrid(uFn, range);
    const gv = sampleGrid(vFn, range);

    const contourStyle = { showscale: false, hoverinfo: "skip", contours: { coloring: "lines", showlabels: false }, line: { width: 1.5 } };
    const uTrace = Object.assign({ type: "contour", x: gu.xs, y: gu.ys, z: gu.z, name: "u", line: { color: "#5c939f", width: 1.5 } }, contourStyle);
    const vTrace = Object.assign({ type: "contour", x: gv.xs, y: gv.ys, z: gv.z, name: "v", line: { color: "#ed6d40", width: 1.5 } }, contourStyle);

    const [bx, by] = result.basepoint;
    const baseTrace = {
      x: [bx], y: [by], mode: "markers+text", type: "scatter", name: "base point",
      text: ["base point"], textposition: "top center", textfont: { color: "#eef3ef", size: 11 },
      marker: { size: 10, color: "#eef3ef", symbol: "diamond", line: { color: "#090909", width: 1 } },
      hoverinfo: "skip",
    };

    const layout = Engine.plotlyBaseLayout({
      xaxis: { title: "x", range: [-range, range] },
      yaxis: { title: "y", range: [-range, range], scaleanchor: "x", scaleratio: 1 },
    });

    Plotly.newPlot("contourPlot", [uTrace, vTrace, baseTrace], layout, Engine.plotlyConfig);
  }

  // Engine.initChrome() wraps .btn-text into <span>label</span><span class="dup">label</span>
  // (a hover-swap effect) after page load, so .textContent on the container concatenates both
  // and a plain read/write collapses that structure into doubled, un-wrapped text. Read/write
  // every child span instead so the hover effect survives a label change.
  function setButtonLabel(container, text) {
    const spans = container.querySelectorAll("span");
    if (!spans.length) { container.textContent = text; return; }
    spans.forEach((s) => { s.textContent = text; });
  }
  function buttonLabel(container) {
    const first = container.querySelector("span");
    return first ? first.textContent : container.textContent;
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    if (!updateStartCheck()) return;
    const submitBtn = form.querySelector('button[type="submit"] .btn-text');
    const prev = submitBtn ? buttonLabel(submitBtn) : null;
    if (submitBtn) setButtonLabel(submitBtn, "Solving…");

    CAS.harmonicConjugate(uInput.value.trim(), [x0Input.value.trim(), y0Input.value.trim()])
      .then((result) => {
        if (!result.ok) { showError(result.reason); return; }
        render(result);
      })
      .catch((err) => showError(err.message))
      .then(() => {
        if (submitBtn) setButtonLabel(submitBtn, prev);
        if (CAS.mode() === "sync") {
          setStatus(startStatus, startStatusText, "bad",
            "Running without a Web Worker (opened over file://?) — a difficult expression can freeze the page. Serve the site over http:// to restore the safety timeout.");
        }
      });
  });

  exampleChips.addEventListener("click", (e) => {
    const chip = e.target.closest(".chip");
    if (!chip) return;
    uInput.value = chip.dataset.u;
    x0Input.value = chip.dataset.x0;
    y0Input.value = chip.dataset.y0;
    rangeInput.value = chip.dataset.range || "2.5";
    updatePreview();
    updateStartCheck();
    form.requestSubmit();
  });

  stepSlider.addEventListener("input", () => updateStep(Number(stepSlider.value)));

  const debounced = Engine.debounce(() => { updatePreview(); updateStartCheck(); }, 200);
  uInput.addEventListener("input", debounced);
  x0Input.addEventListener("input", debounced);
  y0Input.addEventListener("input", debounced);

  updatePreview();
  updateStartCheck();
})();
