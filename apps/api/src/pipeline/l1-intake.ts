import { SpokenIntakeSchema, type SpokenIntake } from '@kitchen/domain';
import type { StageSpec } from '../llm/gateway';

/**
 * L1 — two spoken answers into structured intake.
 *
 * This is the stage the consolidated delta deleted a regex version of, and it is worth
 * being precise about why a model belongs here and a lexicon scan does not. "I've got some
 * chicken stock and half a cauliflower" contains "chicken" and "cauliflower rice" contains
 * "rice"; a table scan finds both and is wrong both times. Reading a sentence is the thing
 * models are for. What keeps it honest is not the prompt — it is that the output is
 * constrained to `SpokenIntakeSchema`, so the stage returns that shape or it is repaired
 * and re-asked, and anything it could not place goes in `notes` rather than into a slot.
 */

export type IntakeInput = {
  /** Answer to "what do you want to cook this week?" */
  wantsTranscript: string;
  /** Answer to "what have you got, and how many of you are cooking?" */
  pantryTranscript: string;
};

const SYSTEM = `You turn two spoken answers from someone planning a week of batch cooking into structured data.

They were asked two questions:
1. What do you want to cook this week?
2. What have you got in the kitchen, and how many of you are cooking?

Rules:
- Record what they SAID, not what you think they meant. "Some chicken" is "some chicken".
- Put every food they mention in "pantry", one entry each, in their words.
- Set "urgency" only when they said something about it: "going off", "needs using up",
  "before it turns" is use-today; "this week" is use-soon. Say nothing, set nothing.
- "wants" is what they want out of the session: dishes, cuisines, a craving, a constraint
  like "nothing spicy". Short phrases. Never invent a want they did not express.
- "cookCount" is how many PEOPLE WILL BE COOKING, not how many they are feeding. If they
  did not say, it is 1.
- Only set "timeBudgetMin" if they named a length of time for the session.
- "restrictions" only for genuine allergies or diets they stated.
- Anything you heard that matters and fits nowhere goes in "notes", verbatim.
- If a transcript is empty or is not about food, return empty arrays. Do not invent a
  kitchen.`;

export const l1Intake: StageSpec<IntakeInput, SpokenIntake> = {
  stage: 'L1-intake',
  schema: SpokenIntakeSchema,
  system: SYSTEM,
  buildUser: (input) =>
    [
      'Question 1 — what do you want to cook this week?',
      input.wantsTranscript.trim() || '(no answer)',
      '',
      'Question 2 — what have you got, and how many of you are cooking?',
      input.pantryTranscript.trim() || '(no answer)',
    ].join('\n'),
  /**
   * There is no deterministic floor for reading a sentence, and inventing one is how the
   * deleted parser came back. The floor is an empty intake and an honest note: the client
   * then puts the structured form in front of the user, which is the real fallback.
   */
  fallback: (_input, reason) =>
    SpokenIntakeSchema.parse({
      wants: [],
      pantry: [],
      cookCount: 1,
      notes: [`The recording could not be read (${reason}). Fill the fridge in by hand.`],
    }),
};
