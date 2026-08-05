/* Domain colouring — the Complex Analysis engine's flagship renderer.

   f: C -> C is 4-dimensional and cannot be plotted as a curve or a surface — the one problem
   this whole engine exists to solve. Domain colouring solves it by painting the INPUT plane:
   each pixel z is coloured by hue = arg(f(z)) and lightness = a function of |f(z)|, so a zero
   of f shows as a point the hue wheel winds around and darkens toward (order = winding count),
   and a pole shows the same way but brightening toward white instead.

   Deliberately NOT symbolic: this is a per-pixel *numeric* evaluation over a canvas, driven by
   a compiled math.js expression (which has native, correct complex-number support — see the
   Phase 0 probe in COMPLEX_ANALYSIS_ENGINE_PLAN.md). A 300x300 grid is 90,000 evaluations;
   nerdamer would be far too slow and the CAS worker's hang-protection is not needed here since
   math.js's complex arithmetic does not have the hang failure mode nerdamer does. Pure, DOM-
   touching only through the canvas it is given — no globals, no page wiring.

   Two callers, one implementation: every method page that needs a coloured f(z) plot (Complex
   Functions, branch cuts, argument principle, conformal mapping's "before" panel) calls
   DomainColoring.render with its own evalFn and options, instead of re-deriving the HSL math. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.DomainColoring = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const DomainColoring = {};

  // Standard HSL -> RGB, h in [0,360), s/l in [0,1]. Returns [r,g,b] each 0-255.
  function hslToRgb(h, s, l) {
    h = ((h % 360) + 360) % 360;
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const hp = h / 60;
    const x = c * (1 - Math.abs((hp % 2) - 1));
    let r1 = 0, g1 = 0, b1 = 0;
    if (hp < 1) { r1 = c; g1 = x; }
    else if (hp < 2) { r1 = x; g1 = c; }
    else if (hp < 3) { g1 = c; b1 = x; }
    else if (hp < 4) { g1 = x; b1 = c; }
    else if (hp < 5) { r1 = x; b1 = c; }
    else { r1 = c; b1 = x; }
    const m = l - c / 2;
    return [
      Math.round((r1 + m) * 255),
      Math.round((g1 + m) * 255),
      Math.round((b1 + m) * 255),
    ];
  }
  DomainColoring.hslToRgb = hslToRgb;

  /* arg(w) in [-pi, pi] -> hue in [0, 360). arg=0 (positive real axis) is red (hue 0), matching
     the phase-portrait convention every textbook figure uses. */
  function hueFromArg(argW) {
    return ((argW + Math.PI) / (2 * Math.PI)) * 360;
  }
  DomainColoring.hueFromArg = hueFromArg;

  /* Lightness from modulus. m/(1+m) maps 0 -> 0 (black at a zero) and infinity -> 1 (white at
     a pole), passing through 0.5 (pure hue, no black/white mixed in) exactly at |f(z)| = 1 —
     which is itself a useful reference: the unit-modulus level curve is where colour is purest. */
  function lightnessFromModulus(m) {
    if (!Number.isFinite(m)) return 1; // treat "blew up" as a pole: white
    return m / (1 + m);
  }
  DomainColoring.lightnessFromModulus = lightnessFromModulus;

  /* Modulus-contour ring modulation (Mathematica-parity gap audit rec #2: makes |f(z)| exactly
     readable, not just brightness-approximate). Rings appear at |f(z)| = 2^k for integer k, so
     counting rings crossed between two points reads off how many octaves |f| changed by.
     Blended in gently (±12% of lightness) so it augments the base colouring instead of washing
     out the hue winding, which is still the primary signal. */
  function ringModulation(m) {
    if (!Number.isFinite(m) || m <= 0) return 0;
    const t = Math.log2(m);
    return Math.sin(2 * Math.PI * t);
  }
  DomainColoring.ringModulation = ringModulation;

  /* Renders f over [xmin,xmax] x [ymin,ymax] into a canvas 2D context sized width x height
     (device pixels — caller handles devicePixelRatio scaling before calling this).

     evalFn(re, im) must return {re, im} (a math.js Complex or a plain object both work, only
     .re/.im are read) or null/undefined/throw for "f is undefined here" (division by zero,
     branch point, outside the domain) — those pixels are painted a fixed "undefined" grey
     rather than guessed at.

     opts:
       mode          "modulus" (default, plan's hue+brightness scheme) | "phase" (lightness
                     fixed at 0.5 — pure hue wheel, isolates zero/pole counting) | "rings"
                     (modulus mode plus the contour-ring modulation)
       onSample(re,im,w)   optional callback fired once per pixel — lets a caller collect
                     "nearest sample to a click" without a second evaluation pass. */
  DomainColoring.render = function (ctx, evalFn, bounds, opts) {
    opts = opts || {};
    const mode = opts.mode || "modulus";
    const width = ctx.canvas.width;
    const height = ctx.canvas.height;
    const { xmin, xmax, ymin, ymax } = bounds;

    const img = ctx.createImageData(width, height);
    const data = img.data;
    const UNDEFINED_RGB = [58, 58, 66]; // matches the site's --urban-smoke, reads as "no data"

    for (let py = 0; py < height; py++) {
      // flip y: image row 0 is the top of the canvas, which is the LARGEST imaginary part
      const im = ymax - ((ymax - ymin) * py) / (height - 1 || 1);
      for (let px = 0; px < width; px++) {
        const re = xmin + ((xmax - xmin) * px) / (width - 1 || 1);
        const idx = (py * width + px) * 4;

        let w = null;
        try { w = evalFn(re, im); } catch (e) { w = null; }

        if (opts.onSample) opts.onSample(re, im, w);

        if (!w || !Number.isFinite(w.re) || !Number.isFinite(w.im)) {
          data[idx] = UNDEFINED_RGB[0];
          data[idx + 1] = UNDEFINED_RGB[1];
          data[idx + 2] = UNDEFINED_RGB[2];
          data[idx + 3] = 255;
          continue;
        }

        const m = Math.hypot(w.re, w.im);
        const hue = hueFromArg(Math.atan2(w.im, w.re));
        let light;
        if (mode === "phase") {
          light = 0.5;
        } else if (mode === "rings") {
          const base = lightnessFromModulus(m);
          light = Math.min(1, Math.max(0, base + 0.12 * ringModulation(m)));
        } else {
          light = lightnessFromModulus(m);
        }

        const [r, g, b] = hslToRgb(hue, 1, light);
        data[idx] = r;
        data[idx + 1] = g;
        data[idx + 2] = b;
        data[idx + 3] = 255;
      }
    }

    ctx.putImageData(img, 0, 0);
  };

  /* Draws a small standalone hue-wheel legend (audit rec #1: without it, the hue<->argument
     convention is only readable to someone who already knows it) into its own canvas context.
     radius in device pixels; the wheel fills [center-radius, center+radius] on both axes. */
  DomainColoring.renderLegend = function (ctx, cx, cy, radius) {
    const img = ctx.createImageData(ctx.canvas.width, ctx.canvas.height);
    const data = img.data;
    const w = ctx.canvas.width, h = ctx.canvas.height;
    for (let py = 0; py < h; py++) {
      for (let px = 0; px < w; px++) {
        const dx = px - cx, dy = cy - py; // flip y so "up" is positive imaginary, matching the plot
        const r = Math.hypot(dx, dy);
        const idx = (py * w + px) * 4;
        if (r > radius) { data[idx + 3] = 0; continue; } // transparent outside the wheel
        const hue = hueFromArg(Math.atan2(dy, dx));
        const [rr, gg, bb] = hslToRgb(hue, 1, 0.5); // pure hue ring — legend explains angle, not modulus
        data[idx] = rr; data[idx + 1] = gg; data[idx + 2] = bb; data[idx + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  };

  /* Generic boolean-field overlay — paints the plane green where predFn(re,im) is true, red
     where false, and the same undefined-grey where it throws or returns null/undefined.

     Not specific to Cauchy-Riemann (or to any one topic): any per-pixel yes/no test over the
     plane can reuse this instead of re-deriving the grid loop. Its first caller is the
     Analyticity page, painting where the Cauchy-Riemann equations hold using the EXACT
     symbolic residual (u_x - v_y, u_y + v_x) from complex-symbolic.js, compiled once via
     math.js and evaluated per pixel — no CAS calls in the loop, so this can run at full canvas
     resolution without hanging. */
  DomainColoring.renderBoolField = function (ctx, predFn, bounds, opts) {
    opts = opts || {};
    const trueColor = opts.trueColor || [89, 169, 147];   // --validation-green
    const falseColor = opts.falseColor || [203, 53, 0];   // --validation-red
    const undefinedColor = opts.undefinedColor || [58, 58, 66];
    const alpha = opts.alpha != null ? opts.alpha : 255;
    const width = ctx.canvas.width;
    const height = ctx.canvas.height;
    const { xmin, xmax, ymin, ymax } = bounds;

    const img = ctx.createImageData(width, height);
    const data = img.data;

    for (let py = 0; py < height; py++) {
      const im = ymax - ((ymax - ymin) * py) / (height - 1 || 1);
      for (let px = 0; px < width; px++) {
        const re = xmin + ((xmax - xmin) * px) / (width - 1 || 1);
        const idx = (py * width + px) * 4;

        let v = null;
        try { v = predFn(re, im); } catch (e) { v = null; }

        const col = v === true ? trueColor : v === false ? falseColor : undefinedColor;
        data[idx] = col[0];
        data[idx + 1] = col[1];
        data[idx + 2] = col[2];
        data[idx + 3] = alpha;
      }
    }

    ctx.putImageData(img, 0, 0);
  };

  return DomainColoring;
});
