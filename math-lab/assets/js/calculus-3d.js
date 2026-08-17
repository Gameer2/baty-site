/* Calculus Engine — shared 3D scene helper (three.js).

   The first 3D method on the site (Vectors in Space) establishes the camera, axes, grid, and
   pointer-orbit conventions every later 3D page (Partial Derivatives & Tangent Planes,
   Volumes of Revolution) reuses, so they live here once rather than being copied into each
   page. The vendored three.min.js ships core + ArrowHelper/GridHelper/AxesHelper/BufferGeometry
   but NOT OrbitControls, FontLoader, or ParametricGeometry — so orbit is hand-rolled here
   (pointer drag → spherical camera), surfaces are sampled into a plain BufferGeometry, and
   axis labels are an HTML legend on the page rather than 3D text.

   Scope: a Scene3D owns a renderer, a camera, a scene with a grid + colored axis arrows, and a
   rAF render loop. Pages add arrows / points / surfaces / solids via the helpers below and
   call frame() to re-aim the camera at whatever was added. Everything added is tracked so
   clear() can wipe just the page's objects and leave the fixed axes behind.

   Three.js is a global (THREE), loaded from assets/vendor/three.min.js by each page that
   uses this. If THREE is missing the page degrades to a plain note — same honest-fallback
   discipline as the CAS worker over file://. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.Scene3D = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // Palette kept here so every 3D page reads as one system. Pages may pass their own colors
  // for the vectors they add, but the axes/grid/use these.
  const COLORS = {
    axisX: 0xed6d40,   // warm — reads as "x" against the teal engine accent
    axisY: 0x9bcf6b,   // green
    axisZ: 0x5c939f,   // the engine's slate teal
    grid: 0x2a2f33,
    origin: 0xdadada,
  };

  function Scene3D(container, opts) {
    if (!container) throw new Error("Scene3D needs a container element.");
    if (typeof THREE === "undefined") {
      this.unavailable = true;
      this.container = container;
      container.innerHTML = '<p class="p1" style="padding:1.5rem;color:var(--off-white)">3D rendering needs three.js, which is not loaded here.</p>';
      return;
    }
    opts = opts || {};
    this.container = container;

    const w = container.clientWidth || 600;
    const h = container.clientHeight || 360;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(w, h);
    container.appendChild(renderer.domElement);
    this.renderer = renderer;

    const scene = new THREE.Scene();
    this.scene = scene;

    const camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 2000);
    this.camera = camera;
    this.target = new THREE.Vector3(0, 0, 0);

    // Spherical orbit state — hand-rolled because OrbitControls isn't in the bundle.
    this.orbit = { theta: Math.PI * 0.25, phi: Math.PI * 0.35, radius: 10 };
    this._updateCamera();

    // Fixed scene furniture: a ground grid on the xz-plane and three colored axis arrows.
    // The grid lies flat (xz) because "up" is y, the convention every calculus text uses for
    // z = f(x, y). For pure vector pages that's fine; surface/solid pages add their own grid
    // orientation if they need it.
    this._fixed = [];
    this._added = [];

    const grid = new THREE.GridHelper(10, 10, COLORS.grid, COLORS.grid);
    grid.material.transparent = true;
    grid.material.opacity = 0.35;
    scene.add(grid);
    this._fixed.push(grid);

    this._addAxisArrow(new THREE.Vector3(5, 0, 0), COLORS.axisX);
    this._addAxisArrow(new THREE.Vector3(0, 5, 0), COLORS.axisY);
    this._addAxisArrow(new THREE.Vector3(0, 0, 5), COLORS.axisZ);

    // A small sphere at the origin so the meeting point of the axes is legible.
    const origin = new THREE.Mesh(
      new THREE.SphereGeometry(0.08, 16, 16),
      new THREE.MeshBasicMaterial({ color: COLORS.origin })
    );
    scene.add(origin);
    this._fixed.push(origin);

    this._bindPointer();
    this._bindResize();
    this._running = true;
    this._loop = this._loop.bind(this);
    requestAnimationFrame(this._loop);
  }

  Scene3D.prototype._addAxisArrow = function (dir, color) {
    const len = dir.length();
    const arrow = new THREE.ArrowHelper(dir.clone().normalize(), new THREE.Vector3(0, 0, 0), len, color, 0.3, 0.18);
    this.scene.add(arrow);
    this._fixed.push(arrow);
  };

  Scene3D.prototype._updateCamera = function () {
    const { theta, phi, radius } = this.orbit;
    const sp = Math.sin(phi);
    this.camera.position.set(
      this.target.x + radius * sp * Math.cos(theta),
      this.target.y + radius * Math.cos(phi),
      this.target.z + radius * sp * Math.sin(theta)
    );
    this.camera.lookAt(this.target);
  };

  /* ---- pointer orbit + wheel dolly ----
     Drag rotates; wheel/two-finger scales the radius. No inertia, no damping — the page is
     a teaching tool, not a game, and predictable beats smooth here. */
  Scene3D.prototype._bindPointer = function () {
    const el = this.renderer.domElement;
    let dragging = false;
    let pinching = false;
    let lastX = 0, lastY = 0;
    let lastPinch = 0;

    const touchDist = (t) =>
      Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);

    const onDown = (e) => {
      if (e.touches && e.touches.length >= 2) {
        // Two fingers down → pinch to dolly, not rotate.
        pinching = true;
        dragging = false;
        lastPinch = touchDist(e.touches);
        return;
      }
      pinching = false;
      dragging = true;
      const p = e.touches ? e.touches[0] : e;
      lastX = p.clientX; lastY = p.clientY;
      el.style.cursor = "grabbing";
    };
    const onMove = (e) => {
      if (pinching && e.touches && e.touches.length >= 2) {
        const d = touchDist(e.touches);
        // Spread → camera closer (radius down); pinch → farther. Scaled to the
        // same ~0.001/px feel as the wheel dolly above. Clamped to [2, 120].
        this.orbit.radius = Math.max(
          2,
          Math.min(120, this.orbit.radius * (1 - (d - lastPinch) * 0.01)),
        );
        lastPinch = d;
        this._updateCamera();
        return;
      }
      if (!dragging) return;
      const p = e.touches ? e.touches[0] : e;
      const dx = p.clientX - lastX;
      const dy = p.clientY - lastY;
      lastX = p.clientX; lastY = p.clientY;
      this.orbit.theta -= dx * 0.01;
      this.orbit.phi = Math.max(0.05, Math.min(Math.PI - 0.05, this.orbit.phi - dy * 0.01));
      this._updateCamera();
    };
    const onUp = (e) => {
      if (e && e.touches && e.touches.length === 1) {
        // Dropped from two fingers to one — resume rotating with the survivor.
        pinching = false;
        dragging = true;
        lastX = e.touches[0].clientX;
        lastY = e.touches[0].clientY;
        return;
      }
      dragging = false;
      pinching = false;
      lastPinch = 0;
      el.style.cursor = "grab";
    };

    el.style.cursor = "grab";
    // Claim the touch gestures for the 3D canvas so the browser doesn't scroll
    // or page-pinch-zoom while the user rotates / pinches the plot. Touch-only;
    // no effect on mouse/wheel. Paired with the passive listeners below.
    el.style.touchAction = "none";
    el.addEventListener("mousedown", onDown);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    el.addEventListener("touchstart", onDown, { passive: true });
    window.addEventListener("touchmove", onMove, { passive: true });
    window.addEventListener("touchend", onUp);
    el.addEventListener("wheel", (e) => {
      e.preventDefault();
      this.orbit.radius = Math.max(2, Math.min(120, this.orbit.radius * (1 + e.deltaY * 0.001)));
      this._updateCamera();
    }, { passive: false });

    this._detachPointer = () => {
      el.removeEventListener("mousedown", onDown);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      el.removeEventListener("touchstart", onDown);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onUp);
    };
  };

  Scene3D.prototype._bindResize = function () {
    const ro = new ResizeObserver(() => {
      const w = this.container.clientWidth || 600;
      const h = this.container.clientHeight || 360;
      this.renderer.setSize(w, h);
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
    });
    ro.observe(this.container);
    this._ro = ro;
  };

  Scene3D.prototype._loop = function () {
    if (!this._running) return;
    this.renderer.render(this.scene, this.camera);
    requestAnimationFrame(this._loop);
  };

  /* ---- public API: objects the page adds ----

     Each adder returns the object it created (a THREE.Object3D) so the page can keep a
     handle; everything is also tracked in _added so clear() can remove the lot at once. */

  // Arrow from `from` (default origin) to `to`. `to` may be a [x,y,z] array or a Vector3.
  Scene3D.prototype.addArrow = function (to, color, opts) {
    opts = opts || {};
    const from = opts.from ? v3(opts.from) : new THREE.Vector3(0, 0, 0);
    const end = v3(to);
    const dir = end.clone().sub(from);
    const len = dir.length();
    if (len < 1e-9) {
      // A zero-length arrow still deserves a marker (the zero vector is a legitimate input).
      const dot = new THREE.Mesh(
        new THREE.SphereGeometry(0.12, 12, 12),
        new THREE.MeshBasicMaterial({ color })
      );
      dot.position.copy(from);
      this.scene.add(dot);
      this._added.push(dot);
      return dot;
    }
    const headLen = Math.min(0.4, len * 0.2);
    const headW = Math.min(0.2, len * 0.1);
    const arrow = new THREE.ArrowHelper(dir.clone().normalize(), from, len, color, headLen, headW);
    this.scene.add(arrow);
    this._added.push(arrow);
    return arrow;
  };

  Scene3D.prototype.addPoint = function (at, color, size) {
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(size || 0.14, 16, 16),
      new THREE.MeshBasicMaterial({ color })
    );
    mesh.position.copy(v3(at));
    this.scene.add(mesh);
    this._added.push(mesh);
    return mesh;
  };

  // A line through a list of [x,y,z] points — used to draw the projection-from-u or the
  // difference vector u−v as a dashed connector.
  Scene3D.prototype.addLine = function (points, color, opts) {
    opts = opts || {};
    const g = new THREE.BufferGeometry().setFromPoints(points.map(v3));
    const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: opts.opacity != null ? opts.opacity : 1 });
    const line = new THREE.Line(g, mat);
    this.scene.add(line);
    this._added.push(line);
    return line;
  };

  /* A surface z = f(x, y) over [x0,x1]×[y0,y1], as a wireframe so it reads as a transparent
     sheet rather than a solid occluding the vectors. f receives (x, y) and returns z (or null
     to skip the vertex — a point outside the domain). Reused by Partial Derivatives. */
  Scene3D.prototype.addSurface = function (f, xRange, yRange, color, opts) {
    opts = opts || {};
    const nx = opts.samples || 24;
    const ny = opts.samples || 24;
    const [x0, x1] = xRange;
    const [y0, y1] = yRange;
    const positions = [];
    for (let i = 0; i <= nx; i++) {
      const x = x0 + (i / nx) * (x1 - x0);
      for (let j = 0; j <= ny; j++) {
        const y = y0 + (j / ny) * (y1 - y0);
        let z;
        try { z = f(x, y); } catch (e) { z = null; }
        if (z === null || !Number.isFinite(z)) { positions.push(NaN, NaN, NaN); continue; }
        positions.push(x, z, y); // three's y is up, so map math-z → three-y
      }
    }
    // Grid wireframe: rows and columns of line segments joining adjacent sample points.
    const idx = (i, j) => i * (ny + 1) + j;
    const linePts = [];
    const pushSeg = (a, b) => { linePts.push(a[0], a[1], a[2], b[0], b[1], b[2]); };
    const pt = (i, j) => {
      const o = idx(i, j) * 3;
      return [positions[o], positions[o + 1], positions[o + 2]];
    };
    const finite = (p) => Number.isFinite(p[0]) && Number.isFinite(p[1]) && Number.isFinite(p[2]);
    for (let i = 0; i <= nx; i++) {
      for (let j = 0; j < ny; j++) {
        const a = pt(i, j), b = pt(i, j + 1);
        if (finite(a) && finite(b)) pushSeg(a, b);
      }
    }
    for (let j = 0; j <= ny; j++) {
      for (let i = 0; i < nx; i++) {
        const a = pt(i, j), b = pt(i + 1, j);
        if (finite(a) && finite(b)) pushSeg(a, b);
      }
    }
    const g = new THREE.BufferGeometry().setFromPoints(linePts.map((n, k, arr) => (k % 3 === 0 ? new THREE.Vector3(arr[k], arr[k + 1], arr[k + 2]) : null)).filter(Boolean));
    const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.55 });
    const wire = new THREE.LineSegments(g, mat);
    this.scene.add(wire);
    this._added.push(wire);
    return wire;
  };

  /* A surface over an arbitrary (u, v) parameter domain, as a wireframe grid — the same
     "rows and columns of line segments" construction as addSurface, generalized so the page
     supplies the coordinate mapping instead of this file assuming z = f(x, y) directly. Reused
     by Multiple Integrals for a polar region (u = r, v = theta, mapped through x = r·cosθ,
     y (three-y, i.e. math-z) = f(r,θ), z (three-z, i.e. math-y) = r·sinθ) where addSurface's
     fixed x/z-are-the-domain assumption does not apply.

     mapFn(u, v) returns a [x, y, z] array in THREE coordinates already (the page owns the
     convention), or null to skip that vertex — a point outside the region, exactly like
     addSurface's null-for-outside-the-domain contract. */
  Scene3D.prototype.addParametricSurface = function (mapFn, uRange, vRange, color, opts) {
    opts = opts || {};
    const nu = opts.samples || 24;
    const nv = opts.samples || 24;
    const [u0, u1] = uRange;
    const [v0, v1] = vRange;
    const pt = (i, j) => {
      const u = u0 + (i / nu) * (u1 - u0);
      const v = v0 + (j / nv) * (v1 - v0);
      let p;
      try { p = mapFn(u, v); } catch (e) { p = null; }
      return (p && Number.isFinite(p[0]) && Number.isFinite(p[1]) && Number.isFinite(p[2])) ? p : null;
    };
    const finite = (p) => p !== null;
    const linePts = [];
    const pushSeg = (a, b) => { linePts.push(new THREE.Vector3(a[0], a[1], a[2]), new THREE.Vector3(b[0], b[1], b[2])); };
    for (let i = 0; i <= nu; i++) {
      for (let j = 0; j < nv; j++) {
        const a = pt(i, j), b = pt(i, j + 1);
        if (finite(a) && finite(b)) pushSeg(a, b);
      }
    }
    for (let j = 0; j <= nv; j++) {
      for (let i = 0; i < nu; i++) {
        const a = pt(i, j), b = pt(i + 1, j);
        if (finite(a) && finite(b)) pushSeg(a, b);
      }
    }
    const g = new THREE.BufferGeometry().setFromPoints(linePts);
    const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: opts.opacity != null ? opts.opacity : 0.55 });
    const wire = new THREE.LineSegments(g, mat);
    this.scene.add(wire);
    this._added.push(wire);
    return wire;
  };

  // Removes every object the page added; the axes and grid stay.
  Scene3D.prototype.clear = function () {
    for (const o of this._added) {
      this.scene.remove(o);
      if (o.geometry && o.geometry.dispose) o.geometry.dispose();
      if (o.material && o.material.dispose) o.material.dispose();
    }
    this._added = [];
  };

  /* A surface of revolution, drawn as a wireframe. `surfacePoint(x, theta)` returns a
     [x, y, z] array (three.js coords) for a point on the outer skin — the page builds it from
     the curve and the axis being revolved about. The wireframe is rings (constant x, theta
     sweeping the circle — these read as the stacking disk/shell cross-sections) plus
     meridians (constant theta, x sweeping the axis — the profile curve carried around). Both
     are plain THREE.Line objects over a BufferGeometry, so no extra bundle pieces are needed.

     Reused by Volumes of Revolution. */
  Scene3D.prototype.addRevolution = function (surfacePoint, xRange, color, opts) {
    opts = opts || {};
    const nx = opts.samples || 18;
    const nt = opts.thetaSteps || 20;
    const [x0, x1] = xRange;
    const rings = [];
    for (let i = 0; i <= nx; i++) {
      const x = x0 + (i / nx) * (x1 - x0);
      const pts = [];
      for (let j = 0; j <= nt; j++) {
        const th = (j / nt) * 2 * Math.PI;
        const p = surfacePoint(x, th);
        if (p && Number.isFinite(p[0]) && Number.isFinite(p[1]) && Number.isFinite(p[2])) pts.push(v3(p));
      }
      if (pts.length >= 2) rings.push(this.addLine(pts, color, { opacity: opts.opacity != null ? opts.opacity : 0.5 }));
    }
    for (let j = 0; j < nt; j++) {
      const th = (j / nt) * 2 * Math.PI;
      const pts = [];
      for (let i = 0; i <= nx; i++) {
        const x = x0 + (i / nx) * (x1 - x0);
        const p = surfacePoint(x, th);
        if (p && Number.isFinite(p[0]) && Number.isFinite(p[1]) && Number.isFinite(p[2])) pts.push(v3(p));
      }
      if (pts.length >= 2) this.addLine(pts, color, { opacity: opts.opacity != null ? opts.opacity : 0.25 });
    }
    return rings;
  };

  // Re-aim the camera at a box [[x0,x1],[y0,y1],[z0,z1]] (math coords) and pull back so it fits.
  Scene3D.prototype.frame = function (box) {
    const cx = (box[0][0] + box[0][1]) / 2;
    const cy = (box[2][0] + box[2][1]) / 2; // math-z
    const cz = (box[1][0] + box[1][1]) / 2; // math-y
    this.target.set(cx, cy, cz); // three-y is math-z
    const sx = box[0][1] - box[0][0];
    const sy = box[2][1] - box[2][0];
    const sz = box[1][1] - box[1][0];
    const radius = 1.4 * Math.max(sx, sz, sy, 4);
    this.orbit.radius = Math.max(4, Math.min(60, radius));
    this._updateCamera();
  };

  Scene3D.prototype.dispose = function () {
    this._running = false;
    if (this._ro) this._ro.disconnect();
    if (this._detachPointer) this._detachPointer();
    this.clear();
    for (const o of this._fixed) {
      this.scene.remove(o);
      if (o.geometry && o.geometry.dispose) o.geometry.dispose();
      if (o.material && o.material.dispose) o.material.dispose();
    }
    this._fixed = [];
    if (this.renderer) {
      this.renderer.dispose();
      if (this.renderer.domElement && this.renderer.domElement.parentNode) {
        this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
      }
    }
  };

  function v3(v) {
    if (v instanceof THREE.Vector3) return v.clone();
    if (Array.isArray(v)) return new THREE.Vector3(v[0] || 0, v[1] || 0, v[2] || 0);
    return new THREE.Vector3();
  }

  Scene3D.COLORS = COLORS;
  return Scene3D;
});