# scheduling

## ADDED Requirements

### Requirement: Lanes SHALL follow the resource slots a task was given
A task MUST appear on the lane of each instance it actually occupies. Lane membership MUST
NOT be inferred from the task's requirement list, because a task's instance numbers belong
to different pieces of equipment and applying one to another puts the task on a row it never
occupied.

#### Scenario: A task holding two different things
- **WHEN** a task is given burner #2 and saucepan #1
- **THEN** it appears on the burner #2 row and the saucepan #1 row
- **AND** it does not appear on the burner #1 row

#### Scenario: Cold storage rows
- **WHEN** one fridge shelf holds four containers
- **THEN** it contributes four slot rows, each labelled as a slot

### Requirement: The urgency metric SHALL count urgent ingredients only
`urgentIngredientsUsed` and `urgentIngredientsTotal` MUST count ingredients the pantry
marked as needing to go today. The scheduler never sees the pantry, so both numbers MUST be
carried on the plan's coverage rather than derived from the dishes.

#### Scenario: A pantry with four urgent items
- **WHEN** a plan uses three of the four ingredients marked use-today
- **THEN** the metric reads three of four
- **AND** it agrees with the plan's own tagline
