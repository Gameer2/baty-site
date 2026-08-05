/* Direction Field page wiring — the numeric Euler/RK4 comparison that used to be the third tab of
   the monolithic index.html, now a first-class method page. Steps dy/dx = f(x,y) from (x0,y0) with
   Euler and RK4 (ODESymbolic.eulerRK4FirstOrder), draws the slope field, and when f is linear in x
   and y (detected by sampling) plots the exact closed form so each method's error is visible.
   Persists the last session via Proto.saveState, matching the original page's behaviour. */
(function () {
  "use strict";

  const fxyInput = document.getElementById("fxyInput");
  const x0Input = document.getElementById("x0Input");
  const y0Input = document.getElementById("y0Input");
  const hInput = document.getElementById("hInput");
  const stepsInput = document.getElementById("stepsInput");
  const formError = document.getElementById("formError");
  const formErrorText = document.getElementById("formErrorText");

  const STORE_KEY = "engine-lab:ode";
  const savedOde = Proto.loadState(STORE_KEY);
  if (savedOde) {
    if (savedOde.fxy !== undefined) fxyInput.value = savedOde.fxy;
    if (savedOde.x0 !== undefined) x0Input.value = savedOde.x0;
    if (savedOde.y0 !== undefined) y0Input.value = savedOde.y0;
    if (savedOde.h !== undefined) hInput.value = savedOde.h;
    if (savedOde.steps !== undefined) stepsInput.value = savedOde.steps;
  }

  function compileFxy(exprStr) {
    try {
      const node = math.parse(exprStr);
      const code = node.compile();
      const fn = (x, y) => {
        const r = code.evaluate({ x, y });
        if (typeof r !== "number" || Number.isNaN(r)) throw new Error("not a real number");
        return r;
      };
      fn(1, 1);
      return { ok: true, fn };
    } catch (err) {
      return { ok: false, error: err.message || String(err) };
    }
  }

  // Detects whether f(x,y) is linear with constant coefficients — f(x,y) = a*x + b*y + c —
  // by sampling instead of parsing the AST, then checking the fit holds at extra points.
  function detectLinear(fn) {
    try {
      const c = fn(0, 0);
      const a = fn(1, 0) - c;
      const b = fn(0, 1) - c;
      const checks = [[2, 3], [-1, 2], [1.7, -0.6]];
      const ok = checks.every(([x, y]) => {
        const expect = a * x + b * y + c;
        const got = fn(x, y);
        return Math.abs(got - expect) < 1e-6 * Math.max(1, Math.abs(expect));
      });
      return ok ? { a, b, c } : null;
    } catch (e) {
      return null;
    }
  }

  function exactLinearSolution(a, b, c, x0, y0) {
    if (Math.abs(b) < 1e-9) {
      return { fn: (x) => y0 + (a / 2) * (x * x - x0 * x0) + c * (x - x0), form: "poly" };
    }
    const A = -a / b;
    const B = (A - c) / b;
    const C = (y0 - A * x0 - B) * Math.exp(-b * x0);
    return { fn: (x) => A * x + B + C * Math.exp(b * x), form: "exp", A, B, C, b };
  }

  function recompute() {
    const expr = fxyInput.value;
    Engine.renderKatex(document.getElementById("fxyPreview"), expr ? `\\frac{dy}{dx} = ${Engine.toLatex(expr)}` : "", false);

    const compiled = compileFxy(expr);
    if (!compiled.ok) {
      formError.style.display = "block";
      formErrorText.textContent = compiled.error;
      return;
    }
    formError.style.display = "none";

    const x0 = parseFloat(x0Input.value), y0 = parseFloat(y0Input.value);
    const h = parseFloat(hInput.value), steps = parseInt(stepsInput.value, 10);
    const linear = detectLinear(compiled.fn);

    const { path, rk4Path } = ODESymbolic.eulerRK4FirstOrder(compiled.fn, x0, y0, h, steps);
    const x = path[path.length - 1].x, y = path[path.length - 1].y;
    const ry = rk4Path[rk4Path.length - 1].y;

    document.getElementById("statXFinal").textContent = Engine.formatNum(x, 3);
    document.getElementById("statYFinal").textContent = Engine.formatNum(y, 3);
    document.getElementById("statYFinalRK4").textContent = Engine.formatNum(ry, 3);

    const tbody = document.querySelector("#odeTable tbody");
    tbody.innerHTML = "";
    path.forEach((p, i) => {
      const tr = document.createElement("tr");
      if (i === path.length - 1) tr.classList.add("is-current");
      tr.innerHTML = `<td>${i}</td><td>${Engine.formatNum(p.x, 4)}</td><td>${Engine.formatNum(p.y, 4)}</td><td>${Engine.formatNum(p.slope, 4)}</td>`;
      tbody.appendChild(tr);
    });

    const exactBlock = document.getElementById("formulaExact");
    const exactNote = document.getElementById("exactNote");
    const errLabel = document.getElementById("errLabel");
    const errStat = document.getElementById("statError");
    const errLabelRK4 = document.getElementById("errLabelRK4");
    const errStatRK4 = document.getElementById("statErrorRK4");
    let exactTrace = null;

    if (linear) {
      const sol = exactLinearSolution(linear.a, linear.b, linear.c, x0, y0);
      exactNote.style.display = "";
      exactNote.textContent = "Exact solution — this equation is linear in x and y, so a closed form exists";
      exactBlock.style.display = "";
      const latex = sol.form === "poly"
        ? `y(x) = ${Engine.formatNum(y0, 3)} + ${Engine.formatNum(linear.a / 2, 3)}(x^2 - ${Engine.formatNum(x0, 2)}^2) + ${Engine.formatNum(linear.c, 3)}(x - ${Engine.formatNum(x0, 2)})`
        : `y(x) = ${Engine.formatNum(sol.A, 3)}x + ${Engine.formatNum(sol.B, 3)} + ${Engine.formatNum(sol.C, 3)}\\,e^{${Engine.formatNum(sol.b, 3)}x}`;
      Engine.renderKatex(exactBlock, latex, true);
      const exactY = sol.fn(x);
      errLabel.textContent = "Euler error";
      errStat.textContent = Engine.formatNum(Math.abs(exactY - y), 4);
      errLabelRK4.textContent = "RK4 error";
      errStatRK4.textContent = Engine.formatNum(Math.abs(exactY - ry), 6);
      const exs = [], eys = [];
      const N = 60;
      for (let i = 0; i <= N; i++) {
        const xi = x0 + (i / N) * (x - x0);
        exs.push(xi); eys.push(sol.fn(xi));
      }
      exactTrace = { x: exs, y: eys, mode: "lines", name: "exact", line: { color: "#5c939f", width: 2, dash: "dot" } };
    } else {
      exactNote.style.display = "none";
      exactBlock.style.display = "none";
      errLabel.textContent = "Euler error";
      errStat.textContent = "n/a";
      errLabelRK4.textContent = "RK4 error";
      errStatRK4.textContent = "n/a";
    }

    const xs = path.map((p) => p.x), ys = path.map((p) => p.y);
    const rk4xs = rk4Path.map((p) => p.x), rk4ys = rk4Path.map((p) => p.y);
    const xMin = Math.min(...xs, ...rk4xs) - 0.8, xMax = Math.max(...xs, ...rk4xs) + 0.8;
    const yMin = Math.min(...ys, ...rk4ys) - 1.2, yMax = Math.max(...ys, ...rk4ys) + 1.2;
    const shapes = [];
    const GRID = 12;
    for (let i = 0; i <= GRID; i++) {
      for (let j = 0; j <= GRID; j++) {
        const gx = xMin + (i / GRID) * (xMax - xMin);
        const gy = yMin + (j / GRID) * (yMax - yMin);
        let m; try { m = compiled.fn(gx, gy); } catch (e) { continue; }
        const len = 0.22 * (xMax - xMin) / GRID * 1.6;
        const norm = Math.sqrt(1 + m * m);
        const dx = (len / norm), dy = (len * m / norm);
        shapes.push({ type: "line", x0: gx - dx / 2, y0: gy - dy / 2, x1: gx + dx / 2, y1: gy + dy / 2, line: { color: "rgba(255,255,255,0.16)", width: 1.5 } });
      }
    }

    const traces = [
      { x: xs, y: ys, mode: "lines+markers", name: "Euler", line: { color: "#ed6d40", width: 2.5 }, marker: { size: 6 } },
      { x: rk4xs, y: rk4ys, mode: "lines+markers", name: "RK4", line: { color: "#59a993", width: 2.5 }, marker: { size: 6, symbol: "diamond" } }
    ];
    if (exactTrace) traces.push(exactTrace);

    Plotly.react("odePlot", traces, Engine.plotlyBaseLayout({ shapes, legend: { orientation: "h", y: -0.18 } }), Engine.plotlyConfig);

    Proto.saveState(STORE_KEY, { fxy: expr, x0, y0, h, steps });
  }

  Engine.attachMathKeypad(fxyInput, document.getElementById("fxyKeypad"));
  Engine.attachKeypadToggle(document.getElementById("keypadToggle"), document.getElementById("fxyKeypad"));
  [fxyInput, x0Input, y0Input, hInput, stepsInput].forEach((el) => el.addEventListener("input", Engine.debounce(recompute, 180)));
  recompute();
})();