## Why

Kitchen Compiler has to feel like a playful kitchen control center, not enterprise
scheduling software — and it has to reach the aha moment (a Gantt chart with two lanes
filling each other's dead time) in under ninety seconds. Both of those are design
problems, and both get harder if each screen invents its own spacing, colour and
illustration on the way.

Building the system before the screens also settles the thing every later change would
otherwise have to re-litigate: what a passive block looks like, what colour a cook is,
how a wash task reads differently from a cooking task. Those are timeline semantics as
much as decoration.

## What Changes

- Establish the token layer: colour, type scale, spacing, irregular radii, elevation and
  motion, defined once as CSS custom properties and exposed to Tailwind so a component
  can never hard-code a hex value.
- Adopt two typefaces with clearly separated jobs — a soft, slightly irregular display
  face for screen titles and compile moments, and a warm sans with strong numerals for
  UI and the large kitchen-legible timers.
- Commission the vector set that carries the personality: hand-drawn illustrations for
  every ingredient category, every equipment kind, a cook avatar set, and the empty,
  compiling, success and impossible states. No emoji placeholders anywhere.
- Ship component primitives the screens compose from: `Button`, `Chip`, `Card`, `Field`,
  `Toggle`, `Stat`, `Sheet`, `ProgressRail`, `Glyph`, and the `CompileCurtain` used for
  the compile moment.
- Encode timeline semantics as tokens now — dish hues, the hatched passive fill, the
  critical-path stroke, the wash-task treatment — so the Gantt change consumes them
  rather than inventing them.
- Respect `prefers-reduced-motion` throughout, and meet a visible-focus and contrast
  floor as a property of the primitives rather than a per-screen effort.

## Capabilities

### New Capabilities
- `design-system`: the visual language — tokens, typography, illustration set, component
  primitives, motion policy and accessibility floor — that every screen is built from.

### Modified Capabilities
None.

## Impact

- Creates `src/ui/tokens.css`, `src/ui/primitives/`, `src/assets/`.
- Extends `tailwind.config.js` to read from the token layer.
- Adds two web font families, self-hosted so the app keeps working offline.
- No behavioural change; no screen is wired up yet.
