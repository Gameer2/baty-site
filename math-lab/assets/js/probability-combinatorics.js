(function () {
  "use strict";

  // DOM elements
  const form = document.getElementById("probForm");
  const modeRow = document.getElementById("modeRow");
  const modeButtons = modeRow.querySelectorAll(".chip");
  const bayesModeRow = document.getElementById("bayesModeRow");
  const bayesModeButtons = bayesModeRow.querySelectorAll(".chip");
  const statusLine = document.getElementById("statusLine");
  const statusText = document.getElementById("statusText");
  const formError = document.getElementById("formError");
  const formErrorText = document.getElementById("formErrorText");
  const placeholderPanel = document.getElementById("placeholderPanel");
  const resultsArea = document.getElementById("resultsArea");
  const exampleBtn = document.getElementById("exampleBtn");

  // Mode panels
  const countingFields = document.getElementById("countingFields");
  const conditionalFields = document.getElementById("conditionalFields");
  const bayesFields = document.getElementById("bayesFields");
  const bayesSimpleFields = document.getElementById("bayesSimpleFields");
  const bayesGeneralFields = document.getElementById("bayesGeneralFields");

  // Counting inputs
  const countN = document.getElementById("countN");
  const countK = document.getElementById("countK");
  // Conditional inputs
  const pAandB = document.getElementById("pAandB");
  const pB = document.getElementById("pB");
  // Bayes simple inputs
  const bayesPH = document.getElementById("bayesPH");
  const bayesPEH = document.getElementById("bayesPEH");
  const bayesPEnH = document.getElementById("bayesPEnH");
  // Bayes general inputs
  const bayesPriorInput = document.getElementById("bayesPriorInput");
  const bayesLikelihoodInput = document.getElementById("bayesLikelihoodInput");

  // Output elements
  const resultStrip = document.getElementById("resultStrip");
  const bayesTableWrap = document.getElementById("bayesTableWrap");
  const bayesTableBody = document.getElementById("bayesTableBody");
  const bayesPlotWrap = document.getElementById("bayesPlotWrap");
  const formulaBlock = document.getElementById("formulaBlock");

  const STORE_KEY = "engine-lab:statistics:probability";
  let currentMode = "counting";
  let currentBayes = "simple";
  let shownOnce = false;

  function showError(msg) {
    formError.style.display = "block";
    formErrorText.textContent = msg;
  }
  function clearError() { formError.style.display = "none"; }

  function showMode(mode) {
    countingFields.style.display = mode === "counting" ? "flex" : "none";
    conditionalFields.style.display = mode === "conditional" ? "flex" : "none";
    bayesFields.style.display = mode === "bayes" ? "block" : "none";
  }

  function showBayes(sub) {
    bayesSimpleFields.style.display = sub === "simple" ? "flex" : "none";
    bayesGeneralFields.style.display = sub === "general" ? "block" : "none";
  }

  function formulaFor(mode, bayesSub) {
    switch (mode) {
      case "counting":
        return "P(n,k) = \\frac{n!}{(n-k)!} \\quad C(n,k) = \\binom{n}{k} = \\frac{n!}{k!(n-k)!}";
      case "conditional":
        return "P(A \\mid B) = \\frac{P(A \\cap B)}{P(B)}";
      case "bayes":
        return bayesSub === "simple"
          ? "P(H \\mid E) = \\frac{P(E \\mid H)\\,P(H)}{P(E \\mid H)\\,P(H) + P(E \\mid \\neg H)\\,P(\\neg H)}"
          : "P(H_i \\mid E) = \\frac{P(E \\mid H_i)\\,P(H_i)}{\\sum_j P(E \\mid H_j)\\,P(H_j)}";
      default:
        return "";
    }
  }

  function tile(label, value, accent) {
    const cls = "result-stat" + (accent ? " accent" : "");
    return `<div class="${cls}"><div class="label">${label}</div><div class="value">${value}</div></div>`;
  }

  function parseNumberList(text) {
    return text.split(/[\s,]+/).map((s) => parseFloat(s)).filter((v) => Number.isFinite(v));
  }

  function compute() {
    const Stats = StatsAlgorithms;
    clearError();
    try {
      if (currentMode === "counting") {
        const n = parseInt(countN.value, 10);
        const k = parseInt(countK.value, 10);
        return {
          mode: "counting",
          tiles: [
            tile("n!", Engine.formatNum(Stats.factorial(n), 0), true),
            tile("P(n, k)", Engine.formatNum(Stats.permutation(n, k), 0)),
            tile("C(n, k)", Engine.formatNum(Stats.combination(n, k), 0)),
            tile("k!", Engine.formatNum(Stats.factorial(k), 0)),
          ],
        };
      }
      if (currentMode === "conditional") {
        const ab = parseFloat(pAandB.value);
        const b = parseFloat(pB.value);
        const post = Stats.conditionalProbability(ab, b);
        return {
          mode: "conditional",
          tiles: [
            tile("P(A | B)", Engine.formatNum(post, 6), true),
            tile("P(A ∩ B)", Engine.formatNum(ab, 6)),
            tile("P(B)", Engine.formatNum(b, 6)),
          ],
        };
      }
      // Bayes
      if (currentBayes === "simple") {
        const pH = parseFloat(bayesPH.value);
        const pEH = parseFloat(bayesPEH.value);
        const pEnH = parseFloat(bayesPEnH.value);
        const post = Stats.bayesSimple(pH, pEH, pEnH);
        const num = pEH * pH;
        const den = num + pEnH * (1 - pH);
        return {
          mode: "bayes-simple",
          tiles: [
            tile("P(H | E)", Engine.formatNum(post, 6), true),
            tile("P(E|H)·P(H)", Engine.formatNum(num, 6)),
            tile("P(E)", Engine.formatNum(den, 6)),
          ],
        };
      }
      // Bayes general
      const priors = parseNumberList(bayesPriorInput.value);
      const likelihoods = parseNumberList(bayesLikelihoodInput.value);
      const r = Stats.bayesTheorem(priors, likelihoods);
      return {
        mode: "bayes-general",
        tiles: [
          tile("P(E) (normalizer)", Engine.formatNum(r.normalizer, 6), true),
          tile("hypotheses (m)", Engine.formatNum(priors.length, 0)),
        ],
        priors,
        likelihoods,
        posteriors: r.posteriors,
        normalizer: r.normalizer,
      };
    } catch (err) {
      showError(err.message);
      statusLine.className = "status-line";
      statusText.textContent = "Invalid input.";
      return null;
    }
  }

  function render() {
    const result = compute();
    if (!result) return;

    placeholderPanel.style.display = "none";
    resultsArea.style.display = "block";
    shownOnce = true;

    resultStrip.innerHTML = result.tiles.join("");

    // Bayes general: table + plot
    bayesTableWrap.style.display = result.mode === "bayes-general" ? "block" : "none";
    bayesPlotWrap.style.display = result.mode === "bayes-general" ? "block" : "none";

    if (result.mode === "bayes-general") {
      const rows = result.priors.map((p, i) =>
        `<tr style="border-bottom:1px solid rgba(255,255,255,.06);">
          <td style="padding:6px 10px;">H<sub>${i + 1}</sub></td>
          <td style="padding:6px 10px;">${Engine.formatNum(p, 6)}</td>
          <td style="padding:6px 10px;">${Engine.formatNum(result.likelihoods[i], 6)}</td>
          <td style="padding:6px 10px;">${Engine.formatNum(result.posteriors[i], 6)}</td>
        </tr>`).join("");
      bayesTableBody.innerHTML = rows;

      const x = result.priors.map((_, i) => "H" + (i + 1));
      Plotly.react("bayesPlot", [
        { x, y: result.priors, type: "bar", name: "Prior", marker: { color: "rgba(237,109,64,0.35)", line: { color: "#ed6d40", width: 1 } } },
        { x, y: result.posteriors, type: "bar", name: "Posterior", marker: { color: "#c99a3c", line: { color: "#c99a3c", width: 1 } } },
      ], Engine.plotlyBaseLayout({
        showlegend: true,
        barmode: "group",
        xaxis: { title: "Hypothesis", dtick: 1 },
        yaxis: { title: "Probability", range: [0, 1.05] },
        legend: { x: 0.02, y: 1, bgcolor: "rgba(0,0,0,0)" },
      }), Engine.plotlyConfig);
    }

    Engine.renderKatex(formulaBlock, formulaFor(currentMode, currentBayes), true);

    statusLine.className = "status-line ok";
    const labels = { counting: "Counting", conditional: "Conditional probability", "bayes-simple": "Bayes (simple)", "bayes-general": "Bayes (general)" };
    statusText.textContent = `${labels[result.mode]} computed.`;

    Proto.saveState(STORE_KEY, {
      mode: currentMode,
      bayes: currentBayes,
      counting: { n: countN.value, k: countK.value },
      conditional: { ab: pAandB.value, b: pB.value },
      bayesSimple: { pH: bayesPH.value, pEH: bayesPEH.value, pEnH: bayesPEnH.value },
      bayesGeneral: { priors: bayesPriorInput.value, likelihoods: bayesLikelihoodInput.value },
    });
  }

  const debouncedRender = Engine.debounce(() => { if (shownOnce) render(); }, 200);

  // Mode selector
  modeButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      modeButtons.forEach((b) => { b.classList.remove("active"); b.setAttribute("aria-selected", "false"); });
      btn.classList.add("active");
      btn.setAttribute("aria-selected", "true");
      currentMode = btn.getAttribute("data-mode");
      showMode(currentMode);
      if (shownOnce) render();
    });
  });

  // Bayes sub-mode selector
  bayesModeButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      bayesModeButtons.forEach((b) => { b.classList.remove("active"); b.setAttribute("aria-selected", "false"); });
      btn.classList.add("active");
      btn.setAttribute("aria-selected", "true");
      currentBayes = btn.getAttribute("data-bayes");
      showBayes(currentBayes);
      if (shownOnce) render();
    });
  });

  // Input listeners
  [countN, countK, pAandB, pB, bayesPH, bayesPEH, bayesPEnH, bayesPriorInput, bayesLikelihoodInput].forEach((el) => {
    el.addEventListener("input", debouncedRender);
  });

  // Try Example — mode-appropriate defaults
  exampleBtn.addEventListener("click", () => {
    if (currentMode === "counting") {
      countN.value = 52; countK.value = 5;
    } else if (currentMode === "conditional") {
      pAandB.value = 0.12; pB.value = 0.30;
    } else if (currentBayes === "simple") {
      bayesPH.value = 0.01; bayesPEH.value = 0.99; bayesPEnH.value = 0.05;
    } else {
      bayesPriorInput.value = "0.3333333333\n0.3333333333\n0.3333333333";
      bayesLikelihoodInput.value = "0.5\n1\n0";
    }
    render();
  });

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    render();
  });

  // Load saved state
  const saved = Proto.loadState(STORE_KEY);
  if (saved) {
    if (saved.mode) {
      currentMode = saved.mode;
      modeButtons.forEach((b) => {
        b.classList.toggle("active", b.getAttribute("data-mode") === currentMode);
        b.setAttribute("aria-selected", b.getAttribute("data-mode") === currentMode ? "true" : "false");
      });
      showMode(currentMode);
    }
    if (saved.bayes) {
      currentBayes = saved.bayes;
      bayesModeButtons.forEach((b) => {
        b.classList.toggle("active", b.getAttribute("data-bayes") === currentBayes);
        b.setAttribute("aria-selected", b.getAttribute("data-bayes") === currentBayes ? "true" : "false");
      });
      showBayes(currentBayes);
    }
    if (saved.counting) { countN.value = saved.counting.n ?? 52; countK.value = saved.counting.k ?? 5; }
    if (saved.conditional) { pAandB.value = saved.conditional.ab ?? 0.12; pB.value = saved.conditional.b ?? 0.30; }
    if (saved.bayesSimple) { bayesPH.value = saved.bayesSimple.pH ?? 0.01; bayesPEH.value = saved.bayesSimple.pEH ?? 0.99; bayesPEnH.value = saved.bayesSimple.pEnH ?? 0.05; }
    if (saved.bayesGeneral) {
      bayesPriorInput.value = saved.bayesGeneral.priors ?? bayesPriorInput.value;
      bayesLikelihoodInput.value = saved.bayesGeneral.likelihoods ?? bayesLikelihoodInput.value;
    }
  }
})();