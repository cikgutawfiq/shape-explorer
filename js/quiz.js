// Quiz with three levels. Questions are generated from a large bank and recent ones are skipped,
// so every round is different.
import { SHAPES, SHAPES_2D, buildModel, countsOf } from './shapes.js';
import { shuffle, pick, pick1, stars, article } from './util.js';

const nameOf = (id, sides) => SHAPES.find((s) => s.id === id).name(sides);
const iconOf = (id) => SHAPES.find((s) => s.id === id).icon;

const POOL = [['cube'], ['cuboid'], ['prism', 3], ['prism', 5], ['prism', 6], ['prism', 7], ['prism', 8],
  ['pyramid', 3], ['pyramid', 4], ['pyramid', 5], ['pyramid', 6], ['pyramid', 7], ['pyramid', 8], ['cylinder'], ['cone'], ['sphere']]
  .map(([id, sides]) => {
    const counts = id === 'sphere' ? { faces: 0, curved: 1, edges: 0, vertices: 0 } : countsOf(buildModel(id, sides));
    return { id, sides, name: nameOf(id, sides), icon: iconOf(id), counts, poly: counts.curved === 0 };
  });
const EASY = new Set(['Cube', 'Cuboid', 'Cylinder', 'Cone', 'Sphere', 'Square pyramid', 'Triangular prism']);
const WORD = { faces: 'flat faces', edges: 'edges', vertices: 'vertices (corners)' };
const cap = (w) => w[0].toUpperCase() + w.slice(1);

// [shape name, clue, level it first appears at]
const CLUES = [
  ['Cube', 'I have square faces, all the same size.', 0],
  ['Cuboid', 'I have rectangle faces, like a box.', 0],
  ['Cylinder', 'I have 2 flat circles and 1 curved surface.', 0],
  ['Cone', 'I have 1 flat circle, 1 curved surface and 1 pointy tip.', 0],
  ['Sphere', 'I am perfectly round with no flat faces and no corners.', 0],
  ['Square pyramid', 'I have a square base and 4 triangle faces that meet at a point.', 0],
  ['Triangular prism', 'I have 2 triangle ends and 3 rectangle sides.', 1],
  ['Triangular pyramid', 'I have 4 faces and every one of them is a triangle.', 1],
  ['Cube', 'All my faces are squares and I have 12 edges.', 2],
  ['Cuboid', 'I have 6 rectangle faces and 8 vertices.', 2],
  ['Pentagonal prism', 'I have 7 faces: 2 pentagons and 5 rectangles.', 2],
  ['Hexagonal prism', 'I have 8 faces: 2 hexagons and 6 rectangles.', 2],
  ['Pentagonal pyramid', 'I have 6 faces: 1 pentagon and 5 triangles.', 2],
  ['Cylinder', 'I have no vertices, and I can roll and stack.', 2],
  ['Cone', 'I have only 1 vertex and 1 flat face.', 2],
  ['Sphere', 'I have no edges and no vertices.', 2],
];
const REAL = [
  ['🎲', 'Dice', 'Cube'], ['🧊', 'Ice cube', 'Cube'], ['📦', 'Cardboard box', 'Cuboid'], ['🧱', 'Brick', 'Cuboid'], ['📚', 'Book', 'Cuboid'],
  ['⛺', 'Tent', 'Triangular prism'], ['🥫', 'Tin can', 'Cylinder'], ['🔋', 'Battery', 'Cylinder'], ['🪵', 'Log', 'Cylinder'], ['🧻', 'Tissue roll', 'Cylinder'],
  ['🍦', 'Ice-cream cone', 'Cone'], ['🎉', 'Party hat', 'Cone'], ['🚧', 'Traffic cone', 'Cone'],
  ['⚽', 'Football', 'Sphere'], ['🏀', 'Basketball', 'Sphere'], ['🌍', 'Earth', 'Sphere'], ['🫐', 'Blueberry', 'Sphere'], ['🏜️', 'Pyramid of Giza', 'Square pyramid'],
];
const NETS = [
  ['Six squares joined together', 'Cube'], ['A rectangle with a circle at each end', 'Cylinder'], ['A circle and a pizza-slice shape', 'Cone'],
  ['Two triangles and three rectangles', 'Triangular prism'], ['A square with four triangles around it', 'Square pyramid'], ['Six rectangles joined together', 'Cuboid'],
];

