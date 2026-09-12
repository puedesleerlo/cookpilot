/**
 * Generates the Kitchen Compiler design canvas artboards from the real token file and
 * the real glyph registry. Run: node scripts/build-design-canvas.mjs
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readTokens, glyphSvg, contrast, dcShell } from './design-canvas-data.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'design');
mkdirSync(out, { recursive: true });
const T = readTokens();
const t = (k) => T[`--${k}`];

const BASE = `
  * { box-sizing: border-box; }
  body {
    margin: 0;
    background: ${t('c-cream')};
    color: ${t('c-charcoal')};
    font-family: 'Recursive', system-ui, sans-serif;
    font-variation-settings: 'MONO' 0, 'CASL' 0.3, 'slnt' 0, 'CRSV' 0;
    font-size: 15px;
    line-height: 1.55;
  }
  a { color: ${t('c-tomato-ink')}; } a:hover { color: ${t('c-charcoal')}; }
  .sheet { padding: 40px 44px; display: flex; flex-direction: column; gap: 32px; }
  .display {
    font-variation-settings: 'MONO' 0, 'CASL' 1, 'slnt' 0, 'CRSV' 0.5;
    font-weight: 800; letter-spacing: -0.015em; line-height: 1.05;
  }
  .mono {
    font-variation-settings: 'MONO' 1, 'CASL' 0, 'slnt' 0, 'CRSV' 0;
    font-weight: 500; letter-spacing: 0.01em;
  }
  .plate-title { font-size: 31px; margin: 0; }
  .plate-note { margin: 0; max-width: 62ch; color: ${t('c-ink-soft')}; font-size: 14px; }
  .rule { height: 1px; background: ${t('c-line')}; border: 0; margin: 0; }
  .grid { display: grid; gap: 14px; }
  .section-h { font-size: 13px; font-weight: 700; margin: 0 0 2px; }
  .tape {
    display: inline-block; padding: 5px 14px; background: #efe0c6cc;
    color: ${t('c-charcoal')}; font-size: 12px; font-weight: 700;
    transform: rotate(-1.4deg);
    clip-path: polygon(2% 8%, 98% 0%, 100% 88%, 1% 100%);
    box-shadow: 0 1px 2px rgb(46 42 38 / 12%);
  }
`;

// ------------------------------------------------------------------ plate 1
const swatch = (name, token, note) => {
  const hex = t(token);
  const onCream = contrast(hex, t('c-cream'));
  const grade = onCream >= 4.5 ? 'body text' : onCream >= 3 ? 'large text only' : 'fills only';
  return `<div style="display:flex;flex-direction:column;gap:6px">
    <div style="height:78px;background:${hex};border-radius:${t('r-sm')};box-shadow:${t('e-1')}"></div>
    <div style="display:flex;justify-content:space-between;align-items:baseline;gap:8px">
      <strong style="font-size:13px">${name}</strong>
      <span class="mono" style="font-size:11px;color:${t('c-ink-soft')}">${hex}</span>
    </div>
    <div class="mono" style="font-size:11px;color:${t('c-ink-soft')}">${onCream.toFixed(2)}:1 &middot; ${grade}</div>
    ${note ? `<div style="font-size:12px;color:${t('c-ink-soft')}">${note}</div>` : ''}
  </div>`;
};

const pairRow = (fg, bg, label, kind) => {
  const ratio = contrast(t(fg), t(bg));
  const need = kind === 'large' ? 3 : 4.5;
  const ok = ratio >= need;
  return `<div style="display:grid;grid-template-columns:1fr 84px 74px;gap:12px;align-items:center;padding:9px 12px;background:${t(bg)};border-radius:${t('r-xs')};border:1px solid ${t('c-line')}">
    <span style="color:${t(fg)};font-size:${kind === 'large' ? '21px' : '14px'};font-weight:${kind === 'large' ? 800 : 400}">${label}</span>
    <span class="mono" style="font-size:12px;color:${t(fg)}">${ratio.toFixed(2)}:1</span>
    <span class="mono" style="font-size:11px;color:${ok ? t('c-sage-ink') : t('c-tomato-ink')};font-weight:700">${ok ? 'passes' : 'FAILS'}</span>
  </div>`;
};

writeFileSync(path.join(out, 'Main.dc.html'), dcShell('Palette', BASE, `
<div class="sheet">
  <div>
    <span class="tape">Plate 01</span>
    <h1 class="plate-title display" style="margin-top:14px">Palette</h1>
    <p class="plate-note">Cream ground, tomato accent. Every hue ships in three states: the base for
      fills and strokes, an <em>ink</em> variant darkened until body text is legal on cream, and a
      <em>wash</em> tint for timeline blocks that carry charcoal labels.</p>
  </div>
  <hr class="rule">
  <div>
    <h2 class="section-h">Ground and ink</h2>
    <div class="grid" style="grid-template-columns:repeat(4,1fr)">
      ${swatch('Cream', 'c-cream', 'The ground.')}
      ${swatch('Cream deep', 'c-cream-deep', 'Lanes, recessed surfaces.')}
      ${swatch('Charcoal', 'c-charcoal', 'Body text. Never pure black.')}
      ${swatch('Ink soft', 'c-ink-soft', 'Secondary text.')}
    </div>
  </div>
  <div>
    <h2 class="section-h">Accents &mdash; base</h2>
    <div class="grid" style="grid-template-columns:repeat(6,1fr)">
      ${swatch('Tomato', 'c-tomato')}${swatch('Sage', 'c-sage')}${swatch('Orange', 'c-orange')}
      ${swatch('Plum', 'c-plum')}${swatch('Teal', 'c-teal')}${swatch('Mustard', 'c-mustard')}
    </div>
  </div>
  <div>
    <h2 class="section-h">Accents &mdash; ink, for text</h2>
    <div class="grid" style="grid-template-columns:repeat(6,1fr)">
      ${swatch('Tomato ink', 'c-tomato-ink')}${swatch('Sage ink', 'c-sage-ink')}${swatch('Orange ink', 'c-orange-ink')}
      ${swatch('Plum ink', 'c-plum-ink')}${swatch('Teal ink', 'c-teal-ink')}${swatch('Mustard ink', 'c-mustard-ink')}
    </div>
  </div>
  <div>
    <h2 class="section-h">Accents &mdash; wash, for blocks</h2>
    <div class="grid" style="grid-template-columns:repeat(6,1fr)">
      ${swatch('Tomato wash', 'c-tomato-wash')}${swatch('Sage wash', 'c-sage-wash')}${swatch('Orange wash', 'c-orange-wash')}
      ${swatch('Plum wash', 'c-plum-wash')}${swatch('Teal wash', 'c-teal-wash')}${swatch('Mustard wash', 'c-mustard-wash')}
    </div>
  </div>
  <hr class="rule">
  <div>
    <h2 class="section-h">Contrast, measured</h2>
    <p class="plate-note" style="margin-bottom:12px">These pairings are enforced by a test, not checked by eye.
      The row that matters is the last one: tomato is the brand colour and it cannot carry body text.</p>
    <div class="grid" style="grid-template-columns:1fr">
      ${pairRow('c-charcoal', 'c-cream', 'Start the rice, then chop while it cooks', 'body')}
      ${pairRow('c-ink-soft', 'c-cream', 'Cook 2 &middot; beginner &middot; 14 minutes idle', 'body')}
      ${pairRow('c-tomato-ink', 'c-cream', 'Salmon must be chilled within 2 hours', 'body')}
      ${pairRow('c-cream', 'c-tomato-deep', 'Compile the session', 'body')}
      ${pairRow('c-charcoal', 'c-sage-wash', 'Rice cooks &mdash; 24 min, hands free', 'body')}
      ${pairRow('c-tomato', 'c-cream', '54 minutes', 'large')}
    </div>
  </div>
</div>`));

// ------------------------------------------------------------------ plate 2
const scale = [
  ['t-5xl', '76px', 'Display', 'The makespan figure'],
  ['t-3xl', '49px', 'Display', 'Screen titles'],
  ['t-xl', '31px', 'Display', 'Dish names'],
  ['t-lg', '25px', 'Interface', 'Section heads'],
  ['t-md', '20px', 'Interface', 'Task names in cooking mode'],
  ['t-sm', '16px', 'Interface', 'Body'],
  ['t-xs', '13px', 'Compiler', 'Lane labels, the time ruler'],
];

writeFileSync(path.join(out, 'Type.dc.html'), dcShell('Type', BASE, `
<div class="sheet">
  <div>
    <span class="tape">Plate 02</span>
    <h1 class="plate-title display" style="margin-top:14px">Three voices, one typeface</h1>
    <p class="plate-note">Recursive, driven on two axes. The product's whole tension is a warm kitchen
      against a compiler, and one variable superfamily spans exactly that range &mdash; which is also why the
      monospace here is not decoration. It is reserved for the places the interface is genuinely speaking
      as a compiler.</p>
  </div>
  <hr class="rule">
  <div class="grid" style="grid-template-columns:repeat(3,1fr)">
    <div style="padding:22px;background:${t('c-cream-deep')};border-radius:${t('r-md')}">
      <div class="mono" style="font-size:11px;color:${t('c-ink-soft')}">CASL 1 &middot; wght 800</div>
      <div class="display" style="font-size:42px;margin-top:8px">Bok choy<br>and garlic</div>
      <p style="font-size:13px;color:${t('c-ink-soft')};margin:12px 0 0">Display. Titles, dish names,
        the compile moment. The casual axis is what makes the letterforms irregular.</p>
    </div>
    <div style="padding:22px;background:${t('c-cream-deep')};border-radius:${t('r-md')}">
      <div class="mono" style="font-size:11px;color:${t('c-ink-soft')}">CASL 0.3 &middot; wght 400&ndash;800</div>
      <div style="font-size:26px;margin-top:8px;font-weight:600;line-height:1.2">Start the rice,<br>then chop</div>
      <p style="font-size:13px;color:${t('c-ink-soft')};margin:12px 0 0">Interface. Every label and
        button, and the timers at weight 800 with tabular figures.</p>
    </div>
    <div style="padding:22px;background:${t('c-cream-deep')};border-radius:${t('r-md')}">
      <div class="mono" style="font-size:11px;color:${t('c-ink-soft')}">MONO 1 &middot; wght 500</div>
      <div class="mono" style="font-size:19px;margin-top:8px;line-height:1.35">checking<br>dependencies</div>
      <p style="font-size:13px;color:${t('c-ink-soft')};margin:12px 0 0">Compiler. Status lines and the
        time ruler. Nowhere else.</p>
    </div>
  </div>
  <hr class="rule">
  <div>
    <h2 class="section-h">Scale &mdash; major third from 16px</h2>
    <div style="display:flex;flex-direction:column;gap:4px;margin-top:10px">
      ${scale.map(([token, px, voice, job]) => `
        <div style="display:grid;grid-template-columns:120px 1fr 200px;gap:16px;align-items:baseline;padding:8px 0;border-bottom:1px solid ${t('c-line')}">
          <span class="mono" style="font-size:11px;color:${t('c-ink-soft')}">${token} &middot; ${px}</span>
          <span class="${voice === 'Display' ? 'display' : voice === 'Compiler' ? 'mono' : ''}" style="font-size:${px};${voice === 'Interface' ? 'font-weight:600' : ''}">Compile</span>
          <span style="font-size:12px;color:${t('c-ink-soft')}">${job}</span>
        </div>`).join('')}
    </div>
  </div>
  <hr class="rule">
  <div>
    <h2 class="section-h">The timer, at kitchen distance</h2>
    <p class="plate-note" style="margin-bottom:14px">Weight 800, tabular figures so the digits do not
      shift width as they count down. This is read from across a room with wet hands.</p>
    <div style="display:flex;align-items:baseline;gap:20px;padding:26px 30px;background:${t('c-cream-deep')};border-radius:${t('r-lg')}">
      <span style="font-size:76px;font-weight:800;font-variant-numeric:tabular-nums;letter-spacing:-0.02em;line-height:1">08:24</span>
      <span style="font-size:20px;color:${t('c-ink-soft')}">left on the rice</span>
    </div>
  </div>
</div>`));


// ------------------------------------------------------------------ plate 3
const btn = (label, kind) => {
  const styles = {
    primary: `background:${t('c-tomato-deep')};color:${t('c-cream')};border:0;box-shadow:${t('e-2')}`,
    secondary: `background:${t('c-cream')};color:${t('c-charcoal')};border:1.5px solid ${t('c-line-strong')};box-shadow:${t('e-1')}`,
    quiet: `background:transparent;color:${t('c-tomato-ink')};border:0;text-decoration:underline;text-underline-offset:3px`,
  };
  return `<button style="${styles[kind]};border-radius:${t('r-sm')};padding:11px 20px;font:inherit;font-weight:700;font-size:15px;cursor:pointer;min-height:44px">${label}</button>`;
};

const chip = (glyph, label, state) => {
  const tone = { urgent: 'c-tomato', assumed: 'c-ink-faint', plain: 'c-sage-ink' }[state];
  const border = state === 'assumed' ? `1.5px dashed ${t('c-line-strong')}` : `1.5px solid ${t('c-line-strong')}`;
  return `<span style="display:inline-flex;align-items:center;gap:8px;padding:7px 14px 7px 10px;background:${t('c-cream')};border:${border};border-radius:${t('r-chip')};font-size:14px;font-weight:600;box-shadow:${t('e-1')}">
    <span style="color:${t(tone)};display:inline-flex">${glyphSvg(glyph, 22)}</span>${label}
    ${state === 'urgent' ? `<span style="font-size:11px;font-weight:700;color:${t('c-tomato-ink')};background:${t('c-tomato-wash')};padding:2px 7px;border-radius:${t('r-xs')}">today</span>` : ''}
    ${state === 'assumed' ? `<span style="font-size:11px;color:${t('c-ink-soft')};font-style:italic">assumed</span>` : ''}
  </span>`;
};

writeFileSync(path.join(out, 'Components.dc.html'), dcShell('Components', BASE, `
<div class="sheet">
  <div>
    <span class="tape">Plate 03</span>
    <h1 class="plate-title display" style="margin-top:14px">Primitives</h1>
    <p class="plate-note">Every surface uses a non-uniform corner radius, so nothing in the interface is a
      perfect rounded rectangle. Focus rings are off-palette on purpose &mdash; a focus state that reads as
      decoration is not a focus state.</p>
  </div>
  <hr class="rule">
  <div>
    <h2 class="section-h">Buttons</h2>
    <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin-top:10px">
      ${btn('Compile the session', 'primary')}
      ${btn('Add an ingredient', 'secondary')}
      ${btn('Skip this step', 'quiet')}
      <span style="display:inline-flex;border-radius:6px;outline:3px solid ${t('c-focus')};outline-offset:2px">${btn('Focused', 'secondary')}</span>
    </div>
  </div>
  <div>
    <h2 class="section-h">Ingredient chips</h2>
    <p class="plate-note">The chip is the product's main editing surface: the compiler shows what it heard,
      and you correct it by tapping. An assumption it made on your behalf is drawn as a dashed outline,
      never silently.</p>
    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:12px">
      ${chip('produce', 'Bok choy', 'urgent')}
      ${chip('protein-raw', 'Chicken breast', 'plain')}
      ${chip('grain', 'Jasmine rice', 'plain')}
      ${chip('aromatic', 'Garlic', 'plain')}
      ${chip('beverage-base', 'Coffee beans', 'plain')}
      ${chip('pantry', 'Sesame oil', 'assumed')}
    </div>
  </div>
  <div>
    <h2 class="section-h">Cards and stats</h2>
    <div class="grid" style="grid-template-columns:1.4fr 1fr;margin-top:10px">
      <div style="padding:22px 24px;background:${t('c-cream-deep')};border-radius:${t('r-lg')};box-shadow:${t('e-2')}">
        <div class="display" style="font-size:25px">Chicken and bok choy, two ways</div>
        <p style="margin:8px 0 16px;color:${t('c-ink-soft')};font-size:14px">Leans on everything that has to go
          today. Leaves the salmon for tomorrow.</p>
        <div style="display:flex;gap:10px;flex-wrap:wrap">
          ${['3 dishes', '1 sauce', '2 drinks', '10 portions'].map((x) => `<span class="mono" style="font-size:12px;padding:5px 11px;background:${t('c-cream')};border-radius:${t('r-xs')};border:1px solid ${t('c-line')}">${x}</span>`).join('')}
        </div>
      </div>
      <div style="display:flex;flex-direction:column;gap:12px">
        <div style="padding:18px 20px;background:${t('c-sage-wash')};border-radius:${t('r-md')}">
          <div style="font-size:39px;font-weight:800;font-variant-numeric:tabular-nums;line-height:1">38 min</div>
          <div style="font-size:13px;color:${t('c-ink-soft')};margin-top:2px">bought back by working in parallel</div>
        </div>
        <div style="padding:18px 20px;background:${t('c-cream-deep')};border-radius:${t('r-md')}">
          <div style="font-size:39px;font-weight:800;font-variant-numeric:tabular-nums;line-height:1">2</div>
          <div style="font-size:13px;color:${t('c-ink-soft')};margin-top:2px">washes, down from five</div>
        </div>
      </div>
    </div>
  </div>
  <div>
    <h2 class="section-h">The compile sequence</h2>
    <p class="plate-note">One orchestrated moment, not five animations. Under reduced motion it lands on
      the final state with no movement.</p>
    <div style="margin-top:12px;padding:24px 26px;background:${t('c-charcoal')};border-radius:${t('r-lg')};color:${t('c-cream')}">
      <div style="display:flex;flex-direction:column;gap:7px">
        ${[['reading the pantry', 'done'], ['checking dependencies', 'done'], ['allocating cookware', 'now'], ['optimizing parallel tasks', 'next'], ['compilation successful', 'next']]
          .map(([label, state]) => `<div class="mono" style="font-size:14px;display:flex;gap:12px;align-items:center;opacity:${state === 'next' ? 0.35 : 1}">
            <span style="width:8px;height:8px;border-radius:50%;background:${state === 'now' ? t('c-tomato') : state === 'done' ? t('c-sage') : t('c-ink-faint')};flex:none"></span>${label}</div>`).join('')}
      </div>
      <div style="margin-top:18px;height:6px;background:#ffffff22;border-radius:99px;overflow:hidden">
        <div style="width:58%;height:100%;background:${t('c-tomato')}"></div>
      </div>
    </div>
  </div>
  <div>
    <h2 class="section-h">Empty and failure states</h2>
    <div class="grid" style="grid-template-columns:1fr 1fr;margin-top:10px">
      <div style="padding:24px;background:${t('c-cream-deep')};border-radius:${t('r-lg')};display:flex;gap:18px;align-items:center">
        <span style="color:${t('c-ink-faint')};flex:none">${glyphSvg('state-empty', 68)}</span>
        <div><div class="display" style="font-size:21px">Nothing in the fridge yet</div>
          <p style="margin:6px 0 0;font-size:14px;color:${t('c-ink-soft')}">Tell me what you have and I will find the session in it.</p></div>
      </div>
      <div style="padding:24px;background:${t('c-tomato-wash')};border-radius:${t('r-lg')};display:flex;gap:18px;align-items:center">
        <span style="color:${t('c-tomato-ink')};flex:none">${glyphSvg('state-impossible', 68)}</span>
        <div><div class="display" style="font-size:21px">This will not fit in 20 minutes</div>
          <p style="margin:6px 0 0;font-size:14px;color:${t('c-ink-soft')}">The shortest session here needs 34. Add time, or drop the salmon.</p></div>
      </div>
    </div>
  </div>
</div>`));

// ------------------------------------------------------------------ plate 4
const GROUPS = [
  ['Ingredient categories', ['produce', 'protein-raw', 'protein-cooked', 'grain', 'dairy', 'pantry', 'aromatic', 'beverage-base']],
  ['Heat', ['burner', 'oven-rack', 'frying-pan', 'saucepan', 'pot', 'wok', 'sheet-pan', 'kettle']],
  ['Tools', ['cutting-board', 'knife', 'mixing-bowl', 'blender', 'colander', 'grater', 'measuring-cup', 'pitcher']],
  ['Storage', ['jar', 'storage-container', 'fridge-shelf', 'freezer-shelf', 'sink']],
  ['Cooks', ['cook-0', 'cook-1', 'cook-2', 'cook-3']],
];

const cell = (name) => `<div style="display:flex;flex-direction:column;align-items:center;gap:8px;padding:16px 8px;background:${t('c-cream')};border-radius:${t('r-sm')};border:1px solid ${t('c-line')}">
  <span style="color:${t('c-charcoal')}">${glyphSvg(name, 46)}</span>
  <span class="mono" style="font-size:10.5px;color:${t('c-ink-soft')};text-align:center">${name}</span>
</div>`;

writeFileSync(path.join(out, 'Glyphs.dc.html'), dcShell('Glyphs', BASE, `
<div class="sheet">
  <div>
    <span class="tape">Plate 04</span>
    <h1 class="plate-title display" style="margin-top:14px">Drawings</h1>
    <p class="plate-note">Single stroke weight, deliberately asymmetric control points, open corners where
      two strokes meet, and a flat tint offset slightly from the outline &mdash; the way a drawing is coloured
      slightly outside its own lines. Strokes take <code class="mono">currentColor</code>, so a glyph picks up
      whatever it sits inside. No emoji anywhere in this product.</p>
  </div>
  <hr class="rule">
  ${GROUPS.map(([title, names]) => `<div>
    <h2 class="section-h">${title}</h2>
    <div class="grid" style="grid-template-columns:repeat(8,1fr);margin-top:8px">${names.map(cell).join('')}</div>
  </div>`).join('')}
  <div>
    <h2 class="section-h">Inheriting colour</h2>
    <div style="display:flex;gap:12px;margin-top:8px">
      ${['c-tomato-ink', 'c-sage-ink', 'c-orange-ink', 'c-plum-ink', 'c-teal-ink', 'c-charcoal']
        .map((c) => `<span style="color:${t(c)}">${glyphSvg('saucepan', 44)}</span>`).join('')}
    </div>
  </div>
</div>`));


// ------------------------------------------------------------------ plate 5
// The Gantt is where the design spends its boldness: masking-tape lane labels and a
// ticket-rail colour strip down each block's left edge. Everything else stays quiet.
const MIN_PX = 26;       // one minute, in px, on this plate
const px = (m) => m * MIN_PX;

const block = ({ startMin, durMin, label, dish, kind, cook }) => {
  const wash = t(`dish-${dish}-wash`);
  const hue = t(`dish-${dish}`);
  const isHold = kind === 'hold';
  const isWash = kind === 'wash';
  const isDone = kind === 'done';
  const fill = isWash ? t('block-wash-fill') : isHold ? wash : wash;
  const edge = isWash ? t('block-wash-stroke') : hue;
  const critical = kind === 'critical';
  return `<div title="${label}" style="
      position:absolute;left:${px(startMin)}px;width:${Math.max(px(durMin), 26)}px;top:6px;bottom:6px;
      background:${fill};
      ${isHold ? `background-image:repeating-linear-gradient(-45deg, ${t('block-hold-hatch')}55 0 2px, transparent 2px 7px);` : ''}
      border-radius:${t('r-xs')};
      border:1px solid ${edge}66;
      ${critical ? `box-shadow:inset 0 0 0 2.5px ${t('block-critical-stroke')};` : ''}
      ${isDone ? 'opacity:0.45;' : ''}
      overflow:hidden;display:flex;align-items:center;padding-left:9px;gap:7px">
    <span style="position:absolute;left:0;top:0;bottom:0;width:4px;background:${edge}"></span>
    <span style="font-size:12px;font-weight:${isHold ? 500 : 700};color:${t('c-charcoal')};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;${isHold ? 'font-style:italic;' : ''}">${label}</span>
    ${cook !== undefined ? `<span style="flex:none;width:7px;height:7px;border-radius:50%;background:${t(`cook-${cook}`)}"></span>` : ''}
  </div>`;
};

const LANES = [
  { group: 'People', label: 'Cook 1', blocks: [
    { startMin: 0, durMin: 2, label: 'Start rice', dish: 1, kind: 'critical', cook: 0 },
    { startMin: 2, durMin: 6, label: 'Cube the chicken', dish: 0, kind: 'active', cook: 0 },
    { startMin: 8, durMin: 3, label: 'Wash board', dish: 0, kind: 'wash', cook: 0 },
    { startMin: 11, durMin: 9, label: 'Sear chicken', dish: 0, kind: 'critical', cook: 0 },
    { startMin: 22, durMin: 4, label: 'Portion', dish: 0, kind: 'active', cook: 0 },
  ] },
  { group: 'People', label: 'Cook 2', blocks: [
    { startMin: 1, durMin: 5, label: 'Wash bok choy', dish: 2, kind: 'active', cook: 1 },
    { startMin: 6, durMin: 3, label: 'Grind coffee', dish: 4, kind: 'active', cook: 1 },
    { startMin: 9, durMin: 2, label: 'Fill cold brew jar', dish: 4, kind: 'active', cook: 1 },
    { startMin: 13, durMin: 4, label: 'Whisk sauce', dish: 3, kind: 'active', cook: 1 },
    { startMin: 19, durMin: 5, label: 'Label and store', dish: 5, kind: 'active', cook: 1 },
  ] },
  { group: 'Heat', label: 'Burner 1', blocks: [
    { startMin: 0, durMin: 2, label: 'Rice on', dish: 1, kind: 'active' },
    { startMin: 2, durMin: 22, label: 'Rice cooks &mdash; hands free', dish: 1, kind: 'hold' },
  ] },
  { group: 'Heat', label: 'Burner 2', blocks: [
    { startMin: 11, durMin: 9, label: 'Chicken', dish: 0, kind: 'active' },
  ] },
  { group: 'Tools', label: 'Frying pan', blocks: [
    { startMin: 11, durMin: 9, label: 'In use', dish: 0, kind: 'active' },
    { startMin: 20, durMin: 3, label: 'Rests', dish: 0, kind: 'hold' },
  ] },
  { group: 'Tools', label: 'Board', blocks: [
    { startMin: 1, durMin: 5, label: 'Greens', dish: 2, kind: 'done' },
    { startMin: 2, durMin: 6, label: 'Chicken &mdash; raw', dish: 0, kind: 'active' },
    { startMin: 8, durMin: 3, label: 'Wash', dish: 0, kind: 'wash' },
  ] },
  { group: 'Cold', label: 'Fridge', blocks: [
    { startMin: 11, durMin: 15, label: 'Cold brew steeps &mdash; overnight', dish: 4, kind: 'hold' },
    { startMin: 22, durMin: 4, label: 'Chilling', dish: 0, kind: 'hold' },
  ] },
];

const TOTAL = 27;
const ruler = Array.from({ length: TOTAL + 1 }, (_, m) => {
  const major = m % 5 === 0;
  return `<div style="position:absolute;left:${px(m)}px;top:0;bottom:0;width:1px;background:${major ? t('c-line-strong') : t('c-line')};opacity:${major ? 1 : 0.6}">
    ${major ? `<span class="mono" style="position:absolute;top:-17px;left:3px;font-size:11px;color:${t('c-ink-soft')}">${m}</span>` : ''}
  </div>`;
}).join('');

const laneRow = (lane, i) => {
  const prev = LANES[i - 1];
  const newGroup = !prev || prev.group !== lane.group;
  return `${newGroup ? `<div style="grid-column:1/-1;padding:14px 0 4px"><span class="mono" style="font-size:11px;font-weight:700;color:${t('c-ink-soft')}">${lane.group}</span></div>` : ''}
  <div style="display:flex;align-items:center;height:46px;padding-right:14px">
    <span class="tape" style="transform:rotate(${i % 2 ? -1.6 : 1.2}deg)">${lane.label}</span>
  </div>
  <div style="position:relative;height:46px;background:${t('c-cream-deep')};border-radius:${t('r-xs')};overflow:hidden">
    <div style="position:absolute;inset:0;opacity:0.5">${ruler}</div>
    ${lane.blocks.map(block).join('')}
  </div>`;
};

const key = (label, swatchHtml, note) => `<div style="display:flex;gap:11px;align-items:flex-start">
  <span style="flex:none;margin-top:2px">${swatchHtml}</span>
  <span><strong style="font-size:13px">${label}</strong><br><span style="font-size:12.5px;color:${t('c-ink-soft')}">${note}</span></span>
</div>`;
const sw = (style) => `<span style="display:block;width:36px;height:20px;border-radius:5px;${style}"></span>`;

writeFileSync(path.join(out, 'Timeline.dc.html'), dcShell('Timeline', BASE, `
<div class="sheet">
  <div>
    <span class="tape">Plate 05</span>
    <h1 class="plate-title display" style="margin-top:14px">The timeline</h1>
    <p class="plate-note">This is the payoff screen and the only place the design raises its voice. Lane
      labels are masking tape, the way a working kitchen actually labels things, and each block carries its
      dish colour as a strip down the left edge like a ticket on the rail &mdash; so the dish reads instantly
      without tinting the whole block and fighting the label for contrast.</p>
  </div>
  <div style="display:grid;grid-template-columns:118px 1fr;gap:6px 0;margin-top:4px;padding-top:20px">
    ${LANES.map(laneRow).join('')}
  </div>
  <hr class="rule">
  <div>
    <h2 class="section-h">Reading it</h2>
    <div class="grid" style="grid-template-columns:repeat(3,1fr);margin-top:10px">
      ${key('Active work', sw(`background:${t('dish-0-wash')};border:1px solid ${t('dish-0')}66;border-left:4px solid ${t('dish-0')}`), 'Somebody is doing this. The left strip is the dish.')}
      ${key('Passive &mdash; hands free', sw(`background:${t('dish-1-wash')};background-image:repeating-linear-gradient(-45deg, ${t('block-hold-hatch')}55 0 2px, transparent 2px 7px);border:1px solid ${t('dish-1')}66;border-left:4px solid ${t('dish-1')}`), 'Equipment is busy, you are not. Hatched, so it survives greyscale.')}
      ${key('On the critical path', sw(`background:${t('dish-0-wash')};box-shadow:inset 0 0 0 2.5px ${t('block-critical-stroke')};border-left:4px solid ${t('dish-0')}`), 'Slip this and the whole session finishes later.')}
      ${key('Washing up', sw(`background:${t('block-wash-fill')};border:1px solid ${t('block-wash-stroke')}66;border-left:4px solid ${t('block-wash-stroke')}`), 'Inserted by the compiler for safety. The one cool colour in the palette.')}
      ${key('Already done', sw(`background:${t('dish-2-wash')};border-left:4px solid ${t('dish-2')};opacity:0.45`), 'Dimmed as cooking mode moves past it.')}
      ${key('Whose hands', `<span style="display:flex;gap:5px;margin-top:5px">${[0, 1].map((c) => `<span style="width:11px;height:11px;border-radius:50%;background:${t(`cook-${c}`)}"></span>`).join('')}</span>`, 'Cook colours come from their own ramp, never the dish ramp.')}
    </div>
  </div>
  <div style="padding:20px 24px;background:${t('c-sage-wash')};border-radius:${t('r-lg')}">
    <div class="display" style="font-size:25px">Why this order?</div>
    <ul style="margin:10px 0 0;padding-left:20px;font-size:14px;line-height:1.7">
      <li>Rice starts first because it is 24 minutes of nobody's attention &mdash; everything else fits inside it.</li>
      <li>The board is washed between the chicken and anything raw. That is not negotiable and costs 3 minutes.</li>
      <li>Cook 2 grinds coffee in the gap while the chicken sears, because the cold brew is free time and needs to start tonight.</li>
    </ul>
  </div>
</div>`));

console.log('wrote 5 artboards');


