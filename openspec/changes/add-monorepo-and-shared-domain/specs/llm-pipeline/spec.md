## MODIFIED Requirements

### Requirement: The application works with no model provider reachable

Where the model provider is unreachable, unconfigured or disabled, the system SHALL remain
fully usable: the structured intake form, seed recipe packs, deterministic ranking,
template explanations and the scheduler SHALL between them reach a compiled schedule.

The demo scenario SHALL compile end to end with the API origin blocked.

This requirement no longer rests on a natural-language fallback parser. The fallback for
stage L1 is the structured form, which needs no parsing.

#### Scenario: No provider means no call
- **WHEN** the model provider is disabled
- **THEN** no request is attempted and each stage reports that it used its primary deterministic path or was skipped

#### Scenario: The demo compiles with the API blocked
- **WHEN** the demo scenario is started with the API origin unreachable
- **THEN** a complete schedule is produced in the browser from bundled seed packs

#### Scenario: Form and voice produce the same constraints
- **WHEN** equivalent answers are given through the structured form and through the voice interview
- **THEN** the resulting `Constraints` objects are identical

## REMOVED Requirements

### Requirement: Stage L3 normalizes recipe text into RecipeIR
**Reason**: The consolidated delta reorders this stage. Normalization is no longer
model-first: structured `schema.org/Recipe` markup extraction becomes the primary path and
the model handles only unmarked pages. The replacement requirement is introduced with the
structured-markup extractor and the ingestion worker, where the ordering can be specified
against a measured hit rate rather than assumed.

**Migration**: The existing L3 implementation and its deterministic parser are removed.
Recipe text import is unavailable between this change and `add-structured-markup-extractor`;
pack JSON import, which needs no model, continues to work throughout.
