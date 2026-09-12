# shared-session Specification

## Purpose
TBD - created by archiving change add-shared-session. Update Purpose after archive.
## Requirements
### Requirement: A session SHALL be opened from a compiled timeline and reached by a code
The host MUST be able to open a shared session from any compiled timeline, and the server
MUST answer with a six-character join code drawn from the unambiguous alphabet. The host's
screen MUST show the code as a QR code carrying a link and as text, and a phone MUST be
able to reach the session either way.

#### Scenario: Opening a session
- **WHEN** the host chooses to cook a compiled session together
- **THEN** a session exists on the server with that session's inputs and crew
- **AND** the host is shown a six-character code and a QR code that links to it

#### Scenario: A code nobody has
- **WHEN** a phone looks up a code no open session has
- **THEN** it is told so, by code `join_code_invalid`, and stays on the join screen

#### Scenario: A session that has run out
- **WHEN** a session is looked up more than twelve hours after it was opened
- **THEN** the answer is `session_expired`, and the phone is told to ask for a new one

### Requirement: Only the inputs and the log SHALL travel
The server MUST store the session's inputs, its crew, and the ordered event log, and MUST
NOT serve a schedule. Every device MUST compile its own timeline from the inputs. The host
MUST send a content hash of the schedule it compiled, and every device that joins MUST
compare its own compile against it and say when they differ.

#### Scenario: A phone compiles for itself
- **WHEN** a phone finds a session by code
- **THEN** it compiles the session's inputs on the device
- **AND** no schedule is downloaded

#### Scenario: Two devices agree
- **WHEN** the host and a phone run the same build and compile the same inputs
- **THEN** the phone's schedule hashes to the host's, and no warning is shown

#### Scenario: Two devices disagree
- **WHEN** the phone's compile hashes differently from the host's
- **THEN** the phone shows a warning naming a stale version as the likely cause, before cooking

### Requirement: A device SHALL claim exactly one cook, and a cook SHALL have at most one device
Joining MUST mean choosing one cook from the compiled crew and a display name. The server
MUST refuse a cook another device holds, naming who holds it, and MUST decide between two
simultaneous claims under the session's row lock so exactly one succeeds. A device that
claims again MUST be moved, not listed twice.

#### Scenario: Claiming a free cook
- **WHEN** a phone claims a free cook with the name "Ben"
- **THEN** the roster shows Ben as that cook on every device by its next poll
- **AND** the log carries a `member-joined` event

#### Scenario: Claiming a taken cook
- **WHEN** a phone claims a cook Ana already holds
- **THEN** the answer is `conflict`, naming Ana, and the phone stays on the join screen

#### Scenario: Two taps at once
- **WHEN** two phones claim the same cook in the same instant
- **THEN** exactly one succeeds and the other is refused

#### Scenario: Changing your mind
- **WHEN** a phone that holds one cook claims another
- **THEN** it holds the new one and the old one is free

#### Scenario: The host is a cook too
- **WHEN** the host's device claims a cook
- **THEN** it is on the roster as that cook and marked as the host

### Requirement: Starting SHALL be the host's call, made once
Only the host device MUST be able to start the session. The start control MUST become
enabled when every cook in the crew is claimed, and a quieter control MUST let the host
start once anyone has joined. A started session MUST NOT be started again.

#### Scenario: Everyone is in
- **WHEN** the last cook in the crew is claimed
- **THEN** the host's start control is enabled and the lobby says everyone is here

#### Scenario: Starting short-handed
- **WHEN** one of two cooks has joined
- **THEN** the main start control is disabled and a secondary "start with whoever's here" is offered

#### Scenario: A guest cannot start
- **WHEN** a device that is not the host asks to start
- **THEN** the answer is `forbidden` and the session stays open

#### Scenario: Starting twice
- **WHEN** the host asks to start an already started session
- **THEN** the answer is `conflict`

### Requirement: Every countdown SHALL be anchored to the server clock
Every response about a session MUST carry the server's time, and a device MUST compute its
offset from it — allowing for half the round trip — and drive every countdown from that
offset rather than from its own clock alone. The session's start MUST be the server's time
at the moment the host started it.

