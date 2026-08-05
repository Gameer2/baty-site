/* Lagrange Multipliers — page wiring.
   Symbolic work (the gradients, the multi-start numeric solve, the directional-derivative
   verification) lives in calculus-symbolic.js and runs in the CAS worker; this file reads
   f(x, y), the constraint g(x, y) = c, calls CAS.lagrangeMultipliers, renders the critical
   points + derivation, and draws the signature visual — the surface z = f(x, y), the
   constraint curve g = c traced numerically and lifted onto the surface, and the critical
   points marked and colored by whether each is the max, the min, or (rarely) neither — using
   the shared Scene3D established by the Vectors in Space page. */
(function () {
  "use strict";

  const fInput = document.getElementById("fInput");
  const gInput = document.getElementById("gInput");
  const cInput = document.getElementById("cInput");
  const fPreview = document.getElementById("fPreview");
  const gPreview = document.getElementById("gPreview");
  const startStatus = document.getElementById("startStatus");
  const startStatusText = document.getElementById("startStatusText");
  const formError = document.getElementById("formError");
  const formErrorText = document.getElementById("formErrorText");
  const form = document.getElementById("lagrangeForm");
  const exampleBtn = document.getElementById("exampleBtn");
  const presetRow = document.getElementById("presetRow");

  const placeholderPanel = document.getElementById("placeholderPanel");
  const resultsArea = document.getElementById("resultsArea");
  const statMax = document.getElementById("statMax");
  const statMin = document.getElementById("statMin");
  const statCount = document.getElementById("statCount");
  const pointsTableBody = document.querySelector("#pointsTable tbody");
  const stepTableBody = document.querySelector("#stepTable tbody");
  const stepSlider = document.getElementById("stepSlider");
  const stepLabel = document.getElementById("stepLabel");
  const sceneHost = document.getElementById("sceneHost");
  const legend = document.getElementById("sceneLegend");

  // Surface = teal, constraint curve = warm, max = green, min = slate-blue, other = off-white.
  const COL = { surface: 0x4f9e82, curve: 0xed6d40, max: 0x9bcf6b, min: 0x5c93c9, other: 0xeef3ef };
  const WINDOW = 2.2; // sample the surface this far past the critical points' bounding box

  let scene = null;
  let state = null;

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  function fmt(n) { return Engine.formatNum(n, 4); }

  function updatePreview() {
    const rawF = fInput.value.trim();
    Engine.renderKatex(fPreview, rawF ? "f(x,y)=" + Engine.toLatex(rawF) : "", false);
    Engine.pulseFlash(fPreview);
    const rawG = gInput.value.trim();
    const rawC = cInput.value.trim();
    Engine.renderKatex(gPreview, rawG ? "g(x,y)=" + Engine.toLatex(rawG) + (rawC ? "=" + Engine.toLatex(rawC) : "") : "", false);
    Engine.pulseFlash(gPreview);
  }

  function showError(msg) { formError.style.display = "block"; formErrorText.textContent = msg; }

  function checkTwoVarExpr(raw, label, setBad) {
    if (!raw) { setBad("Enter " + label + "."); return false; }
    try {
      const code = math.parse(raw).compile();
      code.evaluate({ x: 1, y: 1 });
    } catch (e) {
      const msg = (e && e.message) || String(e);
      if (/undefined symbol/i.test(msg)) { setBad(label + " uses an unknown symbol: " + msg); return false; }
      if (/syntax|unexpected|expected/i.test(msg)) { setBad(label + " doesn't parse: " + msg); return false; }
      // Otherwise valid but not defined at the smoke-test point — not a reason to block.
    }
    return true;
  }

  function updateStartCheck() {
    function setBad(msg) { startStatus.className = "status-line bad"; startStatusText.textContent = msg; }
    if (!checkTwoVarExpr(fInput.value.trim(), "f(x, y)", setBad)) return false;
    if (!checkTwoVarExpr(gInput.value.trim(), "the constraint g(x, y)", setBad)) return false;
    try {
      const v = math.evaluate(cInput.value.trim());
      if (typeof v !== "number" || !Number.isFinite(v)) throw 0;
    } catch (e) { setBad("The constraint value c must be a number."); return false; }
    startStatus.className = "status-line ok";
    startStatusText.textContent = "Ready — press Evaluate.";
    return true;
  }

  function render(result) {
    placeholderPanel.style.display = "none";
    resultsArea.style.display = "";
    formError.style.display = "none";
    state = { steps: result.steps };

    statMax.textContent = result.max ? "(" + fmt(result.max.x) + ", " + fmt(result.max.y) + ")  f=" + fmt(result.max.value) : "—";
    statMin.textContent = result.min ? "(" + fmt(result.min.x) + ", " + fmt(result.min.y) + ")  f=" + fmt(result.min.value) : "—";
    statCount.textContent = String(result.points.length) + (result.singleCritical ? " (unclassified)" : "");

    pointsTableBody.innerHTML = result.points
      .map((p) => `<tr><td>(${fmt(p.x)}, ${fmt(p.y)})</td><td>${fmt(p.lambda)}</td><td>${fmt(p.value)}</td><td>${escapeHtml(p.label)}</td></tr>`)
      .join("");

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
     The surface z = f(x, y), the constraint curve g = c traced numerically (a predictor step
     along the tangent ⟂ ∇g, then a Newton corrector back onto the curve — no CAS involved,
     just the same numeric gradient the verification gate already used) and lifted onto the
     surface, and every reported critical point marked, colored by its label. */
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

  function makeFn2(expr) {
    let code;
    try { code = math.parse(expr).compile(); } catch (e) { return () => null; }
    return (x, y) => { try { const z = code.evaluate({ x, y }); return typeof z === "number" && Number.isFinite(z) ? z : null; } catch (e) { return null; } };
  }

  // Marches along the tangent to g(x,y) = c from `start` in direction `dir` (±1), correcting
  // back onto the curve with a short Newton step along ∇g after every predictor step.
  function traceHalfCurve(gFn, dgdx, dgdy, cNum, start, dir, steps, h) {
    const pts = [];
    let [x, y] = start;
    for (let i = 0; i < steps; i++) {
      const gx = dgdx(x, y), gy = dgdy(x, y);
      if (gx === null || gy === null) break;
      const tmag = Math.hypot(gx, gy);
      if (!Number.isFinite(tmag) || tmag < 1e-9) break;
      x += h * dir * (-gy / tmag);
      y += h * dir * (gx / tmag);
      for (let k = 0; k < 4; k++) {
        const cgx = dgdx(x, y), cgy = dgdy(x, y);
        if (cgx === null || cgy === null) break;
        const gmag2 = cgx * cgx + cgy * cgy;
        if (gmag2 < 1e-12) break;
        const gv = gFn(x, y);
        if (gv === null) break;
        const err = gv - cNum;
        x -= (err * cgx) / gmag2;
        y -= (err * cgy) / gmag2;
      }
      const check = gFn(x, y);
      if (check === null || !Number.isFinite(check) || Math.abs(check - cNum) > 1e-2 * Math.max(1, Math.abs(cNum))) break;
      pts.push([x, y]);
    }
    return pts;
  }

  function drawScene(result) {
    const s = ensureScene();
    if (!s) return;
    s.clear();

    const f = makeFn2(fInput.value.trim());
    const g = makeFn2(gInput.value.trim());
    const gxFn = makeFn2(result.grad.gx);
    const gyFn = makeFn2(result.grad.gy);

    // Window the surface around the critical points found (falls back to a fixed window
    // around the origin if, somehow, none were reported — render() already refuses that case).
    const xs = result.points.map((p) => p.x), ys = result.points.map((p) => p.y);
    const cx = xs.length ? (Math.min(...xs) + Math.max(...xs)) / 2 : 0;
    const cy = ys.length ? (Math.min(...ys) + Math.max(...ys)) / 2 : 0;
    const halfX = Math.max(WINDOW, xs.length ? (Math.max(...xs) - Math.min(...xs)) / 2 + WINDOW * 0.6 : WINDOW);
    const halfY = Math.max(WINDOW, ys.length ? (Math.max(...ys) - Math.min(...ys)) / 2 + WINDOW * 0.6 : WINDOW);
    const xR = [cx - halfX, cx + halfX];
    const yR = [cy - halfY, cy + halfY];

    s.addSurface(f, xR, yR, COL.surface, { samples: 26 });

    // Trace the constraint curve from the first critical point (guaranteed to be ON the
    // curve, since it satisfies g = c to the search's own tolerance) outward in both directions.
    if (result.points.length) {
      const start = [result.points[0].x, result.points[0].y];
      const span = Math.max(halfX, halfY);
      const h = span / 60;
      const fwd = traceHalfCurve(g, gxFn, gyFn, result.c, start, 1, 240, h);
      const bwd = traceHalfCurve(g, gxFn, gyFn, result.c, start, -1, 240, h).reverse();
      const curvePts2D = bwd.concat([start]).concat(fwd);
      const curveOnSurface = curvePts2D.map(([x, y]) => {
        const z = f(x, y);
        return z === null ? null : [x, z, y];
      }).filter(Boolean);
      if (curveOnSurface.length >= 2) s.addLine(curveOnSurface, COL.curve, { opacity: 0.95 });
    }

    let zMin = 0, zMax = 0;
    for (const p of result.points) {
      const col = p.label === "max" ? COL.max : p.label === "min" ? COL.min : COL.other;
      s.addPoint([p.x, p.value, p.y], col, 0.16);
      zMin = Math.min(zMin, p.value); zMax = Math.max(zMax, p.value);
    }
    for (const xx of xR) for (const yy of yR) { const z = f(xx, yy); if (Number.isFinite(z)) { zMin = Math.min(zMin, z); zMax = Math.max(zMax, z); } }

    legend.innerHTML =
      `<span class="swatch" style="background:#4f9e82"></span> surface z=f &nbsp; ` +
      `<span class="swatch" style="background:#ed6d40"></span> constraint g=c &nbsp; ` +
      `<span class="swatch" style="background:#9bcf6b"></span> max &nbsp; ` +
      `<span class="swatch" style="background:#5c93c9"></span> min`;

    s.frame([xR, yR, [zMin - 0.5, zMax + 0.5]]);
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    formError.style.display = "none";
    if (!updateStartCheck()) return;
    const submitBtn = form.querySelector('button[type="submit"] .btn-text');
    const prev = submitBtn ? submitBtn.textContent : null;
    if (submitBtn) submitBtn.textContent = "Evaluating…";

    CAS.lagrangeMultipliers(fInput.value.trim(), gInput.value.trim(), cInput.value.trim(), ["x", "y"], {})
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

  function loadPreset(f, g, c) {
    fInput.value = f; gInput.value = g; cInput.value = c;
    updatePreview();
    updateStartCheck();
    form.requestSubmit();
  }

  exampleBtn.addEventListener("click", () => loadPreset("x*y", "x^2+y^2", "1"));

  presetRow.addEventListener("click", (e) => {
    const btn = e.target.closest(".tag");
    if (!btn) return;
    loadPreset(btn.dataset.f, btn.dataset.g, btn.dataset.c);
  });

  stepSlider.addEventListener("input", () => updateStep(Number(stepSlider.value)));

  const debounced = Engine.debounce(() => { updatePreview(); updateStartCheck(); }, 220);
  fInput.addEventListener("input", debounced);
  gInput.addEventListener("input", debounced);
  cInput.addEventListener("input", debounced);

  Engine.attachMathKeypad(fInput, document.getElementById("fKeypad"));
  Engine.attachKeypadToggle(document.getElementById("keypadToggle"), document.getElementById("fKeypad"));

  updatePreview();
  updateStartCheck();
})();
