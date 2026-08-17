(function () {
  "use strict";

  const fxInput = document.getElementById("fxInput");
  const fxPreview = document.getElementById("fxPreview");
  const xInput = document.getElementById("xInput");
  const hInput = document.getElementById("hInput");
  const statusLine = document.getElementById("statusLine");
  const formError = document.getElementById("formError");
  const formErrorText = document.getElementById("formErrorText");
  const form = document.getElementById("numericalDiffForm");
  const exampleBtn = document.getElementById("exampleBtn");

  const placeholderPanel = document.getElementById("placeholderPanel");
  const resultsArea = document.getElementById("resultsArea");
  const statForward = document.getElementById("statForward");
  const statCentral = document.getElementById("statCentral");
  const statExact = document.getElementById("statExact");
  const formulaBlock = document.getElementById("formulaBlock");

  const STORE_KEY = "engine-lab:numerical-numerical-diff";

  function snapshot() {
    return { fx: fxInput.value, x: xInput.value, h: hInput.value };
  }

  function updatePreview() {
    Engine.renderKatex(fxPreview, `f(x) = ${Engine.toLatex(fxInput.value)}`, false);
    Engine.pulseFlash(fxPreview);
  }

  function updateStatus() {
    const compiled = Engine.compileFx(fxInput.value);
    if (!compiled.ok) {
      statusLine.className = "status-line bad";
      statusLine.textContent = compiled.error;
      return null;
    }
    const x = parseFloat(xInput.value);
    const h = parseFloat(hInput.value);
    if (Number.isNaN(x)) {
      statusLine.className = "status-line bad";
      statusLine.textContent = "Enter a numeric point x.";
      return null;
    }
    if (Number.isNaN(h) || h <= 0) {
      statusLine.className = "status-line bad";
      statusLine.textContent = "Enter a positive step size h.";
      return null;
    }
    statusLine.className = "status-line ok";
    statusLine.textContent = `f(x) valid, evaluating at x = ${x} with h = ${h}`;
    return compiled;
  }

  const debouncedUpdate = Engine.debounce(() => {
    updatePreview();
    updateStatus();
  }, 200);

  [fxInput, xInput, hInput].forEach((el) => el.addEventListener("input", debouncedUpdate));

  exampleBtn.addEventListener("click", () => {
    fxInput.value = "sin(x)";
    xInput.value = "0.7853981633974483";
    hInput.value = "0.001";
    updatePreview();
    updateStatus();
  });

  function showError(msg) {
    formError.style.display = "block";
    formErrorText.textContent = msg;
  }
  function clearError() {
    formError.style.display = "none";
  }

  function render(result, compiled, x) {
    placeholderPanel.style.display = "none";
    resultsArea.style.display = "block";

    statForward.textContent = Engine.formatNum(result.forward, 8);
    statCentral.textContent = Engine.formatNum(result.central, 8);

    // Compute exact derivative symbolically
    const deriv = Engine.derivativeFx(compiled.node, "x");
    if (deriv.ok) {
      const exact = deriv.fn(x);
      statExact.textContent = Engine.formatNum(exact, 8);
      Engine.renderKatex(formulaBlock, `f'(x) = ${deriv.latex}`, true);
    } else {
      statExact.textContent = "—";
      Engine.renderKatex(formulaBlock, "f'(x) = \\lim_{h \\to 0} \\dfrac{f(x+h) - f(x)}{h}", true);
    }
  }

  function runCompute() {
    clearError();

    const compiled = Engine.compileFx(fxInput.value);
    if (!compiled.ok) return showError(`Invalid function: ${compiled.error}`);

    const x = parseFloat(xInput.value);
    const h = parseFloat(hInput.value);

    if (Number.isNaN(x)) return showError("x must be a number.");
    if (Number.isNaN(h) || h <= 0) return showError("h must be a positive number.");

    try {
      const result = Algorithms.runNumericalDiff(compiled.fn, x, h);
      render(result, compiled, x);
      Proto.saveState(STORE_KEY, snapshot());
    } catch (err) {
      showError(err.message);
    }
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    runCompute();
  });

  Engine.attachMathKeypad(fxInput, document.getElementById("fxKeypad"));
  Engine.attachKeypadToggle(document.getElementById("keypadToggle"), document.getElementById("fxKeypad"));

  const saved = Proto.loadState(STORE_KEY);
  if (saved) {
    if (saved.fx !== undefined) fxInput.value = saved.fx;
    if (saved.x !== undefined) xInput.value = saved.x;
    if (saved.h !== undefined) hInput.value = saved.h;
  }

  updatePreview();
  updateStatus();
  if (saved) runCompute();
})();
