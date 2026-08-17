(function () {
  "use strict";

  const nInput = document.getElementById("nInput");
  const eqnContainer = document.getElementById("eqnContainer");
  const x0Container = document.getElementById("x0Container");
  const tolInput = document.getElementById("tolInput");
  const maxIterInput = document.getElementById("maxIterInput");
  const startStatus = document.getElementById("startStatus");
  const startStatusText = document.getElementById("startStatusText");
  const formError = document.getElementById("formError");
  const formErrorText = document.getElementById("formErrorText");
  const form = document.getElementById("broydenForm");
  const exampleBtn = document.getElementById("exampleBtn");

  const placeholderPanel = document.getElementById("placeholderPanel");
  const resultsArea = document.getElementById("resultsArea");
  const statRoot = document.getElementById("statRoot");
  const statIters = document.getElementById("statIters");
  const statFNorm = document.getElementById("statFNorm");
  const statError = document.getElementById("statError");
  const formulaBlock = document.getElementById("formulaBlock");
  const iterTableBody = document.querySelector("#iterTable tbody");
  const jacobianBlock = document.getElementById("jacobianBlock");
  const stepSlider = document.getElementById("stepSlider");
  const stepLabel = document.getElementById("stepLabel");

  let state = null; // { iterations }

  // ---- equation / x0 grid builders ----
  function buildInputs(n) {
    eqnContainer.innerHTML = "";
    x0Container.innerHTML = "";
    for (let i = 0; i < n; i++) {
      const wrap = document.createElement("div");
      wrap.className = "field";
      wrap.style.marginTop = i === 0 ? "0" : "12px";
      const label = document.createElement("label");
      label.htmlFor = "eqn" + i;
      const vars = Array.from({ length: n }, (_, k) => "x" + (k + 1)).join(", ");
      label.textContent = "F" + (i + 1) + "(" + vars + ") = 0";
      const input = document.createElement("input");
      input.type = "text";
      input.id = "eqn" + i;
      input.className = "mono eqn-input";
      input.setAttribute("autocomplete", "off");
      input.setAttribute("spellcheck", "false");
      input.value = defaultEquation(i, n);
      const note = document.createElement("span");
      note.className = "field-note";
      note.textContent = "Preview";
      const preview = document.createElement("div");
      preview.className = "katex-preview";
      preview.id = "eqnPreview" + i;
      wrap.appendChild(label);
      wrap.appendChild(input);
      wrap.appendChild(note);
      wrap.appendChild(preview);
      eqnContainer.appendChild(wrap);
    }
    // x0 vector as a field-row of number inputs
    const row = document.createElement("div");
    row.className = "field-row";
    row.style.marginTop = "0";
    for (let i = 0; i < n; i++) {
      const f = document.createElement("div");
      f.className = "field";
      const label = document.createElement("label");
      label.htmlFor = "x0" + i;
      label.textContent = "x" + (i + 1) + "⁰";
      const input = document.createElement("input");
      input.type = "number";
      input.id = "x0" + i;
      input.className = "x0-input";
      input.setAttribute("step", "any");
      input.value = i === 0 ? "1.5" : "1.5";
      f.appendChild(label);
      f.appendChild(input);
      row.appendChild(f);
    }
    x0Container.appendChild(row);
  }

  function defaultEquation(i, n) {
    if (n === 2) return i === 0 ? "x1^2 + x2^2 - 2" : "x1 - x2";
    return "x" + (i + 1);
  }

  function updatePreviews() {
    const n = currentN();
    for (let i = 0; i < n; i++) {
      const el = document.getElementById("eqnPreview" + i);
      const input = document.getElementById("eqn" + i);
      if (el && input) {
        Engine.renderKatex(el, "F_{" + (i + 1) + "} = " + Engine.toLatex(input.value), false);
        Engine.pulseFlash(el);
      }
    }
  }

  function currentN() {
    const v = parseInt(nInput.value, 10);
    if (!Number.isInteger(v) || v < 2 || v > 4) return 2;
    return v;
  }

  // Multivariable compile: mirrors Engine.compileFx but with scope x1..xn.
  function compileEquation(exprStr, n) {
    try {
      if (!exprStr || !exprStr.trim()) return { ok: false, error: "Enter an expression." };
      const node = math.parse(exprStr);
      const code = node.compile();
      const fn = (xVec) => {
        const scope = {};
        for (let i = 0; i < n; i++) scope["x" + (i + 1)] = xVec[i];
        const r = code.evaluate(scope);
        if (typeof r !== "number" || Number.isNaN(r)) throw new Error("not a real number");
        return r;
      };
      // smoke-test at x0
      const testVec = new Array(n).fill(1);
      fn(testVec);
      return { ok: true, fn };
    } catch (err) {
      return { ok: false, error: err.message || String(err) };
    }
  }

  const STORE_KEY = "engine-lab:numerical-broydens-method";

  function snapshot() {
    const n = currentN();
    const equations = [];
    for (let i = 0; i < n; i++) equations.push(document.getElementById("eqn" + i).value);
    return {
      equations: equations.join(";"),
      x0: getx0(n).join(","),
      tol: tolInput.value,
      maxIter: maxIterInput.value,
    };
  }

  function getx0(n) {
    const v = [];
    for (let i = 0; i < n; i++) {
      const el = document.getElementById("x0" + i);
      v.push(parseFloat(el.value));
    }
    return v;
  }

  function updateStartCheck() {
    const n = currentN();
    const compiled = [];
    for (let i = 0; i < n; i++) {
      const c = compileEquation(document.getElementById("eqn" + i).value, n);
      if (!c.ok) {
        startStatus.className = "status-line bad";
        startStatusText.textContent = "F" + (i + 1) + ": " + c.error;
        return null;
      }
      compiled.push(c);
    }
    const x0 = getx0(n);
    if (x0.some((v) => Number.isNaN(v))) {
      startStatus.className = "status-line bad";
      startStatusText.textContent = "Enter a numeric value for every component of x₀.";
      return null;
    }
    try {
      const f0 = compiled.map((c) => c.fn(x0));
      startStatus.className = "status-line ok";
      startStatusText.textContent = "F(x₀) = (" + f0.map((v) => Engine.formatNum(v, 4)).join(", ") + ")";
      return { compiled, x0 };
    } catch {
      startStatus.className = "status-line bad";
      startStatusText.textContent = "Could not evaluate F(x) at x₀.";
      return null;
    }
  }

  const debouncedUpdate = Engine.debounce(() => {
    updatePreviews();
    updateStartCheck();
  }, 200);

  nInput.addEventListener("input", () => {
    buildInputs(currentN());
    debouncedUpdate();
  });

  eqnContainer.addEventListener("input", debouncedUpdate);
  x0Container.addEventListener("input", debouncedUpdate);

  exampleBtn.addEventListener("click", () => {
    nInput.value = "2";
    buildInputs(2);
    document.getElementById("eqn0").value = "x1^2 + x2^2 - 2";
    document.getElementById("eqn1").value = "x1 - x2";
    document.getElementById("x00").value = "1.5";
    document.getElementById("x01").value = "1.5";
    tolInput.value = "0.0000000001";
    maxIterInput.value = "100";
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

  function formatVec(v, dec) {
    return "(" + v.map((x) => Engine.formatNum(x, dec)).join(", ") + ")";
  }

  function render(iterations, n) {
    placeholderPanel.style.display = "none";
    resultsArea.style.display = "block";

    const last = iterations[iterations.length - 1];
    statRoot.textContent = formatVec(last.xNext, 6);
    statIters.textContent = String(iterations.length);
    const norm = Math.sqrt(last.fxNext.reduce((s, v) => s + v * v, 0));
    statFNorm.textContent = Engine.formatNum(norm, 6);
    statError.textContent = Engine.formatNum(last.err, 8);

    Engine.renderKatex(
      formulaBlock,
      "J_k = J_{k-1} + \\dfrac{(\\Delta F_k - J_{k-1}\\,\\Delta x_k)\\,\\Delta x_k^{\\mathsf T}}{\\Delta x_k^{\\mathsf T}\\,\\Delta x_k}",
      true
    );

    iterTableBody.innerHTML = iterations
      .map(
        (it) => `<tr data-n="${it.n}">
          <td>${it.n}</td>
          <td>${formatVec(it.x, 6)}</td>
          <td>${formatVec(it.fx, 6)}</td>
          <td>${Engine.formatNum(it.err, 8)}</td>
        </tr>`
      )
      .join("");

    // --- step-size decay plot (log y) ---
    const decayTrace = {
      x: iterations.map((it) => it.n),
      y: iterations.map((it) => Math.max(it.err, 1e-16)),
      mode: "lines+markers",
      type: "scatter",
      name: "‖δ‖∞",
      line: { color: "#5c939f", width: 2 },
      marker: { size: 5, color: "#5c939f" },
    };
    const first = iterations[0];
    const currentTrace = {
      x: [first.n],
      y: [Math.max(first.err, 1e-16)],
      mode: "markers",
      type: "scatter",
      name: "current step",
      marker: { size: 13, color: "#ed6d40", symbol: "circle-open", line: { width: 2, color: "#ed6d40" } },
    };
    Plotly.newPlot(
      "errorPlot",
      [decayTrace, currentTrace],
      Engine.plotlyBaseLayout({
        xaxis: { title: "iteration k" },
        yaxis: { title: "‖δ‖∞ (step size)", type: "log" },
      }),
      Engine.plotlyConfig
    );

    // --- step slider ---
    stepSlider.min = 0;
    stepSlider.max = iterations.length - 1;
    stepSlider.value = 0;
    state = { iterations, n };
    updateStep(0);
  }

  function updateStep(idx) {
    if (!state) return;
    const it = state.iterations[idx];
    stepLabel.textContent = "step " + it.n + " / " + state.iterations.length;
    document.querySelectorAll("#iterTable tbody tr").forEach((row) => {
      row.classList.toggle("is-current", Number(row.dataset.n) === it.n);
    });
    const rowEl = document.querySelector('#iterTable tbody tr[data-n="' + it.n + '"]');
    if (rowEl) rowEl.scrollIntoView({ block: "nearest" });

    // Show the current iteration's Jacobian J (used to produce δ) as a read-only block.
    Engine.renderKatex(
      jacobianBlock,
      "J_{" + it.n + "} = \\begin{bmatrix}" +
        it.J.map((row) => row.map((x) => Engine.formatNum(x, 4)).join(" & ")).join(" \\\\ ") +
        "\\end{bmatrix}",
      true
    );

    // Move the step-size marker to the current iteration (trace 1 = current step).
    Plotly.restyle(
      "errorPlot",
      { x: [[it.n]], y: [[Math.max(it.err, 1e-16)]] },
      [1]
    );
  }

  stepSlider.addEventListener("input", (e) => updateStep(Number(e.target.value)));

  function runCompute() {
    clearError();

    const n = currentN();
    const compiled = [];
    for (let i = 0; i < n; i++) {
      const c = compileEquation(document.getElementById("eqn" + i).value, n);
      if (!c.ok) return showError("F" + (i + 1) + " is invalid: " + c.error);
      compiled.push(c);
    }
    const F = compiled.map((c) => c.fn);
    const x0 = getx0(n);
    if (x0.some((v) => Number.isNaN(v))) return showError("Every component of x₀ must be a number.");

    const tol = parseFloat(tolInput.value);
    const maxIter = parseInt(maxIterInput.value, 10);
    if (Number.isNaN(tol) || tol <= 0) return showError("Tolerance must be a positive number.");
    if (!Number.isInteger(maxIter) || maxIter < 1) return showError("Max iterations must be a positive integer.");

    let iterations;
    try {
      iterations = Algorithms.runBroyden(F, x0, tol, maxIter);
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

  // initial build + preview
  buildInputs(currentN());

  const saved = Proto.loadState(STORE_KEY);
  if (saved && saved.equations !== undefined) {
    const equations = String(saved.equations).split(";");
    const n = equations.length;
    if (n >= 2 && n <= 4) {
      nInput.value = String(n);
      buildInputs(n);
      equations.forEach((eq, i) => {
        const el = document.getElementById("eqn" + i);
        if (el) el.value = eq;
      });
      if (saved.x0 !== undefined) {
        const x0 = String(saved.x0).split(",");
        x0.forEach((v, i) => {
          const el = document.getElementById("x0" + i);
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