function numberOptions(answer, n, max = 30) {
  const set = new Set([answer]);
  const cand = shuffle([-3, -2, -1, 1, 2, 3, 4].map((d) => answer + d).filter((x) => x >= 0 && x <= max));
  for (const x of cand) { if (set.size >= n) break; set.add(x); }
  return shuffle([...set]).map(String);
}
const namesFor = (level, answer, n) => {
  const pool = (level === 0 ? POOL.filter((p) => EASY.has(p.name)) : POOL).map((p) => p.name).filter((x) => x !== answer);
  return shuffle(pick(pool, n - 1).concat(answer));
};

/* each generator returns a question for the level (0 easy, 1 medium, 2 hard) */
const GEN = {
  count(level) {
    const p = pick1(level === 0 ? POOL.filter((x) => EASY.has(x.name)) : POOL);
    const kind = pick1(['faces', 'vertices', ...(p.poly && level > 0 ? ['edges'] : [])]);
    const ans = p.counts[kind];
    return {
      emoji: p.icon, text: `How many ${WORD[kind]} does ${article(p.name)} ${p.name.toLowerCase()} have?`,
      options: numberOptions(ans, level === 0 ? 3 : 4), answer: String(ans), why: `${p.name} has ${ans} ${kind === 'faces' ? 'flat faces' : kind}.`,
    };
  },
  clue(level) {
    const [name, clue] = pick1(CLUES.filter((c) => c[2] <= level && (level < 2 || c[2] >= 1)));
    return { emoji: '🕵️', text: `Which shape am I? ${clue}`, options: namesFor(level, name, level === 0 ? 3 : 4), answer: name, why: `That is ${article(name)} ${name.toLowerCase()}!` };
  },
  real(level) {
    const [em, label, shape] = pick1(REAL.filter((r) => level > 0 || EASY.has(r[2])));
    return { emoji: em, text: `Which 3D shape is this? (${label})`, options: namesFor(level, shape, level === 0 ? 3 : 4), answer: shape, why: `${label} is shaped like ${article(shape)} ${shape.toLowerCase()}.` };
  },
  flat(level) {
    const poly = SHAPES_2D.filter((s) => !s.circle && !s.rect);
    const s = pick1(level === 0 ? poly.filter((x) => x.n <= 6) : poly);
    const t = level === 0 ? 0 : Math.floor(Math.random() * (level === 2 ? 4 : 2));
    if (t === 1) {
      const opts = pick(poly.filter((o) => o.sides !== s.sides), 3).map((o) => o.name).concat(s.name);
      return { emoji: '🔷', text: `Which flat shape has ${s.corners} corners?`, options: shuffle(opts), answer: s.name, why: `${s.name} has ${s.corners} corners and ${s.sides} sides.` };
    }
    if (t === 2) {
      const r = pick1(SHAPES_2D.filter((x) => !x.circle));
      return { emoji: '📐', text: `How many right angles does a ${r.name.toLowerCase()} have?`, options: numberOptions(r.right, 4, 6), answer: String(r.right), why: `A ${r.name.toLowerCase()} has ${r.right} right angles.` };
    }
    if (t === 3) {
      const r = pick1(poly);
      return { emoji: '🔁', text: `How many lines of symmetry does a regular ${r.name.toLowerCase()} have?`, options: numberOptions(r.sym, 4, 10), answer: String(r.sym), why: `A regular ${r.name.toLowerCase()} has ${r.sym} lines of symmetry.` };
    }
    return { emoji: s.icon, text: `How many sides does a ${s.name.toLowerCase()} have?`, options: numberOptions(s.sides, level === 0 ? 3 : 4, 10), answer: String(s.sides), why: `A ${s.name.toLowerCase()} has ${s.sides} sides and ${s.corners} corners.` };
  },
  tf() {
    const p = pick1(POOL.filter((x) => x.poly));
    const kind = pick1(['faces', 'vertices', 'edges']);
    const real = p.counts[kind];
    const shown = Math.random() < 0.5 ? real : real + pick1([-2, -1, 1, 2].filter((d) => real + d >= 0));
    return {
      emoji: p.icon, text: `True or false? ${cap(article(p.name))} ${p.name.toLowerCase()} has ${shown} ${WORD[kind]}.`,
      options: ['True', 'False'], answer: shown === real ? 'True' : 'False', why: `${p.name} really has ${real} ${kind === 'faces' ? 'flat faces' : kind}.`,
    };
  },
  euler() {
    const p = pick1(POOL.filter((x) => x.poly));
    const miss = pick1(['faces', 'edges', 'vertices']);
    const known = ['faces', 'edges', 'vertices'].filter((k) => k !== miss).map((k) => `${p.counts[k]} ${k}`).join(' and ');
    return {
      emoji: '🧮', text: `A solid has ${known}. Use Faces + Vertices − Edges = 2 to find its ${miss}.`,
      options: numberOptions(p.counts[miss], 4), answer: String(p.counts[miss]),
      why: `It is ${article(p.name)} ${p.name.toLowerCase()}: ${p.counts.faces} + ${p.counts.vertices} − ${p.counts.edges} = 2.`,
    };
  },
  net(level) {
    const [net, shape] = pick1(NETS);
    return { emoji: '✂️', text: `Which shape folds up from this net? ${net}.`, options: namesFor(level, shape, 4), answer: shape, why: `That net folds into ${article(shape)} ${shape.toLowerCase()}.` };
  },
};
const PLAN = [
  [['count', 3], ['clue', 2], ['real', 2], ['flat', 1]],
  [['count', 3], ['clue', 2], ['real', 2], ['flat', 2], ['tf', 1]],
  [['count', 3], ['clue', 2], ['euler', 2], ['net', 2], ['tf', 1], ['flat', 2]],
];
const recent = [];

