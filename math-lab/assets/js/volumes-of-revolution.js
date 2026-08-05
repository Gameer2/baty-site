/* Volumes of Revolution — page wiring.
   Symbolic work (the antiderivative, the π-symbolic volume, the Simpson verification) lives in
   calculus-symbolic.js and runs in the CAS worker; this file reads f(x), a method, optional
   g(x) for the washer, and bounds a, b, calls CAS.volumeOfRevolution, renders the exact volume
   + numeric + derivation, and draws the signature visual — the solid built live from sampled
   cross-sections, revolved about its axis — using the shared Scene3D established by the Vectors
   in Space page. */
(function () {
  "use strict";

  const fInput = document.getElementById("fInput");
  const gInput = document.getElementById("gInput");
  const gField = document.getElementById("gField");
  const methodSelect = document.getElementById("methodSelect");
  const aInput = document.getElementById("aInput");
  const bInput = document.getElementById("bInput");
  const fPreview = document.getElementById("fPreview");
  const startStatus = document.getElementById("startStatus");
  const startStatusText = document.getElementById("startStatusText");
  const formError = document.getElementById("formError");
  const formErrorText = document.getElementById("formErrorText");
  const form = document.getElementById("volForm");
  const exampleBtn = document.getElementById("exampleBtn");
  const presetRow = document.getElementById("presetRow");

  const placeholderPanel = document.getElementById("placeholderPanel");
  const resultsArea = document.getElementById("resultsArea");
  const statVolume = document.getElementById("statVolume");
  const statNumeric = document.getElementById("statNumeric");
  const statMethod = document.getElementById("statMethod");
  const formulaResult = document.getElementById("formulaResult");
  const stepTableBody = document.querySelector("#stepTable tbody");
  const stepSlider = document.getElementById("stepSlider");
  const stepLabel = document.getElementById("stepLabel");
  const sceneHost = document.getElementById("sceneHost");
  const legend = document.getElementById("sceneLegend");

  // Outer skin = teal, inner hole (washer) = warm, generating curve = green, axis = dashed grey.
  const COL = { outer: 0x4f9e82, inner: 0xed6d40, curve: 0x9bcf6b, axis: 0x7d858c };

  let scene = null;
  let state = null;

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  function updatePreview() {
    const raw = fInput.value.trim();
    const tex = raw ? Engine.toLatex(raw) : "";
    Engine.renderKatex(fPreview, raw ? `f(x)=${tex}` : "", false);
    Engine.pulseFlash(fPreview);
  }

  function showError(msg) { formError.style.display = "block"; formErrorText.textContent = msg; }
  function fmtNum(n) { return Engine.formatNum(n, 6); }

  function updateStartCheck() {
    const raw = fInput.value.trim();
    if (!raw) { setBad("Enter f(x)."); return false; }
    const c = Engine.compileFx(raw, "x");
    if (!c.ok) { setBad("f(x) doesn't parse: " + c.error); return false; }
    const aBound = num(aInput.value.trim()), bBound = num(bInput.value.trim());
    if (!Number.isFinite(aBound) || !Number.isFinite(bBound)) {
      setBad("The bounds a and b must be numbers (or constants like pi, e, sqrt(2))."); return false;
    }
    if (methodSelect.value === "washer") {
      const gRaw = gInput.value.trim();
      if (!gRaw) { setBad("The washer method needs an inner curve g(x)."); return false; }
      const cg = Engine.compileFx(gRaw, "x");
      if (!cg.ok) { setBad("g(x) doesn't parse: " + cg.error); return false; }
    }
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

    statVolume.textContent = String(result.volume);
    statNumeric.textContent = "≈ " + fmtNum(result.numeric);
    const about = result.method === "shell" ? "about the y-axis" : "about the x-axis";
    statMethod.textContent = result.method + " · " + about;

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
     The solid is built live from sampled cross-sections via Scene3D.addRevolution. For disk and
     washer (revolved about the x-axis) the axis lies along three-x and the radius spreads in the
     three-y/three-z plane; for shell (revolved about the y-axis) the axis is vertical (three-y)
     and the radius spreads horizontally. The generating curve f(x) and the axis of revolution are
     drawn too, so the 2D picture being swept is legible inside the 3D one. */
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

    const f = makeFn(fInput.value.trim());
    const g = (result.method === "washer") ? makeFn(gInput.value.trim()) : null;
    const [a, b] = [num(aInput.value.trim()), num(bInput.value.trim())];

    // Sample f (and g) to find the extent, for framing and to skip bad points.
    let fMax = 0, gMax = 0;
    for (let i = 0; i <= 24; i++) {
      const x = a + (i / 24) * (b - a);
      const fv = f(x); if (Number.isFinite(fv)) fMax = Math.max(fMax, Math.abs(fv));
      if (g) { const gv = g(x); if (Number.isFinite(gv)) gMax = Math.max(gMax, Math.abs(gv)); }
    }
    const rMax = Math.max(fMax, gMax, 0.5);

    // The generating curve f(x) in the θ = 0 plane, plus the axis of revolution.
    const curvePts = [];
    for (let i = 0; i <= 40; i++) {
      const x = a + (i / 40) * (b - a);
      const fv = f(x);
      if (Number.isFinite(fv)) curvePts.push(genCurve(x, fv));
    }
    if (curvePts.length >= 2) s.addLine(curvePts, COL.curve, { opacity: 0.9 });

    // The axis of revolution, drawn through the solid.
    s.addLine(axisEnds(a, b, rMax), COL.axis, { opacity: 0.4 });

    // Outer skin. For shell the skin's height is f(x) at radius x; for disk/washer the radius is f(x).
    s.addRevolution((x, th) => outerPoint(f, x, th), [a, b], COL.outer, { samples: 16, thetaSteps: 22, opacity: 0.5 });

    // Inner skin for the washer — the hole left by g(x).
    if (g) s.addRevolution((x, th) => innerPoint(g, x, th), [a, b], COL.inner, { samples: 14, thetaSteps: 18, opacity: 0.45 });

    legend.innerHTML =
      `<span class="swatch" style="background:#4f9e82"></span> outer surface &nbsp; ` +
      (g ? `<span class="swatch" style="background:#ed6d40"></span> inner hole &nbsp; ` : "") +
      `<span class="swatch" style="background:#9bcf6b"></span> generating curve &nbsp; ` +
      `<span class="swatch" style="background:#7d858c"></span> axis`;

    frame3(threeBox(a, b, rMax, result.axis));
  }

  /* Geometry helpers — one set per axis. The axis string from the engine tells us which. */
  function outerPoint(f, x, th) {
    const fv = f(x);
    if (!Number.isFinite(fv)) return null;
    if (axisIsX()) return [x, fv * Math.cos(th), fv * Math.sin(th)];      // disk/washer: radius = f(x)
    return [x * Math.cos(th), fv, x * Math.sin(th)];                       // shell: height = f(x), radius = x
  }
  function innerPoint(g, x, th) {
    const gv = g(x);
    if (!Number.isFinite(gv)) return null;
    return [x, gv * Math.cos(th), gv * Math.sin(th)];                     // washer is always about the x-axis
  }
  function genCurve(x, fv) {
    if (axisIsX()) return [x, fv, 0];
    return [x, fv, 0];
  }
  function axisEnds(a, b, rMax) {
    if (axisIsX()) return [[a, 0, 0], [b, 0, 0]];
    const h = rMax; // the y-axis runs from the base up through the tallest shell
    return [[0, 0, 0], [0, h, 0]];
  }
  // box3 is in three-space order [threeX, threeY, threeZ]; frame3 hands frame the y/z-swapped
  // version because frame() itself swaps (math-z is up). For disk/washer the axis is three-x and
  // the radius spreads in three-y/three-z; for shell the axis is three-y and the radius spreads in
  // three-x/three-z. Symmetric in the perpendiculars so the solid is framed whatever the sign of f.
  function threeBox(a, b, rMax, axis) {
    if (axis === "y") return [[-b, b], [-rMax, rMax], [-rMax, rMax]];        // shell: three-x = radius, three-y = height
    return [[a, b], [-rMax, rMax], [-rMax, rMax]];                          // disk/washer: three-x = axis, three-y/z = radius
  }
  let _axis = "x";
  function axisIsX() { return _axis === "x"; }

  // frame() takes a math-coord box and swaps y↔z internally (math-z is up); our revolution boxes
  // are in three coords, so we hand frame the y/z-swapped version.
  function frame3(box3) {
    scene.frame([[box3[0][0], box3[0][1]], [box3[2][0], box3[2][1]], [box3[1][0], box3[1][1]]]);
  }

  function makeFn(expr) {
    let code;
    try { code = math.parse(expr).compile(); } catch (e) { return () => NaN; }
    return (x) => { try { const y = code.evaluate({ x }); return typeof y === "number" && Number.isFinite(y) ? y : NaN; } catch (e) { return NaN; } };
  }
  function num(s) { try { return parseFloat(math.evaluate(String(s))); } catch (e) { return NaN; } }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    formError.style.display = "none";
    if (!updateStartCheck()) return;
    const submitBtn = form.querySelector('button[type="submit"] .btn-text');
    const prev = submitBtn ? submitBtn.textContent : null;
    if (submitBtn) submitBtn.textContent = "Evaluating…";

    const opts = { method: methodSelect.value };
    if (opts.method === "washer") opts.inner = gInput.value.trim();

    CAS.volumeOfRevolution(fInput.value.trim(), "x", aInput.value.trim(), bInput.value.trim(), opts)
      .then((result) => {
        if (!result.ok) {
          resultsArea.style.display = "none";
          placeholderPanel.style.display = "";
          showError(result.reason);
          return;
        }
        _axis = result.axis;
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

  exampleBtn.addEventListener("click", () => {
    fInput.value = "x^2";
    aInput.value = "0";
    bInput.value = "2";
    methodSelect.value = "disk";
    syncGField();
    updatePreview();
    updateStartCheck();
    form.requestSubmit();
  });

  presetRow.addEventListener("click", (e) => {
    const btn = e.target.closest(".tag");
    if (!btn) return;
    fInput.value = btn.dataset.f;
    aInput.value = btn.dataset.a;
    bInput.value = btn.dataset.b;
    methodSelect.value = btn.dataset.method || "disk";
    if (btn.dataset.g) gInput.value = btn.dataset.g;
    syncGField();
    updatePreview();
    updateStartCheck();
    form.requestSubmit();
  });

  methodSelect.addEventListener("change", () => { syncGField(); updateStartCheck(); });

  function syncGField() { gField.style.display = methodSelect.value === "washer" ? "" : "none"; }

  stepSlider.addEventListener("input", () => updateStep(Number(stepSlider.value)));

  const debounced = Engine.debounce(() => { updatePreview(); updateStartCheck(); }, 220);
  fInput.addEventListener("input", debounced);
  gInput.addEventListener("input", debounced);
  aInput.addEventListener("input", debounced);
  bInput.addEventListener("input", debounced);

  Engine.attachMathKeypad(fInput, document.getElementById("fKeypad"));
  Engine.attachKeypadToggle(document.getElementById("keypadToggle"), document.getElementById("fKeypad"));

  syncGField();
  updatePreview();
  updateStartCheck();
})();