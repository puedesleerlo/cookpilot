# shared-session

## ADDED Requirements

### Requirement: A step SHALL be startable by hand, as a shared event
A member MUST be able to start a step that has not begun, by appending a `task-started`
event for it. The server MUST stamp the event with its own clock. Every device MUST run
that step's countdown from the stamp for the minutes the compiler gave the step, and MUST
show it as the step in progress, the most recent such start winning over the plan's order.

#### Scenario: Skipping the wait
- **WHEN** a cook is waiting for a step the plan says starts later and taps "Start it now"
- **THEN** the step becomes the one in progress, with its whole duration ahead of it
- **AND** the log carries a `task-started` event for it, stamped by the server

#### Scenario: Every device runs the same timer
- **WHEN** another device folds that event
- **THEN** its countdown for that step runs from the same stamp

#### Scenario: A start is not a shortcut
- **WHEN** a step of ten minutes is started by hand
- **THEN** its countdown reads ten minutes, and it runs over ten minutes after the tap

#### Scenario: Before the session
- **WHEN** a start is reported for a session that has not begun
- **THEN** the answer is `conflict`

### Requirement: The action for the step in view SHALL always be on screen
On a phone, the control that acts on the step in view MUST be pinned to the bottom of the
slide so it needs no scrolling: Done for a step in progress or overdue, "Start it now" for
one not yet begun. A step already done MUST offer no action.

#### Scenario: A long slide
- **WHEN** a step's slide is taller than the phone's screen
- **THEN** its Done control is visible without scrolling

#### Scenario: A step not yet begun
- **WHEN** the step in view has not started
- **THEN** the pinned control reads "Start it now"

### Requirement: A cook SHALL be able to page through their steps
A slide MUST offer previous and next controls over the cook's steps in plan order, show
each step's standing — done, in progress, overdue, or coming up — and offer a way back to
the live step. A slide left on the live step MUST follow the clock; one paged away MUST
stay until "Now" is chosen, unless the clock reaches the step it is on.

#### Scenario: Looking ahead
- **WHEN** a cook pages forward from the live step
- **THEN** the next step is shown as coming up, with the time until it starts
- **AND** a "Now" control is offered

#### Scenario: Looking back
- **WHEN** a cook pages back to a finished step
- **THEN** it is shown as done, with the minutes the plan had for it

#### Scenario: The clock moves on
- **WHEN** a slide is following the live step and that step is finished or its time passes
- **THEN** the slide moves to the new live step without a tap

### Requirement: Progress SHALL be shown for the meal and for the dish in view
A slide MUST show two progress indicators: the whole session, as attended steps finished
over attended steps there are across every cook; and the dish of the step in view, the same
way filtered to that dish. Both MUST come from the compiled schedule and the folded log.

#### Scenario: Three of twenty-four
- **WHEN** three attended steps of twenty-four are done across the crew
- **THEN** the session bar reads three of twenty-four

#### Scenario: Paging changes the dish
- **WHEN** a cook pages to a step of a different dish
- **THEN** the dish bar names that dish and shows its own count
