(function () {
  "use strict";

  const nInput = document.getElementById("nInput");
  const equationsContainer = document.getElementById("equationsContainer");
  const initialGuessContainer = document.getElementById("initialGuessContainer");
  const keypadToggle = document.getElementById("keypadToggle");
  const eqKeypad = document.getElementById("eqKeypad");
  const tolInput = document.getElementById("tolInput");
  const maxIterInput = document.getElementById("maxIterInput");
  const startStatus = document.getElementById("startStatus");
  const startStatusText = document.getElementById("startStatusText");
  const formError = document.getElementById("formError");
  const formErrorText = document.getElementById("formErrorText");
  const form = document.getElementById("newtonSystemForm");
  const exampleBtn = document.getElementById("exampleBtn");

  const placeholderPanel = document.getElementById("placeholderPanel");
  const resultsArea = document.getElementById("resultsArea");
  const statSolution = document.getElementById("statSolution");
  const statIters = document.getElementById("statIters");
  const statFNorm = document.getElementById("statFNorm");
  const statError = document.getElementById("statError");
  const formulaBlock = document.getElementById("formulaBlock");
  const iterTableBody = document.querySelector("#iterTable tbody");
  const jacobianBlock = document.getElementById("jacobianBlock");
  const stepSlider = document.getElementById("stepSlider");
  const stepLabel = document.getElementById("stepLabel");

  let state = null;
  let activeEqInput = null;

  const DEFAULT_EQUATIONS = ["x1^2 + x2^2 - 2", "x1 - x2", "x1^2 - x2", "x1 + x2 - x3"];
  const DEFAULT_GUESS = [1.5, 1.5, 1, 1];
  const STORE_KEY = "engine-lab:numerical-newton-nonlinear-systems";

  function snapshot() {
    const n = parseInt(nInput.value, 10) || 2;
    const equations = [];
    for (let i = 0; i < n; i++) {
      const el = document.getElementById("eqInput-" + i);
      equations.push(el ? el.value : "");
    }
    return {
      n,
      equations: equations.join(";"),
      x0: readX0(n).join(","),
      tol: tolInput.value,
      maxIter: maxIterInput.value,
    };
  }

  // Compile an n-variable expression (variables x1..xn) into (xVec) -> number.
  // Mirrors Engine.compileFx's validation, generalized to n variables.
  function compileEq(exprStr, n) {
    if (!exprStr || !exprStr.trim()) return { ok: false, error: "Enter an expression." };
    try {
      const node = math.parse(exprStr);
      const code = node.compile();
      const fn = (xVec) => {
        const scope = {};
        for (let i = 0; i < n; i++) scope["x" + (i + 1)] = xVec[i];
        const r = code.evaluate(scope);
        if (typeof r !== "number" || Number.isNaN(r)) throw new Error("not a real number");
        return r;
      };
      fn(new Array(n).fill(1)); // smoke-test
      return { ok: true, fn, node };
    } catch (err) {
      return { ok: false, error: err.message || String(err) };
    }
  }

  function varList(n) {
    const vs = [];
    for (let i = 1; i <= n; i++) vs.push("x" + i);
    return vs.join(", ");
  }

  function subscriptLabel(i) {
    // 1 -> "₁", 2 -> "₂", ...
    const subs = ["₁", "₂", "₃", "₄", "₅", "₆", "₇", "₈", "₉"];
    return subs[i - 1] || String(i);
  }

  function generateInputs(n, keepValues) {
    // preserve currently typed values across rebuilds if requested
    const prevEq = [];
    if (keepValues) {
      for (let i = 0; i < n; i++) {
        const el = document.getElementById("eqInput-" + i);
        prevEq.push(el ? el.value : (DEFAULT_EQUATIONS[i] || ""));
      }
    }
    equationsContainer.innerHTML = "";
    for (let i = 0; i < n; i++) {
      const wrap = document.createElement("div");
      wrap.className = "field";
      wrap.style.marginTop = i === 0 ? "18px" : "0";
      const label = document.createElement("label");
      label.setAttribute("for", "eqInput-" + i);
      label.textContent = "F" + subscriptLabel(i + 1) + "(" + varList(n) + ") = 0";
      const input = document.createElement("input");
      input.type = "text";
      input.id = "eqInput-" + i;
      input.className = "mono";
      input.value = prevEq.length ? prevEq[i] : (DEFAULT_EQUATIONS[i] || "");
      input.setAttribute("autocomplete", "off");
      input.setAttribute("spellcheck", "false");
      const note = document.createElement("span");
      note.className = "field-note";
      note.textContent = "Preview";
      const preview = document.createElement("div");
      preview.className = "katex-preview";
      preview.id = "eqPreview-" + i;
      wrap.appendChild(label);
      wrap.appendChild(input);
      wrap.appendChild(note);
      wrap.appendChild(preview);
      equationsContainer.appendChild(wrap);
      input.addEventListener("input", debouncedUpdate);
      input.addEventListener("focus", () => {
        activeEqInput = input;
        Engine.attachMathKeypad(input, eqKeypad);
      });
    }

    // initial guess vector
    const prevGuess = [];
    if (keepValues) {
      for (let i = 0; i < n; i++) {
        const el = document.getElementById("x0Input-" + i);
        prevGuess.push(el ? el.value : String(DEFAULT_GUESS[i] ?? 1));
      }
    }
    initialGuessContainer.innerHTML = "";
    for (let i = 0; i < n; i++) {
      const field = document.createElement("div");
      field.className = "field";
      const label = document.createElement("label");
      label.setAttribute("for", "x0Input-" + i);
      label.textContent = "x" + subscriptLabel(i + 1);
      const input = document.createElement("input");
      input.type = "number";
      input.id = "x0Input-" + i;
      input.value = prevGuess.length ? prevGuess[i] : String(DEFAULT_GUESS[i] ?? 1);
      input.step = "any";
      field.appendChild(label);
      field.appendChild(input);
      initialGuessContainer.appendChild(field);
      input.addEventListener("input", debouncedUpdate);
    }

    // bind keypad to the first equation input by default
    const firstEq = document.getElementById("eqInput-0");
    if (firstEq) {
      activeEqInput = firstEq;
      Engine.attachMathKeypad(firstEq, eqKeypad);
    }
  }

  function readX0(n) {
    const x0 = [];
    for (let i = 0; i < n; i++) {
      const el = document.getElementById("x0Input-" + i);
      x0.push(parseFloat(el ? el.value : "0"));
    }
    return x0;
  }

  function updatePreviews() {
    const n = parseInt(nInput.value, 10) || 2;
    for (let i = 0; i < n; i++) {
      const el = document.getElementById("eqInput-" + i);
      const pv = document.getElementById("eqPreview-" + i);
      if (!el || !pv) continue;
      Engine.renderKatex(pv, "F_" + (i + 1) + " = " + Engine.toLatex(el.value), false);
      Engine.pulseFlash(pv);
    }
  }

  function updateStartCheck() {
    const n = parseInt(nInput.value, 10) || 2;
    if (!Number.isInteger(n) || n < 2 || n > 4) {
      startStatus.className = "status-line bad";
      startStatusText.textContent = "n must be an integer between 2 and 4.";
      return null;
    }
    const compiled = [];
    for (let i = 0; i < n; i++) {
      const el = document.getElementById("eqInput-" + i);
      const c = compileEq(el ? el.value : "", n);
      if (!c.ok) {
        startStatus.className = "status-line bad";
        startStatusText.textContent = "F" + subscriptLabel(i + 1) + ": " + c.error;
        return null;
      }
      compiled.push(c);
    }
    const x0 = readX0(n);
    if (x0.some((v) => Number.isNaN(v))) {
      startStatus.className = "status-line bad";
      startStatusText.textContent = "Enter a numeric initial guess for every component.";
      return null;
    }
    try {
      const fx = compiled.map((c) => c.fn(x0));
      if (!fx.every(Number.isFinite)) throw new Error("non-finite");
      startStatus.className = "status-line ok";
      startStatusText.textContent = "F(x₀) = [" + fx.map((v) => Engine.formatNum(v, 4)).join(", ") + "]";
      return { compiled, x0, n };
    } catch {
      startStatus.className = "status-line bad";
      startStatusText.textContent = "Could not evaluate F(x) at the initial guess.";
      return null;
    }
  }

  const debouncedUpdate = Engine.debounce(() => {
    updatePreviews();
    updateStartCheck();
  }, 200);

  nInput.addEventListener("input", () => {
    const n = Math.max(2, Math.min(4, parseInt(nInput.value, 10) || 2));
    generateInputs(n, true);
    debouncedUpdate();
  });

  exampleBtn.addEventListener("click", () => {
    nInput.value = "2";
    generateInputs(2, false);
    document.getElementById("eqInput-0").value = "x1^2 + x2^2 - 2";
    document.getElementById("eqInput-1").value = "x1 - x2";
    document.getElementById("x0Input-0").value = "1.5";
    document.getElementById("x0Input-1").value = "1.5";
    tolInput.value = "0.0000000001";
    maxIterInput.value = "50";
    updatePreviews();
    updateStartCheck();
  });

  function showError(msg) {
    formError.style.display = "block";
    formErrorText.textContent = msg;
  }
  function clearError() {
    formError.style.display = "none";
  }

  function formatVec(v) {
    return "[" + v.map((x) => Engine.formatNum(x, 4)).join(", ") + "]";
  }

  function formatMatrix(M) {
    // Render as a bracketed matrix in KaTeX.
    const rows = M.map((row) => row.map((x) => Engine.formatNum(x, 4)).join(" & ")).join(" \\\\ ");
    return "J = \\begin{bmatrix} " + rows + " \\end{bmatrix}";
  }

  function render(iterations, n) {
    placeholderPanel.style.display = "none";
    resultsArea.style.display = "block";

    const last = iterations[iterations.length - 1];
    statSolution.textContent = "(" + last.xNext.map((x) => Engine.formatNum(x, 6)).join(", ") + ")";
    statIters.textContent = String(iterations.length);
    const fnorm = Math.sqrt(last.fx.reduce((s, v) => s + v * v, 0));
    statFNorm.textContent = Engine.formatNum(fnorm, 6);
    statError.textContent = Engine.formatNum(last.err, 8);

    Engine.renderKatex(
      formulaBlock,
      "J(\\mathbf{x}_{k-1})\\,\\boldsymbol{\\delta} = -F(\\mathbf{x}_{k-1}), \\quad \\mathbf{x}_k = \\mathbf{x}_{k-1} + \\boldsymbol{\\delta}",
      true
    );

    iterTableBody.innerHTML = iterations
      .map(
        (it) => `<tr data-n="${it.n}">
          <td>${it.n}</td>
          <td>${formatVec(it.x)}</td>
          <td>${formatVec(it.fx)}</td>
          <td>${Engine.formatNum(it.err, 8)}</td>
        </tr>`
      )
      .join("");

    // --- step-size decay plot (log y) ---
    Plotly.newPlot(
      "errorPlot",
      [{
        x: iterations.map((it) => it.n),
        y: iterations.map((it) => Math.max(it.err, 1e-16)),
        mode: "lines+markers",
        type: "scatter",
        name: "‖δ‖∞",
        line: { color: "#ed6d40", width: 2 },
        marker: { size: 5, color: "#ed6d40" },
      }],
      Engine.plotlyBaseLayout({
        xaxis: { title: "iteration k" },
        yaxis: { title: "‖δ‖∞", type: "log" },
      }),
      Engine.plotlyConfig
    );

    stepSlider.min = 0;
    stepSlider.max = iterations.length - 1;
    stepSlider.value = 0;
    state = { iterations, n };
    updateStep(0);
  }

  function updateStep(idx) {
    if (!state) return;
    const it = state.iterations[idx];
    stepLabel.textContent = `step ${it.n} / ${state.iterations.length}`;
    document.querySelectorAll("#iterTable tbody tr").forEach((row) => {
      row.classList.toggle("is-current", Number(row.dataset.n) === it.n);
    });
    const rowEl = document.querySelector(`#iterTable tbody tr[data-n="${it.n}"]`);
    if (rowEl) rowEl.scrollIntoView({ block: "nearest" });
    Engine.renderKatex(jacobianBlock, formatMatrix(it.J), true);
  }

  stepSlider.addEventListener("input", (e) => updateStep(Number(e.target.value)));

  function runCompute() {
    clearError();

    const n = parseInt(nInput.value, 10);
    if (!Number.isInteger(n) || n < 2 || n > 4) return showError("n must be an integer between 2 and 4.");

    const compiled = [];
    for (let i = 0; i < n; i++) {
      const el = document.getElementById("eqInput-" + i);
      const c = compileEq(el ? el.value : "", n);
      if (!c.ok) return showError("F" + subscriptLabel(i + 1) + ": " + c.error);
      compiled.push(c);
    }

    const x0 = readX0(n);
    if (x0.some((v) => Number.isNaN(v))) return showError("Every component of the initial guess must be a number.");

    const tol = parseFloat(tolInput.value);
    const maxIter = parseInt(maxIterInput.value, 10);
    if (Number.isNaN(tol) || tol <= 0) return showError("Tolerance must be a positive number.");
    if (!Number.isInteger(maxIter) || maxIter < 1) return showError("Max iterations must be a positive integer.");

    const F = compiled.map((c) => c.fn);
    let iterations;
    try {
      iterations = Algorithms.runNewtonSystem(F, x0, tol, maxIter);
    } catch (err) {
      return showError(err.message);
    }
    if (!iterations.length) return showError("No iterations were produced.");

    render(iterations, n);
    Proto.saveState(STORE_KEY, snapshot());
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    runCompute();
  });

  Engine.attachKeypadToggle(keypadToggle, eqKeypad);

  // initial build + first preview/validity
  generateInputs(parseInt(nInput.value, 10) || 2, false);

  const saved = Proto.loadState(STORE_KEY);
  if (saved && saved.equations !== undefined) {
    const equations = String(saved.equations).split(";");
    const n = equations.length;
    if (n >= 2 && n <= 4) {
      nInput.value = String(n);
      generateInputs(n, false);
      equations.forEach((eq, i) => {
        const el = document.getElementById("eqInput-" + i);
        if (el) el.value = eq;
      });
      if (saved.x0 !== undefined) {
        const x0 = String(saved.x0).split(",");
        x0.forEach((v, i) => {
          const el = document.getElementById("x0Input-" + i);
          if (el) el.value = v;
        });
      }
      if (saved.tol !== undefined) tolInput.value = saved.tol;
      if (saved.maxIter !== undefined) maxIterInput.value = saved.maxIter;
    }
  }

  updatePreviews();
  updateStartCheck();
  if (saved) runCompute();
})();