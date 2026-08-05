/* Engine Lab — prototype-only helpers (three.js point/line fields driven
   every frame), parametrized per engine so each page can pass its own
   accent color and its own shape. Nothing here touches engine-core.js.

   Every init*Scene function returns { dispose() } — callers MUST call
   dispose() on the previous handle before creating a new one on the same
   canvas (matrix/optimization pages recreate the scene on every input
   edit). Skipping this leaves the old render loop running forever on a
   detached context. */
(function (global) {
  "use strict";
  const Proto = {};

  function commonLifecycle(canvas, renderer, resize, animate) {
    resize();
    window.addEventListener("resize", resize);
    let raf;
    function loop() { raf = requestAnimationFrame(loop); animate(); }
    raf = requestAnimationFrame(loop);
    const onVis = () => {
      if (document.hidden) cancelAnimationFrame(raf);
      else raf = requestAnimationFrame(loop);
    };
    document.addEventListener("visibilitychange", onVis);
    return {
      stop() {
        cancelAnimationFrame(raf);
        window.removeEventListener("resize", resize);
        document.removeEventListener("visibilitychange", onVis);
      }
    };
  }

  function disposeRenderer(renderer) {
    try {
      renderer.dispose();
      const ext = renderer.getContext && renderer.getContext().getExtension("WEBGL_lose_context");
      if (ext) ext.loseContext();
    } catch (e) { /* best-effort cleanup */ }
  }

  /* ---------------- tinted hero ripple, with a mouse-driven ripple layered on top.
     This is the one hero canvas implementation used site-wide (hub + every engine
     that has a hero). On a fine-pointer device (real mouse, not touch) the point
     field bulges and heats up toward infrared under the
     cursor and settles back once you stop moving — reinforcing "this reacts to
     you live" rather than being a looping background clip. On touch devices the
     ambient wave still runs; nothing extra is wired up. ---------------- */
  Proto.initRipple = function (canvas, hex) {
    if (!canvas || typeof THREE === "undefined") return { dispose() {} };
    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
    camera.position.set(0, 5.2, 8.5);
    camera.lookAt(0, 0, 0);

    const SIZE = 60, SEG = 70;
    const geo = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG);
    geo.rotateX(-Math.PI / 2);
    const basePos = geo.attributes.position.array.slice();
    const count = geo.attributes.position.count;

    const accent = new THREE.Color(hex || 0x5c939f);
    const hot = new THREE.Color(0xed6d40);
    const fog = new THREE.Color(0xe7e7e7);
    const baseColors = new Float32Array(count * 3);
    const mixes = new Float32Array(count);
    for (let p = 0; p < count; p++) {
      const mix = Math.random() * 0.35;
      mixes[p] = mix;
      const c = accent.clone().lerp(fog, mix);
      baseColors[p * 3] = c.r; baseColors[p * 3 + 1] = c.g; baseColors[p * 3 + 2] = c.b;
    }
    geo.setAttribute("color", new THREE.BufferAttribute(baseColors.slice(), 3));

    const material = new THREE.PointsMaterial({ size: 0.055, vertexColors: true, transparent: true, opacity: 0.85, sizeAttenuation: true });
    const points = new THREE.Points(geo, material);
    scene.add(points);

    const clock = new THREE.Clock();

    // mouse-follow ripple — only wired up on a real mouse (hover + fine pointer)
    const supportsMouse = !!(window.matchMedia && window.matchMedia("(hover: hover) and (pointer: fine)").matches);
    const raycaster = new THREE.Raycaster();
    const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const pointerNDC = new THREE.Vector2(0, 0);
    const mouseTarget = new THREE.Vector3(9999, 0, 9999);
    const mousePos = new THREE.Vector3(9999, 0, 9999);
    let activity = 0; // 0..1, rises on movement, decays when idle or off-canvas

    function onPointerMove(e) {
      const rect = canvas.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      pointerNDC.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointerNDC.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointerNDC, camera);
      const hit = new THREE.Vector3();
      if (raycaster.ray.intersectPlane(groundPlane, hit)) {
        mouseTarget.copy(hit);
        activity = 1;
      }
    }
    function onPointerLeave() { activity = 0; }
    if (supportsMouse) {
      canvas.addEventListener("mousemove", onPointerMove);
      canvas.addEventListener("mouseleave", onPointerLeave);
    }

    function resize() {
      const parent = canvas.parentElement;
      const w = parent.clientWidth, h = parent.clientHeight;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }

    let lastT = 0;
    function frame() {
      const t = clock.getElapsedTime();
      const dt = Math.min(0.1, Math.max(0, t - lastT));
      lastT = t;

      if (activity > 0) {
        mousePos.lerp(mouseTarget, Math.min(1, dt * 6));
        activity = Math.max(0, activity - dt * 0.6);
      }

      const pos = geo.attributes.position.array;
      const col = geo.attributes.color.array;
      const interactive = activity > 0.001;
      for (let p = 0, i = 0; p < count; p++, i += 3) {
        const x = basePos[i], z = basePos[i + 2];
        let y = Math.sin(x * 0.35 + t * 0.6) * 0.55 + Math.cos(z * 0.3 + t * 0.4) * 0.45;

        let heat = 0;
        if (interactive) {
          const dx = x - mousePos.x, dz = z - mousePos.z;
          const dist = Math.sqrt(dx * dx + dz * dz);
          const falloff = Math.exp(-dist * 0.12);
          const bump = activity * falloff * Math.sin(dist * 1.1 - t * 3.2) * 1.6;
          y += bump;
          heat = Math.min(1, Math.abs(bump) * 0.85);
        }
        pos[i + 1] = y;

        if (heat > 0.02) {
          const c = accent.clone().lerp(fog, mixes[p]).lerp(hot, heat);
          col[i] = c.r; col[i + 1] = c.g; col[i + 2] = c.b;
        } else {
          col[i] = baseColors[i]; col[i + 1] = baseColors[i + 1]; col[i + 2] = baseColors[i + 2];
        }
      }
      geo.attributes.position.needsUpdate = true;
      geo.attributes.color.needsUpdate = true;
      points.rotation.y = t * 0.03;
      renderer.render(scene, camera);
    }
    const life = commonLifecycle(canvas, renderer, resize, frame);

    return {
      dispose() {
        life.stop();
        if (supportsMouse) {
          canvas.removeEventListener("mousemove", onPointerMove);
          canvas.removeEventListener("mouseleave", onPointerLeave);
        }
        geo.dispose(); material.dispose();
        disposeRenderer(renderer);
      }
    };
  };

  /* ---------------- linear algebra: grid + basis vectors under a 2x2 matrix ---------------- */
  Proto.initMatrixScene = function (canvas, m, hex) {
    if (!canvas || typeof THREE === "undefined") return { dispose() {} };
    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    camera.position.set(0, 3.6, 6.4);
    camera.lookAt(0, 0, 0);

    const accent = new THREE.Color(hex || 0x5c939f);
    const infrared = new THREE.Color(0xed6d40);
    const fogCol = new THREE.Color(0x7d858c);

    const N = 4;
    const segs = [];
    for (let i = -N; i <= N; i++) { segs.push([[i, -N], [i, N]]); segs.push([[-N, i], [N, i]]); }

    const apply = (p) => [m[0][0] * p[0] + m[0][1] * p[1], m[1][0] * p[0] + m[1][1] * p[1]];
    const orig = [], target = [];
    segs.forEach(([p0, p1]) => {
      orig.push(p0, p1);
      target.push(apply(p0), apply(p1));
    });

    const vCount = orig.length;
    const positions = new Float32Array(vCount * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.LineBasicMaterial({ color: accent, transparent: true, opacity: 0.55 });
    const lines = new THREE.LineSegments(geo, mat);
    scene.add(lines);

    // faint static reference grid (untransformed)
    const refGeo = new THREE.BufferGeometry();
    const refPos = new Float32Array(vCount * 3);
    orig.forEach((p, i) => { refPos[i * 3] = p[0]; refPos[i * 3 + 1] = 0; refPos[i * 3 + 2] = p[1]; });
    refGeo.setAttribute("position", new THREE.BufferAttribute(refPos, 3));
    const refMat = new THREE.LineBasicMaterial({ color: fogCol, transparent: true, opacity: 0.16 });
    scene.add(new THREE.LineSegments(refGeo, refMat));

    const iHat = new THREE.Vector3(1, 0, 0), jHat = new THREE.Vector3(0, 0, 1);
    const mi = apply([1, 0]), mj = apply([0, 1]);
    const miVec = new THREE.Vector3(mi[0], 0, mi[1]), mjVec = new THREE.Vector3(mj[0], 0, mj[1]);
    const arrowI = new THREE.ArrowHelper(iHat, new THREE.Vector3(0, 0.01, 0), 1, 0xe7e7e7, 0.22, 0.13);
    const arrowJ = new THREE.ArrowHelper(jHat, new THREE.Vector3(0, 0.01, 0), 1, 0xe7e7e7, 0.22, 0.13);
    const arrowMi = new THREE.ArrowHelper(iHat, new THREE.Vector3(0, 0.02, 0), 1, infrared.getHex(), 0.24, 0.14);
    const arrowMj = new THREE.ArrowHelper(jHat, new THREE.Vector3(0, 0.02, 0), 1, infrared.getHex(), 0.24, 0.14);
    [arrowI, arrowJ, arrowMi, arrowMj].forEach((a) => scene.add(a));

    function resize() {
      const parent = canvas.parentElement;
      const w = parent.clientWidth, h = parent.clientHeight;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }

    const clock = new THREE.Clock();
    function setArrow(arrow, from, to, t) {
      const cur = from.clone().lerp(to, t);
      const len = Math.max(cur.length(), 0.001);
      arrow.setDirection(cur.clone().normalize());
      arrow.setLength(len, len * 0.22, len * 0.13);
    }
    function frame() {
      const time = clock.getElapsedTime();
      const t = (Math.sin(time * 0.55) + 1) / 2; // 0..1..0 morph
      const pos = geo.attributes.position.array;
      for (let i = 0; i < orig.length; i++) {
        const ox = orig[i][0], oz = orig[i][1];
        const tx = target[i][0], tz = target[i][1];
        pos[i * 3] = ox + (tx - ox) * t;
        pos[i * 3 + 1] = 0;
        pos[i * 3 + 2] = oz + (tz - oz) * t;
      }
      geo.attributes.position.needsUpdate = true;
      setArrow(arrowMi, iHat, miVec, t);
      setArrow(arrowMj, jHat, mjVec, t);
      scene.rotation.y = Math.sin(time * 0.12) * 0.18;
      renderer.render(scene, camera);
    }
    const life = commonLifecycle(canvas, renderer, resize, frame);

    return {
      dispose() {
        life.stop();
        geo.dispose(); mat.dispose(); refGeo.dispose(); refMat.dispose();
        [arrowI, arrowJ, arrowMi, arrowMj].forEach((a) => {
          a.line.geometry.dispose(); a.line.material.dispose();
          a.cone.geometry.dispose(); a.cone.material.dispose();
        });
        disposeRenderer(renderer);
      }
    };
  };

  /* ---------------- optimization: loss surface + descending marker ---------------- */
  Proto.initSurfaceScene = function (canvas, opts) {
    if (!canvas || typeof THREE === "undefined") return { dispose() {} };
    const hex = opts.hex || 0x5c939f;
    const path = opts.path || []; // [{x,y,z}] already scaled to scene units
    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    camera.position.set(6.2, 4.4, 6.8);
    camera.lookAt(0, 0.6, 0);

    const accent = new THREE.Color(hex);
    const fog = new THREE.Color(0x1b1b1b);
    const SIZE = 9, SEG = 46;
    const geo = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG);
    geo.rotateX(-Math.PI / 2);
    const posAttr = geo.attributes.position;
    const heightOf = (x, z) => (opts.kind === "saddle") ? (x * x - z * z) * 0.045 : (x * x + z * z * 2.4) * 0.045;
    const colors = new Float32Array(posAttr.count * 3);
    let maxH = 0;
    for (let i = 0; i < posAttr.count; i++) maxH = Math.max(maxH, Math.abs(heightOf(posAttr.getX(i), posAttr.getZ(i))));
    for (let i = 0; i < posAttr.count; i++) {
      const x = posAttr.getX(i), z = posAttr.getZ(i);
      const h = heightOf(x, z);
      posAttr.setY(i, h);
      const mix = Math.min(Math.abs(h) / (maxH || 1), 1);
      const c = fog.clone().lerp(accent, mix);
      colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
    }
    geo.computeVertexNormals();
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    const meshMat = new THREE.MeshBasicMaterial({ vertexColors: true, wireframe: false, transparent: true, opacity: 0.92 });
    const mesh = new THREE.Mesh(geo, meshMat);
    scene.add(mesh);
    const wireMat = new THREE.MeshBasicMaterial({ color: 0x000000, wireframe: true, transparent: true, opacity: 0.08 });
    const wire = new THREE.Mesh(geo, wireMat);
    scene.add(wire);

    const markerGeo = new THREE.SphereGeometry(0.12, 16, 16);
    const markerMat = new THREE.MeshBasicMaterial({ color: 0xed6d40 });
    const marker = new THREE.Mesh(markerGeo, markerMat);
    scene.add(marker);

    const trailGeo = new THREE.BufferGeometry();
    const trailPositions = new Float32Array(200 * 3);
    trailGeo.setAttribute("position", new THREE.BufferAttribute(trailPositions, 3));
    const trailMat = new THREE.LineBasicMaterial({ color: 0xed6d40, transparent: true, opacity: 0.7 });
    const trail = new THREE.Line(trailGeo, trailMat);
    scene.add(trail);

    function resize() {
      const parent = canvas.parentElement;
      const w = parent.clientWidth, h = parent.clientHeight;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }

    const clock = new THREE.Clock();
    const cycle = 5.5; // seconds per full path traversal, then pause + reset
    function frame() {
      const time = clock.getElapsedTime();
      if (path.length > 1) {
        const cyclePos = (time % (cycle + 1.2));
        const tt = Math.min(cyclePos / cycle, 1);
        const segF = tt * (path.length - 1);
        const idx = Math.min(Math.floor(segF), path.length - 2);
        const localT = segF - idx;
        const a = path[idx], b = path[idx + 1];
        const x = a.x + (b.x - a.x) * localT;
        const z = a.y + (b.y - a.y) * localT;
        const y = heightOf(x, z) + 0.1;
        marker.position.set(x, y, z);

        const shown = Math.max(2, Math.floor(segF) + 2);
        const trailPos = trailGeo.attributes.position.array;
        for (let i = 0; i < shown && i < path.length; i++) {
          const p = path[i];
          trailPos[i * 3] = p.x; trailPos[i * 3 + 1] = heightOf(p.x, p.y) + 0.06; trailPos[i * 3 + 2] = p.y;
        }
        trailGeo.setDrawRange(0, shown);
        trailGeo.attributes.position.needsUpdate = true;
      }
      scene.rotation.y = Math.sin(time * 0.08) * 0.25;
      renderer.render(scene, camera);
    }
    const life = commonLifecycle(canvas, renderer, resize, frame);

    return {
      dispose() {
        life.stop();
        geo.dispose(); meshMat.dispose(); wireMat.dispose();
        markerGeo.dispose(); markerMat.dispose();
        trailGeo.dispose(); trailMat.dispose();
        disposeRenderer(renderer);
      }
    };
  };

  /* ---------------- tiny localStorage persistence helper ----------------
     Each page defines its own getState()/setState(state) tailored to its
     fields; this just guards the storage calls so a private-browsing tab
     or a full quota never throws into the caller. */
  Proto.saveState = function (key, obj) {
    try { localStorage.setItem(key, JSON.stringify(obj)); } catch (e) { /* ignore */ }
  };
  Proto.loadState = function (key) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  };

  global.Proto = Proto;
})(window);
