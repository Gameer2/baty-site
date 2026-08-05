"use strict";
const path = require("path");
const DomainColoring = require(path.join(__dirname, "..", "assets", "js", "domain-coloring.js"));

let pass = 0;
let fail = 0;

function ok(cond, label, detail) {
  if (cond) { pass++; console.log(`  ok    ${label}`); }
  else { fail++; console.error(`  FAIL  ${label}${detail ? " — " + detail : ""}`); }
  return cond;
}
function approx(actual, expected, tol, label) {
  const good = Number.isFinite(actual) && Math.abs(actual - expected) <= tol;
  ok(good, label, `got ${actual}, expected ≈${expected}`);
}

console.log("Domain Colouring — verification suite\n");

// --- hueFromArg ---
console.log("hueFromArg");
approx(DomainColoring.hueFromArg(0), 180, 1e-9, "arg=0 (positive real axis) -> hue 180 (mid-wheel by this mapping's convention)");
approx(DomainColoring.hueFromArg(-Math.PI), 0, 1e-9, "arg=-π -> hue 0");
approx(DomainColoring.hueFromArg(Math.PI), 360, 1e-9, "arg=π -> hue 360 (wraps to same as 0)");
approx(DomainColoring.hueFromArg(Math.PI / 2), 270, 1e-9, "arg=π/2 -> hue 270");

// --- lightnessFromModulus ---
console.log("\nlightnessFromModulus");
approx(DomainColoring.lightnessFromModulus(0), 0, 1e-9, "modulus 0 (a zero of f) -> lightness 0 (black)");
approx(DomainColoring.lightnessFromModulus(1), 0.5, 1e-9, "modulus 1 -> lightness 0.5 (pure hue, no black/white mixed in)");
approx(DomainColoring.lightnessFromModulus(1e9), 1, 1e-6, "huge modulus -> lightness approaches 1 (white, near a pole)");
ok(DomainColoring.lightnessFromModulus(Infinity) === 1, "modulus = Infinity -> lightness exactly 1 (an exact pole)");

// --- hslToRgb sanity ---
console.log("\nhslToRgb");
{
  const [r, g, b] = DomainColoring.hslToRgb(0, 1, 0.5);
  ok(r === 255 && g === 0 && b === 0, "hue 0, full saturation, mid lightness = pure red", `got (${r},${g},${b})`);
}
{
  const [r, g, b] = DomainColoring.hslToRgb(120, 1, 0.5);
  ok(r === 0 && g === 255 && b === 0, "hue 120 = pure green", `got (${r},${g},${b})`);
}
{
  const [r, g, b] = DomainColoring.hslToRgb(0, 1, 0);
  ok(r === 0 && g === 0 && b === 0, "lightness 0 is black regardless of hue", `got (${r},${g},${b})`);
}
{
  const [r, g, b] = DomainColoring.hslToRgb(0, 1, 1);
  ok(r === 255 && g === 255 && b === 255, "lightness 1 is white regardless of hue", `got (${r},${g},${b})`);
}

// --- ringModulation ---
console.log("\nringModulation");
approx(DomainColoring.ringModulation(1), 0, 1e-9, "log2(1)=0 -> sin(0) = 0, no ring at modulus 1");
approx(DomainColoring.ringModulation(2), 0, 1e-9, "log2(2)=1 -> sin(2π) = 0, no ring exactly at a power of 2");
approx(DomainColoring.ringModulation(Math.sqrt(2)), 0, 1e-9, "log2(√2)=0.5 -> sin(π) = 0, a zero-crossing midway between rings");
approx(DomainColoring.ringModulation(Math.pow(2, 0.25)), 1, 1e-9, "log2(2^0.25)=0.25 -> sin(π/2) = 1, the ring's brightest peak");
ok(DomainColoring.ringModulation(0) === 0, "ringModulation(0) is defined (no NaN/throw) at a zero");

/* --- render(): a minimal mock canvas context, since Node has no Canvas API. Just enough
   surface (createImageData / putImageData / canvas.width/height) to exercise the pixel loop
   and confirm f(z)=z (identity) paints exactly the arg/modulus colouring at known points. */
function makeMockCtx(width, height) {
  let lastImageData = null;
  return {
    canvas: { width, height },
    createImageData(w, h) { return { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }; },
    putImageData(img) { lastImageData = img; },
    _pixelAt(px, py) {
      const idx = (py * width + px) * 4;
      const d = lastImageData.data;
      return [d[idx], d[idx + 1], d[idx + 2], d[idx + 3]];
    },
  };
}

