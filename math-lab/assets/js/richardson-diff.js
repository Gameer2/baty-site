(function () {
  "use strict";

  const fxInput = document.getElementById("fxInput");
  const fxPreview = document.getElementById("fxPreview");
  const xInput = document.getElementById("xInput");
  const hInput = document.getElementById("hInput");
  const statusLine = document.getElementById("statusLine");
  const formError = document.getElementById("formError");
  const formErrorText = document.getElementById("formErrorText");
  const form = document.getElementById("richardsonDiffForm");
  const exampleBtn = document.getElementById("exampleBtn");

  const placeholderPanel = document.getElementById("placeholderPanel");
  const resultsArea = document.getElementById("resultsArea");
  const statD1 = document.getElementById("statD1");
  const statD2 = document.getElementById("statD2");
  const statRichardson = document.getElementById("statRichardson");
  const formulaBlock = document.getElementById("formulaBlock");

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
    hInput.value = "0.1";
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

    statD1.textContent = Engine.formatNum(result.D1, 8);
    statD2.textContent = Engine.formatNum(result.D2, 8);
    statRichardson.textContent = Engine.formatNum(result.richardson, 8);

    const deriv = Engine.derivativeFx(compiled.node, "x");
    if (deriv.ok) {
      Engine.renderKatex(formulaBlock, "D^*(h) = \\dfrac{4D(h/2) - D(h)}{3}", true);
    } else {
      Engine.renderKatex(formulaBlock, "D^*(h) = \\dfrac{4D(h/2) - D(h)}{3} \\quad \\text{(Richardson extrapolation)}", true);
    }
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    clearError();

    const compiled = Engine.compileFx(fxInput.value);
    if (!compiled.ok) return showError(`Invalid function: ${compiled.error}`);

    const x = parseFloat(xInput.value);
    const h = parseFloat(hInput.value);

    if (Number.isNaN(x)) return showError("x must be a number.");
    if (Number.isNaN(h) || h <= 0) return showError("h must be a positive number.");

    try {
      const result = Algorithms.runRichardsonDiff(compiled.fn, x, h);
      render(result, compiled, x);
    } catch (err) {
      showError(err.message);
    }
  });

  Engine.attachMathKeypad(fxInput, document.getElementById("fxKeypad"));
  Engine.attachKeypadToggle(document.getElementById("keypadToggle"), document.getElementById("fxKeypad"));

  updatePreview();
  updateStatus();
})();
