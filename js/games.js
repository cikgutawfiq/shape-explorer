// Games hub: Quiz, Memory Match and Match Pairs, each with three difficulty levels.
// Every new round draws a different random selection and never repeats the previous layout.
import { initQuiz } from './quiz.js';
import { shuffle, pick, stars, fresh } from './util.js';

const LEVELS = ['Easy', 'Medium', 'Hard'];

/* real object <-> shape name (used by Easy and Medium memory) */
const OBJECTS = [
  ['🎲', 'Dice', 'Cube', 0], ['📦', 'Box', 'Cuboid', 0], ['⛺', 'Tent', 'Triangular prism', 0], ['🏜️', 'Pyramid of Giza', 'Pyramid', 0],
  ['🥫', 'Tin can', 'Cylinder', 0], ['🍦', 'Ice-cream cone', 'Cone', 0], ['⚽', 'Football', 'Sphere', 0],
  ['🐝', 'Honeycomb', 'Hexagon', 1], ['🛑', 'Stop sign', 'Octagon', 1], ['🪙', 'Coin', 'Circle', 1], ['🚪', 'Door', 'Rectangle', 1],
  ['🍕', 'Pizza slice', 'Triangle', 1], ['🧇', 'Waffle', 'Square', 1],
];

/* shape name <-> clue (used by Hard memory and by Match pairs) */
const CLUES = [
  ['🎲', 'Cube', 'Square faces, all the same size', 0],
  ['📦', 'Cuboid', 'Rectangle faces, like a brick', 0],
  ['🥫', 'Cylinder', 'Flat circles and a curved surface', 0],
  ['🍦', 'Cone', 'A flat circle and a pointy tip', 0],
  ['⚽', 'Sphere', 'Round all over, no flat faces', 0],
  ['🏜️', 'Square pyramid', 'A square base and triangle faces', 0],
  ['⛺', 'Triangular prism', 'Triangle ends and rectangle sides', 0],
  ['🔺', 'Triangular pyramid', 'Four faces, all triangles', 1],
  ['🍫', 'Pentagonal prism', 'Two pentagon ends', 1],
  ['⬢', 'Hexagonal prism', 'Two hexagon ends and six rectangles', 1],
  ['🔻', 'Pentagonal pyramid', 'A pentagon base and triangle faces', 1],
  ['🟦', 'Square', 'Four equal sides and four right angles', 1],
  ['🔴', 'Circle', 'One curved side and no corners', 1],
  ['🛑', 'Octagon', 'Eight straight sides', 1],
];

/* ----------------------------------------------------------------- memory ---- */
const MEM = [
  { pairs: 6, hard: false }, // 12 cards
  { pairs: 8, hard: false }, // 16 cards, 8 x 2 on a desktop
  { pairs: 10, hard: true }, // 20 cards, names <-> clues
];

function initMemory(root, level) {
  const cfg = MEM[level];
  const { cards } = fresh(`mem${level}`, () => {
    let chosen;
    if (cfg.hard) {
      chosen = pick(CLUES, cfg.pairs).map(([em, name, clue]) => ({ id: name, a: `<span class="em">${em}</span><strong>${name}</strong>`, an: name, b: `<span class="clue">${clue}</span>`, bn: clue }));
    } else {
      const src = level === 0 ? OBJECTS.filter((o) => o[3] === 0) : OBJECTS;
      chosen = pick(src, cfg.pairs).map(([em, obj, name]) => ({ id: obj, a: `<span class="em">${em}</span><small>${obj}</small>`, an: obj, b: `<strong>${name}</strong>`, bn: name }));
    }
    const list = shuffle(chosen.flatMap((c) => [{ id: c.id, face: c.a, label: c.an }, { id: c.id, face: c.b, label: c.bn }]));
    return { cards: list, sig: list.map((c) => c.label) };
  });

  let moves = 0;
  let matched = 0;
  let open = [];
  let lock = false;

  root.innerHTML = `
    <div class="q-top"><span>${cfg.hard ? 'Match each shape with its clue' : 'Match each real object with its shape name'}</span><span class="mem-score">Moves: <b>0</b></span></div>
    <div class="mem ${cfg.hard ? 'hard' : ''}" style="--cols-d:${cfg.pairs}" role="group" aria-label="Memory cards">
      ${cards.map((c, i) => `<button type="button" class="mem-card" data-i="${i}" aria-label="Face-down card ${i + 1}"><span class="inner"><span class="back" aria-hidden="true">?</span><span class="front">${c.face}</span></span></button>`).join('')}
    </div>
    <p class="q-fb" role="status" aria-live="polite"></p>
    <button class="q-again" type="button">New game</button>`;

  const fb = root.querySelector('.q-fb');
  const score = root.querySelector('.mem-score b');
  root.querySelector('.q-again').addEventListener('click', () => initMemory(root, level));

  root.querySelector('.mem').addEventListener('click', (e) => {
    const btn = e.target.closest('.mem-card');
    if (!btn || lock || btn.classList.contains('flip') || btn.classList.contains('done')) return;
    btn.classList.add('flip');
    btn.setAttribute('aria-label', cards[btn.dataset.i].label);
    open.push(btn);
    if (open.length < 2) return;
    moves++;
    score.textContent = moves;
    const [a, b] = open;
    open = [];
    if (cards[a.dataset.i].id === cards[b.dataset.i].id) {
      [a, b].forEach((x) => x.classList.add('done'));
      matched++;
      fb.textContent = '🎉 A match!';
      if (matched === cfg.pairs) {
        const par = cfg.pairs * 1.6;
        const s = moves <= par ? 3 : moves <= par * 1.6 ? 2 : 1;
        fb.textContent = `You found every pair in ${moves} moves! ${stars(s)}`;
      }
    } else {
      lock = true;
      fb.textContent = 'Not a pair. Remember where they are!';
      setTimeout(() => {
        [a, b].forEach((x) => { x.classList.remove('flip'); x.setAttribute('aria-label', 'Face-down card'); });
        lock = false;
      }, level === 2 ? 1300 : 950);
    }
  });
}

