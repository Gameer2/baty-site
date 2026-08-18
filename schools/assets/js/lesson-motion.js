/* Schools shared motion module — the animation *system* that replaces per-lesson
   hand-coded GSAP tweens. See DESIGN_SYSTEM.md §14 (revised).

   Why this exists: the first generation of lesson pages hard-coded gsap.fromTo(...)
   per element — 20 bespoke tweens per page, no shared language, wouldn't scale to 91
   lessons, and felt canned. This module wraps Motion (motion.dev, vendored at
   schools/assets/vendor/motion.min.js, global `Motion`) into a small schools-specific
   API so a lesson declares *what* moves and *why*, not the tween mechanics.

   Shared identity (the "common ground" with math-lab): the lab's expo-out curve
   cubic-bezier(.16,1,.3,1) is the default for every transition, and state changes use
   a spring tuned to ~back.out(1.7) elastic — matching DESIGN_SYSTEM.md §0/§14's
   established motion language. A lesson never picks a raw easing; it picks an intent
   (transition | state | ambient) and inherits the right curve. */
(function (global) {
  "use strict";
  const M = global.Motion;
  if (!M) { console.warn("[lesson-motion] Motion global not found — load vendor/motion.min.js first"); return; }
  const { animate, spring, inView, stagger, motionValue } = M;

  // ---- the lab's identity curves (shared ground) -------------------------------
  // expo-out — the "everything" curve from math-lab/engine.css. Snappy ease-out-expo.
  const EXPO = [0.16, 1, 0.3, 1];
  // state-change spring — tuned to feel like GSAP's back.out(1.7) the lab already uses
  // (§14.3): a slight overshoot, settles in ~0.45s. stiffness/damping from a back-ease
  // calibration; mass kept at 1. Lessons should use this for "a value just changed"
  // reveals (a new arc appearing, the selected digit snapping into place).
  const STATE_SPRING = { type: spring, stiffness: 170, damping: 12, mass: 1, restSpeed: 0.01 };
  // ambient spring — softer, no overshoot, for loops / breathing motion that must never
  // compete with state-driven animation (§14.3's "ambient loops independently" rule).
  const AMBIENT_SPRING = { type: spring, stiffness: 60, damping: 20, mass: 1 };
  // quiet spring — the Apple-pass state-change spring (SCHOOLS_FINGERPRINT.md §10.3):
  // damping raised relative to stiffness so it settles with NO overshoot, just a gentle
  // ease into place. This is now the vertical's default (see springValue below) — every
  // lesson that hasn't hand-picked STATE_SPRING gets the quieter settle automatically,
  // instead of each lesson hand-flattening its own points/arcs to remove the bounce.
  // STATE_SPRING (the elastic ~back.out(1.7) pop) is still exported for a lesson that
  // explicitly wants the livelier feel at one specific moment.
  const QUIET_SPRING = { type: spring, stiffness: 210, damping: 26, mass: 1, restSpeed: 0.01 };

  // ---- tween a raw number with the lab curve -----------------------------------
  // onUpdate fires every frame with the interpolated value — bind it to your render
  // (e.g. drive a JSXGraph radius: onUpdate: r => { circle.setRadius(r); board.update(); }).
  // Returns Motion's animation handle (has .stop()).
  function tweenValue(from, to, onUpdate, opts) {
    opts = opts || {};
    return animate(from, to, {
      duration: opts.duration != null ? opts.duration : 0.45,
      ease: opts.ease || EXPO,
      onUpdate: onUpdate,
      onComplete: opts.onComplete
    });
  }

  // ---- a spring-driven value you can .set() repeatedly -------------------------
  // The fix for "slider input jumps the visual": instead of writing the slider value
  // straight to the scene, write it to a springValue and let the spring catch up.
  // Each frame, onUpdate gives the eased value — feed it to your render. This is what
  // makes the compass width or a selected place feel alive instead of discrete.
  function springValue(initial, onUpdate, opts) {
    opts = opts || {};
    const mv = motionValue(initial);
    if (onUpdate) mv.on("change", onUpdate);
    let current = initial;
    mv.on("change", v => { current = v; });
    return {
      set: function (target) {
        // default flipped to QUIET_SPRING (Apple-pass, no overshoot) — pass
        // { spring: LessonMotion.STATE_SPRING } explicitly for the elastic feel.
        animate(mv, target, opts.spring || QUIET_SPRING);
      },
      get: function () { return current; },
      stop: function () { if (mv.stop) mv.stop(); }
    };
  }

  // ---- reveal-on-scroll, lab style ---------------------------------------------
  // opacity 0→1, translateY 28→0, 0.7s expo — the exact `.reveal` rule from
  // engine.css, but now it can't be missed by a lesson that forgets the class.
  function reveal(target, opts) {
    opts = opts || {};
    const els = target.length ? Array.from(target) : [target];
    return inView(target, function (el) {
      animate(el, { opacity: [0, 1], y: [28, 0] },
        { duration: opts.duration != null ? opts.duration : 0.7, ease: EXPO });
    }, { margin: opts.margin || "-10% 0px" });
  }

  // ---- staggered reveal for a list (step cards, nav, etc.) ---------------------
  function revealStagger(target, opts) {
    opts = opts || {};
    return inView(target, function (el) {
      const items = el.matches(opts.itemSelector || "> *") ? [el] : Array.from(el.querySelectorAll(opts.itemSelector || "> *"));
      animate(items, { opacity: [0, 1], y: [20, 0] },
        { duration: opts.duration != null ? opts.duration : 0.6, ease: EXPO, delay: stagger(opts.stagger != null ? opts.stagger : 0.08) });
    }, { margin: opts.margin || "-10% 0px" });
  }

  // ---- timeline-style sequence with lab defaults -------------------------------
  // Pass Motion's segment array: [["#a",{opacity:1},{at:0}], ...]. The lab expo curve
  // is the default transition unless a segment overrides it.
  function sequence(segments, opts) {
    opts = opts || {};
    return animate(segments, { defaultTransition: { ease: EXPO, duration: 0.45 }, ...opts });
  }

  // ---- fade/entrance helpers for JSXGraph SVG nodes (or any SVG/DOM node) -------
  // JSXGraph elements expose `.rendNode` (the SVG node). These give a lesson a one-line
  // "appear" / "draw" without hand-rolling timelines.
  function appear(node, opts) {
    opts = opts || {};
    node.style.opacity = "0";
    // a spring is a transition *type*, not an easing — so spring reveals spread a
    // spring config as the transition, non-spring uses the expo curve + duration.
    // `opts.spring: true` now gets QUIET_SPRING (no-overshoot default); pass the actual
    // STATE_SPRING object explicitly for the elastic pop at a moment that wants it.
    const transition = opts.spring
      ? (opts.spring === true ? QUIET_SPRING : opts.spring)
      : { ease: EXPO, duration: opts.duration != null ? opts.duration : 0.5 };
    return animate(node, { opacity: [0, 1] }, { ...transition, onComplete: opts.onComplete });
  }
  // ---- "a point lands" — the shared quiet-settle primitive -----------------------
  // Supersedes the hand-rolled per-lesson `popPoint` functions (each geometry lesson
  // used to write its own opacity+scale tween for intersection/marked points). Gentle
  // scale-in, no overshoot, no blur — the Apple-pass point treatment
  // (SCHOOLS_FINGERPRINT.md §10.3), now the shared default rather than a per-lesson
  // hand-flatten. Pass { spring: STATE_SPRING } to opt into the older elastic pop.
  function settle(node, opts) {
    opts = opts || {};
    node.style.opacity = "0";
    node.style.transform = "scale(0.6)";
    return animate(node, { opacity: [0, 1], scale: [0.6, 1] },
      { ...(opts.spring || QUIET_SPRING), onComplete: opts.onComplete });
  }
  // SVG line/path "draws itself" by animating stroke-dashoffset. Pass the SVG path/line.
  // NOTE: Motion's `animate` does not actually progress strokeDashoffset on SVG nodes
  // (verified — the value stays pinned at the start, so the stroke never draws on).
  // The Web Animations API handles it reliably, so we drive the draw-on with WAAPI and
  // keep the lab's expo curve. `fill:"forwards"` + an onfinish inline write makes the end
  // state (offset 0, fully drawn) survive any later style read.
  function draw(node, opts) {
    opts = opts || {};
    const len = (typeof node.getTotalLength === "function") ? node.getTotalLength() : 400;
    node.style.strokeDasharray = len + " " + len;
    node.style.strokeDashoffset = String(len);
    node.style.opacity = "1";
    const ease = opts.ease || EXPO;
    const easing = Array.isArray(ease) ? "cubic-bezier(" + ease.join(",") + ")" : (ease || "ease-out");
    const dur = (opts.duration != null ? opts.duration : 0.7) * 1000;
    const anim = node.animate(
      [{ strokeDashoffset: len }, { strokeDashoffset: 0 }],
      { duration: dur, easing: easing, fill: "forwards" }
    );
    anim.onfinish = function () {
      node.style.strokeDashoffset = "0";
      // Drop the dash pattern once the draw is done. The dasharray was only needed
      // DURING the draw-on; leaving it pinned to the original length means a later
      // geometry change (dragging a JSXGraph handle, a spring-driven resize) makes
      // the line longer than the dash, and the extra length falls into the dash gap
      // and disappears — which reads as the stroke "animating back". A finished line
      // is just a solid line, so clearing the pattern is visually identical and
      // drag-safe.
      node.style.strokeDasharray = "none";
      if (opts.onComplete) opts.onComplete();
    };
    return anim;
  }

  global.LessonMotion = {
    EXPO: EXPO, STATE_SPRING: STATE_SPRING, AMBIENT_SPRING: AMBIENT_SPRING, QUIET_SPRING: QUIET_SPRING,
    tweenValue: tweenValue, springValue: springValue,
    reveal: reveal, revealStagger: revealStagger, sequence: sequence,
    appear: appear, draw: draw, settle: settle,
    // pass-through for lessons that need the raw primitives
    animate: animate, spring: spring, inView: inView, stagger: stagger, motionValue: motionValue
  };
})(window);