function makeQuestions(level) {
  const qs = [];
  PLAN[level].forEach(([type, n]) => {
    for (let k = 0, tries = 0; k < n && tries < 80; tries++) {
      const q = GEN[type](level);
      if (qs.some((x) => x.text === q.text) || recent.includes(q.text)) continue;
      qs.push(q);
      k++;
    }
  });
  qs.forEach((q) => recent.push(q.text));
  while (recent.length > 45) recent.shift();
  return shuffle(qs);
}

export function initQuiz(root, level = 1) {
  const qs = makeQuestions(level);
  let i = 0;
  let score = 0;

  function render() {
    if (i >= qs.length) { result(); return; }
    const q = qs[i];
    root.innerHTML = `
      <div class="q-top"><span>Question ${i + 1} of ${qs.length}</span><span>⭐ ${score}</span></div>
      <div class="q-bar" aria-hidden="true"><i style="transform:scaleX(${i / qs.length})"></i></div>
      <div class="q-main"><div class="q-emoji" aria-hidden="true">${q.emoji}</div><p class="q-text">${q.text}</p></div>
      <div class="q-opts n${q.options.length}">${q.options.map((o) => `<button type="button" data-o="${o}">${o}</button>`).join('')}</div>
      <p class="q-fb" role="status" aria-live="polite"></p>
      <button class="q-next" type="button" hidden>${i === qs.length - 1 ? 'See my score' : 'Next question'}</button>`;
    const fb = root.querySelector('.q-fb');
    const next = root.querySelector('.q-next');
    root.querySelectorAll('.q-opts button').forEach((b) => b.addEventListener('click', () => {
      const ok = b.dataset.o === q.answer;
      if (ok) score++;
      root.querySelectorAll('.q-opts button').forEach((x) => { x.disabled = true; if (x.dataset.o === q.answer) x.classList.add('right'); });
      if (!ok) b.classList.add('wrong');
      fb.textContent = ok ? `🎉 Yes! ${q.why}` : `Not quite. ${q.why}`;
      next.hidden = false;
      next.focus({ preventScroll: true });
    }));
    next.addEventListener('click', () => { i++; render(); });
  }

  function result() {
    const pct = score / qs.length;
    const s = pct >= 0.9 ? 3 : pct >= 0.6 ? 2 : pct >= 0.3 ? 1 : 0;
    const msg = ['Keep exploring. You will get it!', 'Good try! Explore a bit more and play again.', 'Great job, shape detective!', 'Amazing! You are a geometry superstar!'][s];
    root.innerHTML = `
      <div class="q-result">
        <div class="stars" aria-label="${s} out of 3 stars">${stars(s)}</div>
        <div class="score">${score} / ${qs.length}</div>
        <p class="q-text">${msg}</p>
        <button class="q-again" type="button">Play again</button>
      </div>`;
    root.querySelector('.q-again').addEventListener('click', () => initQuiz(root, level));
  }
  render();
}
