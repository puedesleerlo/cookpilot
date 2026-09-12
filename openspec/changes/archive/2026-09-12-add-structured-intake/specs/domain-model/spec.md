# domain-model

## ADDED Requirements

### Requirement: The lexicon SHALL support search without becoming a parser
The lexicon MUST expose a search over canonical names and synonyms for autocomplete, and a
default urgency derived from `keepsDays`. Both are dictionary lookups over a whole query
term; neither may be used to segment a sentence into ingredients.

#### Scenario: Searching
- **WHEN** the lexicon is searched for a partial term
- **THEN** matching entries are returned, prefix matches first, capped to a usable number

#### Scenario: Default urgency from shelf life
- **WHEN** an entry keeps for two days or fewer
- **THEN** its default urgency is use-today

#### Scenario: No shelf life recorded
- **WHEN** an entry has no `keepsDays`
- **THEN** its default urgency is use-soon, never use-today
