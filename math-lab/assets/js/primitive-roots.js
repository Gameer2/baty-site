/* Primitive roots — DOM wiring. Reports existence, a generator, the full list of primitive roots,
   and draws the modular rosette: residues placed around a circle (angle = residue/n), connected in
   the order g^0 → g^1 → … → g^φ(n−1) → g^0. A primitive root visits every point once. */
(function () {
  "use strict";

  const nInput = document.getElementById("nInput");
  const form = document.getElementById("prForm");
  const exampleBtn = document.getElementById("exampleBtn");
  const formError = document.getElementById("formError");
  const formErrorText = document.getElementById("formErrorText");
  const placeholderPanel = document.getElementById("placeholderPanel");
  const resultsArea = document.getElementById("resultsArea");
  const statExists = document.getElementById("statExists");
  const statGen = document.getElementById("statGen");
  const statPhi = document.getElementById("statPhi");
  const rootList = document.getElementById("rootList");
  const rootNote = document.getElementById("rootNote");
  const rosettePanel = document.getElementById("rosettePanel");
  const rosetteCanvas = document.getElementById("rosetteCanvas");
  const rosetteNote = document.getElementById("rosetteNote");

  function showError(msg) { formError.style.display = "block"; formErrorText.textContent = msg; }
  function clearError() { formError.style.display = "none"; }
  exampleBtn.addEventListener("click", () => { nInput.value = "11"; clearError(); });

  function parseInput(raw) {
    const s = String(raw).trim();
    if (!/^\d+$/.test(s)) throw new Error("n must be a positive integer.");
    const v = BigInt(s);
    if (v < 1n) throw new Error("n must be at least 1.");
    return v;
  }

  function drawRosette(n, g, powers) {
    // Place the n residues (0..n-1) at angle 2π·r/n around a circle, then connect
    // consecutive powers of g. Because a primitive root cycles through all units,
    // the chord diagram becomes a star polygon.
    const ctx = rosetteCanvas.getContext("2d");
    const W = rosetteCanvas.width, H = rosetteCanvas.height;
    ctx.fillStyle = "#111111";
    ctx.fillRect(0, 0, W, H);
    const cx = W / 2, cy = H / 2;
    const R = Math.min(W, H) / 2 - 40;
    const N = Number(n);
    const angle = (r) => -Math.PI / 2 + (2 * Math.PI * Number(r)) / N;
    const pt = (r) => [cx + R * Math.cos(angle(r)), cy + R * Math.sin(angle(r))];

    // residue points (all residues 0..n-1 drawn; units bold, non-units faint)
    for (let r = 0; r < N; r++) {
      const [px, py] = pt(r);
      ctx.beginPath();
      ctx.arc(px, py, 9, 0, Math.PI * 2);
      ctx.fillStyle = NumberTheory.gcd(BigInt(r), n) === 1n ? "#5c939f" : "rgba(255,255,255,0.10)";
      ctx.fill();
      ctx.fillStyle = "#dadada";
      ctx.font = "11px monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      if (N <= 24) ctx.fillText(String(r), px, py);
    }

    // connect consecutive powers of g
    ctx.strokeStyle = "rgba(237,109,64,0.85)";
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    const seq = powers.map((p) => Number(p)).concat([Number(powers[0])]); // close the loop
    seq.forEach((r, i) => {
      const [px, py] = pt(r);
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    });
    ctx.stroke();

    rosetteNote.textContent = `The rosette connects g^0=1 → g → g² → … → g^${powers.length - 1} → back to 1, with each residue placed at angle 2π·r/${n}. Since g=${g} is a primitive root (order ${powers.length} = φ(${n})), the star visits every unit before closing — a single connected star polygon, not several smaller loops.`;
  }

  function render(n) {
    placeholderPanel.style.display = "none";
    resultsArea.style.display = "block";

    const r = NumberTheory.primitiveRoots(n);
    statPhi.textContent = NumberTheory.totient(n).toString();

    if (!r.exists) {
      statExists.textContent = "none";
      statGen.textContent = "—";
      rootList.innerHTML = '<span class="pipe">none</span>';
      rootNote.textContent = r.reason;
      rosettePanel.style.display = "none";
      return;
    }

    statExists.textContent = `yes — ${r.count}`;
    statGen.textContent = r.generator.toString();
    rootList.innerHTML = r.roots.map((rt, i) => `<span class="pipe ${i === 0 ? "is-accent" : ""}">${rt}</span>`).join("");
    rootNote.textContent = `${r.count} primitive roots (= φ(φ(n)) = φ(${NumberTheory.totient(n)})). The smallest generator is g = ${r.generator}; every other primitive root is g^k for k coprime to φ(${n}) = ${r.phi}.`;
    rosettePanel.style.display = "block";
    drawRosette(n, r.generator, r.powers);
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    clearError();
    let n;
    try { n = parseInput(nInput.value); } catch (err) { return showError(err.message); }
    render(n);
    Proto.saveState("engine-lab:number-theory-primitive-roots", { n: nInput.value });
  });

  const saved = Proto.loadState("engine-lab:number-theory-primitive-roots");
  if (saved) {
    if (saved.n !== undefined) nInput.value = saved.n;
    form.requestSubmit();
  }
})();