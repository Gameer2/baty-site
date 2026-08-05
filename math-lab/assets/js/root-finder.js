/* Numerical Engine — "Find a Root" auto-solve board.
   Classify -> dispatch -> fallback, the same shape as the ODE/PDE solver, applied one level
   down: given f(x) and whatever the student actually has (a starting guess x0, a bracket
   [a,b], or both), attack it with the fastest applicable method and monitor it — Newton if
   the derivative and a well-defined tangent exist, Secant if no derivative is available, and
   an automatic, clearly-labeled fall back to Bisection whenever the fast method fails and a
   valid bracket was given. This mirrors how a real hybrid solver (e.g. Brent's method)
   behaves, and needs no new mathematics: every run below calls Algorithms.runNewton /
   runSecant / runBisection exactly as the individual method pages already do. */
(function () {
  "use strict";

  const fxInput = document.getElementById("fxInput");
  const fxPreview = document.getElementById("fxPreview");
  const x0Input = document.getElementById("x0Input");
  const aInput = document.getElementById("aInput");
  const bInput = document.getElementById("bInput");
  const tolInput = document.getElementById("tolInput");
  const maxIterInput = document.getElementById("maxIterInput");
  const formError = document.getElementById("formError");
  const formErrorText = document.getElementById("formErrorText");
  const form = document.getElementById("rootForm");
  const exampleBtn = document.getElementById("exampleBtn");

  const placeholderPanel = document.getElementById("placeholderPanel");
  const resultsArea = document.getElementById("resultsArea");
  const classificationBox = document.getElementById("classificationBox");
  const statRoot = document.getElementById("statRoot");
  const statMethod = document.getElementById("statMethod");
  const statIters = document.getElementById("statIters");
  const statFRoot = document.getElementById("statFRoot");
  const statError = document.getElementById("statError");
  const iterTableBody = document.querySelector("#iterTable tbody");
  const stepSlider = document.getElementById("stepSlider");
  const stepLabel = document.getElementById("stepLabel");

  const METHOD_LABEL = { newton: "Newton-Raphson", secant: "Secant", bisection: "Bisection" };
  let state = null; // { norm, compiled }
  const CURRENT_TRACE = 3;

  function updatePreview() {
    Engine.renderKatex(fxPreview, `f(x) = ${Engine.toLatex(fxInput.value)}`, false);
    Engine.pulseFlash(fxPreview);
  }
  [fxInput].forEach((el) => el.addEventListener("input", Engine.debounce(updatePreview, 200)));

  document.querySelectorAll("#exampleChips .chip").forEach((btn) => {
    btn.addEventListener("click", () => {
      fxInput.value = btn.dataset.fx;
      x0Input.value = btn.dataset.x0 || "";
      aInput.value = btn.dataset.a || "";
      bInput.value = btn.dataset.b || "";
      updatePreview();
    });
  });

  exampleBtn.addEventListener("click", () => {
    fxInput.value = "x^3 - x - 2";
    x0Input.value = "1.5";
    aInput.value = "1";
    bInput.value = "2";
    tolInput.value = "0.000001";
    maxIterInput.value = "30";
    updatePreview();
  });

  function showError(msg) { formError.style.display = "block"; formErrorText.textContent = msg; }
  function clearError() { formError.style.display = "none"; }

  function readBracket(compiled) {
    const aRaw = aInput.value.trim(), bRaw = bInput.value.trim();
    if (aRaw === "" || bRaw === "") return { given: false, valid: false };
    const a = parseFloat(aRaw), b = parseFloat(bRaw);
    if (Number.isNaN(a) || Number.isNaN(b) || a === b) return { given: true, valid: false };
    const lo = Math.min(a, b), hi = Math.max(a, b);
    let fa, fb;
    try { fa = compiled.fn(lo); fb = compiled.fn(hi); } catch (e) { return { given: true, valid: false }; }
    const valid = Number.isFinite(fa) && Number.isFinite(fb) && fa !== 0 && fb !== 0 && Math.sign(fa) !== Math.sign(fb);
    return { given: true, valid, a: lo, b: hi };
  }

  function normalize(method, iterations) {
    if (method === "bisection") return iterations.map((it) => ({ n: it.n, x: it.c, err: it.err }));
    return iterations.map((it) => ({ n: it.n, x: it.xNext, err: it.err })); // newton & secant share this shape
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    clearError();

    const compiled = Engine.compileFx(fxInput.value);
    if (!compiled.ok) return showError(`Invalid function: ${compiled.error}`);

    const tol = parseFloat(tolInput.value);
    const maxIter = parseInt(maxIterInput.value, 10);
    if (Number.isNaN(tol) || tol <= 0) return showError("Tolerance must be a positive number.");
    if (!Number.isInteger(maxIter) || maxIter < 1) return showError("Max iterations must be a positive integer.");

    const x0Raw = x0Input.value.trim();
    const x0 = x0Raw === "" ? null : parseFloat(x0Raw);
    if (x0Raw !== "" && Number.isNaN(x0)) return showError("x₀ must be a number, or left blank.");

    const bracket = readBracket(compiled);
    if (bracket.given && !bracket.valid) {
      return showError("The bracket [a, b] needs f(a) and f(b) to have opposite signs (or leave both blank to skip it).");
    }

    if (x0 === null && !bracket.valid) {
      return showError("Provide a starting guess x₀ (for Newton/Secant), or a bracket [a, b] with f(a) and f(b) of opposite sign (for Bisection).");
    }

    function tryBisection() {
      if (!bracket.valid) return null;
      try { return Algorithms.runBisection(compiled.fn, bracket.a, bracket.b, tol, maxIter); }
      catch (e) { return null; }
    }

    let method = null, iterations = null, classificationLine = "", why = "", isFallback = false, fallbackNote = null;

    if (x0 !== null) {
      const deriv = Engine.derivativeFx(compiled.node);
      let fp0 = NaN;
      if (deriv.ok) { try { fp0 = deriv.fn(x0); } catch (e) { fp0 = NaN; } }

      if (deriv.ok && Number.isFinite(fp0) && Math.abs(fp0) > 1e-12) {
        try {
          iterations = Algorithms.runNewton(compiled.fn, deriv.fn, x0, tol, maxIter);
          method = "newton";
          classificationLine = "Newton-Raphson — derivative available, tangent well-defined at x₀";
          why = `f′(x₀) = ${Engine.formatNum(fp0, 4)} ≠ 0, so the tangent step is well-defined — the fastest method available here (quadratic convergence near the root).`;
        } catch (err) {
          const fb = tryBisection();
          if (fb) {
            iterations = fb; method = "bisection"; isFallback = true;
            classificationLine = "Newton-Raphson failed — fell back to Bisection";
            why = "Newton-Raphson was attempted first because a starting guess x₀ was given.";
            fallbackNote = `Newton-Raphson failed: ${err.message} Falling back to Bisection using the bracket you gave — slower, but guaranteed to converge once bracketed.`;
          } else {
            return showError(`Newton-Raphson failed: ${err.message} Give a valid bracket [a, b] (f(a), f(b) of opposite sign) to enable the guaranteed fallback.`);
          }
        }
      }

      if (!method) {
        // No usable derivative (or a horizontal tangent right at x0) — Secant needs one more
        // point; manufacture it from x0 with a small step rather than asking the student for
        // a second number up front.
        const h = 0.01 * Math.max(1, Math.abs(x0));
        const x1 = x0 + h;
        try {
          iterations = Algorithms.runSecant(compiled.fn, x0, x1, tol, maxIter);
          method = "secant";
          classificationLine = "Secant Method — no usable derivative at x₀";
          why = `${deriv.ok ? `f′(x₀) ≈ 0` : "Could not differentiate f(x) symbolically"}, so Newton's tangent step isn't available. Used a second point x₁ = ${Engine.formatNum(x1, 4)} (x₀ plus a small step) automatically to run the Secant method instead.`;
        } catch (err) {
          const fb = tryBisection();
          if (fb) {
            iterations = fb; method = "bisection"; isFallback = true;
            classificationLine = "Secant failed — fell back to Bisection";
            why = "Secant was attempted after Newton's tangent step turned out not to be available.";
            fallbackNote = `Secant failed: ${err.message} Falling back to Bisection using the bracket you gave.`;
          } else {
            return showError(`Secant failed: ${err.message} Give a valid bracket [a, b] to enable the guaranteed fallback.`);
          }
        }
      }
    } else {
      iterations = tryBisection();
      method = "bisection";
      classificationLine = "Bisection — no starting guess given, bracket used directly";
      why = "No x₀ was given, so there's nothing to be clever about here — Bisection is the direct, always-converges choice once a valid sign-change bracket exists.";
    }

    render({ method, iterations, classificationLine, why, isFallback, fallbackNote, compiled, x0, bracket });
  });

  function render({ method, iterations, classificationLine, why, isFallback, fallbackNote, compiled, x0, bracket }) {
    placeholderPanel.style.display = "none";
    resultsArea.style.display = "block";

    Engine.renderClassification(classificationBox, { line: classificationLine, why, isFallback, fallbackNote });

    const norm = normalize(method, iterations);
    const last = norm[norm.length - 1];
    let fLast; try { fLast = compiled.fn(last.x); } catch (e) { fLast = NaN; }

    statRoot.textContent = Engine.formatNum(last.x, 8);
    statMethod.textContent = METHOD_LABEL[method];
    statIters.textContent = String(norm.length);
    statFRoot.textContent = Engine.formatNum(fLast, 6);
    statError.textContent = Engine.formatNum(last.err, 8);

    iterTableBody.innerHTML = norm.map((it) => {
      let f; try { f = compiled.fn(it.x); } catch (e) { f = NaN; }
      return `<tr data-n="${it.n}">
        <td>${it.n}</td>
        <td>${Engine.formatNum(it.x, 6)}</td>
        <td>${Engine.formatNum(f, 6)}</td>
        <td>${Engine.formatNum(it.err, 8)}</td>
      </tr>`;
    }).join("");

    const allX = [x0, bracket.a, bracket.b, ...norm.map((it) => it.x)].filter(Number.isFinite);
    const lo = Math.min(...allX), hi = Math.max(...allX);
    const pad = Math.max(0.5, (hi - lo) * 0.6 || 1);
    const xmin = lo - pad, xmax = hi + pad;
    const xs = [], ys = [];
    for (let i = 0; i <= 240; i++) {
      const x = xmin + ((xmax - xmin) * i) / 240;
      let y; try { y = compiled.fn(x); } catch (e) { y = null; }
      xs.push(x); ys.push(Number.isFinite(y) ? y : null);
    }

    const curveTrace = { x: xs, y: ys, mode: "lines", type: "scatter", name: "f(x)", line: { color: "#5c939f", width: 2 } };
    const zeroTrace = { x: [xmin, xmax], y: [0, 0], mode: "lines", type: "scatter", name: "y = 0", line: { color: "#7d858c", width: 1, dash: "dash" }, hoverinfo: "skip" };
    const pointsTrace = {
      x: norm.map((it) => it.x),
      y: norm.map((it) => { try { return compiled.fn(it.x); } catch (e) { return null; } }),
      mode: "markers", type: "scatter", name: "xₙ",
      marker: { size: 7, color: norm.map((it) => it.n), colorscale: [[0, "#5c939f"], [1, "#ed6d40"]], line: { color: "#090909", width: 1 } },
    };
    const currentTrace = {
      x: [last.x], y: [fLast], mode: "markers", type: "scatter", name: "current",
      marker: { size: 13, color: "#ed6d40", symbol: "circle-open", line: { width: 2, color: "#ed6d40" } },
    };

    Plotly.newPlot("fxPlot", [curveTrace, zeroTrace, pointsTrace, currentTrace],
      Engine.plotlyBaseLayout({ xaxis: { title: "x" }, yaxis: { title: "f(x)" } }), Engine.plotlyConfig);

    Plotly.newPlot("errorPlot", [{
      x: norm.map((it) => it.n), y: norm.map((it) => Math.max(it.err, 1e-16)),
      mode: "lines+markers", type: "scatter", line: { color: "#ed6d40", width: 2 }, marker: { size: 5, color: "#ed6d40" },
    }], Engine.plotlyBaseLayout({ xaxis: { title: "iteration n" }, yaxis: { title: "|error|", type: "log" } }), Engine.plotlyConfig);

    stepSlider.min = 0;
    stepSlider.max = norm.length - 1;
    stepSlider.value = norm.length - 1;
    state = { norm, compiled };
    updateStep(norm.length - 1);
  }

  function updateStep(idx) {
    if (!state) return;
    const it = state.norm[idx];
    stepLabel.textContent = `step ${it.n} / ${state.norm.length}`;
    document.querySelectorAll("#iterTable tbody tr").forEach((row) => {
      row.classList.toggle("is-current", Number(row.dataset.n) === it.n);
    });
    const rowEl = document.querySelector(`#iterTable tbody tr[data-n="${it.n}"]`);
    if (rowEl) rowEl.scrollIntoView({ block: "nearest" });
    let f; try { f = state.compiled.fn(it.x); } catch (e) { f = null; }
    Plotly.restyle("fxPlot", { x: [[it.x]], y: [[f]] }, [CURRENT_TRACE]);
  }

  stepSlider.addEventListener("input", (e) => updateStep(Number(e.target.value)));

  Engine.attachMathKeypad(fxInput, document.getElementById("fxKeypad"));
  Engine.attachKeypadToggle(document.getElementById("keypadToggle"), document.getElementById("fxKeypad"));

  updatePreview();
})();