console.log("\nrender() — identity function f(z) = z, 5x5 grid over [-1,1] x [-1,1]");
{
  const ctx = makeMockCtx(5, 5);
  const identity = (re, im) => ({ re, im });
  DomainColoring.render(ctx, identity, { xmin: -1, xmax: 1, ymin: -1, ymax: 1 }, { mode: "modulus" });

  // center pixel (2,2) is z=0 -> f(z)=0 -> modulus 0 -> lightness 0 -> black
  const center = ctx._pixelAt(2, 2);
  ok(center[0] === 0 && center[1] === 0 && center[2] === 0, "center pixel (z=0) is black — a zero of the identity function", `got (${center[0]},${center[1]},${center[2]})`);

  // rightmost-middle pixel (4,2) is z=1 (positive real axis, modulus 1) -> hue 180, lightness 0.5
  const rightMid = ctx._pixelAt(4, 2);
  const expected = DomainColoring.hslToRgb(180, 1, 0.5);
  ok(
    Math.abs(rightMid[0] - expected[0]) <= 1 && Math.abs(rightMid[1] - expected[1]) <= 1 && Math.abs(rightMid[2] - expected[2]) <= 1,
    "z=1 (positive real axis, |z|=1) matches hue-from-arg-0 at lightness 0.5",
    `got (${rightMid[0]},${rightMid[1]},${rightMid[2]}), expected ~(${expected[0]},${expected[1]},${expected[2]})`
  );

  // fully opaque everywhere
  let allOpaque = true;
  for (let py = 0; py < 5; py++) for (let px = 0; px < 5; px++) if (ctx._pixelAt(px, py)[3] !== 255) allOpaque = false;
  ok(allOpaque, "every pixel is fully opaque (alpha=255) for a function defined everywhere");
}

console.log("\nrender() — a pole at the origin, f(z) = 1/z, undefined pixel handling");
{
  const ctx = makeMockCtx(5, 5);
  const reciprocal = (re, im) => {
    const d = re * re + im * im;
    if (d === 0) throw new Error("pole");
    return { re: re / d, im: -im / d };
  };
  DomainColoring.render(ctx, reciprocal, { xmin: -1, xmax: 1, ymin: -1, ymax: 1 }, { mode: "modulus" });
  const center = ctx._pixelAt(2, 2); // z=0, undefined
  ok(center[0] === 58 && center[1] === 58 && center[2] === 66, "the pole itself (z=0, evalFn throws) paints the fixed undefined-grey", `got (${center[0]},${center[1]},${center[2]})`);
  const rightMid = ctx._pixelAt(4, 2); // z=1 -> f(z)=1 -> same as identity's z=1 case
  const expected = DomainColoring.hslToRgb(180, 1, 0.5);
  ok(
    Math.abs(rightMid[0] - expected[0]) <= 1 && Math.abs(rightMid[1] - expected[1]) <= 1,
    "away from the pole, 1/z at z=1 colours the same as any other |w|=1, arg=0 point"
  );
}

console.log("\nrender() — onSample callback fires once per pixel");
{
  const ctx = makeMockCtx(3, 3);
  let calls = 0;
  DomainColoring.render(ctx, (re, im) => ({ re, im }), { xmin: -1, xmax: 1, ymin: -1, ymax: 1 }, { onSample: () => { calls++; } });
  ok(calls === 9, "onSample fired exactly width*height times", `got ${calls}, expected 9`);
}

console.log("\nrenderBoolField() — generic true/false/undefined overlay");
{
  const ctx = makeMockCtx(3, 3);
  // true on the right half (re > 0), false on the left, undefined at re === 0 (the middle column)
  DomainColoring.renderBoolField(ctx, (re) => { if (re === 0) return null; return re > 0; }, { xmin: -1, xmax: 1, ymin: -1, ymax: 1 });
  const left = ctx._pixelAt(0, 1), mid = ctx._pixelAt(1, 1), right = ctx._pixelAt(2, 1);
  ok(left[0] === 203 && left[1] === 53 && left[2] === 0, "false paints the validation-red default", `got (${left[0]},${left[1]},${left[2]})`);
  ok(right[0] === 89 && right[1] === 169 && right[2] === 147, "true paints the validation-green default", `got (${right[0]},${right[1]},${right[2]})`);
  ok(mid[0] === 58 && mid[1] === 58 && mid[2] === 66, "null (or a thrown predicate) paints the undefined grey", `got (${mid[0]},${mid[1]},${mid[2]})`);
}
{
  const ctx = makeMockCtx(3, 3);
  DomainColoring.renderBoolField(ctx, () => { throw new Error("boom"); }, { xmin: -1, xmax: 1, ymin: -1, ymax: 1 });
  const p = ctx._pixelAt(1, 1);
  ok(p[0] === 58 && p[1] === 58 && p[2] === 66, "a throwing predicate is treated the same as undefined, not a crash");
}
{
  const ctx = makeMockCtx(2, 2);
  DomainColoring.renderBoolField(ctx, () => true, { xmin: -1, xmax: 1, ymin: -1, ymax: 1 }, { trueColor: [1, 2, 3], alpha: 128 });
  const p = ctx._pixelAt(0, 0);
  ok(p[0] === 1 && p[1] === 2 && p[2] === 3 && p[3] === 128, "custom trueColor and alpha are honoured", `got (${p[0]},${p[1]},${p[2]},${p[3]})`);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
