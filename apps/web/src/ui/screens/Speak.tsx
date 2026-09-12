import { useEffect, useRef, useState } from 'react';
import { useSession } from '@/app/store';
import { RecordingFailure, canRecord, startRecording, type Recorder } from '@/app/record';
import { transcribeAnswer } from '@/app/cook';
import { Button, Glyph } from '../primitives';

/**
 * Two questions, spoken.
 *
 * Two rather than one because they are different kinds of answer — a wish and an inventory —
 * and a single rambling answer to both is measurably harder to read than two short ones.
 * Two rather than five because every extra question is a chance to give up, and everything
 * else has a defensible default.
 *
 * Every answer is a textarea that happens to have a microphone next to it. The transcript
 * lands in the box, editable, and typing is a first-class way to answer rather than the
 * consolation prize: microphones are refused, browsers lack the API, and people sit in
 * offices. Nothing here blocks on the recording working.
 */

const QUESTIONS = [
  {
    key: 'wants' as const,
    ask: 'What do you want to cook this week?',
    hint: 'A dish, a craving, a cuisine. "Something with the chicken, nothing too spicy."',
    placeholder: 'I want to batch cook something with chicken, maybe a stir fry…',
  },
  {
    key: 'pantry' as const,
    ask: 'What have you got, and how many of you are cooking?',
    hint: 'Say what is going off. That is what the week gets built around.',
    placeholder: "I've got chicken, rice, bok choy that needs using, garlic. Two of us cooking.",
  },
];

export const Speak = () => {
  const answers = useSession((s) => s.spoken);
  const setAnswer = useSession((s) => s.setSpokenAnswer);
  const findRecipes = useSession((s) => s.findRecipes);
  const finding = useSession((s) => s.finding);
  const goTo = useSession((s) => s.goTo);
  const outcome = useSession((s) => s.outcome);

  const ready = answers.wants.trim().length > 0 || answers.pantry.trim().length > 0;
  const failure = outcome && !outcome.ok ? outcome.reason : null;

  return (
    <main className="mx-auto flex min-h-dvh max-w-[760px] flex-col gap-6 px-5 py-7">
      <header>
        <h1 className="voice-display text-3xl">Two questions</h1>
        <p className="mt-2 max-w-measure text-md text-ink-soft">
          Answer out loud or type. It goes and finds real recipes, reads them, and works out
          a week of meals for however many of you are cooking.
        </p>
      </header>

      {QUESTIONS.map((question, index) => (
        <Answer
          key={question.key}
          index={index + 1}
          ask={question.ask}
          hint={question.hint}
          placeholder={question.placeholder}
          value={answers[question.key]}
          onChange={(text) => setAnswer(question.key, text)}
          disabled={finding}
        />
      ))}

      {failure ? (
        <p className="rounded-sm bg-orange-wash p-3 text-sm" role="status">
          {failure}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-3 pb-4">
        <Button variant="primary" size="lg" onClick={findRecipes} disabled={!ready || finding}>
          {finding ? 'Finding recipes…' : 'Find me recipes'}
        </Button>
        <Button variant="secondary" onClick={() => goTo('intake')} disabled={finding}>
          Type a fridge instead
        </Button>
        {!ready ? <p className="text-xs text-ink-soft">Answer one of them to start.</p> : null}
      </div>
    </main>
  );
};

type AnswerProps = {
  index: number;
  ask: string;
  hint: string;
  placeholder: string;
  value: string;
  onChange: (text: string) => void;
  disabled: boolean;
};

const Answer = ({ index, ask, hint, placeholder, value, onChange, disabled }: AnswerProps) => {
  const [state, setState] = useState<'idle' | 'recording' | 'transcribing'>('idle');
  const [problem, setProblem] = useState('');
  const recorder = useRef<Recorder | null>(null);

  // A tab closed mid-recording should not leave the microphone light on.
  useEffect(() => () => recorder.current?.cancel(), []);

  const begin = async (): Promise<void> => {
    setProblem('');
    try {
      recorder.current = await startRecording();
      setState('recording');
    } catch (error) {
      setProblem(error instanceof RecordingFailure ? error.message : 'The recording did not start.');
      setState('idle');
    }
  };

  const end = async (): Promise<void> => {
    const active = recorder.current;
    if (!active) return;
    recorder.current = null;
    setState('transcribing');
    try {
      const recording = await active.stop();
      const result = await transcribeAnswer(recording.blob);
      if (result.ok) {
        onChange(value.trim().length > 0 ? `${value.trim()} ${result.text}` : result.text);
      } else {
        setProblem(`${result.reason}. Type your answer instead.`);
      }
    } catch (error) {
      setProblem(error instanceof RecordingFailure ? error.message : 'The recording did not work.');
    } finally {
      setState('idle');
    }
  };

  const busy = state === 'transcribing';

  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-md font-bold">
        <span className="mr-2 text-ink-faint">{index}.</span>
        {ask}
      </h2>
      <p className="text-xs text-ink-soft">{hint}</p>

      <div className="flex items-start gap-3">
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={3}
          disabled={disabled || busy}
          aria-label={ask}
          className="min-h-[92px] w-full flex-1 rounded-sm border-[1.5px] border-line-strong bg-cream px-3 py-2
            font-ui text-sm text-charcoal placeholder:text-ink-faint disabled:opacity-60"
        />
        {canRecord() ? (
          <button
            type="button"
            onClick={state === 'recording' ? end : begin}
            disabled={disabled || busy}
            aria-label={state === 'recording' ? `Stop recording answer ${index}` : `Record answer ${index}`}
            className={`grid h-[92px] w-[72px] flex-none place-items-center rounded-sm border-[1.5px]
              text-xs font-bold transition-colors duration-fast disabled:opacity-50
              ${state === 'recording'
                ? 'border-tomato-deep bg-tomato-wash text-tomato-ink'
                : 'border-line-strong bg-cream text-ink-soft hover:text-charcoal'}`}
          >
            <span className="flex flex-col items-center gap-1">
              <Glyph name={state === 'recording' ? 'state-compiling' : 'beverage-base'} size={26} />
              {busy ? 'writing…' : state === 'recording' ? 'stop' : 'speak'}
            </span>
          </button>
        ) : null}
      </div>

      {problem ? (
        <p className="text-xs text-tomato-ink" role="status">
          {problem}
        </p>
      ) : null}
    </section>
  );
};
