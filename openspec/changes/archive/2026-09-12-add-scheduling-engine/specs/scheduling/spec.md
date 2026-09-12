## ADDED Requirements

### Requirement: The engine is a pure function

Scheduling SHALL depend only on its arguments. Given identical inputs it SHALL produce
byte-identical output, including task order, resource choices and cook assignments.

Ties SHALL be broken deterministically, ultimately on task id.

#### Scenario: A hundred runs agree
- **WHEN** the same plan and constraints are scheduled one hundred times
- **THEN** every result serialises identically

#### Scenario: The browser and the server agree
- **WHEN** the same inputs are scheduled in a browser and on the server
- **THEN** both produce the same schedule

#### Scenario: Ties resolve on task id
- **WHEN** two eligible tasks have identical slack and identical remaining path length
- **THEN** the one whose id sorts first is scheduled first

### Requirement: No resource is ever over-allocated

At every minute of the schedule, the number of tasks holding a resource SHALL NOT exceed
that resource's count, and no task SHALL hold a resource that does not exist in the kitchen.

A cook SHALL NOT be assigned two overlapping tasks, and SHALL be assigned nothing outside
their availability.

#### Scenario: Two burners means two burners
- **WHEN** a schedule is produced for a kitchen with two burners
- **THEN** no minute has three tasks holding a burner

#### Scenario: A cook does one thing at a time
- **WHEN** a schedule assigns tasks to a cook
- **THEN** none of that cook's tasks overlap in time

#### Scenario: A cook who leaves is not scheduled after they leave
- **WHEN** a cook is available only until minute 18
- **THEN** no task assigned to them starts or runs after minute 18

#### Scenario: Cold storage is finite
- **WHEN** more dishes need chilling than there are shelves
- **THEN** chilling tasks are staggered rather than overlapped beyond capacity

#### Scenario: Property-tested over random graphs
- **WHEN** randomly generated task graphs are scheduled
- **THEN** no run over-allocates any resource

### Requirement: Dependencies and their delay windows are respected

No task SHALL start before its predecessors have finished, plus any minimum delay. Where a
maximum delay is declared, the task SHALL start within it, or the schedule SHALL report
that it could not.

#### Scenario: Order is preserved
- **WHEN** a task depends on another
- **THEN** it starts no earlier than the predecessor's finish

#### Scenario: Resting time is honoured
- **WHEN** an edge declares a three-minute minimum delay
- **THEN** the dependent task starts at least three minutes after its predecessor finishes

#### Scenario: A breached chill window is reported, not hidden
- **WHEN** cooked food cannot reach the fridge within its window
- **THEN** the schedule carries a warning naming the dish and the breach

### Requirement: A raw-meat surface never reaches ready-to-eat food unwashed

The engine SHALL insert a wash task before any task that requires a clean surface on
equipment last left carrying raw protein.

This SHALL hold regardless of the cost in time: it is the one constraint the degradation
ladder may not trade away.

#### Scenario: A board is washed between chicken and salad
- **WHEN** a cutting board is used for raw chicken and then for something served uncooked
- **THEN** a wash task is scheduled on that board between the two

#### Scenario: Heat is not a substitute for washing a board
- **WHEN** a board carrying raw meat is next needed for ready-to-eat work
- **THEN** a wash is inserted even though a later step applies heat elsewhere

#### Scenario: A pan that will be heated again needs no wash
- **WHEN** a frying pan that seared beef is next used to cook mushrooms
- **THEN** no wash is inserted, because the next use applies heat to the same surface

#### Scenario: The engine prefers orderings that avoid washes
- **WHEN** two orderings are otherwise equal and one needs a wash
- **THEN** the one without the wash is chosen

#### Scenario: Property-tested over random graphs
- **WHEN** randomly generated graphs containing raw protein and ready-to-eat tasks are scheduled
- **THEN** no run lets an unwashed contaminated surface reach ready-to-eat work

### Requirement: Cooks are assigned by eligibility, then balanced

