import { SHAPES, byId } from './shapes.js';
import { Viewer } from './viewer.js';
import { initShapes2D } from './shapes2d.js';
import { initGames } from './games.js';
import { hideCount, showCount } from './ui.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const store = {
  get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
};

/* ------------------------------------------------------------------ tabs ---- */
const tabs = $$('.tabs [role="tab"]');
let twoD;
function showTab(name, { push = true } = {}) {
  if (!['3d', '2d', 'quiz'].includes(name)) name = '3d';
  tabs.forEach((t) => {
    const on = t.dataset.tab === name;
    t.setAttribute('aria-selected', on);
    t.tabIndex = on ? 0 : -1;
    $(`#tab-${t.dataset.tab}`).hidden = !on;
  });
  if (push && location.hash.slice(1).split('/')[0] !== name) history.replaceState(null, '', `#${name}`);
  $('#picker').hidden = name !== '3d';
  $('#pills2d').hidden = name !== '2d';
  $('.hdr-pick').hidden = name === 'quiz';
  if (name === '3d') requestAnimationFrame(() => viewer?.resize());
  if (name === '2d') twoD?.show();
  window.scrollTo({ top: 0 });
}
tabs.forEach((t, i) => {
  t.addEventListener('click', () => showTab(t.dataset.tab));
  t.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const n = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
    n.focus(); showTab(n.dataset.tab);
  });
});

/* ------------------------------------------------------------ 3D explorer ---- */
const stage = $('#stage');
const el = {
  picker: $('#picker'), select: $('#shapeSelect'), fold: $('#fold'), play: $('#btnPlay'),
  sidesField: $('#sidesField'), sides: $('#sides'), sidesVal: $('#sidesVal'),
  hud: $('#hud'), toast: $('#toast'), full: $('#btnFull'), reset: $('#btnReset'),
};
const state = { id: 'cube', sides: { prism: 3, pyramid: 4 }, anim: null };
let viewer = null;

const setFill = (input) => {
  const p = ((input.value - input.min) / (input.max - input.min)) * 100;
  input.style.setProperty('--p', `${p}%`);
};

let toastTimer;
function toast(msg, ms = 2600) {
  el.toast.textContent = msg;
  el.toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.toast.classList.remove('show'), ms);
}

function buildPicker() {
  el.picker.innerHTML = SHAPES.map((s) => `<button role="option" data-id="${s.id}" aria-selected="false">${s.id === 'prism' ? 'Prism' : s.id === 'pyramid' ? 'Pyramid' : s.name()}</button>`).join('');
  el.select.innerHTML = SHAPES.map((s) => `<option value="${s.id}">${s.id === 'prism' ? 'Prism' : s.id === 'pyramid' ? 'Pyramid' : s.name()}</option>`).join('');
  el.picker.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-id]');
    if (b) selectShape(b.dataset.id);
  });
  el.select.addEventListener('change', () => selectShape(el.select.value));
}

function stopAnim() { if (state.anim) { cancelAnimationFrame(state.anim.raf); state.anim.resolve(false); state.anim = null; } }

function setFold(v, fromSlider = false) {
  viewer.setFold(v);
  if (!fromSlider) el.fold.value = v;
  setFill(el.fold);
  el.play.textContent = v > 0.5 ? 'Unfold' : 'Fold';
}

function animateFold(target, ms = 1800) {
  stopAnim();
  const from = viewer.fold;
  if (Math.abs(from - target) < 0.001) return Promise.resolve(true);
  const dur = ms * Math.abs(target - from) ** 0.5;
  return new Promise((resolve) => {
    const t0 = performance.now();
    const step = (now) => {
      const k = Math.min(1, (now - t0) / dur);
      const e = k < 0.5 ? 4 * k ** 3 : 1 - (-2 * k + 2) ** 3 / 2;
      setFold(from + (target - from) * e);
      if (k < 1) state.anim.raf = requestAnimationFrame(step);
      else { state.anim = null; resolve(true); }
    };
    state.anim = { raf: requestAnimationFrame(step), resolve };
  });
}

