(function () {
  "use strict";

  const reInput = document.getElementById("reInput");
  const imInput = document.getElementById("imInput");
  const nInput = document.getElementById("nInput");
  const form = document.getElementById("complexForm");
  const exampleBtn = document.getElementById("exampleBtn");
  const unityBtn = document.getElementById("unityBtn");
  const formError = document.getElementById("formError");
  const formErrorText = document.getElementById("formErrorText");

  const placeholderPanel = document.getElementById("placeholderPanel");
  const resultsArea = document.getElementById("resultsArea");
  const statModulus = document.getElementById("statModulus");
  const statArg = document.getElementById("statArg");
  const statConj = document.getElementById("statConj");
  const statPow = document.getElementById("statPow");
  const polarBlock = document.getElementById("polarBlock");
  const deMoivreBlock = document.getElementById("deMoivreBlock");
  const rootsTableBody = document.querySelector("#rootsTable tbody");
  const powLabel = document.getElementById("powLabel");
  const ACCENT = "#b45fd0";

  function showError(msg) {
    formError.style.display = "block";
    formErrorText.textContent = msg;
  }
  function clearError() { formError.style.display = "none"; }

  function parseNum(raw, label) {
    const s = String(raw).trim();
    const v = Number(s);
    if (s === "" || !Number.isFinite(v)) throw new Error(`${label} must be a real number.`);
    return v;
  }

  exampleBtn.addEventListener("click", () => {
    reInput.value = "1"; imInput.value = "1"; nInput.value = "3"; clearError();
  });
  unityBtn.addEventListener("click", () => {
    reInput.value = "1"; imInput.value = "0"; nInput.value = "6"; clearError();
  });

  // arg(z) tidied: radians to 4dp, plus a clean multiple-of-π label when it is one.
  function argLabel(theta) {
    const frac = theta / Math.PI;
    const rounded = Math.round(frac * 12) / 12; // twelfths of π catch π/6, π/4, π/3, π/2 ...
    if (Math.abs(frac - rounded) < 1e-9 && rounded !== 0) {
      // build a "kπ/m" style label from the rounded twelfths
      let num = Math.round(rounded * 12), den = 12;
      const g = gcd(Math.abs(num), den); num /= g; den /= g;
      const sign = num < 0 ? "-" : "";
      const a = Math.abs(num);
      const numPart = a === 1 ? "π" : a + "π";
      const s = den === 1 ? `${sign}${numPart}` : `${sign}${numPart}/${den}`;
      return `${theta.toFixed(4)} rad  (${s})`;
    }
    return `${theta.toFixed(4)} rad  (${(theta * 180 / Math.PI).toFixed(2)}°)`;
  }
  function gcd(a, b) { while (b) { [a, b] = [b, a % b]; } return a || 1; }

  function render(z, n) {
    placeholderPanel.style.display = "none";
    resultsArea.style.display = "block";

    const r = Complex.abs(z);
    const theta = Complex.arg(z);
    const conj = Complex.conj(z);
    const zpow = Complex.powInt(z, n);
    const roots = Complex.nthRoots(z, n);

    statModulus.textContent = Number(r.toFixed(6)).toString();
    statArg.textContent = argLabel(theta);
    statConj.textContent = Complex.format(conj, 4);
    powLabel.textContent = `zⁿ (n = ${n})`;
    statPow.textContent = Complex.format(zpow, 4);

    // polar form  z = r(cos θ + i sin θ) = r·e^{iθ}
    Engine.renderKatex(
      polarBlock,
      `z = ${Complex.format(z, 4)} = ${Number(r.toFixed(4))}\\left(\\cos ${theta.toFixed(4)} + i\\sin ${theta.toFixed(4)}\\right) = ${Number(r.toFixed(4))}\\,e^{i(${theta.toFixed(4)})}`,
      true
    );

    // De Moivre for z^n
    Engine.renderKatex(
      deMoivreBlock,
      `z^{${n}} = r^{${n}}\\left(\\cos ${n}\\theta + i\\sin ${n}\\theta\\right) = ${Complex.format(zpow, 4)}`,
      true
    );

    // roots table
    rootsTableBody.innerHTML = roots
      .map((w, k) => {
        const wr = Complex.abs(w), wt = Complex.arg(w);
        return `<tr data-k="${k}">
          <td>${k}</td>
          <td>${Complex.format(w, 4)}</td>
          <td>${Number(wr.toFixed(4))}</td>
          <td>${wt.toFixed(4)}</td>
        </tr>`;
      })
      .join("");

    drawArgand(z, conj, roots, n);
  }

  function drawArgand(z, conj, roots, n) {
    const rootR = roots.length ? Complex.abs(roots[0]) : 0;

    // the circle the n roots sit on: |w| = |z|^(1/n)
    const circX = [], circY = [];
    for (let i = 0; i <= 120; i++) {
      const t = (2 * Math.PI * i) / 120;
      circX.push(rootR * Math.cos(t));
      circY.push(rootR * Math.sin(t));
    }
    const circleTrace = {
      x: circX, y: circY, mode: "lines", type: "scatter", name: `|w| = |z|^(1/${n})`,
      line: { color: "rgba(180,95,208,0.35)", width: 1.5 }, hoverinfo: "skip",
    };

    // the roots as a closed regular polygon
    const polyX = roots.map((w) => w.re).concat(roots.length ? roots[0].re : []);
    const polyY = roots.map((w) => w.im).concat(roots.length ? roots[0].im : []);
    const polyTrace = {
      x: polyX, y: polyY, mode: "lines", type: "scatter", name: "roots polygon",
      line: { color: "rgba(180,95,208,0.55)", width: 1, dash: "dot" }, hoverinfo: "skip",
    };

    const rootsTrace = {
      x: roots.map((w) => w.re), y: roots.map((w) => w.im),
      mode: "markers+text", type: "scatter", name: `the ${n} roots`,
      text: roots.map((_, k) => `w${sub(k)}`), textposition: "top center",
      textfont: { color: "#cfa8e0", size: 11 },
      marker: { size: 9, color: ACCENT, line: { color: "#090909", width: 1 } },
    };

    // z itself and the vector from the origin to it
    const zVec = {
      x: [0, z.re], y: [0, z.im], mode: "lines", type: "scatter", name: "z",
      line: { color: "#e7e7e7", width: 2 }, hoverinfo: "skip",
    };
    const zPt = {
      x: [z.re], y: [z.im], mode: "markers+text", type: "scatter", name: "z",
      text: ["z"], textposition: "bottom right", textfont: { color: "#e7e7e7", size: 13 },
      marker: { size: 11, color: "#e7e7e7", symbol: "diamond", line: { color: "#090909", width: 1 } },
    };
    const conjPt = {
      x: [conj.re], y: [conj.im], mode: "markers+text", type: "scatter", name: "z̄",
      text: ["z̄"], textposition: "top right", textfont: { color: "#7d858c", size: 12 },
      marker: { size: 8, color: "#7d858c", symbol: "circle-open", line: { width: 2, color: "#7d858c" } },
    };

    // symmetric square window so the plane reads as a plane (equal aspect)
    const ext = Math.max(Complex.abs(z), rootR, 1) * 1.35;
    const layout = Engine.plotlyBaseLayout({
      xaxis: { title: "Re", range: [-ext, ext], zeroline: true, zerolinecolor: "rgba(255,255,255,0.25)" },
      yaxis: { title: "Im", range: [-ext, ext], scaleanchor: "x", scaleratio: 1, zeroline: true, zerolinecolor: "rgba(255,255,255,0.25)" },
    });

    Plotly.newPlot("argandPlot", [circleTrace, polyTrace, zVec, zPt, conjPt, rootsTrace], layout, Engine.plotlyConfig);
  }

  // unicode subscript digits for w0, w1, ...
  function sub(k) {
    return String(k).split("").map((d) => "₀₁₂₃₄₅₆₇₈₉"[Number(d)]).join("");
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    clearError();
    let re, im, n;
    try {
      re = parseNum(reInput.value, "Real part");
      im = parseNum(imInput.value, "Imaginary part");
      const ns = String(nInput.value).trim();
      if (!/^\d+$/.test(ns)) throw new Error("n must be a positive whole number.");
      n = parseInt(ns, 10);
      if (n < 1 || n > 24) throw new Error("Keep n between 1 and 24 so the roots stay readable.");
    } catch (err) { return showError(err.message); }

    if (re === 0 && im === 0) return showError("z = 0 has no argument and only the trivial root — try a nonzero z.");
    render({ re, im }, n);
  });
})();
