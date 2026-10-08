export const rnd = (n) => Math.floor(Math.random() * n);
export const pick1 = (a) => a[rnd(a.length)];
export const shuffle = (a) => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = rnd(i + 1); [b[i], b[j]] = [b[j], b[i]]; } return b; };
export const pick = (a, n) => shuffle(a).slice(0, n);
export const stars = (n) => '⭐'.repeat(n) + '☆'.repeat(3 - n);
export const article = (w) => (/^[aeiou]/i.test(w) ? 'an' : 'a');

/** Keeps the last layout per key so a new round never repeats the previous one. */
const last = new Map();
export function fresh(key, make) {
  let out;
  for (let i = 0; i < 12; i++) {
    out = make();
    if (JSON.stringify(out.sig) !== last.get(key)) break;
  }
  last.set(key, JSON.stringify(out.sig));
  return out;
}
