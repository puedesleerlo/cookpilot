import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { useSession } from '@/app/store';
import { RecordingFailure, canRecord, startRecording, type Recorder } from '@/app/record';
import { transcribeAnswer } from '@/app/cook';
import dill from '@/assets/makitra/ingredients/dill.svg';
import tomato from '@/assets/makitra/ingredients/tomato.svg';
import { Button, Glyph, Motif } from '../primitives';
import { MicMark } from './entry/MicMark';

/**
 * Two questions, spoken.
 *
 * Two rather than one because they are different kinds of answer — a wish and an inventory —
 * and a single rambling answer to both is measurably harder to read than two short ones.
 * Two rather than five because every extra question is a chance to give up, and everything
 * else has a defensible default.
 *
 * Every answer is a textarea that happens to have a microphone under it. The transcript
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
    <main className="relative mx-auto flex min-h-dvh max-w-[1120px] flex-col gap-7 px-5 pb-[40px] pt-6 sm:px-[40px] sm:pt-7">
      <header className="relative grid items-center gap-5 sm:grid-cols-[minmax(0,1fr)_auto]">
        <div>
          <h1 className="voice-display leading-[0.9] [font-size:clamp(3rem,14.5vw,6rem)]">
            <span className={`relative mb-2 inline-block px-[0.18em] pb-[0.04em] pt-[0.1em] text-paper [rotate:-3deg] ${STAMP}`}>
              <span aria-hidden="true" className="absolute inset-0 bg-mk-plum [clip-path:var(--mk-cut-tag)]" />
              <span className="relative">Two</span>
            </span>{' '}
            <span className={`inline-block ${STAMP}`} style={{ animationDelay: '90ms' }}>
              questions
            </span>
          </h1>
          <p className="mt-4 max-w-[46ch] text-md text-muted">
            Answer out loud or type. It goes and finds real recipes, reads them, and works out
            a week of meals for however many of you are cooking.
          </p>
        </div>
        <VoiceCollage />
      </header>

      <ol className="grid items-stretch gap-[40px] lg:grid-cols-2 lg:gap-7">
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
      </ol>

      {failure ? (
        <p className="flex items-start gap-3 rounded-nick-md bg-warning-bg p-4 text-md text-ink" role="status">
          <span className="flex-none text-warning">
            <Glyph name="state-impossible" size={28} strokeWidth={2} />
          </span>
          <span>{failure}</span>
        </p>
      ) : null}

      <div className="relative px-[20px] pb-[24px] pt-[32px] sm:px-[28px]">
        <span aria-hidden="true" className="absolute inset-0 bg-sunken [clip-path:var(--mk-cut-edge-top)]" />
        <div className="relative flex flex-wrap items-center gap-4">
          <Button variant="primary" size="lg" onClick={findRecipes} disabled={!ready || finding}>
            {finding ? 'Finding recipes…' : 'Find me recipes'}
          </Button>
          <Button variant="secondary" onClick={() => goTo('intake')} disabled={finding}>
            Type a fridge instead
          </Button>
          {!ready ? <p className="text-sm text-muted">Answer one of them to start.</p> : null}
        </div>
      </div>
    </main>
  );
};

const STAMP = 'motion-safe:animate-[mk-stamp_var(--d-slow)_var(--mk-ease-stamp)_both]';

/** The header's still life: a paprika burst with a microphone cut out of it, and two slips. */
const VoiceCollage = () => (
  <div
    aria-hidden="true"
    className="pointer-events-none absolute -right-[4px] -top-[14px] h-[96px] w-[96px] sm:relative sm:right-0 sm:top-0 sm:h-[220px] sm:w-[280px]"
  >
    <span
      className={`absolute right-0 top-0 block aspect-square w-full bg-paprika [clip-path:var(--mk-cut-burst)] [rotate:12deg] sm:right-[20px] sm:w-[200px] ${STAMP}`}
      style={{ animationDelay: '120ms' }}
    />
    <span
      className={`absolute right-[26%] top-[25%] block w-[48%] text-paper sm:right-[74px] sm:top-[48px] sm:w-[92px] ${STAMP}`}
      style={{ animationDelay: '200ms' }}
    >
      <MicMark className="h-auto w-full" strokeWidth={2} />
    </span>
    <span
      className={`absolute left-0 top-[128px] hidden bg-enamel px-4 py-2 text-sm font-bold text-plum-900 [clip-path:var(--mk-cut-tag)] [rotate:-7deg] sm:block ${STAMP}`}
      style={{ animationDelay: '220ms' }}
    >
      what you want
    </span>
    <span
      className={`absolute right-0 top-[172px] hidden bg-marigold px-4 py-2 text-sm font-bold text-plum-900 [clip-path:var(--mk-cut-tag)] [rotate:5deg] sm:block ${STAMP}`}
      style={{ animationDelay: '300ms' }}
    >
      what you have
    </span>
    <Motif name="spark" m1="var(--mk-cornflower)" className="absolute -left-2 top-[4px] hidden w-[44px] [rotate:-20deg] sm:block" />
  </div>
);

