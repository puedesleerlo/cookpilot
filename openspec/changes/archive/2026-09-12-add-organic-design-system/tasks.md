## 1. Design canvas

- [x] 1.1 Produce the design canvas in Claude Design: palette and contrast plate, type specimen, component plate, glyph sheet, and the timeline block-treatment plate.
- [x] 1.2 Reconcile the canvas with `design.md`; record any deviation in `DECISIONS.md`.

## 2. Token layer

- [x] 2.1 Add `src/ui/tokens.css`: colour, derived tints, dish and cook ramps, type scale, spacing, irregular radii, elevation, motion durations and easings.
- [x] 2.2 Wire `tailwind.config.js` to read the tokens so `bg-tomato` and `var(--c-tomato)` resolve to the same value.
- [x] 2.3 Add `src/ui/theme.ts`: deterministic `dishHue(dishId)` and `cookColor(index)` allocators.

## 3. Typography

- [x] 3.1 Self-host Fraunces and Rubik as subset variable woff2 in `src/assets/fonts/`; declare `@font-face` with `font-display: swap` and preload both.
- [x] 3.2 Set the type scale, tabular figures for numerals, and a 68-character measure cap.

## 4. Illustration set

- [x] 4.1 Author `src/assets/glyphs/` covering every ingredient category and every equipment kind, in the hand-drawn idiom from `design.md`.
- [x] 4.2 Author the cook avatar set (4 variants) and the empty, compiling, success and impossible state drawings.
- [x] 4.3 Add `src/ui/primitives/Glyph.tsx` with a typed registry so a missing name is a compile error.

## 5. Component primitives

- [x] 5.1 `Button`, `Chip`, `Card`, `Field`, `Toggle` — irregular radii, visible focus ring, 44px targets where cooking mode uses them.
- [x] 5.2 `Stat`, `Sheet`, `ProgressRail`, `Blobs`, `Grain` — with decoration marked `aria-hidden`.
- [x] 5.3 `CompileCurtain` — the single orchestrated compile sequence, reduced-motion aware.

## 6. Guardrails

- [x] 6.1 Test: no hex/rgb/hsl literal appears in `src/ui/**` outside `tokens.css`.
- [x] 6.2 Test: no emoji codepoint appears in `src/ui/**` or `src/assets/**`.
- [x] 6.3 Test: every ingredient category and equipment kind resolves to a glyph.
- [x] 6.4 Test: documented token pairings meet 4.5:1 body / 3:1 large text contrast.
- [x] 6.5 Test: `Card` renders non-uniform corner radii; primitives expose focus styles.

## 7. Close out

- [x] 7.1 `npm run lint`, typecheck, `npm test`, `npm run build` all clean.
- [x] 7.2 `openspec validate add-organic-design-system --strict` clean.
- [x] 7.3 Log decisions; archive; commit.
