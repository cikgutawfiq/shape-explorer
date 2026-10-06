// Generic "unfold any convex solid" engine (pure three.js, no DOM).
//
//   model.V      folded vertex positions (y up)
//   model.faces  [{ idx:[vertex ids], color, curved? }]
//   model.tree   [{ face, parent, delay? }]  – which faces stay joined when the solid is cut open
//
// 1. Every face gets a 2D frame (inside of the solid faces the viewer, +z).
// 2. Walking the tree, each face is laid next to its parent in the flat net (a rigid 2D move).
// 3. Folding rotates every face about the hinge it shares with its parent by the angle between
//    their outward normals. At fold = 1 all hinges are closed and the original solid appears.
import * as THREE from 'three';

const clamp01 = (x) => Math.min(1, Math.max(0, x));

export function buildNet(model) {
  const { V, faces, tree } = model;

  const solidCenter = V.reduce((s, v) => s.add(v), new THREE.Vector3()).multiplyScalar(1 / V.length);

  // ---- 1. a 2D frame per face ------------------------------------------------------------
  const F = faces.map((face, fi) => {
    const idx = face.idx.slice();
    const pts = idx.map((k) => V[k]);
    const c = pts.reduce((s, p) => s.add(p), new THREE.Vector3()).multiplyScalar(1 / pts.length);
    const n = new THREE.Vector3();
    pts.forEach((p, i) => {
      const q = pts[(i + 1) % pts.length];
      n.add(new THREE.Vector3().crossVectors(p.clone().sub(c), q.clone().sub(c)));
    });
    n.normalize();
    if (n.dot(c.clone().sub(solidCenter)) < 0) {
      idx.reverse();
      pts.reverse();
      n.negate();
    }
    const nIn = n.clone().negate();
    const x = pts[1].clone().sub(pts[0]).normalize();
    const y = new THREE.Vector3().crossVectors(nIn, x);
    const local = pts.map((p) => {
      const d = p.clone().sub(c);
      return new THREE.Vector2(d.dot(x), d.dot(y));
    });
    return {
      fi, idx, pts, c, nOut: n, nIn, x, y, local,
      color: face.color, curved: !!face.curved,
      net: null, rot: 0, trans: new THREE.Vector2(), origin: new THREE.Vector2(), parent: -1,
      delay: 0, psi: 0, axis: new THREE.Vector3(),
    };
  });

  // ---- 2. lay the faces out flat ---------------------------------------------------------
  const rootIdx = model.root;
  const root = F[rootIdx];
  root.net = root.local.map((p) => p.clone());
  const placed = new Set([rootIdx]);
  const queue = tree.slice();
  let guard = 0;
  while (queue.length && guard++ < 10000) {
    const t = queue.shift();
    if (!placed.has(t.parent)) { queue.push(t); continue; }
    const par = F[t.parent];
    const ch = F[t.face];
    // shared edge, in the parent's travelling direction a -> b
    let ia = -1;
    for (let i = 0; i < par.idx.length; i++) {
      const a = par.idx[i];
      const b = par.idx[(i + 1) % par.idx.length];
      if (ch.idx.includes(a) && ch.idx.includes(b)) { ia = i; break; }
    }
    if (ia < 0) throw new Error(`faces ${t.parent} and ${t.face} share no edge`);
    const a = par.idx[ia];
    const b = par.idx[(ia + 1) % par.idx.length];
    const Na = par.net[ia];
    const Nb = par.net[(ia + 1) % par.idx.length];
    const la = ch.local[ch.idx.indexOf(a)];
    const lb = ch.local[ch.idx.indexOf(b)];
    const rot = Math.atan2(Nb.y - Na.y, Nb.x - Na.x) - Math.atan2(lb.y - la.y, lb.x - la.x);
    const cs = Math.cos(rot);
    const sn = Math.sin(rot);
    const R = (p) => new THREE.Vector2(p.x * cs - p.y * sn, p.x * sn + p.y * cs);
    const tr = Na.clone().sub(R(la));
    ch.rot = rot;
    ch.trans = tr;
    ch.net = ch.local.map((p) => R(p).add(tr));
    ch.parent = t.parent;
    ch.origin = Na.clone();
    ch.axis = new THREE.Vector3(Nb.x - Na.x, Nb.y - Na.y, 0).normalize();
    ch.psi = Math.acos(Math.min(1, Math.max(-1, par.nOut.dot(ch.nOut))));
    ch.delay = t.delay || 0;
    ch.hingeVerts = [a, b];
    placed.add(t.face);
  }
  if (placed.size !== F.length) throw new Error('tree does not reach every face');

  // ---- 3. three.js objects ---------------------------------------------------------------
  const holder = new THREE.Group(); // turns the net's z-axis into "up"
  holder.rotation.x = -Math.PI / 2;
  const rootGroup = new THREE.Group();
  holder.add(rootGroup);

  F.forEach((f) => {
    f.pivot = new THREE.Group();
    f.pivot.position.set(f.origin.x, f.origin.y, 0);
    f.vertLocal = new Map();
    f.idx.forEach((k, i) => f.vertLocal.set(k, new THREE.Vector3(f.net[i].x - f.origin.x, f.net[i].y - f.origin.y, 0)));
    f.centroidLocal = new THREE.Vector3(
      f.net.reduce((s, p) => s + p.x, 0) / f.net.length - f.origin.x,
      f.net.reduce((s, p) => s + p.y, 0) / f.net.length - f.origin.y,
      0,
    );
    f.mesh = makeFaceMesh(f, model);
    f.pivot.add(f.mesh);
  });
  F.forEach((f) => {
    if (f.parent < 0) rootGroup.add(f.pivot);
    else {
      const par = F[f.parent];
      f.pivot.position.set(f.origin.x - par.origin.x, f.origin.y - par.origin.y, 0);
      par.pivot.add(f.pivot);
    }
  });

  // net bounds, used to centre the flat net
  const allPts = F.flatMap((f) => f.net);
  const min = new THREE.Vector2(Infinity, Infinity);
  const max = new THREE.Vector2(-Infinity, -Infinity);
  allPts.forEach((p) => { min.min(p); max.max(p); });
  const netCenter = min.clone().add(max).multiplyScalar(0.5);
  const netRadius = Math.max(...allPts.map((p) => p.distanceTo(netCenter)));
  const foldedRadius = Math.max(...V.map((v) => v.distanceTo(solidCenter)));
  const foldedHeight = Math.max(...V.map((v) => v.y)) - Math.min(...V.map((v) => v.y));
  const foldedMinY = Math.min(...V.map((v) => v.y));

  function setFold(t) {
    F.forEach((f) => {
      if (f.parent < 0) return;
      const p = clamp01((t - f.delay) / (1 - f.delay || 1));
      f.pivot.quaternion.setFromAxisAngle(f.axis, f.psi * p);
    });
    // slide from "net centred" to "root face centred" so the folded solid sits at the middle
    rootGroup.position.set(-netCenter.x * (1 - t), -netCenter.y * (1 - t), 0);
    holder.updateMatrixWorld(true);
  }
  setFold(1);

  return {
    object: holder,
    faces: F,
    setFold,
    netRadius,
    foldedRadius,
    foldedHeight,
    fitRadius: Math.max(netRadius, foldedRadius * 1.2),
  };
}

function makeFaceMesh(f, model) {
  const m = f.net.length;
  const pos = [];
  const nor = [];
  const smooth = f.curved && model.smoothNormal;
  const cosR = Math.cos(f.rot);
  const sinR = Math.sin(f.rot);
  for (let i = 0; i < m; i++) {
    pos.push(f.net[i].x - f.origin.x, f.net[i].y - f.origin.y, 0);
    if (smooth) {
      const N = model.smoothNormal(f.pts[i], f.c);
      const lx = N.dot(f.x);
      const ly = N.dot(f.y);
      const lz = N.dot(f.nIn);
      nor.push(lx * cosR - ly * sinR, lx * sinR + ly * cosR, lz);
    } else nor.push(0, 0, -1); // outward side of a face points to -z in the net
  }
  const index = [];
  for (let i = 1; i < m - 1; i++) index.push(0, i, i + 1); // wound so the outside is the front side
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setIndex(index);
  const mat = new THREE.MeshLambertMaterial({
    color: f.color,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1,
  });
  const mesh = new THREE.Mesh(g, mat);
  mesh.userData.face = f.fi;
  return mesh;
}
