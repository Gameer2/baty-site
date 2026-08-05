/* Integral Calculator page wiring — the general-purpose "type any integral" tool that
   assets/js/integration-advanced.js's autoIntegrate() never had a UI for (it existed and was
   tested via tests/bench/baseline.js, but was unreachable from any page — see
   docs/kernel/04_BUILD_PHASES.md Phase 3 / memory: kernel<->production gap, same pattern one
   level up: engine<->UI this time).

   Two-tier solve: CAS.autoIntegrate() first (fast, worker-protected, everything the kernel and
   nerdamer already know how to do). If that refuses, SympyClient.integrate() as a fallback — a
   full general-purpose CAS running client-side via Pyodide/WebAssembly, for the genuinely-hard
   cases (e.g. degree>=3 irreducible rational denominators) that need Rothstein-Trager/Q(alpha)
   machinery this site's own kernel does not yet have (see project_math_lab_phase3_foundation_slice
   memory). SymPy is never trusted blindly: its answer is independently re-verified the same way
   every other technique on this site is, by numeric finite-difference against the integrand,
   before it is ever shown. */
(function () {
  "use strict";

  const fxInput = document.getElementById("fxInput");
  const fxPreview = document.getElementById("fxPreview");
  const startStatus = document.getElementById("startStatus");
  const startStatusText = document.getElementById("startStatusText");
  const formError = document.getElementById("formError");
  const formErrorText = document.getElementById("formErrorText");
  const form = document.getElementById("calcForm");
  const exampleBtn = document.getElementById("exampleBtn");
  const presetRow = document.getElementById("presetRow");

  const placeholderPanel = document.getElementById("placeholderPanel");
  const advancedNotice = document.getElementById("advancedNotice");
  const resultsArea = document.getElementById("resultsArea");
  const refusedPanel = document.getElementById("refusedPanel");
  const refusedReason = document.getElementById("refusedReason");
  const refusedTableBody = document.querySelector("#refusedTable tbody");
  const rejectedPanel = document.getElementById("rejectedPanel");
  const rejectedTableBody = document.querySelector("#rejectedTable tbody");

  const statTechnique = document.getElementById("statTechnique");
  const statVerified = document.getElementById("statVerified");
  const formulaResult = document.getElementById("formulaResult");

  const VARIABLE = "x";

  function updatePreview() {
    const raw = fxInput.value.trim();
    Engine.renderKatex(fxPreview, raw ? "\\int " + Engine.toLatex(raw) + "\\,dx" : "", false);
    Engine.pulseFlash(fxPreview);
  }

  function updateStartCheck() {
    const raw = fxInput.value.trim();
    if (!raw) {
      startStatus.className = "status-line bad";
      startStatusText.textContent = "Enter an integrand.";
      return null;
    }
    const compiled = Engine.compileFx(raw, VARIABLE);
    if (!compiled.ok) {
      startStatus.className = "status-line bad";
      startStatusText.textContent = compiled.error;
      return null;
    }
    startStatus.className = "status-line ok";
    startStatusText.textContent = "Integrand parses — press Solve to run the toolkit.";
    return compiled;
  }

  function showError(msg) {
    formError.style.display = "block";
    formErrorText.textContent = msg;
  }

  function hideError() {
    formError.style.display = "none";
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  // The four mutually-exclusive top-level states this page can be in. Centralized so a new
  // state can't accidentally leave a stale panel visible (each caller used to hand-toggle its
  // own subset of these four, which is exactly the kind of thing that drifts out of sync).
  const PANELS = { placeholder: placeholderPanel, advancedNotice, results: resultsArea, refused: refusedPanel };
  function showPanel(name) {
    for (const key of Object.keys(PANELS)) PANELS[key].style.display = key === name ? "" : "none";
  }

  function renderTechniqueRows(tbody, list, emptyMessage) {
    tbody.innerHTML = (list || [])
      .map((r) => `<tr><td class="mono">${escapeHtml(r.technique)}</td><td>${escapeHtml(r.reason || "")}</td></tr>`)
      .join("") || (emptyMessage ? `<tr><td colspan="2">${emptyMessage}</td></tr>` : "");
  }

  function showRefused(reason, rejected) {
    showPanel("refused");
    refusedReason.textContent = reason;
    renderTechniqueRows(refusedTableBody, rejected, "No technique produced a usable reason.");
  }

  function render(technique, resultText, verified, integrand, rejected) {
    showPanel("results");

    statTechnique.textContent = technique;
    statVerified.textContent = verified ? "✓ verified" : "unverified";

    Engine.renderKatex(formulaResult, "\\int " + Engine.toLatex(integrand) + "\\,dx = " + Engine.toLatex(resultText) + " + C", true);

    const rej = rejected || [];
    rejectedPanel.style.display = rej.length ? "" : "none";
    renderTechniqueRows(rejectedTableBody, rej);

    plot(integrand, resultText);
  }

  /* Like Engine.compileFx, but (1) evaluates log/ln on the REAL branch (Math.log(Math.abs(v)))
     instead of math.js's complex-valued log, matching the numeric-verification convention
     already established in tests/verify-poly-properties.js's numEval — SymPy's (and the
     kernel's own) antiderivatives routinely contain a bare log(x-r) that is genuinely only
     real-valued on one side of r, exactly like the textbook convention "the antiderivative is
     ln|x-r|, not ln(x-r)" — and (2) does NOT smoke-test at a fixed point before returning
     ok:true, because that fixed point can itself land outside a branch-restricted domain
     (e.g. x=1 is outside log(x-2^(1/3))'s real domain) and would wrongly reject an otherwise
     good function. Domain issues are handled per-sample-point by the caller instead. */
  function compileRealFx(exprStr, variable) {
    try {
      if (!exprStr || !exprStr.trim()) return { ok: false, error: "Enter an expression." };
      const node = math.parse(exprStr);
      const code = node.compile();
      const realLog = (v) => Math.log(Math.abs(v));
      const fn = (val) => {
        const scope = { log: realLog, ln: realLog };
        scope[variable] = val;
        const r = code.evaluate(scope);
        if (typeof r !== "number" || Number.isNaN(r)) throw new Error("not a real number");
        return r;
      };
      return { ok: true, fn };
    } catch (err) {
      return { ok: false, error: err.message || String(err) };
    }
  }

  function plot(integrand, antiderivative) {
    const f = compileRealFx(integrand, VARIABLE);
    const F = compileRealFx(antiderivative, VARIABLE);
    if (!f.ok || !F.ok) {
      Plotly.purge("fxPlot");
      return;
    }
    const xs = [], fs = [], Fs = [];
    for (let i = 0; i <= 300; i++) {
      const x = -4 + (i / 300) * 8;
      let yf, yF;
      try { yf = f.fn(x); } catch { yf = null; }
      try { yF = F.fn(x); } catch { yF = null; }
      xs.push(x);
      fs.push(Number.isFinite(yf) ? yf : null);
      Fs.push(Number.isFinite(yF) ? yF : null);
    }
    Plotly.newPlot("fxPlot", [
      { x: xs, y: fs, mode: "lines", name: "f(x)", line: { color: "#5c939f", width: 2.5 } },
      { x: xs, y: Fs, mode: "lines", name: "F(x)", line: { color: "#ed6d40", width: 2, dash: "dash" } }
    ], Engine.plotlyBaseLayout({}), Engine.plotlyConfig);
  }

  /* Independent numeric finite-difference check — SymPy is a different codebase entirely, but
     this site's own discipline (docs/kernel/03_ARCHITECTURE.md L4: never trust a symbolic
     result without an independent check) applies to it exactly as it does to every in-house
     technique. Shares no code with SymPy's own internal verification (it has none exposed to
     us anyway) or with the kernel's checks. */
  function verifyNumerically(resultText, integrandText) {
    const F = compileRealFx(resultText, VARIABLE);
    const f = compileRealFx(integrandText, VARIABLE);
    if (!F.ok || !f.ok) return false;
    const h = 1e-5;
    let usable = 0;
    for (const x of [0.37, 0.83, 1.29, 1.71, 2.13, -0.61, -1.47]) {
      let fp, gx;
      try { fp = (F.fn(x + h) - F.fn(x - h)) / (2 * h); } catch (e) { continue; }
      try { gx = f.fn(x); } catch (e) { continue; }
      if (!Number.isFinite(fp) || !Number.isFinite(gx)) continue;
      usable++;
      if (Math.abs(fp - gx) > 1e-3 * Math.max(1, Math.abs(gx))) return false;
    }
    return usable >= 3;
  }

  // SymPy's str() output is Python syntax: ** for power (site/math.js convention is ^),
  // Abs(...) capitalized (math.js wants lowercase abs). Natural log already prints as
  // "log(...)" in SymPy, which matches this site's own nerdamer-facing convention (see
  // calc-core.js's tidy() — no "ln" translation needed here, only for the kernel's own output).
  function normalizeSympyText(s) {
    return s.replace(/\*\*/g, "^").replace(/\bAbs\(/g, "abs(");
  }

  function trySympyFallback(integrand, submitBtn, previousLabel) {
    showPanel("advancedNotice");
    if (submitBtn) submitBtn.textContent = "Trying advanced solver…";

    return SympyClient.integrate(integrand, VARIABLE)
      .then((out) => {
        const normalized = normalizeSympyText(out.resultText);
        if (!verifyNumerically(normalized, integrand)) {
          showRefused(
            "SymPy returned an answer, but it did not independently verify against the integrand — refusing to show a result this site cannot confirm.",
            [{ technique: "SymPy (general CAS)", reason: "differentiate-back check failed" }]
          );
          return;
        }
        render("SymPy (general CAS)", normalized, true, integrand, []);
      })
      .catch((err) => {
        showRefused(
          "No technique in the fast toolkit could solve this, and the advanced solver could not either.",
          [{ technique: "SymPy (general CAS)", reason: err.message }]
        );
      });
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    hideError();
    const compiled = updateStartCheck();
    if (!compiled) return;

    const integrand = fxInput.value.trim();
    const submitBtn = form.querySelector('button[type="submit"] .btn-text');
    const previousLabel = submitBtn ? submitBtn.textContent : null;
    if (submitBtn) submitBtn.textContent = "Solving…";

    CAS.autoIntegrate(integrand, VARIABLE)
      .then((result) => {
        if (!result.ok) {
          return trySympyFallback(integrand, submitBtn, previousLabel);
        }
        render(result.technique, result.result, !!result.verified, integrand, result.rejected);
      })
      .catch((err) => showError(err.message))
      .then(() => {
        if (submitBtn) submitBtn.textContent = previousLabel;
        if (CAS.mode() === "sync") {
          startStatus.className = "status-line bad";
          startStatusText.textContent =
            "Running without a Web Worker (opened over file://?) — a difficult expression can freeze the page, and the advanced SymPy fallback is unavailable entirely. Serve the site over http:// to restore both.";
        }
      });
  });

  exampleBtn.addEventListener("click", () => {
    fxInput.value = "1/(x^3-2)";
    updatePreview();
    updateStartCheck();
    form.requestSubmit();
  });

  presetRow.addEventListener("click", (e) => {
    const btn = e.target.closest(".tag");
    if (!btn) return;
    fxInput.value = btn.dataset.fx;
    updatePreview();
    updateStartCheck();
    form.requestSubmit();
  });

  const debounced = Engine.debounce(() => { updatePreview(); updateStartCheck(); }, 220);
  fxInput.addEventListener("input", debounced);

  Engine.attachMathKeypad(fxInput, document.getElementById("fxKeypad"));
  Engine.attachKeypadToggle(document.getElementById("keypadToggle"), document.getElementById("fxKeypad"));

  updatePreview();
  updateStartCheck();
})();
