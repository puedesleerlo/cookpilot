## Why

"Tell me what you have" leads to a screen that says the screen is not built. The example
session proves the compiler works on someone else's fridge; this is the one that makes it
work on yours.

## What Changes

- A structured pantry editor: type, pick from the lexicon, and the ingredient lands as a
  chip with its category, its allergens and a default urgency derived from how fast the
  thing actually goes off.
- Keep what the lexicon does not know. An unrecognised ingredient is added, flagged, and
  used — it just cannot contribute to matching a recipe that never heard of it either.
- Urgency is one tap per chip, because "this has to go today" is the single most valuable
  thing the user knows and the hardest thing to infer.
- The kitchen and the crew are stated with defaults and shown as assumptions, so they can
  be corrected without being interrogated first.
- Compile from the form, into the same timeline the example session lands on.

This is deliberately **not** a natural-language intake. The consolidated delta deleted the
free-text fallback parser; the structured form is the fallback. No lexicon-driven quantity
extraction, no keyword slot matching, no guessing what a sentence meant.

## Capabilities

### New Capabilities
- `structured-intake`: how a fridge, a kitchen and a crew are stated, corrected and
  compiled.

### Modified Capabilities
- `domain-model`: the lexicon gains a search for autocomplete and a shelf-life-derived
  default urgency. Both are dictionary lookups, not parsing.

## Impact

- Fills `apps/web/src/ui/screens/Intake.tsx` and the pantry editing already stubbed into
  the session store.
- Widens the assumed kitchen to what a small kitchen actually holds, because the previous
  default was missing the pot and the colander and quietly disqualified half the registry.
