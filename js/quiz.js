// A short, friendly 10-question quiz built from the same shape data as the explorer.
import { SHAPES, SHAPES_2D, buildModel, countsOf } from './shapes.js';

const rnd = (n) => Math.floor(Math.random() * n);
const shuffle = (a) => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = rnd(i + 1); [b[i], b[j]] = [b[j], b[i]]; } return b; };
const pick = (a, n) => shuffle(a).slice(0, n);
const nameOf = (id, sides) => SHAPES.find((s) => s.id === id).name(sides);

// the shapes we ask about: [catalogue id, sides]
const POOL = [['cube'], ['cuboid'], ['prism', 3], ['prism', 5], ['prism', 6], ['pyramid', 3], ['pyramid', 4], ['pyramid', 5], ['pyramid', 6], ['cylinder'], ['cone'], ['sphere']]
  .map(([id, sides]) => {
    const m = id === 'sphere' ? null : buildModel(id, sides);
    const counts = m ? countsOf(m) : { faces: 0, curved: 1, edges: 0, vertices: 0 };
    return { id, sides, name: nameOf(id, sides), counts, poly: counts.curved === 0 };
  });

const CLUES = {
  cube: 'I have 6 square faces, all the same size.',
  cuboid: 'I have 6 rectangle faces, like a box.',
  'prism-3': 'I have 2 triangle ends and 3 rectangle sides.',
  'pyramid-4': 'I have a square base and 4 triangle faces that meet at a point.',
  'pyramid-3': 'I have 4 faces and every one of them is a triangle.',
  cylinder: 'I have 2 flat circles and 1 curved surface.',
  cone: 'I have 1 flat circle, 1 curved surface and 1 pointy tip.',
  sphere: 'I am perfectly round with no flat faces and no corners.',
};
const keyOf = (p) => (p.sides ? `${p.id}-${p.sides}` : p.id);

function numberOptions(answer, max = 14) {
  const set = new Set([answer]);
  const around = shuffle([-2, -1, 1, 2, 3, 4].map((d) => answer + d).filter((x) => x >= 0 && x <= max));
  for (const x of around) { if (set.size >= 4) break; set.add(x); }
  return shuffle([...set]);
}

function makeQuestions() {
  const qs = [];
  const polys = POOL.filter((p) => p.poly);

  // counting (4)
  const kinds = shuffle(['faces', 'edges', 'vertices', 'vertices']);
  kinds.forEach((kind) => {
    const p = kind === 'vertices' ? pick(POOL, 1)[0] : pick(polys, 1)[0];
    const word = kind === 'faces' ? 'flat faces' : kind === 'edges' ? 'edges' : 'vertices (corners)';
    const ans = p.counts[kind];
    qs.push({
      emoji: SHAPES.find((s) => s.id === p.id).icon,
      text: `How many ${word} does a ${p.name.toLowerCase()} have?`,
      options: numberOptions(ans).map(String), answer: String(ans),
      why: `A ${p.name.toLowerCase()} has ${ans} ${kind === 'faces' ? 'flat faces' : kind}.`,
    });
  });

  // "which shape am I?" (2)
  pick(POOL.filter((p) => CLUES[keyOf(p)]), 2).forEach((p) => {
    const opts = pick(POOL.filter((o) => o.name !== p.name), 3).map((o) => o.name).concat(p.name);
    qs.push({ emoji: '🕵️', text: `Which shape am I? ${CLUES[keyOf(p)]}`, options: shuffle(opts), answer: p.name, why: `That is a ${p.name.toLowerCase()}!` });
  });

  // real life (2)
  const base = SHAPES.filter((s) => ['cube', 'cuboid', 'cylinder', 'cone', 'sphere', 'pyramid', 'prism'].includes(s.id));
  pick(base, 2).forEach((s) => {
    const [em, label] = s.examples[0];
    const baseName = (x) => (x.id === 'prism' ? 'Triangular prism' : x.id === 'pyramid' ? 'Pyramid' : x.name());
    const opts = pick(base.filter((o) => o.id !== s.id), 3).map(baseName).concat(baseName(s));
    qs.push({ emoji: em, text: `Which 3D shape is this? (${label})`, options: shuffle(opts), answer: baseName(s), why: `${label} is shaped like a ${baseName(s).toLowerCase()}.` });
  });

  // 2D (2)
  const flat = SHAPES_2D.filter((s) => !s.circle && !s.rect);
  pick(flat, 2).forEach((s, i) => {
    if (i === 0) {
      qs.push({ emoji: s.icon, text: `How many sides does a ${s.name.toLowerCase()} have?`, options: numberOptions(s.sides, 10).map(String), answer: String(s.sides), why: `A ${s.name.toLowerCase()} has ${s.sides} sides and ${s.corners} corners.` });
    } else {
      const opts = pick(flat.filter((o) => o.sides !== s.sides), 3).map((o) => o.name).concat(s.name);
      qs.push({ emoji: '🔷', text: `Which flat shape has ${s.corners} corners?`, options: shuffle(opts), answer: s.name, why: `${s.name} has ${s.corners} corners and ${s.sides} sides.` });
    }
  });

  return shuffle(qs);
}

export function initQuiz(root) {
  let qs = [];
  let i = 0;
  let score = 0;

  const start = () => { qs = makeQuestions(); i = 0; score = 0; render(); };

  function render() {
    if (i >= qs.length) return result();
    const q = qs[i];
    root.innerHTML = `
      <div class="q-top"><span>Question ${i + 1} of ${qs.length}</span><span>⭐ ${score}</span></div>
      <div class="q-bar" aria-hidden="true"><i style="transform:scaleX(${i / qs.length})"></i></div>
      <div class="q-emoji" aria-hidden="true">${q.emoji}</div>
      <p class="q-text">${q.text}</p>
      <div class="q-opts">${q.options.map((o) => `<button type="button" data-o="${o}">${o}</button>`).join('')}</div>
      <p class="q-fb" role="status" aria-live="polite"></p>
      <button class="q-next" type="button" hidden>${i === qs.length - 1 ? 'See my score' : 'Next question'}</button>`;
    const fb = root.querySelector('.q-fb');
    const next = root.querySelector('.q-next');
    root.querySelectorAll('.q-opts button').forEach((b) => b.addEventListener('click', () => {
      const ok = b.dataset.o === q.answer;
      if (ok) score++;
      root.querySelectorAll('.q-opts button').forEach((x) => {
        x.disabled = true;
        if (x.dataset.o === q.answer) x.classList.add('right');
      });
      if (!ok) b.classList.add('wrong');
      fb.textContent = ok ? `🎉 Yes! ${q.why}` : `Not quite. ${q.why}`;
      next.hidden = false;
      next.focus({ preventScroll: true });
    }));
    next.addEventListener('click', () => { i++; render(); });
  }

  function result() {
    const stars = score >= 9 ? 3 : score >= 6 ? 2 : score >= 3 ? 1 : 0;
    const msg = ['Keep exploring. You will get it!', 'Good try! Explore a bit more and play again.', 'Great job, shape detective!', 'Amazing! You are a geometry superstar!'][stars];
    root.innerHTML = `
      <div class="q-result">
        <div class="stars" aria-label="${stars} out of 3 stars">${'⭐'.repeat(stars)}${'☆'.repeat(3 - stars)}</div>
        <div class="score">${score} / ${qs.length}</div>
        <p class="q-text">${msg}</p>
        <button class="q-again" type="button">Play again</button>
      </div>`;
    root.querySelector('.q-again').addEventListener('click', start);
  }

  start();
}
