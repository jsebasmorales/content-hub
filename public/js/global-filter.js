// @ts-check
// Progressive enhancement of the global filter (D-081). The filter is a plain GET form that works with
// no script; this only adds comfort and never replaces what the server decides. Budget: 2 KB gzip.

/** "Todos los tipos (5)" or "2 de 5 tipos". */
export const typesLabel = (/** @type {number} */ n, /** @type {number} */ total) =>
  n >= total ? `Todos los tipos (${total})` : `${n} de ${total} tipos`;

/** The server's "today" (YYYY-MM-DD, Bogotá): the browser's own clock is never asked. */
export function parseToday(/** @type {string | undefined} */ value) {
  const m = /^(\d{4})-(\d{2})-\d{2}$/.exec(value ?? '');
  return m ? { year: Number(m[1]), month: Number(m[2]) } : null;
}

/** A quarter that starts after today (it starts on the 1st, so only the month matters). */
export const isFutureQuarter = (
  /** @type {number} */ year,
  /** @type {number} */ quarter,
  /** @type {{ year: number, month: number }} */ today,
) => year > today.year || (year === today.year && quarter * 3 - 2 > today.month);

/** The chip to check when the checked quarter is in the future: the latest one left, or 30 days. */
export function fallbackChip(
  /** @type {number} */ year,
  /** @type {{ year: number, month: number }} */ today,
) {
  for (let q = 4; q > 0; q -= 1) if (!isFutureQuarter(year, q, today)) return `T${q}`;
  return '30d';
}

/** @param {HTMLFormElement} form */
function types(form) {
  const box = form.querySelector('details');
  const button = box?.querySelector('summary');
  const label = form.querySelector('[data-types-label]');
  const hint = form.querySelector('[data-types-hint]');
  if (!box || !button || !label) return;
  const checks = [...box.querySelectorAll('input')];
  const close = (/** @type {boolean} */ refocus) => {
    box.open = false;
    if (refocus) button.focus();
  };
  button.setAttribute('aria-expanded', String(box.open));
  box.addEventListener('toggle', () => {
    button.setAttribute('aria-expanded', String(box.open));
    for (const other of document.querySelectorAll('details[open]'))
      if (box.open && other !== box) other.removeAttribute('open');
  });
  box.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && box.open) {
      e.preventDefault();
      close(true);
    }
  });
  box.addEventListener('focusout', (e) => {
    if (e.relatedTarget instanceof Node && !box.contains(e.relatedTarget)) close(false);
  });
  document.addEventListener('pointerdown', (e) => {
    if (box.open && e.target instanceof Node && !box.contains(e.target)) close(false);
  });
  for (const check of checks) {
    check.addEventListener('change', () => {
      const n = checks.filter((c) => c.checked).length;
      if (n === 0) check.checked = true;
      if (hint) hint.textContent = n === 0 ? 'Debe quedar al menos un tipo de solicitud.' : '';
      label.textContent = typesLabel(Math.max(n, 1), checks.length);
    });
  }
}

/** @param {HTMLFormElement} form */
function dates(form) {
  const range = form.querySelector('.gfilter-range');
  const inputs = [...(range?.querySelectorAll('input') ?? [])];
  range?.addEventListener('click', (e) => {
    const x = e instanceof MouseEvent ? e.clientX : 0;
    const gap = (/** @type {HTMLElement} */ el) =>
      Math.abs(el.getBoundingClientRect().left + el.offsetWidth / 2 - x);
    const input =
      inputs.find((i) => i === e.target) ?? inputs.reduce((a, b) => (gap(a) <= gap(b) ? a : b));
    try {
      input.showPicker();
    } catch {
      // Refused (no gesture, or no picker): the field can still be typed in.
    }
  });
}

/** @param {HTMLFormElement} form */
function quarters(form) {
  const year = form.querySelector('select');
  const today = parseToday(form.dataset['today']);
  const chips = [...form.querySelectorAll('.gfilter-chip input')].filter(
    (c) => c instanceof HTMLInputElement,
  );
  if (!year || !today) return;
  const update = () => {
    for (const chip of chips) {
      const q = /^T([1-4])$/.exec(chip.value);
      chip.disabled = q !== null && isFutureQuarter(Number(year.value), Number(q[1]), today);
    }
    if (chips.some((c) => c.checked && c.disabled)) {
      const next = chips.find((c) => c.value === fallbackChip(Number(year.value), today));
      if (next) next.checked = true;
    }
  };
  year.addEventListener('change', update);
  update();
}

export function enhance() {
  document.documentElement.classList.add('gfilter-js');
  for (const form of document.querySelectorAll('form.gfilter')) {
    if (!(form instanceof HTMLFormElement)) continue;
    types(form);
    dates(form);
    quarters(form);
  }
}

if (typeof document !== 'undefined') enhance();
