/**
 * Shared data for the design canvas generator. Everything here is read from the real
 * token file and the real glyph registry, so the canvas cannot drift from the app.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const tokensCss = readFileSync(path.join(root, 'src/ui/tokens.css'), 'utf8');

/** Pull `--name: value;` pairs out of tokens.css, resolving one level of var(). */
export function readTokens() {
  const raw = {};
  for (const m of tokensCss.matchAll(/^\s*(--[a-z0-9-]+):\s*([^;]+);/gim)) {
    raw[m[1]] = m[2].trim();
  }
  const resolve = (v, depth = 0) => {
    if (depth > 6) return v;
    const m = /^var\((--[a-z0-9-]+)\)$/.exec(v.trim());
    return m && raw[m[1]] ? resolve(raw[m[1]], depth + 1) : v;
  };
  return Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, resolve(v)]));
}

export const glyphs = JSON.parse(readFileSync(path.join(root, 'src/assets/glyphs/glyphs.json'), 'utf8'));

// --------------------------------------------------------------- contrast
const srgb = (h) => {
  const n = h.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16) / 255);
};
const lum = (h) => {
  const [r, g, b] = srgb(h).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
export const contrast = (a, b) => {
  const [x, y] = [lum(a), lum(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};

/** Render one glyph as inline SVG. Strokes use currentColor; fills use a soft tint. */
export function glyphSvg(name, size = 40, tint = 'rgb(0 0 0 / 9%)') {
  const gl = glyphs[name];
  if (!gl) throw new Error(`unknown glyph: ${name}`);
  const box = gl.box ?? 32;
  const fills = gl.fill.map((d) => `<path d="${d}" fill="${tint}"/>`).join('');
  const strokes = gl.stroke.map((d) => `<path d="${d}"/>`).join('');
  return `<svg viewBox="0 0 ${box} ${box}" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${fills}${strokes}</svg>`;
}

export const FONT_LINK =
  '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Recursive:slnt,wght,CASL,CRSV,MONO@-15..0,300..1000,0..1,0..1,0..1&display=swap">';

export const dcShell = (title, style, body) => `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
  ${FONT_LINK}
  <style>
    ${style}
  </style>
</helmet>
${body}
</x-dc>
</body>
</html>
`;
