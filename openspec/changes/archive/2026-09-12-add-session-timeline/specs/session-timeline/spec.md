# session-timeline

## ADDED Requirements

### Requirement: The client SHALL compile a session without a network
Compiling the example session MUST require no API call, no credential and no account. The
recipe registry, the plan builder and the scheduler all ship in the bundle.

#### Scenario: Compiling offline
- **WHEN** the example session is compiled with no network available
- **THEN** a plan and a schedule are produced
- **AND** no request leaves the device

#### Scenario: Nothing to compile
- **WHEN** a compile is asked for with an empty pantry
- **THEN** the result reports why rather than returning an empty session

### Requirement: The chart SHALL draw resources, not steps
The timeline MUST show one row per cook and one row per instance of equipment that is used
more than once, so that overlap is visible as overlap. Rows for equipment used only once
MUST be omitted, because a row with one block on it shows no contention.

#### Scenario: The cooks are always drawn
- **WHEN** a schedule is drawn
- **THEN** every cook has a row, whether or not they were given work

#### Scenario: Single-use equipment is left out
- **WHEN** six storage containers are each used once
- **THEN** none of them gets a row
- **AND** the run sheet still lists every task

### Requirement: A block SHALL never be drawn wider than its duration
Block width MUST be the task's minutes at the current scale, with a floor of exactly one
minute. Widening a short block to make it readable would overlap whatever starts next.

#### Scenario: Two tasks back to back
- **WHEN** a one-minute task is followed immediately by another on the same row
- **THEN** the blocks touch and do not overlap, at every scale

#### Scenario: Reading a short block
- **WHEN** a block is too narrow to carry its name
- **THEN** hovering widens it to show the name
- **AND** the name is available to assistive technology at all times

### Requirement: The chart SHALL scale so the attended session fits
The scale MUST be chosen so that minute zero to the moment the last cook is free fits the
available width without scrolling. Passive work continuing past that point MAY scroll.

#### Scenario: A narrow screen
- **WHEN** the available width cannot fit the session even at the minimum scale
- **THEN** the scale stops at the minimum and the chart scrolls

#### Scenario: A short session on a wide screen
- **WHEN** a twelve-minute session is drawn on a wide screen
- **THEN** the scale stops at the maximum rather than stretching

### Requirement: Overnight work SHALL be listed, not drawn
Work on the far side of a long passive tail MUST be excluded from the chart and listed
separately as what happens tomorrow. Drawn to scale beside a twelve-hour steep, an hour of
cooking is a few pixels wide.

#### Scenario: A cold brew
- **WHEN** a session includes a drink that steeps overnight
- **THEN** its steep and everything after it appear in the tomorrow list
- **AND** none of them appear on the chart or in the session's minutes

### Requirement: The chart SHALL distinguish its markings by more than colour
Passive blocks MUST be hatched, critical-path blocks MUST be stroked, and both MUST be
explained by a key. Colour alone MUST NOT carry any of these meanings.

#### Scenario: Reading without colour
- **WHEN** the chart is viewed without colour discrimination
- **THEN** passive work, critical work and washing remain distinguishable

### Requirement: Every dish in a plan SHALL have its own hue
Hue allocation MUST depend only on the set of dish ids, so the same session renders
identically everywhere, and MUST NOT give two dishes in one plan the same hue while an
unused hue remains.

#### Scenario: Six dishes, six hues
- **WHEN** a plan of six dishes is drawn
- **THEN** each dish has a distinct hue
- **AND** the allocation is the same whatever order the dishes arrive in

### Requirement: Changing an answer SHALL recompile immediately
Time budget, crew size, servings and whether drinks are wanted MUST recompile the session on
change, with no intermediate confirmation.

#### Scenario: Half the time
- **WHEN** the time budget is changed from sixty minutes to thirty
- **THEN** a new plan is built and scheduled within the new budget
- **AND** the chart, the numbers and the dish list all reflect it

#### Scenario: Cooking alone
- **WHEN** the crew is reduced to one cook
- **THEN** the session contains fewer dishes than the same budget with two cooks

### Requirement: A task SHALL explain itself from compiled facts
Opening a block MUST show when it runs, who has it, what it holds, how far it can slip, and
any rationale naming it. Every one of those MUST come from the compiled schedule; none may
be generated prose.

#### Scenario: Opening a critical task
- **WHEN** a task on the critical path is opened
- **THEN** it says that it sets the finish time rather than showing a slack figure
