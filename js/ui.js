// Small helpers for the "hidden until you tap" count chips.
const EYE = '<svg class="eye" viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/><circle cx="12" cy="12" r="3" fill="currentColor"/></svg>';

/** Show the eye icon instead of a number. */
export function hideCount(chip) {
  const b = chip.querySelector('b');
  b.innerHTML = EYE;
  b.classList.add('hid');
  chip.classList.remove('on');
  chip.setAttribute('aria-pressed', 'false');
}

/** Show the number. */
export function showCount(chip, n) {
  const b = chip.querySelector('b');
  b.textContent = n;
  b.classList.remove('hid');
}
