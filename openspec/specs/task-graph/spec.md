# task-graph Specification

## Purpose
TBD - created by archiving change add-task-graph-compiler. Update Purpose after archive.
## Requirements
### Requirement: Each step expands into phases that separate hands from equipment

The compiler SHALL expand each recipe step into a START task where its active minutes are
greater than zero, a HOLD task where its passive minutes are greater than zero, and a
FINISH task where its finishing minutes are greater than zero.

A HOLD task SHALL NOT require a cook. START and FINISH tasks SHALL require one.

The phases of one step SHALL be chained so that each begins when the previous ends.

#### Scenario: A simmer separates the pan from the cook
- **WHEN** a step declares 25 minutes total, 2 active and 1 finishing
- **THEN** three tasks are emitted: a 2-minute START needing a cook, a 22-minute HOLD needing none, and a 1-minute FINISH needing a cook

#### Scenario: A fully attended step is one task
- **WHEN** a step declares 8 minutes total and 8 active
- **THEN** exactly one START task of 8 minutes is emitted, and no HOLD

#### Scenario: A rest needs nobody
- **WHEN** a step declares 5 minutes total and no active or finishing minutes
- **THEN** exactly one HOLD task of 5 minutes is emitted, requiring no cook

#### Scenario: Phases run in order
- **WHEN** a step expands into all three phases
- **THEN** the HOLD depends on the START and the FINISH depends on the HOLD

### Requirement: Equipment is held only where it is really held

Equipment SHALL be attached to a step's HOLD phase only where the step's requirement
declares it held through the hold.

#### Scenario: A saucepan is occupied while rice cooks
- **WHEN** a simmer holds a saucepan and a burner
- **THEN** the HOLD task requires both

#### Scenario: A knife is not occupied while food marinates
- **WHEN** a step uses a cutting board and knife that are not held through the hold
- **THEN** the HOLD task requires neither, and they are free for other work

### Requirement: Dependencies between steps carry their delay windows

Where a step depends on another, the compiler SHALL create an edge from the last phase of
the predecessor to the first phase of the dependent, preserving any minimum and maximum
delay the recipe declared.

#### Scenario: Resting time is preserved
- **WHEN** a step declares a three-minute minimum delay after its predecessor
- **THEN** the emitted edge carries that minimum

#### Scenario: A promptness requirement is preserved
- **WHEN** a step declares a two-minute maximum delay after its predecessor
- **THEN** the emitted edge carries that maximum

#### Scenario: Steps with no declared dependency are independent
- **WHEN** two steps of a recipe declare no dependency on each other
- **THEN** no edge is created between them and they may be scheduled in parallel

### Requirement: The session ends portioned, chilled and labelled

For every dish that is not consumed immediately, the compiler SHALL append a portioning
task, a chilling task and a labelling task.

The chilling task SHALL be constrained by a maximum delay from the end of cooking, taken
from the session's configured limit.

#### Scenario: Finishing tasks exist
- **WHEN** a dish is compiled
- **THEN** the graph contains a portion task, a chill task and a label task for it

#### Scenario: Cooked food must reach cold storage in time
- **WHEN** a dish finishes cooking
- **THEN** the edge to its chill task carries a maximum delay equal to the configured chill window

#### Scenario: Chilling occupies cold storage
- **WHEN** a chill task is emitted
- **THEN** it requires cold storage, so chilling competes for shelf space

#### Scenario: Labelling follows chilling
- **WHEN** a dish is compiled
- **THEN** its label task depends on its chill task

### Requirement: An overnight tail does not lengthen the session

Where a recipe is marked overnight, the compiler SHALL mark the tasks after its long
passive step as running beyond the session, so that they do not contribute to the session's
finish time.

#### Scenario: A cold brew does not make the session twelve hours
- **WHEN** a twelve-hour steep is compiled
- **THEN** its start is scheduled within the session and its steep and the tasks after it are marked as extending past it

#### Scenario: The work before the tail is still in the session
- **WHEN** a cold brew is compiled
- **THEN** grinding and filling the jar are ordinary in-session tasks

### Requirement: Safety is annotated on the tasks that carry it

The compiler SHALL annotate tasks that leave a surface contaminated with what they leave,
tasks that are ready-to-eat, and tasks with a hold limit.

#### Scenario: Handling raw protein is marked
- **WHEN** a step handles raw chicken
- **THEN** the emitted task carries a raw-protein constraint naming the residue it leaves

#### Scenario: Ready-to-eat work is marked
- **WHEN** a task portions cooked food or adds a garnish
- **THEN** it carries a ready-to-eat constraint, so the scheduler knows it must not follow raw protein on an unwashed surface

#### Scenario: The chill window is expressed as a constraint
- **WHEN** a chill task is emitted
- **THEN** it carries a maximum-hold constraint stating the window in minutes

### Requirement: A cycle is a reported error, never a hang

The compiler SHALL validate that the emitted graph is acyclic and SHALL report which
recipe introduced a cycle.

#### Scenario: A cycle is named
- **WHEN** a recipe's steps depend on each other in a loop
- **THEN** compilation fails with an error naming that recipe, and does not hang

#### Scenario: A valid plan compiles
- **WHEN** the demo plan is compiled
- **THEN** the graph is acyclic and every dependency names a task in the graph

### Requirement: Compilation is deterministic

Compiling the same plan and constraints twice SHALL produce byte-identical graphs,
including task ids and ordering.

#### Scenario: Two compilations agree
- **WHEN** the same plan is compiled twice
- **THEN** the two graphs serialise identically

