/* Vectors in Space page wiring. All symbolic work lives in calculus-symbolic.js and runs in
   the CAS worker; this file reads the inputs, calls CAS.vectorOps, renders the exact result +
   derivation ladder, and draws the vectors as arrows in the shared three.js scene
   (assets/js/calculus-3d.js). The scene conventions established here are reused by every
   later 3D page. */
(function () {
  "use strict";

  const aInput = document.getElementById("aInput");
  const bInput = document.getElementById("bInput");
  const cInput = document.getElementById("cInput");
  const opSelect = document.getElementById("opSelect");
  const scalarField = document.getElementById("scalarField");
  const aPreview = document.getElementById("aPreview");
  const bPreview = document.getElementById("bPreview");
  const startStatus = document.getElementById("startStatus");
  const startStatusText = document.getElementById("startStatusText");
  const formError = document.getElementById("formError");
  const formErrorText = document.getElementById("formErrorText");
  const form = document.getElementById("vectorForm");
  const exampleBtn = document.getElementById("exampleBtn");
  const presetRow = document.getElementById("presetRow");

  const placeholderPanel = document.getElementById("placeholderPanel");
  const resultsArea = document.getElementById("resultsArea");
  const statResult = document.getElementById("statResult");
  const statNumeric = document.getElementById("statNumeric");
  const statExtra = document.getElementById("statExtra");
  const formulaResult = document.getElementById("formulaResult");
  const stepTableBody = document.querySelector("#stepTable tbody");
  const stepSlider = document.getElementById("stepSlider");
  const stepLabel = document.getElementById("stepLabel");
  const sceneHost = document.getElementById("sceneHost");
  const legend = document.getElementById("sceneLegend");

  // Page palette — distinct from the scene's axis colors so input/result vectors read
  // against the fixed x/y/z arrows. Warm = first vector, green = second, teal = the result.
  const COL = { u: 0xed6d40, v: 0x9bcf6b, result: 0x5c939f, dashed: 0x7d858c };

  let scene = null;
  let state = null;

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  // A vector input is three components separated by commas. Each may be an exact expression
  // ("1/2", "sqrt(2)") — validated with math.js here, parsed exactly by nerdamer in the worker.
  function parseVecInput(raw) {
    const parts = String(raw).split(",").map((s) => s.trim()).filter((s) => s !== "");
    if (parts.length !== 3) return { ok: false, error: "A vector needs exactly three components, separated by commas." };
    for (const p of parts) {
      const c = Engine.compileFx(p, "x");
      if (!c.ok) return { ok: false, error: "“" + p + "” is not a valid component: " + c.error };
    }
    return { ok: true, parts };
  }

  // Which operands an operation needs, so the start-check and the UI only ask for what's used.
  function needsB(op) { return op !== "scalarMultiply" && op !== "magnitude" && op !== "unit"; }
  function needsC(op) { return op === "scalarMultiply"; }
  function needsW(op) { return op === "tripleProduct"; }

  function updatePreviews() {
    const a = parseVecInput(aInput.value);
    Engine.renderKatex(aPreview, a.ok ? `\\mathbf{a}=\\langle\\,${a.parts.map(Engine.toLatex).join(",\\ ")}\\,\\rangle` : "", false);
    Engine.pulseFlash(aPreview);
    if (needsB(opSelect.value)) {
      const b = parseVecInput(bInput.value);
      Engine.renderKatex(bPreview, b.ok ? `\\mathbf{b}=\\langle\\,${b.parts.map(Engine.toLatex).join(",\\ ")}\\,\\rangle` : "", false);
      Engine.pulseFlash(bPreview);
    } else {
      Engine.renderKatex(bPreview, "", false);
    }
  }

  function updateOpVisibility() {
    const op = opSelect.value;
    scalarField.style.display = needsC(op) ? "" : "none";
    bInput.parentElement.style.display = needsB(op) ? "" : "none";
    document.getElementById("bField").style.display = needsB(op) ? "" : "none";
    document.getElementById("wField").style.display = needsW(op) ? "" : "none";
  }

  function updateStartCheck() {
    const op = opSelect.value;
    const a = parseVecInput(aInput.value);
    if (!a.ok) { setBad(a.error || "Enter a vector."); return false; }
    if (needsB(op)) {
      const b = parseVecInput(bInput.value);
      if (!b.ok) { setBad(b.error || "Enter a second vector."); return false; }
    }
    if (needsC(op)) {
      const c = Engine.compileFx(cInput.value.trim(), "x");
      if (!c.ok) { setBad("Enter a scalar: " + c.error); return false; }
    }
    if (needsW(op)) {
      const w = parseVecInput(document.getElementById("wInput").value);
      if (!w.ok) { setBad("The scalar triple product needs a third vector."); return false; }
    }
    startStatus.className = "status-line ok";
    startStatusText.textContent = "Ready — press Evaluate.";
    return true;

    function setBad(msg) {
      startStatus.className = "status-line bad";
      startStatusText.textContent = msg;
    }
  }

  function showError(msg) { formError.style.display = "block"; formErrorText.textContent = msg; }

  function fmtNum(n) { return Engine.formatNum(n, 6); }

  function vecTexStr(comps) { return "\\langle\\," + comps.map(Engine.toLatex).join(",\\ ") + "\\,\\rangle"; }

  function render(result, op, aParts, bParts) {
    placeholderPanel.style.display = "none";
    resultsArea.style.display = "";
    formError.style.display = "none";
    state = { steps: result.steps };

    const isVec = result.kind === "vector";
    const valueTex = isVec ? vecTexStr(result.resultVector) : result.latex;
    statResult.textContent = isVec ? "⟨" + result.resultVector.join(", ") + "⟩" : String(result.result);
    statNumeric.textContent = isVec ? "≈ ⟨" + result.numeric.map(fmtNum).join(", ") + "⟩" : "≈ " + fmtNum(result.numeric);
    document.getElementById("statExtraLabel").textContent = "Detail";
    statExtra.textContent = op === "angle" ? `θ ≈ ${fmtNum(result.angleDegrees)}° (${fmtNum(result.angleRadians)} rad)` : "—";

    const lhs = lhsOf(op, aParts, bParts);
    Engine.renderKatex(formulaResult, `${lhs} = ${valueTex}`, true);

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

    drawScene(result, op, aParts, bParts);
  }

  function lhsOf(op, a, b) {
    const aT = vecTexStr(a);
    const bT = b ? vecTexStr(b) : "";
    switch (op) {
      case "add": return `\\mathbf{a}+\\mathbf{b}`;
      case "subtract": return `\\mathbf{a}-\\mathbf{b}`;
      case "dot": return `\\mathbf{a}\\cdot\\mathbf{b}`;
      case "cross": return `\\mathbf{a}\\times\\mathbf{b}`;
      case "magnitude": return `\\lVert\\mathbf{a}\\rVert`;
      case "unit": return `\\hat{\\mathbf{a}}`;
      case "scalarMultiply": return `c\\,\\mathbf{a}`;
      case "distance": return `\\lVert\\mathbf{a}-\\mathbf{b}\\rVert`;
      case "angle": return `\\cos\\theta`;
      case "projection": return `\\operatorname{proj}_{\\mathbf{b}}\\mathbf{a}`;
      case "tripleProduct": return `\\mathbf{a}\\cdot(\\mathbf{b}\\times\\mathbf{c})`;
      default: return "";
    }
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
     The fixed axes/grid come from Scene3D; this adds the input vectors (always), the result
     vector (when the result is a vector), and the operation-specific connector that makes the
     geometry legible — the parallelogram for add, the perpendicular drop for projection, the
     gap between the two points for distance. */
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

  function drawScene(result, op, aParts, bParts) {
    const s = ensureScene();
    if (!s) return;
    s.clear();
    const an = aParts.map((p) => numericOf(p));
    const bn = bParts ? bParts.map((p) => numericOf(p)) : null;
    s.addArrow(an, COL.u);

    let box = boxAround([an]);
    legend.innerHTML = `<span class="swatch" style="background:#ed6d40"></span> a${bn ? "" : ""}`;

    if (bn) {
      s.addArrow(bn, COL.v);
      box = boxAround([an, bn]);
      legend.innerHTML = `<span class="swatch" style="background:#ed6d40"></span> a &nbsp; <span class="swatch" style="background:#9bcf6b"></span> b`;
    }

    if (result.kind === "vector") {
      s.addArrow(result.numeric, COL.result);
      box = boxAround([an, bn, result.numeric].filter(Boolean));
      legend.innerHTML += ` &nbsp; <span class="swatch" style="background:#5c939f"></span> result`;
    }

    // Operation-specific connectors.
    if (op === "add" && bn && result.kind === "vector") {
      // The parallelogram: a + b is the far corner.
      s.addLine([bn, result.numeric], COL.dashed, { opacity: 0.5 });
      s.addLine([an, result.numeric], COL.dashed, { opacity: 0.5 });
    } else if (op === "subtract" && bn && result.kind === "vector") {
      // a - b drawn from b's tip to a's tip is the difference vector translated; show the
      // connector from b to a so the subtraction is geometrically the gap.
      s.addLine([bn, an], COL.dashed, { opacity: 0.6 });
    } else if (op === "projection" && bn && result.kind === "vector") {
      // The drop from a's tip onto the projection is the error component a − proj.
      s.addLine([an, result.numeric], COL.dashed, { opacity: 0.6 });
    } else if (op === "distance" && bn) {
      s.addLine([an, bn], COL.dashed, { opacity: 0.7 });
    }

    // frame() expects a math-order box and swaps indices 1/2 internally (three-y = math-z,
    // "up"). addArrow/addLine here draw vectors with no such swap (three.addArrow(an, ...)
    // puts the vector's raw 2nd component straight into three-y), so box — built from those
    // same raw components — must be pre-swapped back, or frame() double-swaps and centers on
    // the wrong axis. Same fix as volumes-of-revolution.js's frame3() wrapper.
    s.frame([box[0], box[2], box[1]]);
  }

  function boxAround(vecs) {
    let x0 = 0, x1 = 0, y0 = 0, y1 = 0, z0 = 0, z1 = 0;
    for (const v of vecs) for (const p of v) {
      if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0];
      if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1];
      if (p[2] < z0) z0 = p[2]; if (p[2] > z1) z1 = p[2];
    }
    const pad = Math.max(1, (Math.max(x1 - x0, y1 - y0, z1 - z0)) * 0.15);
    return [[x0 - pad, x1 + pad], [y0 - pad, y1 + pad], [z0 - pad, z1 + pad]];
  }

  function numericOf(compStr) {
    try { return parseFloat(math.evaluate(String(compStr))); }
    catch (e) { return 0; }
  }

  function operandsFor(op, aParts, bParts) {
    if (op === "scalarMultiply") return [cInput.value.trim(), aParts];
    if (op === "magnitude" || op === "unit") return [aParts];
    if (op === "tripleProduct") return [aParts, bParts, parseVecInput(document.getElementById("wInput").value).parts];
    return [aParts, bParts];
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    formError.style.display = "none";
    if (!updateStartCheck()) return;

    const op = opSelect.value;
    const aParts = parseVecInput(aInput.value).parts;
    const bParsed = needsB(op) ? parseVecInput(bInput.value) : null;
    const bParts = bParsed ? bParsed.parts : null;
    const submitBtn = form.querySelector('button[type="submit"] .btn-text');
    const prev = submitBtn ? submitBtn.textContent : null;
    if (submitBtn) submitBtn.textContent = "Evaluating…";

    CAS.vectorOps(op, operandsFor(op, aParts, bParts))
      .then((result) => {
        if (!result.ok) {
          resultsArea.style.display = "none";
          placeholderPanel.style.display = "";
          showError(result.reason);
          return;
        }
        render(result, op, aParts, bParts);
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
    opSelect.value = "cross";
    aInput.value = "1, 2, 3";
    bInput.value = "4, 5, 6";
    updateOpVisibility();
    updatePreviews();
    updateStartCheck();
    form.requestSubmit();
  });

  presetRow.addEventListener("click", (e) => {
    const btn = e.target.closest(".tag");
    if (!btn) return;
    opSelect.value = btn.dataset.op;
    aInput.value = btn.dataset.a;
    if (btn.dataset.b) bInput.value = btn.dataset.b;
    if (btn.dataset.c) cInput.value = btn.dataset.c;
    if (btn.dataset.w) document.getElementById("wInput").value = btn.dataset.w;
    updateOpVisibility();
    updatePreviews();
    updateStartCheck();
    form.requestSubmit();
  });

  stepSlider.addEventListener("input", () => updateStep(Number(stepSlider.value)));

  opSelect.addEventListener("change", () => { updateOpVisibility(); updatePreviews(); updateStartCheck(); });

  const debounced = Engine.debounce(() => { updatePreviews(); updateStartCheck(); }, 220);
  aInput.addEventListener("input", debounced);
  bInput.addEventListener("input", debounced);
  cInput.addEventListener("input", debounced);
  document.getElementById("wInput").addEventListener("input", debounced);

  updateOpVisibility();
  updatePreviews();
  updateStartCheck();
})();