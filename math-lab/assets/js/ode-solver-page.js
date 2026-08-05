/* ODE Solver page wiring. Detects the equation's order from the typed text, renders that many
   initial-condition fields on demand, calls ODESolver.solve (general, no IC) for the general
   solution and — if the user supplied one — a second call (with IC) for the particular
   solution, then renders both through the existing ODERender.bigBox. Falls back to a numeric
   plot only for order 1 (Euler/RK4) when no closed form is found — see the plan's Global
   Constraints for why higher orders don't get a numeric fallback in this phase. */
(function () {
  "use strict";

  const odeInput = document.getElementById("odeInput");
  const odePreview = document.getElementById("odePreview");
  const icToggle = document.getElementById("icToggle");
  const icFields = document.getElementById("icFields");
  const form = document.getElementById("solverForm");
  const formError = document.getElementById("formError");
  const formErrorText = document.getElementById("formErrorText");
  const startStatus = document.getElementById("startStatus");
  const startStatusText = document.getElementById("startStatusText");
  const placeholderPanel = document.getElementById("placeholderPanel");
  const resultsArea = document.getElementById("resultsArea");
  const fallbackPlotWrap = document.getElementById("fallbackPlotWrap");

  function showError(msg) { formError.style.display = "block"; formErrorText.textContent = msg; }
  function hideError() { formError.style.display = "none"; }
  function setStatus(ok, msg) {
    startStatus.className = "status-line " + (ok ? "ok" : "bad");
    startStatusText.textContent = msg;
  }

  function updatePreview() {
    const raw = odeInput.value.trim();
    Engine.renderKatex(odePreview, raw ? (raw.includes("=") ? raw : `${raw} = 0`) : "", false);
    Engine.pulseFlash(odePreview);
  }

  // Rebuilds the IC field list to match the current input's detected order: x0, then one
  // field per derivative order (y(x0), y'(x0), y''(x0), ...).
  function rebuildIcFields() {
    const order = ODESolver.detectOrder(odeInput.value.trim());
    icFields.innerHTML = "";
    if (order === 0) return;
    const row = document.createElement("div");
    row.className = "field-row";
    row.style.flexWrap = "wrap";
    const x0Field = document.createElement("div");
    x0Field.className = "field";
    x0Field.innerHTML = '<label>x₀</label><input type="number" class="ic-input" data-role="x0" value="0" step="any" />';
    row.appendChild(x0Field);
    const labels = ["y(x₀)", "y'(x₀)", "y''(x₀)", "y'''(x₀)", "y⁗(x₀)"];
    for (let k = 0; k < order; k++) {
      const f = document.createElement("div");
      f.className = "field";
      const label = labels[k] || `y^(${k})(x₀)`;
      f.innerHTML = `<label>${label}</label><input type="number" class="ic-input" data-role="deriv${k}" value="${k === 0 ? 1 : 0}" step="any" />`;
      row.appendChild(f);
    }
    icFields.appendChild(row);
  }

  function readIc() {
    if (!icToggle.checked) return null;
    const x0Input = icFields.querySelector('[data-role="x0"]');
    const x0 = parseFloat(x0Input.value);
    if (Number.isNaN(x0)) return { invalid: true };
    const order = ODESolver.detectOrder(odeInput.value.trim());
    const derivValues = [];
    for (let k = 0; k < order; k++) {
      const v = parseFloat(icFields.querySelector(`[data-role="deriv${k}"]`).value);
      if (Number.isNaN(v)) return { invalid: true };
      derivValues.push(v);
    }
    return { x0, derivValues };
  }

  icToggle.addEventListener("change", () => {
    if (icToggle.checked) rebuildIcFields();
    icFields.style.display = icToggle.checked ? "" : "none";
  });

  document.querySelectorAll("#exampleChips .tag").forEach((btn) => {
    btn.addEventListener("click", () => {
      odeInput.value = btn.dataset.eq;
      updatePreview();
      if (icToggle.checked) rebuildIcFields();
    });
  });

  function renderFallbackPlot(equationText, order, ic) {
    if (order === 1) {
      const rhs = equationText.split("=")[1] || equationText.replace(/^y'\s*/, "");
      let fn;
      try { fn = math.parse(rhs.trim()).compile(); } catch (e) { return false; }
      const evalFn = (x, y) => fn.evaluate({ x, y });
      const x0 = ic ? ic.x0 : 0, y0 = ic ? ic.derivValues[0] : 1;
      const { path, rk4Path } = ODESymbolic.eulerRK4FirstOrder(evalFn, x0, y0, 0.1, 40);
      fallbackPlotWrap.style.display = "";
      Plotly.newPlot("fallbackPlot", [
        { x: path.map((p) => p.x), y: path.map((p) => p.y), mode: "lines", name: "Euler", line: { color: "#ed6d40", width: 2 } },
        { x: rk4Path.map((p) => p.x), y: rk4Path.map((p) => p.y), mode: "lines", name: "RK4", line: { color: "#59a993", width: 2 } }
      ], Engine.plotlyBaseLayout({ xaxis: { title: "x" }, yaxis: { title: "y" } }), Engine.plotlyConfig);
      return true;
    }
    // Order 2+ numeric fallback needs an explicit y''=... system, which this general page no
    // longer parses. Per the plan's Global Constraints, orders >= 2 that fail symbolically get
    // an honest refusal instead of a numeric plot in this phase.
    return false;
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    hideError();
    fallbackPlotWrap.style.display = "none";
    const raw = odeInput.value.trim();
    if (!raw) { setStatus(false, "Enter an equation."); return; }

    const order = ODESolver.detectOrder(raw);
    if (order === 0) { setStatus(false, "Couldn't find a y', y'', ... term — this doesn't look like an ODE."); return; }

    const ic = readIc();
    if (ic && ic.invalid) { setStatus(false, "The initial condition needs numeric values in every field."); return; }

    // Hardcode the restore label rather than capturing/restoring .textContent: Engine.initChrome()
    // injects a hidden duplicate-text span into .btn-text for the hover-flip animation, and
    // .textContent concatenates both spans regardless of visibility — capturing "prev" here would
    // silently read back "SolveSolve" instead of "Solve".
    const submitBtn = form.querySelector('button[type="submit"] .btn-text');
    if (submitBtn) submitBtn.textContent = "Solving…";

    ODESolver.solve(raw, null).then((generalOut) => {
      placeholderPanel.style.display = "none";
      resultsArea.style.display = "";
      if (!generalOut.ok) {
        const handled = renderFallbackPlot(raw, order, ic);
        if (handled) {
          resultsArea.innerHTML = '<div class="status-line bad"><span class="status-dot"></span>' +
            '<span>No closed form — solved numerically instead.</span></div>';
          setStatus(true, "No closed form — showing a numeric solution.");
        } else {
          resultsArea.innerHTML = "";
          showError(generalOut.reason);
          setStatus(false, generalOut.reason);
        }
        return Promise.resolve();
      }
      if (!ic) {
        ODERender.bigBox(resultsArea, {
          classificationLine: generalOut.classification + " — solved by SymPy, verified.",
          generalSolution: `y = ${ODESymbolic.toLatex(generalOut.result)}`,
          particularSolution: null,
        });
        setStatus(true, "Solved.");
        return Promise.resolve();
      }
      return ODESolver.solve(raw, ic).then((particularOut) => {
        ODERender.bigBox(resultsArea, {
          classificationLine: generalOut.classification + " — solved by SymPy, verified.",
          generalSolution: `y = ${ODESymbolic.toLatex(generalOut.result)}`,
          particularSolution: particularOut.ok ? `y = ${ODESymbolic.toLatex(particularOut.result)}` : null,
        });
        setStatus(true, particularOut.ok ? "Solved." : "Solved the general form; the initial condition didn't verify against a particular solution.");
      });
    }).catch((err) => {
      showError(err.message || String(err));
      setStatus(false, err.message || String(err));
    }).then(() => {
      if (submitBtn) submitBtn.textContent = "Solve";
    });
  });

  Engine.attachMathKeypad(odeInput, document.getElementById("odeKeypad"));
  Engine.attachKeypadToggle(document.getElementById("keypadToggle"), document.getElementById("odeKeypad"));
  odeInput.addEventListener("input", Engine.debounce(() => { updatePreview(); if (icToggle.checked) rebuildIcFields(); }, 200));
  updatePreview();
})();
