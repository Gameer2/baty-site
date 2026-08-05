/* Laplace Transform page wiring — Phase 3 of the ODE engine redesign. Three sections, one
   LaplaceEngine module behind them: a standalone transform/inverse-transform calculator, the
   staged "solve an IVP via Laplace" walkthrough (any order), and a convolution-theorem demo.
   Replaces the old dsolve()-front-end version of this file (see git history and the plan's
   design doc for why: that version never computed a transform at all). */
(function () {
  "use strict";

  function setStatus(statusEl, textEl, ok, msg) {
    statusEl.className = "status-line " + (ok ? "ok" : "bad");
    textEl.textContent = msg;
  }
  function showError(errEl, textEl, msg) { errEl.style.display = "block"; textEl.textContent = msg; }
  function hideError(errEl) { errEl.style.display = "none"; }

  // ---- Section tabs ----
  const tabs = document.querySelectorAll("#sectionTabs .tag");
  const sections = { calc: document.getElementById("calcSection"), ivp: document.getElementById("ivpSection"), conv: document.getElementById("convSection") };
  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      tabs.forEach((t) => t.classList.remove("is-active"));
      tab.classList.add("is-active");
      Object.keys(sections).forEach((key) => { sections[key].style.display = key === tab.dataset.section ? "" : "none"; });
    });
  });

  // ---- Transform Calculator ----
  (function () {
    const form = document.getElementById("calcForm");
    const input = document.getElementById("calcInput");
    const label = document.getElementById("calcInputLabel");
    const dirForward = document.getElementById("dirForward");
    const status = document.getElementById("calcStatus"), statusText = document.getElementById("calcStatusText");
    const errEl = document.getElementById("calcError"), errText = document.getElementById("calcErrorText");
    const placeholder = document.getElementById("calcPlaceholder");
    const resultsArea = document.getElementById("calcResultsArea");

    function updateLabel() { label.textContent = dirForward.checked ? "f(x)" : "F(s)"; }
    document.getElementsByName("calcDir").forEach((r) => r.addEventListener("change", updateLabel));
    updateLabel();

    document.querySelectorAll("#calcChips .tag").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.getElementById(btn.dataset.dir === "forward" ? "dirForward" : "dirInverse").checked = true;
        updateLabel();
        input.value = btn.dataset.v;
      });
    });

    form.addEventListener("submit", (e) => {
      e.preventDefault();
      hideError(errEl);
      const raw = input.value.trim();
      if (!raw) { setStatus(status, statusText, false, "Enter an expression."); return; }
      const forward = dirForward.checked;
      const call = forward ? LaplaceEngine.transformOf(raw) : LaplaceEngine.inverseOf(raw);
      call.then((out) => {
        placeholder.style.display = "none";
        resultsArea.style.display = "";
        if (!out.ok) {
          resultsArea.innerHTML = "";
          showError(errEl, errText, out.reason);
          setStatus(status, statusText, false, out.reason);
          return;
        }
        const outVar = forward ? "F(s)" : "f(x)";
        const classLine = out.distributional
          ? "Distributional transform — not independently verified (not Riemann-integrable), symbolic result only."
          : "Solved by SymPy, verified against the defining integral.";
        ODERender.bigBox(resultsArea, {
          classificationLine: classLine,
          generalSolution: `${outVar} = ${ODESymbolic.toLatex(out.result)}`,
          particularSolution: null,
        });
        setStatus(status, statusText, true, out.distributional ? "Computed (not independently verified)." : "Verified.");
      });
    });
  })();

  // ---- IVP walkthrough ----
  (function () {
    const form = document.getElementById("ivpForm");
    const input = document.getElementById("ivpInput");
    const icFields = document.getElementById("ivpIcFields");
    const status = document.getElementById("ivpStatus"), statusText = document.getElementById("ivpStatusText");
    const errEl = document.getElementById("ivpError"), errText = document.getElementById("ivpErrorText");
    const placeholder = document.getElementById("ivpPlaceholder");
    const resultsArea = document.getElementById("ivpResultsArea");

    function rebuildIcFields(icsCsv) {
      const order = ODESolver.detectOrder(input.value.trim());
      icFields.innerHTML = "";
      if (order === 0) return;
      const defaults = icsCsv ? icsCsv.split(",").map((s) => s.trim()) : [];
      const row = document.createElement("div");
      row.className = "field-row";
      row.style.flexWrap = "wrap";
      const labels = ["y(0)", "y'(0)", "y''(0)", "y'''(0)"];
      for (let k = 0; k < order; k++) {
        const f = document.createElement("div");
        f.className = "field";
        const lbl = labels[k] || `y^(${k})(0)`;
        const val = defaults[k] !== undefined ? defaults[k] : (k === 0 ? "1" : "0");
        f.innerHTML = `<label>${lbl}</label><input type="number" class="ic-input" data-role="ic${k}" value="${val}" step="any" />`;
        row.appendChild(f);
      }
      icFields.appendChild(row);
    }
    function readIcs() {
      const order = ODESolver.detectOrder(input.value.trim());
      const values = [];
      for (let k = 0; k < order; k++) {
        const el = icFields.querySelector(`[data-role="ic${k}"]`);
        const v = el ? parseFloat(el.value) : NaN;
        if (Number.isNaN(v)) return null;
        values.push(v);
      }
      return values;
    }

    document.querySelectorAll("#ivpChips .tag").forEach((btn) => {
      btn.addEventListener("click", () => {
        input.value = btn.dataset.eq;
        rebuildIcFields(btn.dataset.ics);
      });
    });
    input.addEventListener("input", Engine.debounce(() => rebuildIcFields(), 200));
    rebuildIcFields("0,0");

    form.addEventListener("submit", (e) => {
      e.preventDefault();
      hideError(errEl);
      const raw = input.value.trim();
      if (!raw) { setStatus(status, statusText, false, "Enter an equation."); return; }
      const ics = readIcs();
      if (ics === null) { setStatus(status, statusText, false, "Every initial condition needs a numeric value."); return; }

      LaplaceEngine.solveIvp(raw, ics).then((out) => {
        placeholder.style.display = "none";
        resultsArea.style.display = "";
        if (!out.ok) {
          resultsArea.innerHTML = "";
          showError(errEl, errText, out.reason);
          setStatus(status, statusText, false, out.reason);
          return;
        }
        // out.sDomainEq is already rendered LaTeX (LaplaceEngine.formatEqAsEquation converts
        // Python's "Eq(lhs, rhs)" into a proper "lhs = rhs" by LaTeX-converting each side
        // separately -- math.js can't parse a bare "lhs = rhs" as one expression, and running
        // the raw "Eq(...)" text through toLatex renders it as a literal \mathrm{Eq}(...) call,
        // not an equals sign) -- do not pass it through toLatex again here.
        const stages = "\\begin{gathered}" +
          "\\text{Transform: } " + out.sDomainEq + "\\\\" +
          "\\text{Solve: } Y(s) = " + ODESymbolic.toLatex(out.Ys) + "\\\\" +
          "\\text{Invert: } y(x) = " + ODESymbolic.toLatex(out.result) +
          "\\end{gathered}";
        ODERender.bigBox(resultsArea, {
          classificationLine: `Order ${out.order}, solved by Laplace transform — verified.`,
          generalSolution: stages,
          particularSolution: null,
        });
        setStatus(status, statusText, true, "Solved.");
      });
    });
  })();

  // ---- Convolution ----
  (function () {
    const form = document.getElementById("convForm");
    const fInput = document.getElementById("convF"), gInput = document.getElementById("convG");
    const status = document.getElementById("convStatus"), statusText = document.getElementById("convStatusText");
    const errEl = document.getElementById("convError"), errText = document.getElementById("convErrorText");
    const placeholder = document.getElementById("convPlaceholder");
    const resultsArea = document.getElementById("convResultsArea");

    form.addEventListener("submit", (e) => {
      e.preventDefault();
      hideError(errEl);
      const fText = fInput.value.trim(), gText = gInput.value.trim();
      if (!fText || !gText) { setStatus(status, statusText, false, "Enter both f(x) and g(x)."); return; }

      LaplaceEngine.convolutionOf(fText, gText).then((out) => {
        placeholder.style.display = "none";
        resultsArea.style.display = "";
        if (!out.ok) {
          resultsArea.innerHTML = "";
          showError(errEl, errText, out.reason);
          setStatus(status, statusText, false, out.reason);
          return;
        }
        const stages = "\\begin{gathered}" +
          "F(s) = " + ODESymbolic.toLatex(out.F) + "\\\\" +
          "G(s) = " + ODESymbolic.toLatex(out.G) + "\\\\" +
          "F(s)\\cdot G(s) = " + ODESymbolic.toLatex(out.product) + "\\\\" +
          "(f * g)(x) = " + ODESymbolic.toLatex(out.result) +
          "\\end{gathered}";
        ODERender.bigBox(resultsArea, {
          classificationLine: "Convolution theorem — verified against the direct convolution integral.",
          generalSolution: stages,
          particularSolution: null,
        });
        setStatus(status, statusText, true, "Verified.");
      });
    });
  })();

  Engine.attachMathKeypad(document.getElementById("calcInput"));
  Engine.attachMathKeypad(document.getElementById("ivpInput"));
})();