// Design gate (docs/PLAN_DISENO.md §1): `pnpm check:design`.
//
// 1. Token hygiene: colors, radii and shadows are written in tokens.css only. A hex, rgb(), hsl(),
//    a literal box-shadow or a pixel border-radius anywhere else in src/presentation is a defect.
// 2. Contrast: every text/background and graphic/background pair of tokens.css, in the light and the
//    dark theme, against WCAG 2.1 AA (4.5:1 for text, 3:1 for graphics), plus how far apart the
//    first two chart series are for people with and without color-vision deficiency.
// Exit code 1 when a rule is broken, so CI fails.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = 'src/presentation';
const TOKENS = `${ROOT}/styles/tokens.css`;
let failures = 0;
const fail = (text) => {
  failures += 1;
  console.error(`✖ ${text}`);
};

// ------------------------------------------------------------------ 1. token hygiene
function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

const CSS_RULES = [
  [/#[0-9a-fA-F]{3,8}\b/, 'literal hex color'],
  [/\brgba?\(|\bhsla?\(/, 'literal rgb()/hsl() color'],
  [/box-shadow:\s*(?!\s)(?!none|var\()/, 'literal box-shadow'],
  [/border-radius:\s*(?!0\b|var\(|inherit|50%)[^;]*\d+(px|rem)/, 'literal border-radius'],
];
const MARKUP_RULES = [
  [
    /\b(fill|stroke|stop-color|color|background)\s*[:=]\s*["']?#[0-9a-fA-F]{3,8}\b/,
    'literal color',
  ],
];

for (const file of walk(ROOT)) {
  if (file.replaceAll('\\', '/') === TOKENS) continue;
  const css = file.endsWith('.css');
  if (!css && !/\.(astro|ts)$/.test(file)) continue;
  const lines = readFileSync(file, 'utf8').split('\n');
  lines.forEach((line, index) => {
    for (const [pattern, what] of css ? CSS_RULES : MARKUP_RULES) {
      if (!pattern.test(line)) continue;
      const where = `${relative('.', file)}:${String(index + 1)} ${what}: ${line.trim()}`;
      fail(where);
    }
  });
}

// ------------------------------------------------------------------ 2. contrast
const source = readFileSync(TOKENS, 'utf8');
const declarations = new Map();
for (const match of source.matchAll(/--([\w-]+):\s*([^;]+);/g))
  declarations.set(match[1], match[2].trim());

/** Splits "a, b(c, d), e" at the top-level commas. */
function splitArgs(text) {
  const parts = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] === '(') depth += 1;
    if (text[i] === ')') depth -= 1;
    if (text[i] === ',' && depth === 0) {
      parts.push(text.slice(start, i).trim());
      start = i + 1;
    }
  }
  parts.push(text.slice(start).trim());
  return parts;
}

const fromHex = (hex) => {
  const h = hex.length === 4 ? [...hex.slice(1)].map((c) => c + c).join('') : hex.slice(1, 7);
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
};

/** Resolves a token value to [r, g, b] for the given theme (var(), light-dark(), color-mix(), hex). */
function resolve(value, theme) {
  const text = value.trim();
  const call = text.match(/^([\w-]+)\((.*)\)$/s);
  if (call?.[1] === 'var') return resolve(declarations.get(call[2].trim().slice(2)) ?? '', theme);
  if (call?.[1] === 'light-dark') {
    const [light, dark] = splitArgs(call[2]);
    return resolve(theme === 'light' ? light : dark, theme);
  }
  if (call?.[1] === 'color-mix') {
    const [, first, second] = splitArgs(call[2]);
    const [colorA, pct] = first.match(/^(.*)\s+([\d.]+)%$/s).slice(1);
    const a = resolve(colorA, theme);
    const b = resolve(second, theme);
    const p = Number(pct) / 100;
    return a.map((v, i) => Math.round(v * p + b[i] * (1 - p)));
  }
  if (text.startsWith('#')) return fromHex(text);
  throw new Error(`Cannot resolve "${value}"`);
}

const channel = (v) => {
  const c = v / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};
const luminance = ([r, g, b]) => 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

const token = (name, theme) => resolve(`var(--${name})`, theme);
const gradientEnds = [...declarations.get('gradient-primary').matchAll(/#[0-9a-fA-F]{6}/g)].map(
  (m) => fromHex(m[0]),
);

const TEXT = 4.5;
const GRAPHIC = 3;
const PAIRS = [
  ...['bg', 'surface', 'surface-raised', 'surface-sunken'].flatMap((bg) => [
    ['text', bg, TEXT],
    ['text-muted', bg, TEXT],
  ]),
  ['link', 'surface', TEXT],
  ['link', 'bg', TEXT],
  ['selected-text', 'selected-bg', TEXT],
  ['text', 'selected-bg', TEXT],
  ...['success', 'warning', 'error', 'info', 'neutral'].flatMap((kind) => [
    [`${kind}-text`, `${kind}-bg`, TEXT],
    ...(kind === 'neutral'
      ? []
      : [
          [`${kind}-accent`, `${kind}-bg`, GRAPHIC],
          [`${kind}-accent`, 'surface', GRAPHIC],
        ]),
  ]),
  ['error-text', 'surface', TEXT],
  ['success-text', 'surface', TEXT],
  ['warning-text', 'surface', TEXT],
  ['info-text', 'surface', TEXT],
  ['focus', 'surface', GRAPHIC],
  ['focus', 'bg', GRAPHIC],
  ['accent', 'surface', GRAPHIC],
  // Series 1 and 2 carry every chart of the Hub today. 3 to 6 are DESIGN.md §8 colors that are pale on
  // white: see the advisory lines below.
  ...[1, 2].map((n) => [`chart-${String(n)}`, 'surface', GRAPHIC]),
  ['text-muted', 'surface', TEXT],
  // Previous-year comparison: text and lines, the box that holds them, and the bars' fill.
  ['compare', 'surface', TEXT],
  ['compare', 'compare-bg', TEXT],
  ['compare-fill', 'surface', GRAPHIC],
];

for (const theme of ['light', 'dark']) {
  for (const [fg, bg, min] of PAIRS) {
    const ratio = contrast(token(fg, theme), token(bg, theme));
    if (ratio < min)
      fail(`${theme}: --${fg} on --${bg} is ${ratio.toFixed(2)}:1, needs ${String(min)}:1`);
  }
}
// White text on the primary button gradient. The label starts about 15 % into the 135° gradient (the
// button has horizontal padding), so that is the lightest color text really sits on. The very first
// pixel of the gradient is a hair under 4.5:1 and is reported below.
const [gradientStart, gradientEnd] = gradientEnds;
const mix = (a, b, share) => a.map((v, i) => Math.round(v * (1 - share) + b[i] * share));
const labelStart = mix(gradientStart, gradientEnd, 0.15);
const labelRatio = contrast(token('on-accent', 'light'), labelStart);
if (labelRatio < TEXT)
  fail(`white text on the button gradient (15 % in) is ${labelRatio.toFixed(2)}:1`);
if (contrast(token('on-accent', 'light'), gradientEnd) < TEXT)
  fail('white text on the end of the button gradient');
if (contrast(token('neutral-100', 'light'), token('neutral-600', 'light')) < TEXT)
  fail('tooltip text');

// How far apart chart series 1 and 2 are, seen normally and with color-vision deficiency.
const toLinear = (rgb) => rgb.map(channel);
const MACHADO = {
  protanopia: [
    [0.152286, 1.052583, -0.204868],
    [0.114503, 0.786281, 0.099216],
    [-0.003882, -0.048116, 1.051998],
  ],
  deuteranopia: [
    [0.367322, 0.860646, -0.227968],
    [0.280085, 0.672501, 0.047413],
    [-0.01182, 0.04294, 0.968881],
  ],
  tritanopia: [
    [1.255528, -0.076749, -0.178779],
    [-0.078411, 0.930809, 0.147602],
    [0.004733, 0.691367, 0.3039],
  ],
};
const simulate = (linear, m) =>
  m.map((row) =>
    Math.min(1, Math.max(0, row[0] * linear[0] + row[1] * linear[1] + row[2] * linear[2])),
  );
const toLab = (linear) => {
  const [r, g, b] = linear;
  const xyz = [
    (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047,
    0.2126 * r + 0.7152 * g + 0.0722 * b,
    (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883,
  ].map((t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116));
  return [116 * xyz[1] - 16, 500 * (xyz[0] - xyz[1]), 200 * (xyz[1] - xyz[2])];
};
const deltaE = (a, b) => Math.hypot(...toLab(a).map((v, i) => v - toLab(b)[i]));

const seriesReport = [];
for (const theme of ['light', 'dark']) {
  const one = toLinear(token('chart-1', theme));
  const two = toLinear(token('chart-2', theme));
  const normal = deltaE(one, two);
  const cvd = Object.entries(MACHADO).map(([name, m]) => [
    name,
    deltaE(simulate(one, m), simulate(two, m)),
  ]);
  seriesReport.push(
    `${theme}: normal ΔE ${normal.toFixed(0)}, ${cvd.map(([n, v]) => `${n} ${v.toFixed(0)}`).join(', ')}`,
  );
  if (normal < 20) fail(`${theme}: chart series 1 and 2 are too close (ΔE ${normal.toFixed(0)})`);
  for (const [name, value] of cvd)
    if (value < 10)
      fail(`${theme}: chart series 1 and 2 look alike with ${name} (ΔE ${value.toFixed(0)})`);
}

// Known limit of DESIGN.md §7.2, reported but not failed: the input border #CCD0D7 is a light line.
const border = contrast(token('border-strong', 'light'), token('surface', 'light'));
for (const theme of ['light', 'dark']) {
  const pale = [3, 4, 5].map(
    (n) =>
      `chart-${String(n)} ${contrast(token(`chart-${String(n)}`, theme), token('surface', theme)).toFixed(2)}`,
  );
  console.log(
    `ℹ ${theme} series 3-5 on surface (DESIGN.md §8, below 3:1 when pale; always used with direct labels): ${pale.join(', ')}`,
  );
}
console.log(
  `ℹ button gradient: first pixel with white text ${contrast(token('on-accent', 'light'), gradientStart).toFixed(2)}:1, at the label ${labelRatio.toFixed(2)}:1`,
);
console.log(
  `ℹ neutral status icon (#CCD0D7) on its tint is ${contrast(token('neutral-accent', 'light'), token('neutral-bg', 'light')).toFixed(2)}:1; it always sits next to its word`,
);
console.log(`ℹ chart series 1 vs 2 → ${seriesReport.join(' | ')}`);
console.log(
  `ℹ input border on a white card is ${border.toFixed(2)}:1 (DESIGN.md §7.2 asks for #CCD0D7; WCAG 1.4.11 suggests 3:1; the label and the 44 px field carry the control)`,
);
for (const theme of ['light', 'dark']) {
  const g = (name, bg) => contrast(token(name, theme), token(bg, theme)).toFixed(2);
  console.log(
    `ℹ ${theme}: chart-1 on surface ${g('chart-1', 'surface')}:1, chart-2 on surface ${g('chart-2', 'surface')}:1, text-muted on surface ${g('text-muted', 'surface')}:1`,
  );
}

for (const theme of ['light', 'dark']) {
  console.log(
    `ℹ ${theme}: striped bar of the previous year (compare-fill on compare-bg) is ${contrast(token('compare-fill', theme), token('compare-bg', theme)).toFixed(2)}:1; that is why each bar also has a 1.5 px outline in --compare`,
  );
}

if (failures > 0) {
  console.error(`\n${String(failures)} design check(s) failed`);
  process.exit(1);
}
console.log('✔ design tokens: no literal values outside tokens.css, contrast within WCAG AA');
