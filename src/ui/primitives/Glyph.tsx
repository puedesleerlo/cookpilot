import glyphData from '@/assets/glyphs/glyphs.json';
import type { EquipmentKind, IngredientCategory } from '@/domain';

/**
 * The hand-drawn illustration set. Strokes use `currentColor` so a glyph adopts whatever
 * it sits inside; fills are a soft tint offset from the outline, the way a drawing is
 * coloured slightly outside its own lines.
 *
 * The registry is typed from the JSON, so `<Glyph name="frying-pn" />` is a compile
 * error rather than an empty box.
 */

type GlyphRecord = { label: string; fill: string[]; stroke: string[]; box?: number };
const glyphs = glyphData as Record<string, GlyphRecord>;

export type GlyphName = keyof typeof glyphData;

export const GLYPH_NAMES = Object.keys(glyphData) as GlyphName[];

/** Identity maps, written out so a new enum member without a drawing fails to compile. */
export const INGREDIENT_GLYPH: Record<IngredientCategory, GlyphName> = {
  'protein-raw': 'protein-raw',
  'protein-cooked': 'protein-cooked',
  produce: 'produce',
  grain: 'grain',
  dairy: 'dairy',
  pantry: 'pantry',
  aromatic: 'aromatic',
  'beverage-base': 'beverage-base',
};

export const EQUIPMENT_GLYPH: Record<EquipmentKind, GlyphName> = {
  burner: 'burner',
  'oven-rack': 'oven-rack',
  'frying-pan': 'frying-pan',
  saucepan: 'saucepan',
  pot: 'pot',
  wok: 'wok',
  'sheet-pan': 'sheet-pan',
  kettle: 'kettle',
  'cutting-board': 'cutting-board',
  knife: 'knife',
  'mixing-bowl': 'mixing-bowl',
  blender: 'blender',
  colander: 'colander',
  grater: 'grater',
  'measuring-cup': 'measuring-cup',
  pitcher: 'pitcher',
  jar: 'jar',
  'storage-container': 'storage-container',
  'fridge-shelf': 'fridge-shelf',
  'freezer-shelf': 'freezer-shelf',
  sink: 'sink',
};

export const COOK_GLYPHS = ['cook-0', 'cook-1', 'cook-2', 'cook-3'] as const satisfies readonly GlyphName[];

export const cookGlyph = (index: number): GlyphName =>
  COOK_GLYPHS[((index % COOK_GLYPHS.length) + COOK_GLYPHS.length) % COOK_GLYPHS.length]!;

export const glyphLabel = (name: GlyphName): string => glyphs[name]!.label;

type GlyphProps = {
  name: GlyphName;
  size?: number;
  /** Omit for decorative use; supply when the drawing is the only carrier of meaning. */
  title?: string;
  className?: string;
  strokeWidth?: number;
};

export const Glyph = ({ name, size = 24, title, className, strokeWidth = 1.6 }: GlyphProps) => {
  const glyph = glyphs[name]!;
  const box = glyph.box ?? 32;
  return (
    <svg
      viewBox={`0 0 ${box} ${box}`}
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      focusable="false"
    >
      {title ? <title>{title}</title> : null}
      {glyph.fill.map((d) => (
        <path key={`f${d.slice(0, 24)}`} d={d} fill="currentColor" opacity={0.11} stroke="none" />
      ))}
      {glyph.stroke.map((d) => (
        <path key={`s${d.slice(0, 24)}`} d={d} />
      ))}
    </svg>
  );
};
