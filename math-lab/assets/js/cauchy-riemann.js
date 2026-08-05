/* Analyticity & the Cauchy-Riemann Equations — page wiring.
   Symbolic work (splitting f(z) into u(x,y)/v(x,y), the partials, the point-verdict, the
   finite-difference cross-check) lives in complex-symbolic.js and runs in the CAS worker via
   CAS.cauchyRiemann. This file reads f(z) and a point, calls it, renders the exact u/v and the
   derivation, and draws the signature visual: f(z) domain-coloured next to a plane-wide map of
   exactly where the Cauchy-Riemann equations hold, built by compiling the RETURNED symbolic
   u_x/u_y/v_x/v_y strings once and evaluating them at every pixel — no further CAS calls, so it
   can run at full canvas resolution without any hang risk. */
(function () {
  "use strict";

  const fzInput = document.getElementById("fzInput");
  const fzPreview = document.getElementById("fzPreview");
  const xInput = document.getElementById("xInput");
  const yInput = document.getElementById("yInput");
  const rangeInput = document.getElementById("rangeInput");
  const form = document.getElementById("crForm");
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
  const statResReal = document.getElementById("statResReal");
  const statResImag = document.getElementById("statResImag");
  const stepTableBody = document.querySelector("#stepTable tbody");
  const stepSlider = document.getElementById("stepSlider");
  const stepLabel = document.getElementById("stepLabel");
  const domainCanvas = document.getElementById("domainCanvas");
  const crCanvas = document.getElementById("crCanvas");
  const renderTime = document.getElementById("renderTime");

  const CANVAS_SIZE = 380;
  let state = null;
  let bounds = null;

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  function updatePreview() {
    const raw = fzInput.value.trim();
    fzPreview.classList.remove("preview-invalid");
    if (!raw) {
      fzPreview.textContent = "Enter an expression in z.";
      fzPreview.classList.add("preview-invalid");
      return;
    }
    try {
      const tex = math.parse(raw).toTex({ parenthesis: "auto" });
      Engine.renderKatex(fzPreview, `f(z) = ${tex}`, false);
      Engine.pulseFlash(fzPreview);
    } catch (err) {
      fzPreview.textContent = "Not a valid expression yet — check parentheses and operators.";
      fzPreview.classList.add("preview-invalid");
    }
  }

  function setStatus(el, textEl, cls, msg) {
    el.className = "status-line " + cls;
    textEl.textContent = msg;
  }

  function updateStartCheck() {
    const raw = fzInput.value.trim();
    if (!raw) { setStatus(startStatus, startStatusText, "bad", "Enter f(z)."); return false; }
    try {
      const code = math.parse(raw).compile();
      code.evaluate({ z: math.complex(1.3, 0.7) });
    } catch (e) {
      setStatus(startStatus, startStatusText, "bad", "f(z) doesn't parse: " + e.message);
      return false;
    }
    for (const inp of [xInput, yInput]) {
      if (!/^-?\d+(\.\d+)?$/.test(inp.value.trim())) {
        setStatus(startStatus, startStatusText, "bad", "The point coordinates must be plain numbers.");
        return false;
      }
    }
    setStatus(startStatus, startStatusText, "ok", "Ready — press Check analyticity.");
    return true;
  }

  function showError(msg) {
    resultsArea.style.display = "none";
    placeholderPanel.style.display = "";
    formError.style.display = "block";
    formErrorText.textContent = msg;
  }

  const VERDICT_COPY = {
    "analytic": { cls: "ok", label: "Analytic — the Cauchy-Riemann equations hold at this point and throughout the sampled neighbourhood." },
    "cr-holds-only-here": { cls: "bad", label: "NOT analytic — the equations hold at this exact point but fail nearby, so no neighbourhood works. (The |z|² trap: differentiable at an isolated point ≠ analytic.)" },
    "not-analytic-at-point": { cls: "bad", label: "NOT analytic — the Cauchy-Riemann equations fail at this point." },
  };

  function render(result) {
    placeholderPanel.style.display = "none";
    resultsArea.style.display = "";
    formError.style.display = "none";
    state = { steps: result.steps };

    const vc = VERDICT_COPY[result.verdict] || { cls: "bad", label: result.verdict };
    setStatus(verdictStatus, verdictText, vc.cls, vc.label);

    Engine.renderKatex(statU, result.latex.u, false);
    Engine.renderKatex(statV, result.latex.v, false);
    statResReal.textContent = result.residual.real.toExponential(3);
    statResImag.textContent = result.residual.imag.toExponential(3);

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

    drawPlanes(result);
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

  // f(z) as a numeric complex evaluator — same pattern as complex-functions.js.
  function makeComplexEval(exprStr) {
    let code;
    try { code = math.parse(exprStr).compile(); } catch (e) { return null; }
    return (re, im) => {
      const w = code.evaluate({ z: math.complex(re, im) });
      if (typeof w === "number") return { re: w, im: 0 };
      return { re: w.re, im: w.im };
    };
  }

  const CR_TOL = 1e-3;

  function drawPlanes(result) {
    const range = parseFloat(rangeInput.value);
    bounds = { xmin: -range, xmax: range, ymin: -range, ymax: range };

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const size = Math.round(CANVAS_SIZE * dpr);
    for (const c of [domainCanvas, crCanvas]) {
      c.width = size; c.height = size;
      c.style.width = CANVAS_SIZE + "px"; c.style.height = CANVAS_SIZE + "px";
    }

    const t0 = performance.now();

    const evalFn = makeComplexEval(fzInput.value.trim());
    if (evalFn) DomainColoring.render(domainCanvas.getContext("2d"), evalFn, bounds, { mode: "modulus" });

    const resRealFn = CalcCore.compileFn(`(${result.ux})-(${result.vy})`);
    const resImagFn = CalcCore.compileFn(`(${result.uy})+(${result.vx})`);
    if (resRealFn && resImagFn) {
      DomainColoring.renderBoolField(crCanvas.getContext("2d"), (re, im) => {
        const rr = resRealFn.evaluate({ x: re, y: im });
        const ri = resImagFn.evaluate({ x: re, y: im });
        if (!Number.isFinite(rr) || !Number.isFinite(ri)) return null;
        const scale = Math.max(1, Math.abs(rr), Math.abs(ri));
        return Math.abs(rr) <= CR_TOL * scale && Math.abs(ri) <= CR_TOL * scale;
      }, bounds);
    }

    const elapsed = performance.now() - t0;
    renderTime.textContent = `${size}×${size} px in ${elapsed.toFixed(0)} ms`;
  }

  function canvasToPoint(canvas, clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const px = ((clientX - rect.left) / rect.width) * canvas.width;
    const py = ((clientY - rect.top) / rect.height) * canvas.height;
    const re = bounds.xmin + ((bounds.xmax - bounds.xmin) * px) / (canvas.width - 1);
    const im = bounds.ymax - ((bounds.ymax - bounds.ymin) * py) / (canvas.height - 1);
    return [re, im];
  }

  function onCanvasClick(canvas) {
    return (e) => {
      if (!bounds) return;
      const [re, im] = canvasToPoint(canvas, e.clientX, e.clientY);
      xInput.value = re.toFixed(4);
      yInput.value = im.toFixed(4);
      updateStartCheck();
      form.requestSubmit();
    };
  }
  domainCanvas.addEventListener("click", onCanvasClick(domainCanvas));
  crCanvas.addEventListener("click", onCanvasClick(crCanvas));

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
    if (submitBtn) setButtonLabel(submitBtn, "Checking…");

    CAS.cauchyRiemann(fzInput.value.trim(), [xInput.value.trim(), yInput.value.trim()])
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
    fzInput.value = chip.dataset.fz;
    xInput.value = chip.dataset.x;
    yInput.value = chip.dataset.y;
    rangeInput.value = chip.dataset.range || "2";
    updatePreview();
    updateStartCheck();
    form.requestSubmit();
  });

  stepSlider.addEventListener("input", () => updateStep(Number(stepSlider.value)));

  const debounced = Engine.debounce(() => { updatePreview(); updateStartCheck(); }, 200);
  fzInput.addEventListener("input", debounced);
  xInput.addEventListener("input", debounced);
  yInput.addEventListener("input", debounced);

  updatePreview();
  updateStartCheck();
})();
