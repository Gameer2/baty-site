/* Distribution of primes — DOM wiring. Exact π(x), the PNT approximation x/ln x (a Number
   computation for the logarithm — this is display only, never part of the integer engine), the
   gap bar chart, and the Ulam spiral canvas. */
(function () {
  "use strict";

  const nInput = document.getElementById("nInput");
  const form = document.getElementById("distForm");
  const exampleBtn = document.getElementById("exampleBtn");
  const formError = document.getElementById("formError");
  const formErrorText = document.getElementById("formErrorText");
  const placeholderPanel = document.getElementById("placeholderPanel");
  const resultsArea = document.getElementById("resultsArea");
  const statPi = document.getElementById("statPi");
  const statApprox = document.getElementById("statApprox");
  const statErr = document.getElementById("statErr");
  const gapsNote = document.getElementById("gapsNote");
  const barTrack = document.getElementById("barTrack");
  const ulamCount = document.getElementById("ulamCount");
  const ulamCanvas = document.getElementById("ulamCanvas");

  function showError(msg) { formError.style.display = "block"; formErrorText.textContent = msg; }
  function clearError() { formError.style.display = "none"; }
  exampleBtn.addEventListener("click", () => { nInput.value = "100000"; clearError(); });

  function parseInput(raw) {
    const s = String(raw).trim();
    if (!/^\d+$/.test(s)) throw new Error("x must be a non-negative integer.");
    const v = BigInt(s);
    if (v < 2n) throw new Error("x must be at least 2.");
    if (v > 1000000n) throw new Error("x must be at most 1,000,000 to keep the page responsive.");
    return v;
  }

  function renderGaps(primes) {
    const gaps = [];
    for (let i = 1; i < primes.length; i++) gaps.push(Number(primes[i] - primes[i - 1]));
    if (!gaps.length) { gapsNote.textContent = "only one prime in range"; barTrack.innerHTML = ""; return; }
    const maxGap = Math.max(...gaps);
    const maxIdx = gaps.indexOf(maxGap);
    gapsNote.textContent = `${gaps.length} gaps; largest is ${maxGap}, between ${primes[maxIdx]} and ${primes[maxIdx + 1]}.`;
    // show a representative slice so the chart isn't enormous
    const slice = gaps.slice(0, 80);
    barTrack.innerHTML = slice.map((g) => {
      const pct = Math.max(4, Math.round((g / maxGap) * 100));
      return `<div class="nt-bar-row"><span class="nt-bar-label">gap ${g}</span><div class="nt-bar-track"><div class="nt-bar-fill" style="width:${pct}%"></div></div></div>`;
    }).join("");
  }

  function renderUlam(size) {
    const cells = NumberTheory.ulamSpiral(size);
    ulamCount.textContent = String(size);
    const ctx = ulamCanvas.getContext("2d");
    const W = ulamCanvas.width, H = ulamCanvas.height;
    ctx.fillStyle = "#111111";
    ctx.fillRect(0, 0, W, H);
    // map cell coords to canvas: scale so the spiral fits
    let maxAbs = 0;
    for (const c of cells) maxAbs = Math.max(maxAbs, Math.abs(c.x), Math.abs(c.y));
    const margin = 20;
    const scale = (Math.min(W, H) / 2 - margin) / (maxAbs || 1);
    const cx = W / 2, cy = H / 2;
    const dotR = Math.max(1.4, scale * 0.42);
    for (const c of cells) {
      const px = cx + c.x * scale;
      const py = cy - c.y * scale;
      ctx.beginPath();
      ctx.arc(px, py, dotR, 0, Math.PI * 2);
      ctx.fillStyle = c.prime ? "#5c939f" : "rgba(255,255,255,0.07)";
      ctx.fill();
    }
  }

  function render(x) {
    placeholderPanel.style.display = "none";
    resultsArea.style.display = "block";

    const { pi, primes } = NumberTheory.primeCount(x);
    const xNum = Number(x);
    const approx = xNum / Math.log(xNum);
    const err = Math.abs(approx - Number(pi)) / Number(pi);

    statPi.textContent = pi.toString();
    statApprox.textContent = approx.toFixed(1);
    statErr.textContent = err < 0.01 ? `≈ ${Math.round(err * 1000) / 10}%` : `${Math.round(err * 1000) / 10}%`;

    renderGaps(primes);
    renderUlam(Math.min(400, xNum < 400 ? Number(x) : 400));
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    clearError();
    let x;
    try { x = parseInput(nInput.value); } catch (err) { return showError(err.message); }
    render(x);
    Proto.saveState("engine-lab:number-theory-distribution-of-primes", { x: nInput.value });
  });

  const saved = Proto.loadState("engine-lab:number-theory-distribution-of-primes");
  if (saved) {
    if (saved.x !== undefined) nInput.value = saved.x;
    form.requestSubmit();
  }
})();