/**
 * Guardrails for the design system. These are the rules that rot silently otherwise:
 * a hex literal creeping into a component, an emoji standing in for a drawing, a new
 * equipment kind with no illustration, a colour pairing that quietly fails contrast.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import {
  EquipmentKindSchema,
  IngredientCategorySchema,
} from '@kitchen/domain';
import { EQUIPMENT_GLYPH, GLYPH_NAMES, INGREDIENT_GLYPH, cookGlyph } from '@/ui/primitives';
import { cookColor, dishHue, dishHueIndex, dishWash } from '@/ui/theme';

const root = process.cwd();
const TOKENS = path.join(root, 'apps/web/src/ui/tokens.css');
const tokensCss = readFileSync(TOKENS, 'utf8');

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });

const tokenValue = (name: string): string => {
  const m = new RegExp(`^\\s*${name}:\\s*([^;]+);`, 'm').exec(tokensCss);
  if (!m?.[1]) throw new Error(`token ${name} is not defined`);
  return m[1].trim();
};

/** Resolve one level of `var(--x)` indirection. */
const resolved = (name: string, depth = 0): string => {
  const v = tokenValue(name);
  const m = /^var\((--[a-z0-9-]+)\)$/.exec(v);
  return m?.[1] && depth < 6 ? resolved(m[1], depth + 1) : v;
};

const luminance = (hex: string): number => {
  const n = hex.replace('#', '');
  const ch = [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16) / 255);
  const [r, g, b] = ch.map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: string, b: string): number => {
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};

