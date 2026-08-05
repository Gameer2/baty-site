/* Partial Derivatives, Gradient, and Tangent Planes — page wiring.
   Symbolic work (partials, gradient, tangent plane) lives in calculus-symbolic.js and runs in
   the CAS worker; this file reads f(x, y) and a point (a, b), calls CAS.partialDerivatives,
   renders the exact results + derivation, and draws the signature visual — the surface
   z = f(x, y), the tangent plane at (a, b), the point, and the gradient as an arrow in the
   domain — using the shared Scene3D established by the Vectors in Space page. */
(function () {
  "use strict";

  const fInput = document.getElementById("fInput");
  const aInput = document.getElementById("aInput");
  const bInput = document.getElementById("bInput");
  const fPreview = document.getElementById("fPreview");
  const startStatus = document.getElementById("startStatus");
  const startStatusText = document.getElementById("startStatusText");
  const formError = document.getElementById("formError");
  const formErrorText = document.getElementById("formErrorText");
  const form = document.getElementById("pdForm");
  const exampleBtn = document.getElementById("exampleBtn");
  const presetRow = document.getElementById("presetRow");

  const placeholderPanel = document.getElementById("placeholderPanel");
  const resultsArea = document.getElementById("resultsArea");
  const statF = document.getElementById("statF");
  const statGrad = document.getElementById("statGrad");
  const statGradMag = document.getElementById("statGradMag");
  const formulaResult = document.getElementById("formulaResult");
  const stepTableBody = document.querySelector("#stepTable tbody");
  const stepSlider = document.getElementById("stepSlider");
  const stepLabel = document.getElementById("stepLabel");
  const sceneHost = document.getElementById("sceneHost");
  const legend = document.getElementById("sceneLegend");

  // Surface = teal, tangent plane = warm, gradient = green, point = white.
  const COL = { surface: 0x4f9e82, plane: 0xed6d40, grad: 0x9bcf6b, point: 0xeef3ef };
  const WINDOW = 2; // sample the surface ±2 around (a, b)

  let scene = null;
  let state = null;

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  function updatePreview() {
    const raw = fInput.value.trim();
    const tex = raw ? Engine.toLatex(raw) : "";
    Engine.renderKatex(fPreview, raw ? `f(x,y)=${tex}` : "", false);
    Engine.pulseFlash(fPreview);
  }

  function updateStartCheck() {
    const raw = fInput.value.trim();
    if (!raw) { setBad("Enter f(x, y)."); return false; }
    // Validate f as a TWO-variable expression. Engine.compileFx is single-variable: compiling
    // "x^2+y^2" with only x in scope throws "Undefined symbol y", which used to reject every
    // genuine surface here, so Evaluate never reached the CAS. Compile with both x and y in
    // scope and smoke-test at (1,1); a domain issue there (sqrt of a negative, log of 0) is
    // tolerated — the CAS checks definedness at the real point — but an undefined symbol or a
    // syntax error is a real reason to refuse.
    let code;
    try {
      code = math.parse(raw).compile();
      code.evaluate({ x: 1, y: 1 });
    } catch (e) {
      const msg = (e && e.message) || String(e);
      if (/undefined symbol/i.test(msg)) { setBad("f(x, y) uses an unknown symbol: " + msg); return false; }
      if (/syntax|unexpected|expected/i.test(msg)) { setBad("f(x, y) doesn't parse: " + msg); return false; }
      // Otherwise the expression is valid but not defined at the smoke-test point (1,1) —
      // not a reason to block Evaluate. The symbolic engine reports the real point.
    }
    for (const id of [aInput, bInput]) {
      const v = id.value.trim();
      if (!/^-?\d+(\.\d+)?$/.test(v)) { setBad("The point coordinates must be numbers."); return false; }
    }
    startStatus.className = "status-line ok";
    startStatusText.textContent = "Ready — press Evaluate.";
    return true;
    function setBad(msg) { startStatus.className = "status-line bad"; startStatusText.textContent = msg; }
  }

  function showError(msg) { formError.style.display = "block"; formErrorText.textContent = msg; }

  function render(result) {
    placeholderPanel.style.display = "none";
    resultsArea.style.display = "";
    formError.style.display = "none";
    state = { steps: result.steps };

    // Stat strip is symbolic, not numeric: the exact closed forms the CAS produced, rendered
    // as KaTeX. (The earlier version ran the exact strings through fmtNum — a number formatter
    // — which crashed on "2".toFixed(...), so Evaluate rendered nothing. Numbers are still
    // computed for the verification gate and the 3D scene, but never shown as the answer.)
    Engine.renderKatex(statF, result.fAtPointLatex, false);
    Engine.renderKatex(statGrad, result.gradAtPointLatex, false);
    Engine.renderKatex(statGradMag, result.gradMagLatex, false);

    Engine.renderKatex(formulaResult, "z=" + result.tangentPlaneLatex, true);

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
     The surface and the tangent plane are both sampled into wireframes via Scene3D.addSurface
     (a plane is just a flat surface), so the kiss between them is visible. The gradient is
     drawn as an arrow in the domain (the xy-plane) from (a, 0, b) — its direction is the
     direction of steepest ascent on the surface. */
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
    const [a, b] = result.point;
    const f = makeFn(fInput.value.trim());
    const plane = makePlaneFn(result.tangentPlane);
    const xR = [a - WINDOW, a + WINDOW];
    const yR = [b - WINDOW, b + WINDOW];

    s.addSurface(f, xR, yR, COL.surface);
    s.addSurface(plane, xR, yR, COL.plane);
    s.addPoint([a, result.fAtPointNum, b], COL.point, 0.18);

    // Gradient arrow in the domain, from the base of the point upward in the steepest-ascent
    // direction. Scaled to read against the ±WINDOW frame.
    const gx = result.gradAtPointNum[0], gy = result.gradAtPointNum[1];
    const gmag = Math.hypot(gx, gy);
    if (gmag > 1e-9) {
      const scale = (WINDOW * 0.6) / gmag;
      s.addArrow([a + gx * scale, 0, b + gy * scale], COL.grad, { from: [a, 0, b] });
    }

    legend.innerHTML =
      `<span class="swatch" style="background:#4f9e82"></span> surface &nbsp; ` +
      `<span class="swatch" style="background:#ed6d40"></span> tangent plane &nbsp; ` +
      `<span class="swatch" style="background:#9bcf6b"></span> ∇f (domain) &nbsp; ` +
      `<span class="swatch" style="background:#eef3ef"></span> point`;

    // Frame to the surface's actual extent so the plane isn't clipped or lost in space.
    let z0 = result.fAtPointNum, z1 = result.fAtPointNum;
    for (const xx of xR) for (const yy of yR) { const z = f(xx, yy); if (Number.isFinite(z)) { z0 = Math.min(z0, z); z1 = Math.max(z1, z); } }
    s.frame([xR, yR, [z0 - 0.5, z1 + 0.5]]);
  }

  // f(x, y) → z, via math.js. Returns null outside the domain so addSurface skips the vertex.
  function makeFn(expr) {
    let code;
    try { code = math.parse(expr).compile(); } catch (e) { return () => null; }
    return (x, y) => { try { const z = code.evaluate({ x, y }); return typeof z === "number" && Number.isFinite(z) ? z : null; } catch (e) { return null; } };
  }
  function makePlaneFn(planeStr) {
    let code;
    try { code = math.parse(planeStr).compile(); } catch (e) { return () => null; }
    return (x, y) => { try { const z = code.evaluate({ x, y }); return typeof z === "number" && Number.isFinite(z) ? z : null; } catch (e) { return null; } };
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    formError.style.display = "none";
    if (!updateStartCheck()) return;
    const submitBtn = form.querySelector('button[type="submit"] .btn-text');
    const prev = submitBtn ? submitBtn.textContent : null;
    if (submitBtn) submitBtn.textContent = "Evaluating…";

    CAS.partialDerivatives(fInput.value.trim(), ["x", "y"], [aInput.value.trim(), bInput.value.trim()])
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

  exampleBtn.addEventListener("click", () => {
    fInput.value = "x^2+y^2";
    aInput.value = "1";
    bInput.value = "1";
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
    updatePreview();
    updateStartCheck();
    form.requestSubmit();
  });

  stepSlider.addEventListener("input", () => updateStep(Number(stepSlider.value)));

  const debounced = Engine.debounce(() => { updatePreview(); updateStartCheck(); }, 220);
  fInput.addEventListener("input", debounced);
  aInput.addEventListener("input", debounced);
  bInput.addEventListener("input", debounced);

  Engine.attachMathKeypad(fInput, document.getElementById("fKeypad"));
  Engine.attachKeypadToggle(document.getElementById("keypadToggle"), document.getElementById("fKeypad"));

  updatePreview();
  updateStartCheck();
})();