function selectShape(id, { keepView = false } = {}) {
  stopAnim();
  state.id = id;
  const s = byId(id);
  const sides = state.sides[id] ?? s.defaultSides;
  const counts = viewer.setShape(id, sides, { keepFold: false, keepView });
  el.select.value = id;
  $$('#picker button').forEach((b) => b.setAttribute('aria-selected', b.dataset.id === id));
  const on = $('#picker button[aria-selected="true"]');
  if (on) el.picker.scrollTo({ left: on.offsetLeft - (el.picker.clientWidth - on.offsetWidth) / 2, behavior: 'smooth' });
  el.sidesField.hidden = !s.hasSides;
  if (s.hasSides) {
    el.sides.min = s.sides[0]; el.sides.max = s.sides[1]; el.sides.value = sides;
    el.sidesVal.textContent = sides; setFill(el.sides);
  }
  el.fold.disabled = el.play.disabled = !!s.noUnfold;
  el.fold.title = s.noUnfold ? 'A sphere cannot be unfolded flat' : '';
  setFold(1);
  updateInfo(s, sides, counts);
  if (s.noUnfold) toast('A sphere can’t be unfolded flat. It is curved everywhere!', 3600);
  if (/^(#3d.*)?$/.test(location.hash)) history.replaceState(null, '', `#3d/${id}`);
}

function updateInfo(s, sides, counts) {
  const name = s.name(sides);
  $('#aboutName').textContent = name;
  $('#aboutBlurb').textContent = s.blurb;
  $('#aboutNet').textContent = s.net;
  $('#funFact').textContent = s.fact;
  $('#examples').innerHTML = s.examples.map(([e, t]) => `<li><span class="em" aria-hidden="true">${e}</span>${t}</li>`).join('');
  const poly = counts.curved === 0;
  $('#euler').hidden = !poly;
  if (poly) $('#euler').textContent = 'Count them all, then try: Faces + Vertices − Edges. What do you get?';
  $$('.chip', el.hud).forEach((c) => {
    const kind = c.dataset.kind;
    c.hidden = kind === 'curved' && counts.curved === 0;
    hideCount(c);
    c.querySelector('span').textContent = { faces: 'Faces', edges: 'Edges', vertices: 'Vertices', curved: 'Curved' }[kind];
  });
  el.hud.setAttribute('aria-label', `Tap to count the faces, edges and vertices of the ${name.toLowerCase()}`);
}

/* counting chips */
const WORD = { faces: ['face', 'faces'], edges: ['edge', 'edges'], vertices: ['vertex', 'vertices'], curved: ['curved surface', 'curved surfaces'] };
function onCount(kind, n, total, done) {
  const chip = $(`.chip[data-kind="${kind}"]`, el.hud);
  if (!chip) return;
  showCount(chip, n);
  if (done && total > 0) toast(`${total} ${WORD[kind][total === 1 ? 0 : 1]}!`, 2200);
}

function resetChips() { $$('.chip', el.hud).forEach(hideCount); }

async function toggleCount(kind) {
  const chip = $(`.chip[data-kind="${kind}"]`, el.hud);
  // tapping an open chip hides the answer again
  if (chip.classList.contains('on')) { viewer.clearCount(); resetChips(); return; }
  viewer.clearCount();
  resetChips();
  const total = viewer.counts[kind];
  chip.classList.add('on');
  chip.setAttribute('aria-pressed', 'true');
  if (total === 0) {
    showCount(chip, 0);
    toast(`${byId(state.id).name(state.sides[state.id])} has no ${WORD[kind][1]}!`);
    return;
  }
  showCount(chip, 0);
  if ((kind === 'edges' || kind === 'vertices') && viewer.fold < 0.98) {
    toast('Let’s fold it up first…', 2000);
    const ok = await animateFold(1, 1400);
    if (!ok || !chip.classList.contains('on')) return;
  }
  viewer.startCount(kind);
}

/* full screen */
const fsActive = () => document.fullscreenElement === stage || document.webkitFullscreenElement === stage || stage.classList.contains('is-fs');
const nativeFs = () => document.fullscreenElement === stage || document.webkitFullscreenElement === stage;
async function toggleFull() {
  if (fsActive()) {
    stage.classList.remove('is-fs');
    document.body.classList.remove('noscroll');
    if (nativeFs()) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
  } else {
    const req = stage.requestFullscreen || stage.webkitRequestFullscreen;
    try {
      if (!req) throw new Error('no fullscreen api');
      // some embedded browsers / iOS never settle the promise, so don't wait forever
      await Promise.race([Promise.resolve(req.call(stage)), new Promise((_, no) => setTimeout(() => no(new Error('timeout')), 700))]);
      if (!nativeFs()) throw new Error('not full screen');
    } catch {
      // fall back to filling the whole page (works on iPhone Safari too)
      stage.classList.add('is-fs');
      document.body.classList.add('noscroll');
    }
  }
  syncFullButton();
}
function syncFullButton() {
  el.full.setAttribute('aria-label', fsActive() ? 'Exit full screen' : 'Full screen');
  setTimeout(() => viewer.resize(), 60);
}
['fullscreenchange', 'webkitfullscreenchange'].forEach((ev) => document.addEventListener(ev, syncFullButton));
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && stage.classList.contains('is-fs')) toggleFull(); });

/* ---------------------------------------------------------------- boot ---- */
function initViewer() {
  try {
    viewer = new Viewer($('#glHost'), $('#labels'), { onCount });
  } catch (err) {
    console.error(err);
    $('#noGl').hidden = false;
    return false;
  }
  buildPicker();

  el.fold.addEventListener('input', () => { stopAnim(); setFold(+el.fold.value, true); });
  el.play.addEventListener('click', () => animateFold(viewer.fold > 0.5 ? 0 : 1));
  el.sides.addEventListener('input', () => {
    const n = +el.sides.value;
    state.sides[state.id] = n;
    el.sidesVal.textContent = n;
    setFill(el.sides);
    const fold = viewer.fold;
    stopAnim();
    const counts = viewer.setShape(state.id, n, { keepFold: true, keepView: true });
    setFold(fold);
    updateInfo(byId(state.id), n, counts);
  });
  $$('.chip', el.hud).forEach((c) => c.addEventListener('click', () => toggleCount(c.dataset.kind)));
  el.full.addEventListener('click', toggleFull);
  el.reset.addEventListener('click', () => viewer.resetView());
  return true;
}

function route() {
  const [tab, sub] = location.hash.slice(1).split('/');
  if (tab === '2d') { showTab('2d', { push: false }); twoD.select(sub); }
  else if (tab === 'quiz') showTab('quiz', { push: false });
  else {
    showTab('3d', { push: false });
    if (viewer && sub && byId(sub) && sub !== state.id) selectShape(sub);
  }
}

const ok = initViewer();
twoD = initShapes2D({ go3d: (id) => { showTab('3d'); if (ok) selectShape(id); } });
initGames($('#games'));

const start = location.hash.slice(1).split('/');
const first = start[0] === '3d' && byId(start[1]) ? start[1] : 'cube';
if (ok) selectShape(first);
route();
window.addEventListener('hashchange', route);

// a little welcome animation: unfold once so people see what the slider does
if (ok && first === 'cube' && !store.get('seen') && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
  store.set('seen', '1');
  setTimeout(() => { if (!viewer.userMoved && viewer.fold === 1 && !viewer.counting) animateFold(0, 2600); }, 900);
}
