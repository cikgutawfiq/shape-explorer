// The 3D stage: renderer, camera, floor, edge outlines, counting highlights and number labels.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { buildNet } from './net.js';
import { buildModel, SPHERE_MODEL, countsOf } from './shapes.js';

const lerp = THREE.MathUtils.lerp;
const smooth = (x) => x * x * (3 - 2 * x);
const keyOf = (a, b) => (a < b ? `${a}-${b}` : `${b}-${a}`);
const STEP_MS = 560;
// outlines sit in the same plane as their faces, so nudge them towards the camera to avoid z-fighting
const LINE_DEPTH = { polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 };

function radialTexture(stops) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  stops.forEach(([o, col]) => grad.addColorStop(o, col));
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class Viewer {
  constructor(host, labelLayer, hooks = {}) {
    this.host = host;
    this.layer = labelLayer;
    this.hooks = hooks;
    this.fold = 1;
    this.net = null;
    this.model = null;
    this.items = { faces: [], curved: [], edges: [], vertices: [] };
    this.labels = [];
    this.count = null;
    this.userMoved = false;
    this.autoFit = true;
    this.visible = true;
    this._frame = 0;
    this._dirTween = null;

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.domElement.className = 'gl';
    host.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(36, 1, 0.1, 100);
    this.camera.position.set(0, 3.2, 5.2);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    Object.assign(this.controls, {
      enableDamping: true, dampingFactor: 0.09, enablePan: false, minDistance: 2, maxDistance: 30,
      maxPolarAngle: Math.PI * 0.92, rotateSpeed: 0.9, autoRotateSpeed: 1.6,
    });
    this.controls.addEventListener('start', () => { this.userMoved = true; this.controls.autoRotate = false; this._dirTween = null; });
    const noFit = () => { this.autoFit = false; };
    this.renderer.domElement.addEventListener('wheel', noFit, { passive: true });
    this.renderer.domElement.addEventListener('touchstart', (e) => { if (e.touches.length > 1) noFit(); }, { passive: true });

    this.scene.add(new THREE.HemisphereLight(0xffffff, 0xb9c9e6, 1.9));
    const sun = new THREE.DirectionalLight(0xffffff, 1.9);
    sun.position.set(3, 7, 5);
    this.scene.add(sun);
    const fill = new THREE.DirectionalLight(0xdfeaff, 0.7);
    fill.position.set(-4, 2, -3);
    this.scene.add(fill);

    // floor: soft platform + contact shadow
    this.platform = new THREE.Mesh(
      new THREE.CircleGeometry(1, 64),
      new THREE.MeshBasicMaterial({
        map: radialTexture([[0, 'rgba(255,255,255,0.95)'], [0.72, 'rgba(255,255,255,0.55)'], [1, 'rgba(255,255,255,0)']]),
        transparent: true, depthWrite: false,
      }),
    );
    this.platform.rotation.x = -Math.PI / 2;
    this.platform.position.y = -0.012;
    this.shadow = new THREE.Mesh(
      new THREE.CircleGeometry(1, 48),
      new THREE.MeshBasicMaterial({
        map: radialTexture([[0, 'rgba(20,40,70,0.38)'], [0.6, 'rgba(20,40,70,0.16)'], [1, 'rgba(20,40,70,0)']]),
        transparent: true, depthWrite: false,
      }),
    );
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.position.y = -0.006;
    this.scene.add(this.platform, this.shadow);

    // shared materials
    this.mats = {
      edge: new LineMaterial({ color: 0x1b2733, linewidth: 2.6, ...LINE_DEPTH }),
      seam: new LineMaterial({ color: 0x1b2733, linewidth: 1.4, transparent: true, opacity: 0.55, ...LINE_DEPTH }),
      ring: new LineMaterial({ color: 0x1b2733, linewidth: 1.4, transparent: true, opacity: 0.35 }),
      hi: new LineMaterial({ color: 0xff7a00, linewidth: 6, ...LINE_DEPTH }),
      dot: new THREE.MeshLambertMaterial({ color: 0xe0246f, emissive: 0x7a0f3a }),
    };
    this.dotGeo = new THREE.SphereGeometry(0.075, 20, 14);
    this.ray = new THREE.Raycaster();

    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(host);
    new IntersectionObserver(([e]) => { this.visible = e.isIntersecting; }).observe(host);
    this.resize();

    this.clock = new THREE.Clock();
    this.renderer.setAnimationLoop(() => this.tick());
  }

  /* ------------------------------------------------------------------ shapes ---- */

  setShape(id, sides, { keepFold = false, keepView = false } = {}) {
    this.clearCount();
    if (this.shapeObj) {
      this.scene.remove(this.shapeObj);
      this.shapeObj.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material && o.material !== this.mats.dot && !(o.material instanceof LineMaterial)) o.material.dispose?.();
      });
    }
    this.items = { faces: [], curved: [], edges: [], vertices: [] };
    this.labels.forEach((l) => l.el.remove());
    this.labels = [];
    this.meshes = [];

    if (id === 'sphere') this._buildSphere();
    else this._buildNet(buildModel(id, sides));

    this.scene.add(this.shapeObj);
    const R = this.net ? this.net.fitRadius : 1.3;
    this.platform.scale.setScalar(R * 1.15);
    this.shadow.scale.setScalar(this.net ? this.net.foldedRadius * 1.35 : 1.35);
    this.counts = countsOf(this.model);
    this.setFold(keepFold && this.net ? this.fold : 1);
    if (!keepView) this.resetView(true);
    return this.counts;
  }

  _buildSphere() {
    this.model = SPHERE_MODEL;
    this.net = null;
    const g = new THREE.Group();
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(1, 64, 40),
      new THREE.MeshLambertMaterial({ color: '#2aa392' }),
    );
    mesh.position.y = 1;
    g.add(mesh);
    // a few guide lines so you can see it turning
    const lines = new THREE.Group();
    const ring = (rot) => {
      const seg = [];
      for (let i = 0; i < 96; i++) {
        const a0 = (i / 96) * Math.PI * 2;
        const a1 = ((i + 1) / 96) * Math.PI * 2;
        seg.push(Math.cos(a0) * 1.004, Math.sin(a0) * 1.004, 0, Math.cos(a1) * 1.004, Math.sin(a1) * 1.004, 0);
      }
      const l = new LineSegments2(new LineSegmentsGeometry().setPositions(seg), this.mats.ring);
      l.frustumCulled = false;
      l.rotation.set(...rot);
      return l;
    };
    lines.add(ring([0, 0, 0]), ring([0, Math.PI / 2, 0]), ring([Math.PI / 2, 0, 0]));
    mesh.add(lines);
    this.shapeObj = g;
    this.meshes = [mesh];
    this.sphereMesh = mesh;
    this.items.curved = [{
      kind: 'curved', curved: true, meshes: [mesh],
      anchors: [{ obj: mesh, local: new THREE.Vector3(0, 0, 1), mesh }],
    }];
  }

  _buildNet(model) {
    this.model = model;
    this.sphereMesh = null;
    const net = buildNet(model);
    this.net = net;
    this.shapeObj = net.object;
    const faces = net.faces;
    faces.forEach((f) => this.meshes.push(f.mesh));

    // ---- face items
    model.faceItems.forEach((it) => {
      const fs = it.faces.map((i) => faces[i]);
      const sample = fs.length > 16 ? fs.filter((_, i) => i % Math.ceil(fs.length / 16) === 0) : fs;
      const item = {
        kind: it.curved ? 'curved' : 'faces', curved: !!it.curved,
        meshes: fs.map((f) => f.mesh),
        anchors: sample.map((f) => ({ obj: f.pivot, local: f.centroidLocal.clone(), mesh: f.mesh })),
      };
      (it.curved ? this.items.curved : this.items.faces).push(item);
    });

    // ---- edges
    const pairToItem = new Map();
    model.edgeItems.forEach((it, i) => it.pairs.forEach(([a, b]) => pairToItem.set(keyOf(a, b), i)));
    const seamKeys = new Set();
    (model.seam || []).forEach(([fa, fb]) => {
      const shared = faces[fa].idx.filter((k) => faces[fb].idx.includes(k));
      if (shared.length === 2) seamKeys.add(keyOf(shared[0], shared[1]));
    });
    this.items.edges = model.edgeItems.map((it) => ({ kind: 'edges', curved: !!it.curved, lines: [], anchors: [] }));
    faces.forEach((f) => {
      const byItem = new Map();
      const seamSegs = [];
      f.idx.forEach((a, i) => {
        const b = f.idx[(i + 1) % f.idx.length];
        const k = keyOf(a, b);
        const pa = f.vertLocal.get(a);
        const pb = f.vertLocal.get(b);
        if (pairToItem.has(k)) {
          const ii = pairToItem.get(k);
          if (!byItem.has(ii)) byItem.set(ii, []);
          byItem.get(ii).push(pa, pb);
        } else if (seamKeys.has(k)) seamSegs.push(pa, pb);
      });
      byItem.forEach((pts, ii) => {
        const ls = this._lines(pts, this.mats.edge);
        f.pivot.add(ls);
        const item = this.items.edges[ii];
        item.lines.push(ls);
        if (item.anchors.length < 24) {
          const mid = pts[0].clone().add(pts[1]).multiplyScalar(0.5);
          item.anchors.push({ obj: f.pivot, local: mid, mesh: f.mesh });
        }
      });
      if (seamSegs.length) f.pivot.add(this._lines(seamSegs, this.mats.seam));
    });

    // ---- vertices
    model.vertexItems.forEach((v) => {
      const item = { kind: 'vertices', dots: [], anchors: [] };
      faces.forEach((f) => {
        if (!f.vertLocal.has(v)) return;
        const dot = new THREE.Mesh(this.dotGeo, this.mats.dot);
        dot.position.copy(f.vertLocal.get(v));
        dot.visible = false;
        f.pivot.add(dot);
        item.dots.push(dot);
        if (item.anchors.length < 12) item.anchors.push({ obj: f.pivot, local: f.vertLocal.get(v).clone(), mesh: f.mesh });
      });
      this.items.vertices.push(item);
    });
  }

  _lines(pts, material) {
    const arr = [];
    for (let i = 0; i < pts.length; i += 2) arr.push(pts[i].x, pts[i].y, pts[i].z, pts[i + 1].x, pts[i + 1].y, pts[i + 1].z);
    const l = new LineSegments2(new LineSegmentsGeometry().setPositions(arr), material);
    l.frustumCulled = false;
    return l;
  }

  /* -------------------------------------------------------------------- fold ---- */

  setFold(t) {
    this.fold = t;
    if (this.net) this.net.setFold(t);
    // the cut line of a cylinder / cone disappears once the shape is closed
    this.mats.seam.opacity = 0.55 * (1 - smooth(Math.min(1, Math.max(0, (t - 0.85) / 0.15))));
    this.shadow.material.opacity = this.net ? smooth(Math.max(0, (t - 0.3) / 0.7)) : 1;
  }

  /* ------------------------------------------------------------------ camera ---- */

  _fitDistance() {
    const vf = THREE.MathUtils.degToRad(this.camera.fov);
    const hf = 2 * Math.atan(Math.tan(vf / 2) * this.camera.aspect);
    const half = Math.min(vf, hf) / 2;
    let R = 1.5;
    if (this.net) R = lerp(this.net.netRadius * 1.04, this.net.foldedRadius * 1.55, smooth(this.fold));
    return Math.max(3, R / Math.sin(half));
  }

  _targetY() {
    if (this.sphereMesh) return 1;
    return lerp(0, this.net.foldedHeight * 0.42, smooth(this.fold));
  }

  resetView(instant = false) {
    this.userMoved = false;
    this.autoFit = true;
    this.controls.autoRotate = false;
    const off = this.camera.position.clone().sub(this.controls.target).normalize();
    const to = new THREE.Vector3(0.0, 0.8, 1).normalize();
    this._dirTween = { from: off, to, t: instant ? 1 : 0 };
    this.controls.target.set(0, this._targetY(), 0);
    if (instant) {
      this.camera.position.copy(this.controls.target).addScaledVector(to, this._fitDistance());
      this._dirTween = null;
      this.controls.update();
    }
    this._startRotateAt = performance.now() + 2500;
  }

  resize() {
    const w = Math.max(1, this.host.clientWidth);
    const h = Math.max(1, this.host.clientHeight);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    Object.values(this.mats).forEach((m) => m.resolution?.set(w, h));
  }

  /* ---------------------------------------------------------------- counting ---- */

  /** kind: 'faces' | 'curved' | 'edges' | 'vertices' */
  startCount(kind) {
    this.clearCount();
    const items = this.items[kind];
    if (!items.length) { this.hooks.onCount?.(kind, 0, 0, true); return; }
    this.controls.autoRotate = false;
    const labels = items.map((it, i) => {
      const el = document.createElement('div');
      el.className = 'vlabel';
      el.dataset.kind = kind;
      el.textContent = kind === 'curved' ? 'curved' : String(i + 1);
      el.style.display = 'none';
      this.layer.appendChild(el);
      return { el, item: it, shown: false, occluded: false, needsFold: kind === 'edges' || kind === 'vertices', i };
    });
    this.labels = labels;
    this.count = { kind, n: 0, total: items.length, last: performance.now() - STEP_MS };
  }

  clearCount() {
    this.count = null;
    this.labels.forEach((l) => l.el.remove());
    this.labels = [];
    const all = [...this.items.faces, ...this.items.curved];
    all.forEach((it) => it.meshes.forEach((m) => m.material.emissive?.setHex(0x000000)));
    this.items.edges.forEach((it) => it.lines.forEach((l) => { l.material = this.mats.edge; }));
    this.items.vertices.forEach((it) => it.dots.forEach((d) => { d.visible = false; d.scale.setScalar(1); }));
  }

  _stepCount(now) {
    const c = this.count;
    if (!c || c.n >= c.total || now - c.last < STEP_MS) return;
    c.last = now;
    c.n++;
    const items = this.items[c.kind];
    const cur = items[c.n - 1];
    this.labels[c.n - 1].shown = true;
    this.labels[c.n - 1].el.classList.add('pop');
    if (c.kind === 'edges') cur.lines.forEach((l) => { l.material = this.mats.hi; });
    if (c.kind === 'vertices') cur.dots.forEach((d) => { d.visible = true; });
    if (c.kind === 'faces' || c.kind === 'curved') {
      items.forEach((it) => it.meshes.forEach((m) => m.material.emissive.setHex(0x000000)));
      cur.meshes.forEach((m) => m.material.emissive.setHex(0x7a5a00));
    }
    const done = c.n === c.total;
    if (done && (c.kind === 'faces' || c.kind === 'curved')) {
      setTimeout(() => items.forEach((it) => it.meshes.forEach((m) => m.material.emissive.setHex(0x000000))), STEP_MS);
    }
    this.hooks.onCount?.(c.kind, c.n, c.total, done);
  }

  /** Is `kind` currently showing numbers? */
  get counting() { return this.count; }

  _bestAnchor(item) {
    if (item.anchors.length === 1) return item.anchors[0];
    const camPos = this.camera.position;
    let best = item.anchors[0];
    let bestScore = -Infinity;
    const p = new THREE.Vector3();
    const n = new THREE.Vector3();
    for (const a of item.anchors) {
      p.copy(a.local);
      a.obj.localToWorld(p);
      n.set(0, 0, -1).transformDirection(a.mesh.matrixWorld);
      const score = n.dot(camPos.clone().sub(p).normalize());
      if (score > bestScore) { bestScore = score; best = a; }
    }
    return best;
  }

  _updateLabels(checkOcclusion) {
    if (!this.labels.length) return;
    const w = this.host.clientWidth;
    const h = this.host.clientHeight;
    const v = new THREE.Vector3();
    for (const L of this.labels) {
      const visible = L.shown && !(L.needsFold && this.fold < 0.96);
      if (!visible) { L.el.style.display = 'none'; continue; }
      const a = this._bestAnchor(L.item);
      v.copy(a.local);
      a.obj.localToWorld(v);
      if (checkOcclusion) {
        const dir = v.clone().sub(this.camera.position);
        const dist = dir.length();
        this.ray.set(this.camera.position, dir.normalize());
        const hit = this.ray.intersectObjects(this.meshes, false)[0];
        L.occluded = !!hit && hit.distance < dist - 0.06;
        L.el.classList.toggle('behind', L.occluded);
      }
      v.project(this.camera);
      L.el.style.display = '';
      L.el.style.transform = `translate(${(v.x * 0.5 + 0.5) * w}px, ${(-v.y * 0.5 + 0.5) * h}px) translate(-50%, -50%)`;
    }
  }

  /* -------------------------------------------------------------------- loop ---- */

  tick() {
    if (!this.visible || document.hidden) return;
    const dt = Math.min(this.clock.getDelta(), 0.05);
    const now = performance.now();
    const k = 1 - Math.exp(-dt * 7);

    // direction tween after "reset view" / new shape
    if (this._dirTween) {
      const d = this._dirTween;
      d.t = Math.min(1, d.t + dt / 0.7);
      const dir = d.from.clone().lerp(d.to, smooth(d.t)).normalize();
      const dist = this.camera.position.distanceTo(this.controls.target);
      this.camera.position.copy(this.controls.target).addScaledVector(dir, dist);
      if (d.t >= 1) this._dirTween = null;
    }

    // keep the shape nicely framed as it folds / unfolds
    this.controls.target.y += (this._targetY() - this.controls.target.y) * k;
    if (this.autoFit) {
      const off = this.camera.position.clone().sub(this.controls.target);
      const dist = off.length();
      off.setLength(dist + (this._fitDistance() - dist) * k);
      this.camera.position.copy(this.controls.target).add(off);
    }
    // flat nets read better from higher up, folded solids from the side
    if (!this.userMoved && !this._dirTween && this.net) {
      const off = this.camera.position.clone().sub(this.controls.target);
      const sph = new THREE.Spherical().setFromVector3(off);
      const wantPhi = lerp(THREE.MathUtils.degToRad(16), THREE.MathUtils.degToRad(58), smooth(this.fold));
      sph.phi += (wantPhi - sph.phi) * k * 0.6;
      this.camera.position.copy(this.controls.target).add(off.setFromSpherical(sph));
    }
    // gentle spin when nothing is happening
    const idle = !this.userMoved && !this.count && now > this._startRotateAt && (!this.net || this.fold > 0.985);
    this.controls.autoRotate = idle;
    if (this.sphereMesh && !this.count) this.sphereMesh.rotation.y += dt * 0.5;

    this._stepCount(now);
    // pulse the current vertex
    if (this.count?.kind === 'vertices') {
      const cur = this.items.vertices[this.count.n - 1];
      this.items.vertices.forEach((it) => it.dots.forEach((d) => d.scale.setScalar(1)));
      if (cur && this.count.n < this.count.total) cur.dots.forEach((d) => d.scale.setScalar(1.7));
    }

    this.controls.update();
    this.renderer.render(this.scene, this.camera);
    this._frame++;
    this._updateLabels(this._frame % 6 === 0);
  }
}