#### Scenario: A device with a wrong clock
- **WHEN** a device's clock runs five seconds ahead of the server's
- **THEN** its offset is measured at about minus five seconds and its countdowns match the other devices'

#### Scenario: The start is one moment everywhere
- **WHEN** the host starts the session
- **THEN** every device counts from the same server timestamp

### Requirement: Story mode SHALL show one cook one step and the next
While cooking, a device that claimed a cook MUST show that cook's current step — its name,
its dish, a countdown to the minute the compiler expected it finished, and a Done control
at least 44 pixels tall — with the following step shown smaller beneath it. The current
step MUST be the earliest unfinished step whose start minute has passed. A device that
claimed no cook MUST show every cook's slide. Every device MUST list the holds in progress
with their own countdowns.

#### Scenario: The step of the moment
- **WHEN** the clock is inside a step's minutes and the step is not done
- **THEN** the slide shows that step with the seconds left in it, and the next step beneath

#### Scenario: Running late
- **WHEN** a step's end minute has passed and it is not done
- **THEN** the slide keeps showing it, with how far over it is, rather than moving on

#### Scenario: Two steps behind
- **WHEN** two of a cook's steps are overdue
- **THEN** the older one is shown first

#### Scenario: Finishing early
- **WHEN** a cook finishes a step before its end minute
- **THEN** the slide shows the next step with a countdown to when it is due to start

#### Scenario: Nothing to do yet
- **WHEN** a cook's next step starts later than now
- **THEN** the slide says so and counts down to it

#### Scenario: Everything done
- **WHEN** every step of a cook's is done
- **THEN** the slide says they are done

#### Scenario: The kitchen display
- **WHEN** a device that claimed no cook is cooking
- **THEN** it shows one slide per cook, each with its own Done control

#### Scenario: What is looking after itself
- **WHEN** a hold phase is in progress
- **THEN** every device lists it with the seconds it has left

#### Scenario: The countdown is legible across a kitchen
- **WHEN** a phone shows its owner's slide
- **THEN** the countdown is set in the numeral voice at no less than 4rem

### Requirement: A finished step SHALL be an event in the log
Tapping Done MUST append a `task-completed` event for that task. The tapping device MUST
move on immediately and take the tap back if the server refuses it. Every other device MUST
see the completion on its next poll, and MUST replay only what it has not seen.

#### Scenario: Tapping done
- **WHEN** a cook taps Done on a step
- **THEN** their slide moves on before the server has answered
- **AND** the log gains a `task-completed` event with that task id

#### Scenario: The server refuses
- **WHEN** the append fails
- **THEN** the step is shown again and the failure is said in words

#### Scenario: Another cook's tap
- **WHEN** a different device completes a task
- **THEN** this device's next poll folds it in, asking only for events after the last it saw

#### Scenario: Before the start
- **WHEN** a task is reported done in a session that has not started
- **THEN** the answer is `conflict`

### Requirement: Losing the server SHALL NOT lose the session
A failed poll MUST mark the device offline and keep the timers running from the last known
offset; the next successful poll MUST clear it. A session the server reports as gone MUST
end the flow with the reason. A tab that reloads MUST land back in the session it was in.

#### Scenario: A dropped poll
- **WHEN** a poll cannot reach the server
- **THEN** the device says it lost the server for a moment and keeps counting

#### Scenario: The session is gone
- **WHEN** a poll is answered with `session_expired` or `session_not_found`
- **THEN** the device leaves the flow and shows why

#### Scenario: A reload mid-cook
- **WHEN** a phone reloads while cooking
- **THEN** it returns to the same session, as the same cook, still cooking

### Requirement: The single-device path SHALL NOT need the server
Compiling and following a session on one device MUST work with the API origin blocked.
Only opening or joining a shared session MAY need the API, and failing to reach it MUST be
said in words rather than shown as a blank screen.

#### Scenario: The example session offline
- **WHEN** the example session is compiled with the API unreachable
- **THEN** the timeline renders as before

#### Scenario: Cooking together with the API down
- **WHEN** the host chooses to cook together and the API cannot be reached
- **THEN** a screen says the server could not be reached and offers the way back

