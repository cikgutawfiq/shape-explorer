// Copies the pieces of three.js we use into /vendor so the site is fully static (no CDN, no build step).
import { cpSync, mkdirSync } from 'node:fs';
const src = 'node_modules/three';
const out = 'vendor/three';
mkdirSync(`${out}/addons/controls`, { recursive: true });
mkdirSync(`${out}/addons/lines`, { recursive: true });
for (const f of ['three.module.js', 'three.core.js']) cpSync(`${src}/build/${f}`, `${out}/${f}`);
cpSync(`${src}/examples/jsm/controls/OrbitControls.js`, `${out}/addons/controls/OrbitControls.js`);
for (const f of ['Line2', 'LineGeometry', 'LineMaterial', 'LineSegments2', 'LineSegmentsGeometry'])
  cpSync(`${src}/examples/jsm/lines/${f}.js`, `${out}/addons/lines/${f}.js`);
cpSync(`${src}/LICENSE`, `${out}/LICENSE`);
console.log('vendored three.js');