A task SHALL be assigned only to a cook eligible for its class and meeting its minimum
skill. Where more than one cook qualifies, the engine SHALL prefer the assignment that
finishes earliest, then the one that balances the work.

A bounded improvement pass SHALL swap assignments only where the finish time does not get
worse and the imbalance falls.

#### Scenario: A helper is not handed the raw chicken
- **WHEN** a cook is not eligible for raw-protein work
- **THEN** no raw-protein task is assigned to them

#### Scenario: Skill is respected
- **WHEN** a task requires intermediate skill
- **THEN** it is not assigned to a beginner

#### Scenario: The improvement pass never makes the finish later
- **WHEN** the balancing pass runs
- **THEN** the resulting finish time is no later than before it ran

#### Scenario: The improvement pass terminates
- **WHEN** the balancing pass runs on any input
- **THEN** it completes within its iteration cap

#### Scenario: A task nobody may do is reported
- **WHEN** no available cook is eligible for a task
- **THEN** the schedule reports it rather than assigning it to someone ineligible

### Requirement: The degradation ladder is climbed in order and stops when it fits

Where the session exceeds its time budget, the engine SHALL apply, in order: drop optional
steps; drop beverages; substitute a shorter dish; reduce servings; drop the lowest-scoring
dish — rescheduling after each rung and stopping as soon as the session fits.

Each rung applied SHALL produce an event naming what was given up, why, and how much time
it saved.

#### Scenario: The ladder stops as soon as it fits
- **WHEN** dropping optional steps brings the session inside the budget
- **THEN** no beverage is dropped and no dish is removed

#### Scenario: Beverages go before food
- **WHEN** optional steps are not enough
- **THEN** beverages are dropped before any dish is cut

#### Scenario: Every rung explains itself
- **WHEN** a rung is applied
- **THEN** the schedule carries an event naming what was removed, the reason, and the minutes saved

#### Scenario: An impossible session says so
- **WHEN** every rung has been climbed and the session still does not fit
- **THEN** the schedule is marked infeasible and reports the shortest achievable time

#### Scenario: The ladder always terminates
- **WHEN** the ladder runs on any input
- **THEN** it produces either a feasible schedule or an explicit infeasible one

#### Scenario: Urgent ingredients are protected where possible
- **WHEN** a dish must be dropped and two candidates score equally
- **THEN** the one using fewer use-today ingredients is dropped

### Requirement: The engine explains itself from what it knows

The engine SHALL emit structured reasons for its decisions — passive work scheduled first,
the critical path, pan reuse, inserted washes, skill routing, idle filling, cold capacity
and each degradation.

Explanations SHALL be derived from the schedule, never supplied to it.

#### Scenario: Reasons reference real tasks
- **WHEN** a reason is emitted
- **THEN** every task it names exists in the schedule

#### Scenario: A wash explains itself
- **WHEN** a wash is inserted
- **THEN** a reason names the two tasks it sits between and why it was needed

#### Scenario: The critical path is identified
- **WHEN** a schedule is produced
- **THEN** the tasks on the critical path are marked, and shortening any of them would shorten the session

### Requirement: The schedule reports what it achieved

The schedule SHALL carry its finish time, whether it fits the budget, the time saved by
working in parallel, per-cook active and idle minutes, the number of washes, the portions
produced and how many urgent ingredients were used.

#### Scenario: Parallelism is quantified
- **WHEN** a schedule is produced
- **THEN** it reports the difference between doing everything in sequence and the finish time it achieved

#### Scenario: Fairness is visible
- **WHEN** two cooks work a session
- **THEN** the schedule reports each one's active and idle minutes

### Requirement: An overnight tail does not count against the budget

Tasks marked as running beyond the session SHALL NOT contribute to the finish time compared
against the time budget.

#### Scenario: A cold brew does not blow the budget
- **WHEN** a session includes a twelve-hour steep
- **THEN** the finish time reflects the in-session work only, and the steep is reported separately
