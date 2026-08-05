(function () {
  "use strict";

  const fzInput = document.getElementById("fzInput");
  const fzPreview = document.getElementById("fzPreview");
  const form = document.getElementById("domainColorForm");
  const exampleChips = document.getElementById("exampleChips");
  const modeRadios = document.querySelectorAll('input[name="mode"]');
  const rangeInput = document.getElementById("rangeInput");
  const formError = document.getElementById("formError");
  const formErrorText = document.getElementById("formErrorText");

  const placeholderPanel = document.getElementById("placeholderPanel");
  const resultsArea = document.getElementById("resultsArea");
  const canvas = document.getElementById("domainCanvas");
  const legendCanvas = document.getElementById("legendCanvas");
  const probeBox = document.getElementById("probeBox");
  const probeZ = document.getElementById("probeZ");
  const probeFz = document.getElementById("probeFz");
  const probeAbs = document.getElementById("probeAbs");
  const probeArg = document.getElementById("probeArg");
  const renderTime = document.getElementById("renderTime");

  const CANVAS_SIZE = 460; // device pixels; kept modest so a render stays well under a second

  let compiled = null; // math.js compiled expression
  let bounds = null;

  function showError(msg) {
    formError.style.display = "block";
    formErrorText.textContent = msg;
  }
  function clearError() { formError.style.display = "none"; }

  // Parses before rendering, rather than handing raw text to Engine.toLatex (which falls back
  // to echoing the unparsed string through KaTeX on a parse error) — a half-typed or malformed
  // expression like "z +++ ) bad(" would otherwise render as confusing, garbled-looking "math"
  // instead of a plain, honest "not valid yet" message.
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
  fzInput.addEventListener("input", Engine.debounce(updatePreview, 200));

  exampleChips.addEventListener("click", (e) => {
    const chip = e.target.closest(".chip");
    if (!chip) return;
    fzInput.value = chip.dataset.fz;
    rangeInput.value = chip.dataset.range || "2";
    clearError();
    updatePreview();
    compute();
  });

  modeRadios.forEach((r) => r.addEventListener("change", () => { if (compiled) compute(); }));

  function currentMode() {
    const checked = document.querySelector('input[name="mode"]:checked');
    return checked ? checked.value : "modulus";
  }

  // f(z) as a numeric complex evaluator, closing over the compiled math.js expression.
  // Returns {re, im} or throws — DomainColoring.render already treats a throw as "undefined here".
  function evalFn(re, im) {
    const w = compiled.evaluate({ z: math.complex(re, im) });
    if (typeof w === "number") return { re: w, im: 0 }; // a purely real-valued expression
    return { re: w.re, im: w.im };
  }

  function compute() {
    const exprStr = fzInput.value.trim();
    if (!exprStr) return showError("Enter an expression in z.");
    let node;
    try {
      node = math.parse(exprStr);
      compiled = node.compile();
      // smoke-test at a generic point so a bad expression is caught before painting 200k+ pixels
      compiled.evaluate({ z: math.complex(1.3, 0.7) });
    } catch (err) {
      return showError(`Could not parse/evaluate f(z): ${err.message}`);
    }
    clearError();

    const range = parseFloat(rangeInput.value);
    if (!Number.isFinite(range) || range <= 0) return showError("View range must be a positive number.");
    bounds = { xmin: -range, xmax: range, ymin: -range, ymax: range };

    placeholderPanel.style.display = "none";
    resultsArea.style.display = "block";

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const size = Math.round(CANVAS_SIZE * dpr);
    canvas.width = size;
    canvas.height = size;
    canvas.style.width = CANVAS_SIZE + "px";
    canvas.style.height = CANVAS_SIZE + "px";
    const ctx = canvas.getContext("2d");

    const t0 = performance.now();
    DomainColoring.render(ctx, evalFn, bounds, { mode: currentMode() });
    const elapsed = performance.now() - t0;
    renderTime.textContent = `${size}×${size} px in ${elapsed.toFixed(0)} ms`;

    drawLegend();
  }

  function drawLegend() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const size = Math.round(120 * dpr);
    legendCanvas.width = size;
    legendCanvas.height = size;
    legendCanvas.style.width = "120px";
    legendCanvas.style.height = "120px";
    const ctx = legendCanvas.getContext("2d");
    DomainColoring.renderLegend(ctx, size / 2, size / 2, size / 2 - 2 * dpr);
  }

  // Click-to-probe: map the click's canvas pixel back to a z, evaluate f(z), show both.
  canvas.addEventListener("click", (e) => {
    if (!compiled || !bounds) return;
    const rect = canvas.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * canvas.width;
    const py = ((e.clientY - rect.top) / rect.height) * canvas.height;
    const re = bounds.xmin + ((bounds.xmax - bounds.xmin) * px) / (canvas.width - 1);
    const im = bounds.ymax - ((bounds.ymax - bounds.ymin) * py) / (canvas.height - 1);

    let w;
    try { w = evalFn(re, im); } catch (err) { w = null; }

    probeBox.style.display = "block";
    probeZ.textContent = Complex.format({ re, im }, 4);
    if (!w || !Number.isFinite(w.re) || !Number.isFinite(w.im)) {
      probeFz.textContent = "undefined here";
      probeAbs.textContent = "—";
      probeArg.textContent = "—";
    } else {
      probeFz.textContent = Complex.format(w, 4);
      probeAbs.textContent = Number(Complex.abs(w).toFixed(4)).toString();
      probeArg.textContent = Number(Complex.arg(w).toFixed(4)).toString() + " rad";
    }
  });

  form.addEventListener("submit", (e) => { e.preventDefault(); compute(); });

  updatePreview();
})();