type AnswerProps = {
  index: number;
  ask: string;
  hint: string;
  placeholder: string;
  value: string;
  onChange: (text: string) => void;
  disabled: boolean;
};

/** Each answer is a slip of paper-bright laid over a coloured sheet peeking out behind it. */
const SLIP = {
  1: { sheet: 'bg-enamel', number: 'bg-paprika text-paper', tilt: '-2.5deg', peek: tomato, peekAt: 'right-[36px] -top-[30px] w-[58px] [rotate:16deg]' },
  2: { sheet: 'bg-marigold', number: 'bg-cornflower text-plum-900', tilt: '2deg', peek: dill, peekAt: 'right-[28px] -top-[46px] w-[40px] [rotate:-22deg]' },
} as const;

const Answer = ({ index, ask, hint, placeholder, value, onChange, disabled }: AnswerProps) => {
  const [state, setState] = useState<'idle' | 'recording' | 'transcribing'>('idle');
  const [problem, setProblem] = useState('');
  const [seconds, setSeconds] = useState(0);
  const recorder = useRef<Recorder | null>(null);

  // A tab closed mid-recording should not leave the microphone light on.
  useEffect(() => () => recorder.current?.cancel(), []);

  // The running clock is the one thing here that moves on its own, and only while recording.
  useEffect(() => {
    if (state !== 'recording') return;
    const started = Date.now();
    const id = window.setInterval(() => setSeconds(Math.floor((Date.now() - started) / 1000)), 250);
    return () => window.clearInterval(id);
  }, [state]);

  const begin = async (): Promise<void> => {
    setProblem('');
    try {
      recorder.current = await startRecording();
      setSeconds(0);
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
  const recording = state === 'recording';
  const slip = SLIP[index as 1 | 2] ?? SLIP[1];
  const clock = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

  return (
    <li
      className="relative motion-safe:animate-[mk-slide_var(--d-slow)_var(--mk-ease-simmer)_both] [--slide-from:-24px]"
      style={{ animationDelay: `${index * 90}ms` }}
    >
      <span
        aria-hidden="true"
        className={`absolute inset-0 translate-x-[14px] translate-y-[16px] ${slip.sheet} [clip-path:var(--mk-cut-patch)] [rotate:var(--tilt)]`}
        style={{ '--tilt': slip.tilt } as CSSProperties}
      />
      <img src={slip.peek} alt="" className={`pointer-events-none absolute ${slip.peekAt}`} />
      <section className="relative flex h-full flex-col gap-4 rounded-nick-lg bg-surface p-[20px] sm:p-[28px]">
        <div className="flex items-start gap-4">
          <span aria-hidden="true" className="relative grid h-[60px] w-[60px] flex-none place-items-center sm:h-[72px] sm:w-[72px]">
            <span className={`absolute inset-0 ${slip.number} [clip-path:var(--mk-cut-plate)]`} />
            <span className={`voice-display relative translate-y-[2px] text-[2.5rem] leading-none sm:text-[3rem] ${slip.number}`}>
              {index}
            </span>
          </span>
          <div className="min-w-0 pt-1">
            <h2 className="text-lg font-bold leading-tight [font-variation-settings:var(--mk-sharp)]">{ask}</h2>
            <p className="mt-2 text-sm text-muted">{hint}</p>
          </div>
        </div>

        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={3}
          disabled={disabled || busy}
          aria-label={ask}
          className="mk-field__control min-h-[132px] flex-1 resize-y bg-bg py-3 text-md leading-snug disabled:opacity-60"
        />

        {canRecord() ? (
          <button
            type="button"
            onClick={recording ? end : begin}
            disabled={disabled || busy}
            aria-label={recording ? `Stop recording answer ${index}` : `Record answer ${index}`}
            className={`group relative flex min-h-[76px] w-full items-center gap-4 rounded-nick-md pl-[92px] pr-5 text-left
              transition-colors duration-base disabled:cursor-not-allowed
              ${busy ? 'bg-marigold-100 text-ink' : recording ? 'bg-night text-paper' : 'bg-sunken text-ink hover:bg-flour-deep disabled:opacity-60'}`}
          >
            <span aria-hidden="true" className="absolute left-[14px] top-1/2 grid h-[64px] w-[64px] -translate-y-1/2 place-items-center">
              {recording ? (
                <span className="absolute inset-[-6px] bg-paprika opacity-60 [clip-path:var(--mk-cut-burst)] motion-safe:animate-ping motion-reduce:hidden" />
              ) : null}
              <span
                className={`absolute inset-0 [clip-path:var(--mk-cut-plate)] transition-[rotate] duration-base ease-stamp group-hover:[rotate:-10deg]
                  ${busy ? 'bg-marigold' : recording ? 'bg-paprika' : 'bg-paprika-600'}`}
              />
              {busy ? (
                <span className="relative text-plum-900 motion-safe:animate-pulse">
                  <Glyph name="state-compiling" size={36} strokeWidth={2.2} />
                </span>
              ) : recording ? (
                <span className="relative block h-[22px] w-[22px] bg-paper [clip-path:var(--mk-cut-patch)]" />
              ) : (
                <MicMark className="relative h-[32px] w-[32px] text-paper" />
              )}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-md font-bold leading-tight [font-variation-settings:var(--mk-sharp)]">
                {busy ? 'writing…' : recording ? 'stop' : 'speak'}
              </span>
              <span className={`block text-sm ${recording ? 'text-night-muted' : 'text-muted'}`}>
                {busy ? 'Turning it into words' : recording ? 'Listening' : 'Or type it in the box'}
              </span>
            </span>
            {recording ? (
              <span aria-hidden="true" className="flex flex-none items-center gap-3">
                <span className="hidden items-end gap-[3px] sm:flex">
                  {[18, 28, 14, 24, 20].map((h, i) => (
                    <span
                      key={i}
                      className="block w-[5px] bg-marigold motion-safe:animate-bounce"
                      style={{ height: `${h}px`, animationDelay: `${i * -170}ms` }}
                    />
                  ))}
                </span>
                <span className="voice-display text-xl leading-none [font-variant-numeric:tabular-nums]">{clock}</span>
              </span>
            ) : null}
          </button>
        ) : null}

        {problem ? (
          <p className="flex items-start gap-2 text-sm font-medium text-danger" role="status">
            <span className="flex-none">
              <Glyph name="state-impossible" size={22} strokeWidth={2} />
            </span>
            <span>{problem}</span>
          </p>
        ) : null}
      </section>
    </li>
  );
};
