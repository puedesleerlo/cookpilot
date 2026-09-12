# structured-intake Specification

## Purpose
TBD - created by archiving change add-structured-intake. Update Purpose after archive.
## Requirements
### Requirement: Intake SHALL be structured, never parsed
The pantry MUST be built from discrete choices — a search over the canonical lexicon, or an
explicit "add it anyway" — and MUST NOT be derived by parsing a free-text sentence. No
quantity extraction from prose, no keyword slot matching, no inference about what a phrase
meant.

#### Scenario: Picking a known ingredient
- **WHEN** a search matches a lexicon entry and it is chosen
- **THEN** the ingredient is added with that entry's canonical name, category and allergens

#### Scenario: Something the lexicon has never heard of
- **WHEN** a term matches nothing and is added anyway
- **THEN** it is kept verbatim, marked as not recognised, and included in the pantry
- **AND** it is never silently replaced with a similar known ingredient

### Requirement: Search SHALL find an ingredient by any name it is known by
Lexicon search MUST match canonical names and synonyms, and MUST rank a name that starts
with the query above one that merely contains it.

#### Scenario: Searching by a synonym
- **WHEN** the query is "scallions"
- **THEN** spring onions is offered

#### Scenario: Ranking
- **WHEN** the query is "chick"
- **THEN** chicken breast appears before an entry that only contains "chick" later on

#### Scenario: Already in the pantry
- **WHEN** an ingredient that is already in the pantry matches the query
- **THEN** it is not offered again

### Requirement: Urgency SHALL default from shelf life and stay correctable
Each ingredient MUST arrive with an urgency derived from how long the lexicon says it keeps,
and MUST be changeable in one action. Ingredients the lexicon does not know MUST default to
the middle, not to urgent.

#### Scenario: Fish
- **WHEN** salmon is added
- **THEN** its urgency defaults to use-today

#### Scenario: Rice
- **WHEN** jasmine rice is added
- **THEN** its urgency defaults to not-urgent

#### Scenario: Correcting it
- **WHEN** an ingredient's urgency control is activated
- **THEN** the urgency changes and the plan that follows reflects it

### Requirement: The kitchen and crew SHALL be stated as assumptions
Equipment, time, servings, crew size and restrictions MUST be pre-filled and MUST be visibly
marked as assumed until the user states them. Compiling MUST NOT be blocked on any of them.

#### Scenario: Compiling without touching the kitchen
- **WHEN** a pantry is entered and nothing else is
- **THEN** the session compiles against the assumed kitchen

#### Scenario: Correcting an assumption
- **WHEN** a piece of equipment is turned off
- **THEN** recipes that need it stop being offered

### Requirement: Compiling SHALL be reachable only when there is food
The compile action MUST be disabled while the pantry is empty, and MUST say what is missing
rather than failing silently.

#### Scenario: An empty fridge
- **WHEN** no ingredients have been added
- **THEN** compiling is unavailable and the screen says food is what is missing

### Requirement: A compiled session SHALL remain editable
Returning to intake from a compiled session MUST preserve the pantry, the kitchen and the
crew as they were, so a correction is a correction and not a re-entry.

#### Scenario: Going back to change one thing
- **WHEN** a session is compiled and the fridge is re-opened
- **THEN** every ingredient is still there with its urgency intact

