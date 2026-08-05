/* Multiple Integrals — page wiring.
   Symbolic work (the two nested antiderivatives, the nested-Simpson verification) lives in
   calculus-symbolic.js and runs in the CAS worker; this file reads the integrand, the mode
   (cartesian Type I region, or polar), the outer bounds, and the inner bounds (which may be
   curves in the outer variable), calls CAS.multipleIntegral, renders the exact value +
   derivation, and draws the signature visual — the surface z = f over the region, its
   boundary traced at the base and lifted onto the roof — using Scene3D.addParametricSurface,
   the generalization built for this page (see calculus-3d.js). The (outer, t) parametrization
   with t ∈ [0,1] mapped to lower(outer)..upper(outer) handles a Type I region's x-dependent
   y-bounds and a polar region's θ-dependent r-bounds with the same code path. */
(function () {
  "use strict";

  const fInput = document.getElementById("fInput");
  const fLabel = document.getElementById("fLabel");
  const modeSelect = document.getElementById("modeSelect");
  const aInput = document.getElementById("aInput");
  const bInput = document.getElementById("bInput");
  const lowerInput = document.getElementById("lowerInput");
  const upperInput = document.getElementById("upperInput");
  const outerLabel = document.getElementById("outerLabel");
  const innerLabel = document.getElementById("innerLabel");
  const fPreview = document.getElementById("fPreview");
  const startStatus = document.getElementById("startStatus");
  const startStatusText = document.getElementById("startStatusText");
  const formError = document.getElementById("formError");
  const formErrorText = document.getElementById("formErrorText");
  const form = document.getElementById("miForm");
  const exampleBtn = document.getElementById("exampleBtn");
  const presetRow = document.getElementById("presetRow");

  const placeholderPanel = document.getElementById("placeholderPanel");
  const resultsArea = document.getElementById("resultsArea");
  const statValue = document.getElementById("statValue");
  const statNumeric = document.getElementById("statNumeric");
  const statMode = document.getElementById("statMode");
  const formulaResult = document.getElementById("formulaResult");
  const stepTableBody = document.querySelector("#stepTable tbody");
  const stepSlider = document.getElementById("stepSlider");
  const stepLabel = document.getElementById("stepLabel");
  const sceneHost = document.getElementById("sceneHost");
  const legend = document.getElementById("sceneLegend");

  const COL = { surface: 0x4f9e82, base: 0x7d858c, roof: 0x9bcf6b };

  let scene = null;
  let state = null;

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  // Takes an explicit polar flag rather than reading modeSelect.value live everywhere: the
  // scene-drawing path must key off the mode the CAS result actually came back for, not
  // whatever the <select> says by the time the async call resolves (the user could have
  // flipped it mid-flight).
  function isPolar() { return modeSelect.value === "polar"; }
  function outerVarName(polar) { return polar ? "theta" : "x"; }
  function innerVarName(polar) { return polar ? "r" : "y"; }

  function syncLabels() {
    if (isPolar()) {
      fLabel.textContent = "f(r, θ) =";
      outerLabel.textContent = "θ ∈ [";
      innerLabel.textContent = "r ∈ [lower(θ), upper(θ)] = [";
    } else {
      fLabel.textContent = "f(x, y) =";
      outerLabel.textContent = "x ∈ [";
      innerLabel.textContent = "y ∈ [lower(x), upper(x)] = [";
    }
  }

  function updatePreview() {
    const raw = fInput.value.trim();
    if (!raw) { Engine.renderKatex(fPreview, "", false); return; }
    const tex = Engine.toLatex(raw);
    const head = isPolar() ? "f(r,\\theta)=" : "f(x,y)=";
    Engine.renderKatex(fPreview, head + tex, false);
    Engine.pulseFlash(fPreview);
  }

  function showError(msg) { formError.style.display = "block"; formErrorText.textContent = msg; }

  function updateStartCheck() {
    const raw = fInput.value.trim();
    if (!raw) { setBad("Enter the integrand."); return false; }
    const ov = outerVarName(isPolar()), iv = innerVarName(isPolar());
    let code;
    try {
      code = math.parse(raw).compile();
      code.evaluate({ [ov]: 1, [iv]: 1 });
    } catch (e) {
      const msg = (e && e.message) || String(e);
      if (/undefined symbol/i.test(msg)) { setBad("The integrand uses an unknown symbol: " + msg); return false; }
      if (/syntax|unexpected|expected/i.test(msg)) { setBad("The integrand doesn't parse: " + msg); return false; }
      // Otherwise valid but not defined at the smoke-test point — not a reason to block.
    }
    for (const el of [aInput, bInput]) {
      try { const v = math.evaluate(el.value.trim()); if (typeof v !== "number" || !Number.isFinite(v)) throw 0; }
      catch (e) { setBad("The outer bounds must be numbers (or constants like pi)."); return false; }
    }
    if (!lowerInput.value.trim() || !upperInput.value.trim()) { setBad("Enter both inner bounds."); return false; }
    startStatus.className = "status-line ok";
    startStatusText.textContent = "Ready — press Evaluate.";
    return true;
    function setBad(msg) { startStatus.className = "status-line bad"; startStatusText.textContent = msg; }
  }

  function render(result) {
    placeholderPanel.style.display = "none";
    resultsArea.style.display = "";
    formError.style.display = "none";
    state = { steps: result.steps };

    statValue.textContent = String(result.value);
    statNumeric.textContent = "≈ " + Engine.formatNum(result.numeric, 6);
    statMode.textContent = result.mode === "polar" ? "polar" : "cartesian";

    Engine.renderKatex(formulaResult, result.latex, true);

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

    drawScene(result);
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

  /* ---- the 3D scene ----
     The surface z = f over the region, plus its boundary traced at the base (z = 0) and lifted
     onto the roof (z = f along the boundary) — the "solid under the surface, over this region"
     picture. (x, t) or (θ, t) with t ∈ [0,1] normalizes the possibly outer-variable-dependent
     inner bound into a fixed parameter rectangle, which is exactly what
     Scene3D.addParametricSurface needs. The height plotted is always the plain f — never the
     polar r-Jacobian-weighted integrand — because the surface being integrated is the same
     physical surface regardless of which coordinates measure its base. */
  function ensureScene() {
    if (!scene) {
      if (typeof Scene3D === "undefined") {
        sceneHost.innerHTML = '<p class="p1" style="padding:1.5rem;color:var(--off-white)">3D rendering is unavailable here.</p>';
        return null;
      }
      scene = new Scene3D(sceneHost);
    }
    return scene;
  }

  function drawScene(result) {
    const s = ensureScene();
    if (!s) return;
    s.clear();

    const polar = result.mode === "polar";
    const f = makeFn2(fInput.value.trim(), polar);
    const lowerFn = makeFn1(lowerInput.value.trim(), polar);
    const upperFn = makeFn1(upperInput.value.trim(), polar);
    const a = num(aInput.value.trim()), b = num(bInput.value.trim());

    // Maps a parameter point to THREE coords, or null outside the domain.
    function toXYZ(outer, inner) {
      const z = f(outer, inner);
      if (z === null) return null;
      if (polar) return [inner * Math.cos(outer), z, inner * Math.sin(outer)];
      return [outer, z, inner];
    }

    let zMin = 0, zMax = 0, rMax = 1;
    const NS = 22;
    for (let i = 0; i <= NS; i++) {
      const outer = a + (i / NS) * (b - a);
      const lo = lowerFn(outer), hi = upperFn(outer);
      if (lo === null || hi === null) continue;
      for (let j = 0; j <= NS; j++) {
        const inner = lo + (j / NS) * (hi - lo);
        const p = toXYZ(outer, inner);
        if (p) { zMin = Math.min(zMin, p[1]); zMax = Math.max(zMax, p[1]); }
        rMax = Math.max(rMax, Math.abs(polar ? inner : outer), Math.abs(inner));
      }
    }

    s.addParametricSurface(
      (outer, t) => {
        const lo = lowerFn(outer), hi = upperFn(outer);
        if (lo === null || hi === null) return null;
        return toXYZ(outer, lo + t * (hi - lo));
      },
      [a, b], [0, 1], COL.surface, { samples: NS, opacity: 0.55 }
    );

    // Base outline (z ignored — drawn at the surface's minimum so it reads as "the floor").
    const baseLower = [], baseUpper = [], roofLower = [], roofUpper = [];
    for (let i = 0; i <= 60; i++) {
      const outer = a + (i / 60) * (b - a);
      const lo = lowerFn(outer), hi = upperFn(outer);
      if (lo === null || hi === null) continue;
      const pLo = toXYZ(outer, lo), pHi = toXYZ(outer, hi);
      if (pLo) { baseLower.push([pLo[0], zMin, pLo[2]]); roofLower.push(pLo); }
      if (pHi) { baseUpper.push([pHi[0], zMin, pHi[2]]); roofUpper.push(pHi); }
    }
    if (baseLower.length >= 2) s.addLine(baseLower, COL.base, { opacity: 0.6 });
    if (baseUpper.length >= 2) s.addLine(baseUpper, COL.base, { opacity: 0.6 });
    if (roofLower.length >= 2) s.addLine(roofLower, COL.roof, { opacity: 0.85 });
    if (roofUpper.length >= 2) s.addLine(roofUpper, COL.roof, { opacity: 0.85 });

    legend.innerHTML =
      `<span class="swatch" style="background:#4f9e82"></span> surface z=f &nbsp; ` +
      `<span class="swatch" style="background:#9bcf6b"></span> region boundary (on the surface) &nbsp; ` +
      `<span class="swatch" style="background:#7d858c"></span> region boundary (base)`;

    const span = polar ? rMax : Math.max(Math.abs(a), Math.abs(b), rMax);
    s.frame([[-span, span], [-span, span], [zMin - 0.5, zMax + 0.5]]);
  }

  // f(outer, inner) → z (via math.js, variables named by the current mode: x/y or theta/r),
  // null outside the domain.
  function makeFn2(expr, polar) {
    let code;
    try { code = math.parse(expr).compile(); } catch (e) { return () => null; }
    const ov = outerVarName(polar), iv = innerVarName(polar);
    return (outerVal, innerVal) => {
      try {
        const z = code.evaluate({ [ov]: outerVal, [iv]: innerVal });
        return typeof z === "number" && Number.isFinite(z) ? z : null;
      } catch (e) { return null; }
    };
  }
  function makeFn1(expr, polar) {
    let code;
    try { code = math.parse(expr).compile(); } catch (e) { return () => null; }
    const ov = outerVarName(polar);
    return (t) => {
      try { const y = code.evaluate({ [ov]: t }); return typeof y === "number" && Number.isFinite(y) ? y : null; }
      catch (e) { return null; }
    };
  }
  function num(s) { try { const v = math.evaluate(String(s)); return typeof v === "number" ? v : NaN; } catch (e) { return NaN; } }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    formError.style.display = "none";
    if (!updateStartCheck()) return;
    const submitBtn = form.querySelector('button[type="submit"] .btn-text');
    const prev = submitBtn ? submitBtn.textContent : null;
    if (submitBtn) submitBtn.textContent = "Evaluating…";

    const opts = {
      mode: modeSelect.value,
      a: aInput.value.trim(),
      b: bInput.value.trim(),
      lower: lowerInput.value.trim(),
      upper: upperInput.value.trim()
    };

    CAS.multipleIntegral(fInput.value.trim(), opts)
      .then((result) => {
        if (!result.ok) {
          resultsArea.style.display = "none";
          placeholderPanel.style.display = "";
          showError(result.reason);
          return;
        }
        render(result);
      })
      .catch((err) => showError(err.message))
      .then(() => {
        if (submitBtn) submitBtn.textContent = prev;
        if (CAS.mode() === "sync") {
          startStatus.className = "status-line bad";
          startStatusText.textContent =
            "Running without a Web Worker (opened over file://?) — a difficult expression can freeze the page. Serve the site over http:// to restore the safety timeout.";
        }
      });
  });

  function loadPreset(btn) {
    modeSelect.value = btn.dataset.mode || "cartesian";
    syncLabels();
    fInput.value = btn.dataset.f;
    aInput.value = btn.dataset.a;
    bInput.value = btn.dataset.b;
    lowerInput.value = btn.dataset.lower;
    upperInput.value = btn.dataset.upper;
    updatePreview();
    updateStartCheck();
    form.requestSubmit();
  }

  exampleBtn.addEventListener("click", () => {
    loadPreset({ dataset: { mode: "cartesian", f: "x*y", a: "0", b: "1", lower: "0", upper: "x" } });
  });

  presetRow.addEventListener("click", (e) => {
    const btn = e.target.closest(".tag");
    if (!btn) return;
    loadPreset(btn);
  });

  modeSelect.addEventListener("change", () => { syncLabels(); updatePreview(); updateStartCheck(); });

  stepSlider.addEventListener("input", () => updateStep(Number(stepSlider.value)));

  const debounced = Engine.debounce(() => { updatePreview(); updateStartCheck(); }, 220);
  fInput.addEventListener("input", debounced);
  aInput.addEventListener("input", debounced);
  bInput.addEventListener("input", debounced);
  lowerInput.addEventListener("input", debounced);
  upperInput.addEventListener("input", debounced);

  Engine.attachMathKeypad(fInput, document.getElementById("fKeypad"));
  Engine.attachKeypadToggle(document.getElementById("keypadToggle"), document.getElementById("fKeypad"));

  syncLabels();
  updatePreview();
  updateStartCheck();
})();
