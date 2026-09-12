## ADDED Requirements

### Requirement: Colour exists only as tokens

The system SHALL define every colour once, as a CSS custom property on `:root`, and
components SHALL reference tokens rather than literal colour values.

The ground SHALL be cream, the primary accent tomato, with sage, warm orange and charcoal
completing the core palette.

#### Scenario: No component hard-codes a colour
- **WHEN** the token audit test scans `src/ui/**` for hex literals, `rgb(` or `hsl(` outside the token file
- **THEN** it finds none

#### Scenario: Tokens are readable from both CSS and Tailwind
- **WHEN** a component uses the Tailwind class `bg-tomato`
- **THEN** it resolves to the same custom property that `var(--c-tomato)` resolves to

### Requirement: One variable superfamily, three separated voices

The system SHALL express its typography through a single variable superfamily configured
into three visually distinct voices: a rounded, casual display voice for screen titles,
dish names and compile moments; a linear voice for all interface text and the large timer
numerals; and a monospaced voice reserved for compiler status language and the timeline's
time ruler.

Each voice SHALL be reachable as a named token, and the three SHALL be distinguishable
from one another at a glance.

Fonts SHALL be self-hosted so that typography survives with no network access.

#### Scenario: Typography works offline
- **WHEN** the application is loaded with no network connection
- **THEN** every voice renders from a bundled font file rather than falling back to a system face

#### Scenario: The three voices are distinguishable
- **WHEN** the display, interface and compiler voices are rendered side by side at the same size
- **THEN** they differ in letterform construction, not only in weight

#### Scenario: The monospaced voice is reserved
- **WHEN** the token audit scans for use of the monospaced voice
- **THEN** it appears only in compile status copy and the timeline time ruler

#### Scenario: Timer numerals are legible at arm's length
- **WHEN** cooking mode renders a countdown
- **THEN** the numeral is set at no less than 4rem in the interface voice's heaviest weight, with tabular figures so the width does not jitter as digits change

### Requirement: Shape language avoids perfect geometry

Surfaces SHALL use non-uniform corner radii drawn from a radius token set, so that no
card is a perfect rounded rectangle.

The application background SHALL carry soft organic blob shapes and a subtle paper grain
overlay. Both SHALL be decorative and SHALL be hidden from assistive technology.

#### Scenario: Cards are irregular
- **WHEN** a `Card` renders
- **THEN** its four corner radii are not all equal

#### Scenario: Decoration is not announced
- **WHEN** a screen reader traverses the page
- **THEN** the grain overlay and blob shapes are not reachable, carrying `aria-hidden`

### Requirement: The illustration set replaces emoji entirely

The system SHALL provide hand-drawn SVG illustrations for every ingredient category,
every equipment kind used by the seed packs, a cook avatar set of at least four variants,
and the empty, compiling, success and impossible states.

The application SHALL NOT ship emoji as a stand-in for an illustration.

#### Scenario: Every ingredient category has a glyph
- **WHEN** the glyph registry is asked for each member of the ingredient category enum
- **THEN** every lookup returns a drawing, and none falls through to a placeholder

#### Scenario: Every equipment kind has a glyph
- **WHEN** the glyph registry is asked for each member of the equipment kind enum
- **THEN** every lookup returns a drawing

#### Scenario: No emoji in the interface
- **WHEN** the asset audit test scans `src/ui/**` and `src/assets/**` for emoji codepoints
- **THEN** it finds none

#### Scenario: Glyphs inherit surrounding colour
- **WHEN** a glyph is rendered inside an element with a text colour set
- **THEN** its strokes adopt that colour via `currentColor`

### Requirement: Timeline semantics are tokens, not per-chart decisions

The system SHALL define, as tokens, the visual treatment for: each dish's hue, a passive
`hold` phase, a task on the critical path, an inserted wash task, a completed task, and
each cook's identifying colour.

Dish hues SHALL be assigned deterministically from the dish id so that the same plan
renders identically on every device.

#### Scenario: The same dish is the same colour everywhere
- **WHEN** a dish id is passed to the hue allocator twice
- **THEN** both calls return the same token

#### Scenario: Passive time is distinguishable without colour alone
- **WHEN** a `hold` phase renders
- **THEN** it is drawn with a hatched fill pattern in addition to a lighter tint, so the distinction survives greyscale and colour-blindness

#### Scenario: The critical path is distinguishable without colour alone
- **WHEN** a task on the critical path renders
- **THEN** it carries a distinct stroke treatment in addition to any colour change

### Requirement: Motion is deliberate and respects user preference

Motion SHALL be reserved for state changes the user caused or needs to notice: chips
settling in, Gantt blocks arriving during compile, and the compile-success moment.

When `prefers-reduced-motion: reduce` is set, the system SHALL render the same end states
with no movement and no scaling.

#### Scenario: Reduced motion removes movement, not information
- **WHEN** the user prefers reduced motion and a schedule compiles
- **THEN** the timeline appears fully formed with no sliding or scaling, and the success message is still shown

#### Scenario: The compile moment is a single orchestrated sequence
- **WHEN** compilation runs
- **THEN** the interface shows one progressing sequence of stages rather than independent animations per element

### Requirement: Accessibility floor is a property of the primitives

Every interactive primitive SHALL have a visible keyboard focus indicator that does not
rely on colour contrast alone, a hit target of at least 44 by 44 CSS pixels in cooking
mode, and an accessible name.

Body text SHALL meet a contrast ratio of at least 4.5 to 1 against its background, and
large display text at least 3 to 1.

#### Scenario: Focus is visible
- **WHEN** a user tabs to any `Button`, `Chip` or `Toggle`
- **THEN** a focus ring is rendered that is offset from the control's own edge

#### Scenario: Core palette pairings pass contrast
- **WHEN** the contrast test evaluates each documented foreground/background token pairing
- **THEN** every body-text pairing reaches 4.5 to 1 and every large-text pairing reaches 3 to 1

#### Scenario: Cooking-mode controls are reachable with wet hands
- **WHEN** cooking mode renders its Done, Running Late and Skip controls
- **THEN** each control measures at least 44 by 44 CSS pixels

### Requirement: Interface voice uses restrained compiler language

Progress and status copy SHALL use compiler vocabulary — reading the pantry, checking
dependencies, allocating cookware, optimizing parallel tasks, compilation successful —
in sentence case, without exposing technical identifiers to the user.

Error and empty states SHALL say what happened and what to do next, in the interface's
voice, without apologising.

#### Scenario: Compile stages read as kitchen language
- **WHEN** the compile sequence runs
- **THEN** each stage label is a short sentence-case phrase and none contains a type name, file path or error code

#### Scenario: An empty pantry invites action
- **WHEN** the pantry has no ingredients
- **THEN** the empty state names one concrete next action rather than describing the absence
