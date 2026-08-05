/* L'Hopital's Rule page wiring. All symbolic work lives in calculus-symbolic.js and runs
   inside the CAS worker — this file only reads inputs, calls CAS.lhopital, and renders.

   Unlike the Limits page (which treats L'Hopital as one path among several and always finds
   an answer when one exists), this page's entire point is the indeterminate-form check
   itself: a quotient that ISN'T 0/0 or ∞/∞ at the point is refused, even if its limit is
   perfectly easy to find some other way. Same refusal-is-a-result idiom as u-substitution. */
(function () {
  "use strict";

  const fxInput = document.getElementById("fxInput");
  const atInput = document.getElementById("atInput");
  const fxPreview = document.getElementById("fxPreview");
  const startStatus = document.getElementById("startStatus");
  const startStatusText = document.getElementById("startStatusText");
  const formError = document.getElementById("formError");
  const formErrorText = document.getElementById("formErrorText");
  const form = document.getElementById("lhopitalForm");
  const presetRow = document.getElementById("presetRow");

  const placeholderPanel = document.getElementById("placeholderPanel");
  const resultsArea = document.getElementById("resultsArea");
  const refusedPanel = document.getElementById("refusedPanel");
  const refusedReason = document.getElementById("refusedReason");

  const statValue = document.getElementById("statValue");
  const formulaResult = document.getElementById("formulaResult");
  const stepTableBody = document.querySelector("#stepTable tbody");
  const stepSlider = document.getElementById("stepSlider");
  const stepLabel = document.getElementById("stepLabel");

  const VARIABLE = "x";
  let state = null;

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  function parsePoint(raw) {
    const s = String(raw).trim();
    if (/^[+]?inf(inity)?$/i.test(s)) return { ok: true, value: "Infinity", label: "∞" };
    if (/^-inf(inity)?$/i.test(s)) return { ok: true, value: "-Infinity", label: "-∞" };
    const n = parseFloat(s);
    if (!Number.isFinite(n)) return { ok: false };
    return { ok: true, value: s, label: s };
  }

  function updatePreview() {
    const raw = fxInput.value.trim();
    const pt = parsePoint(atInput.value);
    const tex = raw ? Engine.toLatex(raw) : "";
    const at = pt.ok ? (pt.label === "∞" ? "\\infty" : pt.label === "-∞" ? "-\\infty" : pt.label) : "?";
    Engine.renderKatex(fxPreview, raw ? `\\lim_{x \\to ${at}} ${tex}` : "", false);
    Engine.pulseFlash(fxPreview);
  }

  function updateStartCheck() {
    const raw = fxInput.value.trim();
    if (!raw) {
      startStatus.className = "status-line bad";
      startStatusText.textContent = "Enter a quotient f(x)/g(x).";
      return false;
    }
    const compiled = Engine.compileFx(raw, VARIABLE);
    if (!compiled.ok) {
      startStatus.className = "status-line bad";
      startStatusText.textContent = compiled.error;
      return false;
    }
    if (!parsePoint(atInput.value).ok) {
      startStatus.className = "status-line bad";
      startStatusText.textContent = "The point must be a number, Infinity, or -Infinity.";
      return false;
    }
    startStatus.className = "status-line ok";
    startStatusText.textContent = "Ready — press Apply.";
    return true;
  }

  function showError(msg) {
    formError.style.display = "block";
    formErrorText.textContent = msg;
  }

  function showRefused(reason) {
    resultsArea.style.display = "none";
    placeholderPanel.style.display = "none";
    refusedPanel.style.display = "";
    refusedReason.textContent = reason;
  }

  // SymPy's str() output: ** for power, oo/-oo for infinity (math.js/KaTeX want Infinity, which
  // Engine.toLatex already renders as \infty), Abs(...) capitalized.
  function normalizeSympyLimitText(s) {
    return s.replace(/\*\*/g, "^").replace(/\bAbs\(/g, "abs(").replace(/\boo\b/g, "Infinity");
  }

  // Independent numeric check, same discipline as the integration fallback: sample the
  // function approaching the point (both sides for a finite point, one direction for ±∞) and
  // confirm it actually heads where SymPy claims — finite convergence, or unbounded growth in
  // the claimed direction for an infinite result. Shares no code with SymPy's own machinery.
  function verifyLimitNumerically(exprStr, variable, pointVal, claimedText) {
    const f = SympyIntegrateFallback.compileRealFx(exprStr, variable);
    if (!f.ok) return false;

    let claimedNum;
    try { claimedNum = math.evaluate(claimedText); } catch (e) { return false; }
    if (typeof claimedNum !== "number") return false;

    function sampleApproaching(xs) {
      const ys = [];
      for (const x of xs) {
        try { const y = f.fn(x); if (Number.isFinite(y)) ys.push(y); } catch (e) { /* skip */ }
      }
      return ys;
    }

    let series;
    if (pointVal === "Infinity") series = [sampleApproaching([10, 100, 1000, 10000, 100000])];
    else if (pointVal === "-Infinity") series = [sampleApproaching([-10, -100, -1000, -10000, -100000])];
    else {
      const p = parseFloat(pointVal);
      series = [
        sampleApproaching([1e-1, 1e-2, 1e-3, 1e-4].map((h) => p - h)),
        sampleApproaching([1e-1, 1e-2, 1e-3, 1e-4].map((h) => p + h))
      ];
    }

    if (!Number.isFinite(claimedNum)) {
      const sign = claimedNum > 0 ? 1 : -1;
      return series.every((s) => s.length >= 2 && s.every((v) => v * sign > 0) && Math.abs(s[s.length - 1]) > Math.abs(s[0]) * 5);
    }

    const tail = series.map((s) => s[s.length - 1]).filter(Number.isFinite);
    if (tail.length < 1) return false;
    const tol = 1e-2 * Math.max(1, Math.abs(claimedNum));
    return tail.every((v) => Math.abs(v - claimedNum) < tol);
  }

  function buildSympyLimitResult(rawValue) {
    const normalized = normalizeSympyLimitText(rawValue);
    const latex = Engine.toLatex(normalized);
    return {
      value: normalized,
      latex,
      steps: [{
        rule: "Solved via SymPy (general CAS) — L'Hôpital applies here, but didn't settle to a closed form within the step cap",
        latex
      }]
    };
  }

  // Only called when computeLHopital's OWN refusal reason says the form genuinely was
  // indeterminate (0/0 or ∞/∞) and L'Hôpital applies in principle — never for "not an
  // indeterminate form" or "the limit doesn't exist," which are this page's whole point and
  // must stay refused, not be quietly answered by a general solver.
  function trySympyLimitFallback(pt) {
    const exprStr = fxInput.value.trim();
    if (typeof SympyClient === "undefined") {
      showRefused("L'Hôpital's Rule applies here but didn't settle within the step cap, and the advanced SymPy solver isn't available on this page.");
      return Promise.resolve();
    }
    return SympyClient.limit(exprStr, VARIABLE, pt.value)
      .then((out) => {
        const normalized = normalizeSympyLimitText(out.resultText);
        if (!verifyLimitNumerically(exprStr, VARIABLE, pt.value, normalized)) {
          showRefused("L'Hôpital's Rule applies here, but neither the step cap nor the general-purpose SymPy solver could settle it with a result this site could independently verify.");
          return;
        }
        render(buildSympyLimitResult(out.resultText), pt);
      })
      .catch((err) => {
        showRefused("L'Hôpital's Rule applies here but didn't settle within the step cap, and the advanced SymPy solver couldn't close it either: " + err.message);
      });
  }

  function render(result, pt) {
    placeholderPanel.style.display = "none";
    refusedPanel.style.display = "none";
    resultsArea.style.display = "";
    formError.style.display = "none";
    state = { steps: result.steps };

    statValue.textContent = String(result.value);

    const atTex = pt.label === "∞" ? "\\infty" : pt.label === "-∞" ? "-\\infty" : pt.label;
    const lhs = `\\lim_{x \\to ${atTex}} ${Engine.toLatex(fxInput.value.trim())}`;
    Engine.renderKatex(formulaResult, `${lhs} = ${result.latex}`, true);

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

    plot(pt);
  }

  function plot(pt) {
    const f = Engine.compileFx(fxInput.value.trim(), VARIABLE);
    if (!f.ok) { Plotly.purge("fxPlot"); return; }

    const finite = /^-?[\d.]+$/.test(pt.value);
    const numericPt = finite ? parseFloat(pt.value) : null;
    const lo = finite ? numericPt - 2 : 0.5;
    const hi = finite ? numericPt + 2 : 60;

    const xs = [], ys = [];
    for (let i = 0; i <= 600; i++) {
      const x = lo + (i / 600) * (hi - lo);
      let y;
      try { y = f.fn(x); } catch { y = null; }
      xs.push(x);
      ys.push(Number.isFinite(y) ? y : null);
    }

    const shapes = [];
    if (finite) {
      shapes.push({
        type: "line", x0: numericPt, x1: numericPt, yref: "paper", y0: 0, y1: 1,
        line: { color: "#7d858c", width: 1, dash: "dot" }
      });
    }

    Plotly.newPlot("fxPlot", [{ x: xs, y: ys, mode: "lines", name: "f(x)/g(x)", line: { color: "#5c939f", width: 2.5 } }],
      Engine.plotlyBaseLayout({ shapes, showlegend: false }), Engine.plotlyConfig);
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

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    formError.style.display = "none";
    if (!updateStartCheck()) return;

    const pt = parsePoint(atInput.value);
    const submitBtn = form.querySelector('button[type="submit"] .btn-text');
    const previousLabel = submitBtn ? submitBtn.textContent : null;
    if (submitBtn) submitBtn.textContent = "Applying…";

    CAS.lhopital(fxInput.value.trim(), VARIABLE, pt.value)
      .then((result) => {
        if (!result.ok) {
          const stalledNotUnapplicable = /did not settle to a closed form/.test(result.reason);
          if (stalledNotUnapplicable) {
            startStatusText.textContent = "L'Hôpital applies but stalled — trying the general-purpose SymPy solver…";
            return trySympyLimitFallback(pt);
          }
          showRefused(result.reason);
          return;
        }
        render(result, pt);
      })
      .catch((err) => showError(err.message))
      .then(() => {
        if (submitBtn) submitBtn.textContent = previousLabel;
        if (CAS.mode() === "sync") {
          startStatus.className = "status-line bad";
          startStatusText.textContent =
            "Running without a Web Worker (opened over file://?) — a difficult expression can freeze the page. Serve the site over http:// to restore the safety timeout.";
        }
      });
  });

  presetRow.addEventListener("click", (e) => {
    const btn = e.target.closest(".tag");
    if (!btn) return;
    fxInput.value = btn.dataset.fx;
    atInput.value = btn.dataset.at;
    updatePreview();
    updateStartCheck();
    form.requestSubmit();
  });

  stepSlider.addEventListener("input", () => updateStep(Number(stepSlider.value)));

  const debounced = Engine.debounce(() => { updatePreview(); updateStartCheck(); }, 220);
  fxInput.addEventListener("input", debounced);
  atInput.addEventListener("input", debounced);

  Engine.attachMathKeypad(fxInput, document.getElementById("fxKeypad"));
  Engine.attachKeypadToggle(document.getElementById("keypadToggle"), document.getElementById("fxKeypad"));

  updatePreview();
  updateStartCheck();
})();
