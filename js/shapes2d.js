// 2D shape explorer (SVG).
import { SHAPES_2D, byId } from './shapes.js';

const NS = 'http://www.w3.org/2000/svg';
const C = 200;
const STEP = 520;
const WORD = { sides: ['side', 'sides'], corners: ['corner', 'corners'], right: ['right angle', 'right angles'], sym: ['line of symmetry', 'lines of symmetry'] };

const svgEl = (tag, attrs = {}, parent) => {
  const e = document.createElementNS(NS, tag);
  Object.entries(attrs).forEach(([k, v]) => e.setAttribute(k, v));
  parent?.appendChild(e);
  return e;
};

function pointsFor(s) {
  if (s.circle) return [];
  if (s.rect) return [[C - 135, C - 85], [C + 135, C - 85], [C + 135, C + 85], [C - 135, C + 85]];
  const n = s.n;
  const r = n === 4 ? 142 : 150;
  const start = n % 2 ? -90 : -90 - 180 / n;
  return Array.from({ length: n }, (_, i) => {
    const a = ((start + (i * 360) / n) * Math.PI) / 180;
    return [C + r * Math.cos(a), C + r * Math.sin(a) + (n === 3 ? 22 : 0)];
  });
}

export function initShapes2D({ go3d }) {
  const svg = document.getElementById('svg2d');
  const pills = document.getElementById('pills2d');
  const hud = document.getElementById('hud2d');
  const toastEl = document.getElementById('toast2d');
  let cur = SHAPES_2D[0];
  let timer = null;
  let toastTimer;
  let active = null;

  const toast = (msg) => {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2200);
  };

  pills.innerHTML = SHAPES_2D.map((s) => `<button role="option" data-id="${s.id}" aria-selected="false"><span class="em" aria-hidden="true">${s.icon}</span>${s.name}</button>`).join('');
  pills.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-id]');
    if (b) select(b.dataset.id);
  });

  function stopCount() {
    clearInterval(timer);
    timer = null;
    active = null;
    svg.querySelectorAll('.marks, .symlines').forEach((g) => (g.innerHTML = ''));
    svg.querySelectorAll('.rmark').forEach((r) => r.setAttribute('opacity', 0));
    svg.querySelectorAll('.side.hot').forEach((s) => s.classList.remove('hot'));
    hud.querySelectorAll('.chip').forEach((c) => {
      c.classList.remove('on');
      c.querySelector('b').textContent = cur[c.dataset.kind === 'sym' ? 'sym' : c.dataset.kind];
    });
  }

  function draw() {
    svg.innerHTML = '';
    const pts = pointsFor(cur);
    const g = svgEl('g', { class: 'pop' }, svg);
    if (cur.circle) {
      svgEl('circle', { class: 'shape', cx: C, cy: C, r: 135 }, g);
      svgEl('circle', { class: 'side', cx: C, cy: C, r: 135, id: 'side-0' }, g);
    } else {
      svgEl('polygon', { class: 'shape', points: pts.map((p) => p.join(',')).join(' ') }, g);
      pts.forEach((p, i) => {
        const q = pts[(i + 1) % pts.length];
        svgEl('line', { class: 'side', id: `side-${i}`, x1: p[0], y1: p[1], x2: q[0], y2: q[1] }, g);
      });
    }
    // right-angle marks (always visible so children can spot them)
    const rg = svgEl('g', { class: 'rmarks' }, svg);
    if (cur.right) {
      pts.forEach((p, i) => {
        const prev = pts[(i + pts.length - 1) % pts.length];
        const next = pts[(i + 1) % pts.length];
        const u = [prev[0] - p[0], prev[1] - p[1]];
        const v = [next[0] - p[0], next[1] - p[1]];
        const lu = Math.hypot(...u); const lv = Math.hypot(...v);
        const k = 26;
        const a = [p[0] + (u[0] / lu) * k, p[1] + (u[1] / lu) * k];
        const b = [a[0] + (v[0] / lv) * k, a[1] + (v[1] / lv) * k];
        const c = [p[0] + (v[0] / lv) * k, p[1] + (v[1] / lv) * k];
        svgEl('path', { class: 'rmark', d: `M${p} L${a} L${b} L${c} Z`, opacity: 0 , 'data-i': i}, rg);
      });
    }
    svgEl('g', { class: 'symlines' }, svg);
    svgEl('g', { class: 'marks' }, svg);
  }

  function symLines() {
    const g = svg.querySelector('.symlines');
    g.innerHTML = '';
    const lines = [];
    if (cur.circle) for (let i = 0; i < 4; i++) { const a = (i * Math.PI) / 4; lines.push([C - 160 * Math.cos(a), C - 160 * Math.sin(a), C + 160 * Math.cos(a), C + 160 * Math.sin(a)]); }
    else if (cur.rect) lines.push([C, C - 120, C, C + 120], [C - 165, C, C + 165, C]);
    else {
      const pts = pointsFor(cur);
      const cy = pts.reduce((s, p) => s + p[1], 0) / pts.length;
      const ctr = [C, cur.n === 3 ? cy : C];
      const n = cur.n;
      const dirs = [];
      pts.forEach((p) => dirs.push([p[0] - ctr[0], p[1] - ctr[1]]));
      if (n % 2 === 0) pts.forEach((p, i) => { const q = pts[(i + 1) % n]; dirs.push([(p[0] + q[0]) / 2 - ctr[0], (p[1] + q[1]) / 2 - ctr[1]]); });
      const seen = new Set();
      dirs.forEach((d) => {
        const len = Math.hypot(...d); const ux = d[0] / len; const uy = d[1] / len;
        const key = `${Math.abs(Math.round(ux * 100))}|${Math.round(Math.sign(ux || 1) * uy * 100)}`;
        if (seen.has(key)) return; seen.add(key);
        const r = 172;
        lines.push([ctr[0] - ux * r, ctr[1] - uy * r, ctr[0] + ux * r, ctr[1] + uy * r]);
      });
    }
    return { g, lines };
  }

  function startCount(kind) {
    stopCount();
    const chip = hud.querySelector(`[data-kind="${kind}"]`);
    const total = cur[kind];
    if (total === 0 || (kind === 'sym' && cur.circle)) {
      if (cur.circle && kind === 'sym') toast('A circle has endless lines of symmetry!');
      else toast(`A ${cur.name.toLowerCase()} has no ${WORD[kind][1]}!`);
      return;
    }
    chip.classList.add('on');
    chip.querySelector('b').textContent = 0;
    active = kind;
    const marks = svg.querySelector('.marks');
    const pts = pointsFor(cur);
    let n = 0;

    let symData = null;
    if (kind === 'sym') symData = symLines();

    const step = () => {
      n++;
      chip.querySelector('b').textContent = n;
      const gp = svgEl('g', { class: 'pop' }, marks);
      if (kind === 'sides') {
        svg.querySelector(`#side-${n - 1}`).classList.add('hot');
        let x; let y;
        if (cur.circle) { x = C; y = C - 135; } else { const p = pts[n - 1]; const q = pts[n % pts.length]; x = (p[0] + q[0]) / 2; y = (p[1] + q[1]) / 2; }
        badge(gp, x, y, n, '#ff7a00');
      } else if (kind === 'corners') {
        const p = pts[n - 1];
        svgEl('circle', { class: 'corner', cx: p[0], cy: p[1], r: 11 }, gp);
        const dx = p[0] - C; const dy = p[1] - (cur.n === 3 ? C + 14 : C);
        const l = Math.hypot(dx, dy) || 1;
        badge(gp, p[0] + (dx / l) * 28, p[1] + (dy / l) * 28, n, '#e0246f');
      } else if (kind === 'right') {
        svg.querySelector(`.rmark[data-i="${n - 1}"]`).setAttribute('opacity', 1);
        const p = pts[n - 1];
        const dx = C - p[0]; const dy = C - p[1];
        const l = Math.hypot(dx, dy);
        badge(gp, p[0] + (dx / l) * 52, p[1] + (dy / l) * 52, n, '#0f8f7d');
      } else if (kind === 'sym') {
        const l = symData.lines[n - 1];
        svgEl('line', { class: 'sym', x1: l[0], y1: l[1], x2: l[2], y2: l[3] }, gp);
      }
      if (n >= total) {
        clearInterval(timer);
        timer = null;
        toast(`${total} ${WORD[kind][total === 1 ? 0 : 1]}!`);
      }
    };
    step();
    if (total > 1) timer = setInterval(step, STEP);
  }

  function badge(parent, x, y, n, color) {
    svgEl('circle', { class: 'badge', cx: x, cy: y, r: 15, fill: color }, parent);
    const t = svgEl('text', { class: 'n', x, y: y + 1 }, parent);
    t.textContent = n;
  }

  function select(id) {
    cur = SHAPES_2D.find((s) => s.id === id) || SHAPES_2D[0];
    stopCount();
    draw();
    // clear any old right-angle marks visibility
    pills.querySelectorAll('button').forEach((b) => b.setAttribute('aria-selected', b.dataset.id === cur.id));
    hud.querySelectorAll('.chip').forEach((c) => {
      const k = c.dataset.kind;
      c.querySelector('b').textContent = cur[k];
      c.classList.toggle('zero', !cur[k]);
      c.classList.remove('on');
    });
    document.getElementById('name2d').textContent = cur.name;
    document.getElementById('blurb2d').textContent = cur.blurb;
    document.getElementById('examples2d').innerHTML = cur.examples.map(([e, t]) => `<li><span class="em" aria-hidden="true">${e}</span>${t}</li>`).join('');
    const goto = document.getElementById('goto3d');
    goto.innerHTML = cur.in3d.map(([sid, text]) => `<li><button data-id="${sid}"><span>${byId(sid).icon} ${text}</span><span aria-hidden="true">→</span></button></li>`).join('');
    if (location.hash.startsWith('#2d')) history.replaceState(null, '', `#2d/${cur.id}`);
  }

  hud.addEventListener('click', (e) => {
    const c = e.target.closest('.chip');
    if (!c) return;
    if (c.classList.contains('on')) { stopCount(); return; }
    startCount(c.dataset.kind);
  });
  document.getElementById('goto3d').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-id]');
    if (b) go3d(b.dataset.id);
  });

  select('triangle');
  return {
    select: (id) => select(id || cur.id),
    show: () => {},
  };
}
