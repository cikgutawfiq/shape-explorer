// Games hub: Quiz, Memory Match (flip cards) and Match Pairs (tap a shape, then its clue).
import { initQuiz } from './quiz.js';

const rnd = (n) => Math.floor(Math.random() * n);
const shuffle = (a) => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = rnd(i + 1); [b[i], b[j]] = [b[j], b[i]]; } return b; };
const stars = (n) => '⭐'.repeat(n) + '☆'.repeat(3 - n);

/* ----------------------------------------------------------------- memory ---- */
const MEMORY_PAIRS = [
  ['cube', '🎲', 'Dice', 'Cube'],
  ['cuboid', '📦', 'Box', 'Cuboid'],
  ['prism', '⛺', 'Tent', 'Triangular prism'],
  ['pyramid', '🏜️', 'Pyramid of Giza', 'Pyramid'],
  ['cylinder', '🥫', 'Tin can', 'Cylinder'],
  ['cone', '🍦', 'Ice-cream cone', 'Cone'],
  ['sphere', '⚽', 'Football', 'Sphere'],
  ['hexagon', '🐝', 'Honeycomb', 'Hexagon'],
];

function initMemory(root) {
  let moves = 0;
  let matched = 0;
  let open = [];
  let lock = false;

  const cards = shuffle(MEMORY_PAIRS.flatMap(([id, em, obj, name]) => [
    { id, face: `<span class="em">${em}</span><small>${obj}</small>`, label: obj },
    { id, face: `<strong>${name}</strong>`, label: name },
  ]));

  root.innerHTML = `
    <div class="q-top"><span>Find the matching pairs: a real object and its shape name</span><span class="mem-score">Moves: <b>0</b></span></div>
    <div class="mem" role="group" aria-label="Memory cards">
      ${cards.map((c, i) => `<button type="button" class="mem-card" data-i="${i}" aria-label="Face-down card ${i + 1}"><span class="inner"><span class="back" aria-hidden="true">?</span><span class="front">${c.face}</span></span></button>`).join('')}
    </div>
    <p class="q-fb" role="status" aria-live="polite"></p>
    <button class="q-again" type="button">New game</button>`;

  const fb = root.querySelector('.q-fb');
  const score = root.querySelector('.mem-score b');
  root.querySelector('.q-again').addEventListener('click', () => initMemory(root));

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
      if (matched === MEMORY_PAIRS.length) {
        const s = moves <= 12 ? 3 : moves <= 18 ? 2 : 1;
        fb.textContent = `You found every pair in ${moves} moves! ${stars(s)}`;
      }
    } else {
      lock = true;
      fb.textContent = 'Not a pair. Remember where they are!';
      setTimeout(() => {
        [a, b].forEach((x) => { x.classList.remove('flip'); x.setAttribute('aria-label', 'Face-down card'); });
        lock = false;
      }, 900);
    }
  });
}

/* ------------------------------------------------------------ match pairs ---- */
const CLUES = [
  ['🎲', 'Cube', 'Square faces, all the same size'],
  ['📦', 'Cuboid', 'Rectangle faces, like a brick'],
  ['🥫', 'Cylinder', 'Flat circles and a curved surface'],
  ['🍦', 'Cone', 'A flat circle and a pointy tip'],
  ['⚽', 'Sphere', 'Round all over, no flat faces'],
  ['🏜️', 'Square pyramid', 'A square base and triangle faces'],
  ['⛺', 'Triangular prism', 'Triangle ends and rectangle sides'],
];

function initMatch(root) {
  const round = shuffle(CLUES).slice(0, 5);
  const right = shuffle(round);
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
  root.querySelector('.q-again').addEventListener('click', () => initMatch(root));

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
  root.innerHTML = `
    <div class="game-tabs" role="tablist" aria-label="Choose a game">
      ${games.map(([id, em, name]) => `<button type="button" role="tab" data-g="${id}" aria-selected="false"><span aria-hidden="true">${em}</span> ${name}</button>`).join('')}
    </div>
    <div class="game-body" id="gameBody"></div>`;
  const body = root.querySelector('.game-body');
  const tabs = [...root.querySelectorAll('[data-g]')];
  const select = (id) => {
    tabs.forEach((t) => t.setAttribute('aria-selected', t.dataset.g === id));
    games.find((g) => g[0] === id)[3](body);
  };
  tabs.forEach((t) => t.addEventListener('click', () => select(t.dataset.g)));
  select('quiz');
}
