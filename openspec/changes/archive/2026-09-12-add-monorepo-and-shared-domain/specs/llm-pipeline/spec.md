## REMOVED Requirements

### Requirement: The application works with no API key
**Reason**: There is no longer an API key to be without. Gemini on Vertex authenticates
through the Cloud Run service account's Application Default Credentials, so the model
provider contributes zero secrets. The requirement is restated below in terms of what can
actually fail — the provider being unreachable — and, crucially, without resting on a
natural-language fallback parser, which the delta deletes.

**Migration**: `VITE_ANTHROPIC_API_KEY` is removed from the codebase and from the bundle
scanner's allowlist of things that must never appear. Stages that previously reported
`source: 'fallback'` when the key was absent now take their deterministic primary path.

### Requirement: Stage L3 normalizes recipe text into RecipeIR
**Reason**: The consolidated delta reorders this stage. Normalization is no longer
model-first: structured `schema.org/Recipe` markup extraction becomes the primary path and
the model handles only unmarked pages. The replacement requirement is introduced with the
structured-markup extractor and the ingestion worker, where the ordering can be specified
against a measured hit rate rather than an assumption.

**Migration**: The L3 implementation and its deterministic text parser are deleted. Recipe
*text* import is unavailable between this change and `add-structured-markup-extractor`;
pack JSON import, which needs no model, continues to work throughout.

## ADDED Requirements

### Requirement: The application works with no model provider reachable

Where the model provider is unreachable, unconfigured or disabled, the system SHALL remain
fully usable: the structured intake form, bundled seed packs, deterministic ranking,
template explanations and the scheduler SHALL between them reach a compiled schedule.

The demo scenario SHALL compile end to end with the API origin blocked.

This requirement does not rest on a natural-language fallback parser. The fallback for
stage L1 is the structured form, which needs no parsing.

#### Scenario: No provider means no call
- **WHEN** the model provider is disabled
- **THEN** no request is attempted and each stage reports that it took its deterministic primary path or was skipped

#### Scenario: The demo compiles with the API blocked
- **WHEN** the demo scenario is started with the API origin unreachable
- **THEN** a complete schedule is produced in the browser from bundled seed packs

#### Scenario: Form and voice produce the same constraints
- **WHEN** equivalent answers are given through the structured form and through the voice interview
- **THEN** the resulting `Constraints` objects are identical

### Requirement: The model provider contributes no secret

The system SHALL authenticate to the model provider through workload identity — the
service account's Application Default Credentials — and SHALL NOT read, store or transmit
a model API key.

#### Scenario: No model key is configured anywhere
- **WHEN** the repository and the deployment configuration are scanned for a model provider API key
- **THEN** none is found, and no module reads one

#### Scenario: The client bundle carries no provider secret
- **WHEN** the built client bundle is scanned
- **THEN** it contains no provider secret name and no value matching a known key shape
