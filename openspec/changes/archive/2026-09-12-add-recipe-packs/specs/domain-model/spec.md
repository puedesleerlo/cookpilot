## ADDED Requirements

### Requirement: The shared vocabulary includes the recipe representation

The domain layer SHALL define `RecipeIR`, `RecipeStep` and `RecipePack` alongside the
existing entities, so that `src/recipes`, `src/llm` and the task-graph compiler all agree
on the shape of a recipe without any of them importing another.

#### Scenario: Recipe types come from the domain layer
- **WHEN** `src/llm` produces a `RecipeIR` and `src/recipes` validates one
- **THEN** both import the type and its schema from `@/domain`

#### Scenario: A recipe step's phase budget is enforced by schema
- **WHEN** a `RecipeStep` is constructed whose active and finishing minutes exceed its duration
- **THEN** schema validation fails and names the offending field
