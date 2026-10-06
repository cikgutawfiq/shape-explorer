// Sanity checks for the unfold engine: at fold=1 every copy of a vertex must coincide,
// every face's inside must face the solid's centre, and (at fold=0) no two net faces overlap.
import * as THREE from 'three';
import { buildNet } from '../js/net.js';
import { buildModel, SHAPES } from '../js/shapes.js';

let failed = 0;
const check = (ok, msg) => { if (!ok) { failed++; console.log('  FAIL', msg); } };

function polyOverlap(a, b) {
  // separating-axis test on two convex polygons (shrunk slightly so touching edges don't count)
  const shrink = (p) => { const c = p.reduce((s, q) => s.clone().add(q), new THREE.Vector2()).multiplyScalar(1 / p.length); return p.map((q) => c.clone().add(q.clone().sub(c).multiplyScalar(0.98))); };
  const A = shrink(a), B = shrink(b);
  for (const poly of [A, B]) for (let i = 0; i < poly.length; i++) {
    const e = poly[(i + 1) % poly.length].clone().sub(poly[i]); const ax = new THREE.Vector2(-e.y, e.x).normalize();
    const pr = (P) => P.map((q) => q.dot(ax)); const pa = pr(A), pb = pr(B);
    if (Math.max(...pa) <= Math.min(...pb) + 1e-9 || Math.max(...pb) <= Math.min(...pa) + 1e-9) return false;
  }
  return true;
}

const cases = [['cube'], ['cuboid'], ['cylinder'], ['cone']];
for (let n = 3; n <= 8; n++) { cases.push(['prism', n]); cases.push(['pyramid', n]); }

for (const [id, n] of cases) {
  const model = buildModel(id, n);
  const net = buildNet(model);
  const label = `${id}${n ? ' ' + n : ''}`;
  net.setFold(1);
  net.object.updateMatrixWorld(true);
  const seen = new Map();
  let maxErr = 0;
  net.faces.forEach((f) => {
    const wCenter = f.mesh.localToWorld(f.centroidLocal.clone());
    const wNormalIn = new THREE.Vector3(0, 0, 1).transformDirection(f.mesh.matrixWorld);
    check(wNormalIn.dot(model.V.reduce((s, v) => s.add(v), new THREE.Vector3()).multiplyScalar(1 / model.V.length).sub(wCenter)) > -1e-6, `${label}: face ${f.fi} inside-out`);
    f.vertLocal.forEach((lp, k) => {
      const w = f.mesh.localToWorld(lp.clone());
      if (seen.has(k)) maxErr = Math.max(maxErr, w.distanceTo(seen.get(k))); else seen.set(k, w);
    });
  });
  check(maxErr < 1e-4, `${label}: folded vertices don't meet (err ${maxErr.toExponential(2)})`);
  // folded solid should match the original (distance between vertices preserved)
  const ks = [...seen.keys()];
  let dErr = 0;
  for (let i = 0; i < ks.length; i += Math.max(1, Math.floor(ks.length / 12))) for (let j = i + 1; j < ks.length; j += Math.max(1, Math.floor(ks.length / 12)))
    dErr = Math.max(dErr, Math.abs(seen.get(ks[i]).distanceTo(seen.get(ks[j])) - model.V[ks[i]].distanceTo(model.V[ks[j]])));
  check(dErr < 1e-4, `${label}: folded solid distorted (${dErr.toExponential(2)})`);
  // net must not overlap itself
  let overlaps = 0;
  for (let i = 0; i < net.faces.length; i++) for (let j = i + 1; j < net.faces.length; j++) if (polyOverlap(net.faces[i].net, net.faces[j].net)) overlaps++;
  check(overlaps === 0, `${label}: ${overlaps} overlapping face pairs in the net`);
  console.log(`${label.padEnd(12)} faces=${model.faces.length} netRadius=${net.netRadius.toFixed(2)} foldErr=${maxErr.toExponential(1)} overlaps=${overlaps}`);
}
console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
process.exit(failed ? 1 : 0);