describe('colour exists only as tokens', () => {
  it('finds no colour literal under src/ui outside the token file', () => {
    const offenders: string[] = [];
    for (const file of walk(path.join(root, 'apps/web/src/ui'))) {
      if (file === TOKENS || /\.test\.tsx?$/.test(file)) continue;
      if (!/\.(ts|tsx|css)$/.test(file)) continue;
      const src = readFileSync(file, 'utf8');
      for (const [i, line] of src.split('\n').entries()) {
        // The grain overlay is an inline SVG data URI with no colour in it; skip data URIs.
        const scrubbed = line.replace(/data:image\/svg\+xml,[^"']*/g, '');
        if (/#[0-9a-fA-F]{3,8}\b/.test(scrubbed) || /\b(rgba?|hsla?)\(/.test(scrubbed)) {
          offenders.push(`${path.relative(root, file)}:${i + 1}  ${line.trim().slice(0, 80)}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('exposes each colour to Tailwind through the same custom property', () => {
    const tailwind = readFileSync(path.join(root, 'apps/web/tailwind.config.js'), 'utf8');
    expect(tailwind).toContain("tomato: 'var(--c-tomato)'");
    expect(tokensCss).toMatch(/--c-tomato:\s*#e2553d/i);
  });
});

describe('shape language avoids perfect geometry', () => {
  it.each(['--r-xs', '--r-sm', '--r-md', '--r-lg', '--r-chip'])('%s is non-uniform', (token) => {
    const corners = tokenValue(token).split(/\s+/);
    expect(corners).toHaveLength(4);
    expect(new Set(corners).size).toBeGreaterThan(1);
  });
});

describe('the illustration set replaces emoji entirely', () => {
  it('has a drawing for every ingredient category', () => {
    for (const category of IngredientCategorySchema.options) {
      expect(GLYPH_NAMES).toContain(INGREDIENT_GLYPH[category]);
    }
  });

  it('has a drawing for every equipment kind', () => {
    for (const kind of EquipmentKindSchema.options) {
      expect(GLYPH_NAMES).toContain(EQUIPMENT_GLYPH[kind]);
    }
  });

  it('has at least four cook avatars and the four session states', () => {
    expect(new Set([0, 1, 2, 3].map(cookGlyph)).size).toBe(4);
    for (const s of ['state-empty', 'state-compiling', 'state-success', 'state-impossible']) {
      expect(GLYPH_NAMES).toContain(s);
    }
  });

  it('ships no emoji anywhere in the interface or the assets', () => {
    const offenders: string[] = [];
    const emoji = /\p{Extended_Pictographic}/u;
    for (const dir of ['apps/web/src/ui', 'apps/web/src/assets']) {
      for (const file of walk(path.join(root, dir))) {
        if (!/\.(ts|tsx|css|json|svg)$/.test(file)) continue;
        if (emoji.test(readFileSync(file, 'utf8'))) offenders.push(path.relative(root, file));
      }
    }
    expect(offenders).toEqual([]);
  });

  it('draws strokes with currentColor so a glyph inherits its context', () => {
    const glyph = readFileSync(path.join(root, 'apps/web/src/ui/primitives/Glyph.tsx'), 'utf8');
    expect(glyph).toContain('stroke="currentColor"');
  });
});

describe('timeline semantics are deterministic tokens', () => {
  it('gives the same dish the same hue every time', () => {
    expect(dishHue('dish:seed:chicken-bok-choy')).toBe(dishHue('dish:seed:chicken-bok-choy'));
    expect(dishWash('dish:a')).toBe(`var(--dish-${dishHueIndex('dish:a')}-wash)`);
  });

  it('spreads dishes across the ramp rather than collapsing them', () => {
    const ids = ['dish:rice', 'dish:chicken', 'dish:salmon', 'dish:sauce', 'dish:coldbrew', 'dish:agua'];
    expect(new Set(ids.map(dishHueIndex)).size).toBeGreaterThanOrEqual(4);
  });

  it('draws cooks from a separate ramp so a cook never reads as a dish', () => {
    const cooks = new Set([0, 1, 2, 3].map(cookColor));
    const dishes = new Set([0, 1, 2, 3, 4, 5].map((i) => `var(--dish-${i})`));
    for (const c of cooks) expect(dishes.has(c)).toBe(false);
  });

  it('distinguishes passive time by pattern, not colour alone', () => {
    expect(tokenValue('--block-hold-hatch')).toBeTruthy();
    const theme = readFileSync(path.join(root, 'apps/web/src/ui/theme.ts'), 'utf8');
    expect(theme).toContain('repeating-linear-gradient');
  });

  it('distinguishes the critical path by stroke, not colour alone', () => {
    expect(parseFloat(tokenValue('--block-critical-stroke-width'))).toBeGreaterThan(1);
  });

  it('keeps hold blocks wide enough that the hatch does not moire', () => {
    expect(parseFloat(tokenValue('--block-min-width'))).toBeGreaterThanOrEqual(24);
  });
});

describe('contrast is measured, not eyeballed', () => {
  const CREAM = '--c-cream';
  const body: [string, string][] = [
    ['--c-charcoal', CREAM],
    ['--c-ink-soft', CREAM],
    ['--c-tomato-ink', CREAM],
    ['--c-sage-ink', CREAM],
    ['--c-orange-ink', CREAM],
    ['--c-plum-ink', CREAM],
    ['--c-teal-ink', CREAM],
    ['--c-mustard-ink', CREAM],
    ['--c-charcoal', '--c-cream-deep'],
    ['--c-charcoal', '--dish-0-wash'],
    ['--c-charcoal', '--dish-1-wash'],
    ['--c-charcoal', '--dish-2-wash'],
    ['--c-charcoal', '--dish-3-wash'],
    ['--c-charcoal', '--dish-4-wash'],
    ['--c-charcoal', '--dish-5-wash'],
    ['--c-cream', '--c-tomato-deep'],
    ['--c-cream', '--c-charcoal'],
  ];

  it.each(body)('body text %s on %s reaches 4.5:1', (fg, bg) => {
    expect(contrast(resolved(fg), resolved(bg))).toBeGreaterThanOrEqual(4.5);
  });

  const large: [string, string][] = [
    ['--c-tomato', CREAM],
    ['--c-plum', CREAM],
    ['--c-teal', CREAM],
    ['--c-sage', CREAM],
  ];

  it.each(large)('large text %s on %s reaches 3:1', (fg, bg) => {
    expect(contrast(resolved(fg), resolved(bg))).toBeGreaterThanOrEqual(3);
  });

  it('keeps tomato out of body copy, where it would fail', () => {
    expect(contrast(resolved('--c-tomato'), resolved(CREAM))).toBeLessThan(4.5);
    expect(tokensCss).toContain('large-text only');
  });

  it('uses an off-palette focus colour so focus never reads as decoration', () => {
    const focus = resolved('--c-focus');
    for (const t of ['--c-tomato', '--c-sage', '--c-orange']) {
      expect(focus).not.toBe(resolved(t));
    }
    expect(contrast(focus, resolved(CREAM))).toBeGreaterThanOrEqual(3);
  });
});

describe('motion respects user preference', () => {
  it('collapses every duration under prefers-reduced-motion', () => {
    const block = /@media \(prefers-reduced-motion: reduce\) \{([\s\S]*?)\n\}/.exec(tokensCss)?.[1] ?? '';
    for (const d of ['--d-fast', '--d-base', '--d-slow']) {
      expect(block).toContain(`${d}: 1ms`);
    }
  });
});

describe('typography', () => {
  it('self-hosts the family so it survives offline', () => {
    expect(tokensCss).toContain("src: url('../assets/fonts/recursive-latin.woff2')");
    expect(statSync(path.join(root, 'apps/web/src/assets/fonts/recursive-latin.woff2')).size).toBeGreaterThan(50_000);
  });

  it('defines three voices that differ by axis, not only weight', () => {
    const display = tokenValue('--v-display');
    const ui = tokenValue('--v-ui');
    const compiler = tokenValue('--v-compiler');
    expect(new Set([display, ui, compiler]).size).toBe(3);
    expect(compiler).toContain("'MONO' 1");
    expect(display).toContain("'CASL' 1");
  });

  it('sets timer numerals large, heavy and tabular', () => {
    expect(tokensCss).toMatch(/\.voice-numeral[\s\S]*?font-variant-numeric: tabular-nums/);
    // The spec floor is 4rem: readable across a kitchen at arm's length.
    expect(parseFloat(resolved('--t-timer'))).toBeGreaterThanOrEqual(4);
    expect(tokensCss).toMatch(/\.voice-numeral[\s\S]*?font-weight: 800/);
  });

  it('reserves the compiler voice for compile copy and the time ruler', () => {
    const uses: string[] = [];
    for (const file of walk(path.join(root, 'apps/web/src/ui'))) {
      if (!/\.tsx$/.test(file)) continue;
      if (/voice-compiler|font-compiler/.test(readFileSync(file, 'utf8'))) {
        uses.push(path.basename(file));
      }
    }
    expect(uses.sort()).toEqual(['CompileCurtain.tsx']);
  });
});