/* ------------------------------------------------------------ match pairs ---- */
const MATCH_PAIRS = [4, 6, 8];

function initMatch(root, level) {
  const n = MATCH_PAIRS[level];
  const { round, right } = fresh(`match${level}`, () => {
    const src = level === 0 ? CLUES.filter((c) => c[3] === 0) : CLUES;
    const r = pick(src, n);
    const rt = shuffle(r);
    return { round: r, right: rt, sig: [r.map((x) => x[1]), rt.map((x) => x[1])] };
  });
  let picked = null;
  let done = 0;
  let mistakes = 0;

  root.innerHTML = `
    <div class="q-top"><span>Tap a shape, then tap the clue that matches it</span><span class="mem-score">Mistakes: <b>0</b></span></div>
    <div class="match">
      <div class="col" data-side="l">${round.map((r, i) => `<button type="button" class="m-item" data-k="${i}"><span class="em">${r[0]}</span>${r[1]}</button>`).join('')}</div>
      <div class="col" data-side="r">${right.map((r) => `<button type="button" class="m-item clue" data-k="${round.indexOf(r)}">${r[2]}</button>`).join('')}</div>
    </div>
    <p class="q-fb" role="status" aria-live="polite"></p>
    <button class="q-again" type="button">New round</button>`;

  const fb = root.querySelector('.q-fb');
  const score = root.querySelector('.mem-score b');
  root.querySelector('.q-again').addEventListener('click', () => initMatch(root, level));

  root.querySelector('.match').addEventListener('click', (e) => {
    const b = e.target.closest('.m-item');
    if (!b || b.classList.contains('done')) return;
    const side = b.parentElement.dataset.side;
    if (!picked || picked.parentElement.dataset.side === side) {
      picked?.classList.remove('sel');
      picked = b;
      b.classList.add('sel');
      return;
    }
    const a = picked;
    picked = null;
    a.classList.remove('sel');
    if (a.dataset.k === b.dataset.k) {
      [a, b].forEach((x) => { x.classList.add('done'); x.disabled = true; });
      done++;
      fb.textContent = '🎉 Correct!';
      if (done === round.length) fb.textContent = `All matched with ${mistakes} mistake${mistakes === 1 ? '' : 's'}! ${stars(mistakes <= 1 ? 3 : mistakes <= 3 ? 2 : 1)}`;
    } else {
      mistakes++;
      score.textContent = mistakes;
      fb.textContent = 'Try again. Think about the faces!';
      [a, b].forEach((x) => { x.classList.add('shake'); setTimeout(() => x.classList.remove('shake'), 450); });
    }
  });
}

/* -------------------------------------------------------------------- hub ---- */
export function initGames(root) {
  const games = [
    ['quiz', '⭐', 'Quiz', initQuiz],
    ['memory', '🧠', 'Memory', initMemory],
    ['match', '🔗', 'Match pairs', initMatch],
  ];
  let game = 'quiz';
  let level = 1;
  try { level = Math.min(2, Math.max(0, +localStorage.getItem('level') || 1)); } catch { /* ignore */ }

  root.innerHTML = `
    <div class="game-bar">
      <div class="game-tabs" role="tablist" aria-label="Choose a game">
        ${games.map(([id, em, name]) => `<button type="button" role="tab" data-g="${id}" aria-selected="false"><span aria-hidden="true">${em}</span> ${name}</button>`).join('')}
      </div>
      <div class="levels" role="group" aria-label="Difficulty">
        ${LEVELS.map((l, i) => `<button type="button" data-l="${i}" aria-pressed="false">${'★'.repeat(i + 1)} ${l}</button>`).join('')}
      </div>
    </div>
    <div class="game-body" id="gameBody"></div>`;
  const body = root.querySelector('.game-body');
  const tabs = [...root.querySelectorAll('[data-g]')];
  const lvls = [...root.querySelectorAll('[data-l]')];

  const play = () => {
    tabs.forEach((t) => t.setAttribute('aria-selected', t.dataset.g === game));
    lvls.forEach((b) => b.setAttribute('aria-pressed', +b.dataset.l === level));
    games.find((g) => g[0] === game)[3](body, level);
  };
  tabs.forEach((t) => t.addEventListener('click', () => { game = t.dataset.g; play(); }));
  lvls.forEach((b) => b.addEventListener('click', () => {
    level = +b.dataset.l;
    try { localStorage.setItem('level', level); } catch { /* ignore */ }
    play();
  }));
  play();
}
