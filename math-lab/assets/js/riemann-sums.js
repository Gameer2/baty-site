/* Riemann Sums page wiring. Numeric — Algorithms.runRiemannSum lives in algorithms.js, not
   calculus-symbolic.js, because this page IS the definition of the integral (the limit of
   sums of rectangle areas), not a symbolic derivation. No CAS worker involved: this is plain
   arithmetic on a compiled function, same idiom as the Numerical Engine's own pages. */
(function () {
  "use strict";

  const fxInput = document.getElementById("fxInput");
  const fxPreview = document.getElementById("fxPreview");
  const aInput = document.getElementById("aInput");
  const bInput = document.getElementById("bInput");
  const nSlider = document.getElementById("nSlider");
  const nVal = document.getElementById("nVal");
  const formError = document.getElementById("formError");
  const formErrorText = document.getElementById("formErrorText");
  const presetRow = document.getElementById("presetRow");

  const statIntegral = document.getElementById("statIntegral");
  const statN = document.getElementById("statN");
  const statWidth = document.getElementById("statWidth");

  const VARIABLE = "x";
  const STORE_KEY = "engine-lab:calculus-riemann-sums";

  function showError(msg) {
    formError.style.display = "block";
    formErrorText.textContent = msg;
  }

  function hideError() {
    formError.style.display = "none";
  }

  function snapshot() {
    return { fx: fxInput.value, a: aInput.value, b: bInput.value, n: nSlider.value };
  }

  function recompute() {
    const expr = fxInput.value.trim();
    Engine.renderKatex(fxPreview, expr ? Engine.toLatex(expr) : "", false);

    const compiled = Engine.compileFx(expr, VARIABLE);
    if (!compiled.ok) { showError(compiled.error); return; }

    const a = parseFloat(aInput.value), b = parseFloat(bInput.value);
    const n = parseInt(nSlider.value, 10);
    nVal.textContent = n;
    if (!Number.isFinite(a) || !Number.isFinite(b)) { showError("Interval endpoints a and b must be numbers."); return; }
    if (!(b > a)) { showError("b must be greater than a."); return; }

    let result;
    try { result = Algorithms.runRiemannSum(compiled.fn, a, b, n); }
    catch (err) { showError(err.message); return; }
    hideError();

    statIntegral.textContent = Engine.formatNum(result.total, 4);
    statN.textContent = n;
    statWidth.textContent = Engine.formatNum(result.width, 4);

    Engine.renderKatex(document.getElementById("formulaFx"), "f(x) = " + Engine.toLatex(expr), true);

    const shapes = result.rectangles.map((r) => ({
      type: "rect", x0: r.x0, x1: r.x1, y0: 0, y1: r.height,
      line: { color: "rgba(237,109,64,0.55)", width: 1 },
      fillcolor: "rgba(237,109,64,0.16)"
    }));

    const samples = 300;
    const xs = [], ys = [];
    for (let i = 0; i <= samples; i++) {
      const x = a + (i / samples) * (b - a);
      let y; try { y = compiled.fn(x); } catch { y = null; }
      xs.push(x); ys.push(Number.isFinite(y) ? y : null);
    }

    Plotly.react("fxPlot", [{
      x: xs, y: ys, mode: "lines", name: "f(x)",
      line: { color: "#4f9e82", width: 2.5 }
    }], Engine.plotlyBaseLayout({ shapes, showlegend: false }), Engine.plotlyConfig);

    Proto.saveState(STORE_KEY, snapshot());
  }

  const saved = Proto.loadState(STORE_KEY);
  if (saved) {
    if (saved.fx !== undefined) fxInput.value = saved.fx;
    if (saved.a !== undefined) aInput.value = saved.a;
    if (saved.b !== undefined) bInput.value = saved.b;
    if (saved.n !== undefined) nSlider.value = saved.n;
  }

  Engine.attachMathKeypad(fxInput, document.getElementById("fxKeypad"));
  Engine.attachKeypadToggle(document.getElementById("keypadToggle"), document.getElementById("fxKeypad"));

  const debounced = Engine.debounce(recompute, 180);
  [fxInput, aInput, bInput].forEach((el) => el.addEventListener("input", debounced));
  nSlider.addEventListener("input", recompute);

  presetRow.addEventListener("click", (e) => {
    const btn = e.target.closest(".tag");
    if (!btn) return;
    fxInput.value = btn.dataset.fx;
    aInput.value = btn.dataset.a;
    bInput.value = btn.dataset.b;
    recompute();
  });

  recompute();
})();
