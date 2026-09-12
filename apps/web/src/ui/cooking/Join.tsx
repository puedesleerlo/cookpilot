import { useState, type FormEvent } from 'react';
import { JOIN_CODE_LENGTH } from '@kitchen/contracts';
import { selectCompiled, useSync } from '@/app/sync';
import { slots } from '@/app/story';
import { Button, Field, Glyph } from '../primitives';
import { SlotPicker } from './SlotPicker';
import { Agreement } from './Agreement';

/**
 * Joining from a phone.
 *
 * Two screens in one: type the code if the link did not carry it, then pick who you are and
 * what to call you. Nothing else is asked. The pantry, the kitchen and the plan all came
 * from the host; this phone compiles them itself and shows only the steps for the role
 * chosen here.
 */
export const Join = () => {
  const session = useSync((s) => s.session);
  const compiled = useSync(selectCompiled);
  const joinCode = useSync((s) => s.joinCode);
  const pending = useSync((s) => s.pending);
  const error = useSync((s) => s.error);
  const deviceId = useSync((s) => s.deviceId);
  const lookUp = useSync((s) => s.lookUp);
  const claim = useSync((s) => s.claim);
  const leave = useSync((s) => s.leave);

  const [code, setCode] = useState(joinCode);
  const [cookId, setCookId] = useState<string | null>(null);
  const [name, setName] = useState('');

  if (!session) {
    const submit = (e: FormEvent) => {
      e.preventDefault();
      void lookUp(code);
    };
    return (
      <main className="mx-auto flex min-h-dvh max-w-[520px] flex-col justify-center gap-5 px-5 py-8">
        <header>
          <h1 className="voice-display text-3xl">Join a session</h1>
          <p className="mt-2 text-md text-ink-soft">
            Scan the code on the host&rsquo;s screen, or type the six letters under it.
          </p>
        </header>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-bold text-ink-soft">Join code</span>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, JOIN_CODE_LENGTH))}
              autoCapitalize="characters"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              inputMode="text"
              maxLength={JOIN_CODE_LENGTH}
              placeholder="ABC234"
              className="voice-numeral min-h-[64px] w-full rounded-sm border-[1.5px] border-line-strong bg-cream px-4 text-center text-3xl uppercase tracking-[0.25em] text-charcoal placeholder:text-ink-faint"
            />
          </label>
          {error ? (
            <p role="alert" className="rounded-sm bg-orange-wash p-3 text-sm">
              {error}
            </p>
          ) : null}
          <Button type="submit" variant="primary" size="lg" disabled={code.length !== JOIN_CODE_LENGTH || pending}>
            {pending ? 'Finding it…' : 'Find the session'}
          </Button>
          <Button variant="quiet" onClick={leave}>
            Back
          </Button>
        </form>
      </main>
    );
  }

  const roster = slots(session.crew, session.members);
  const chosen = roster.find((s) => s.cook.id === cookId);
  const ready = chosen !== undefined && name.trim().length > 0 && !pending;

  return (
    <main className="mx-auto flex min-h-dvh max-w-[640px] flex-col gap-5 px-5 py-7">
      <header>
        <p className="text-xs font-bold uppercase tracking-wide text-ink-faint">You&rsquo;re joining</p>
        <h1 className="voice-display mt-1 text-3xl">{compiled?.plan.name ?? 'the session'}</h1>
        {compiled ? <p className="mt-2 max-w-measure text-md text-ink-soft">{compiled.plan.tagline}</p> : null}
        <p className="mt-2 text-sm text-ink-soft">
          {session.crew.length} cooking · {session.inputs.timeBudgetMin.value} minutes
        </p>
      </header>

      <Agreement />

      <section aria-label="Which cook are you">
        <h2 className="mb-2 text-sm font-bold">Which one are you tonight?</h2>
        <SlotPicker slots={roster} selected={cookId} onSelect={setCookId} myDeviceId={deviceId} />
      </section>

      <Field
        label="What should we call you?"
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={40}
        autoComplete="given-name"
        placeholder="Your name"
      />

      {error ? (
        <p role="alert" className="rounded-sm bg-orange-wash p-3 text-sm">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-3 pb-4">
        <Button
          variant="primary"
          size="lg"
          disabled={!ready}
          onClick={() => {
            if (chosen) void claim(chosen.cook.id, name);
          }}
        >
          {chosen ? `Join as ${chosen.cook.name}` : 'Join'}
        </Button>
        <Button variant="quiet" onClick={leave}>
          Not this session
        </Button>
      </div>

      {!compiled ? (
        <p className="flex items-start gap-3 rounded-md bg-tomato-wash p-4 text-sm">
          <span className="text-tomato-ink">
            <Glyph name="state-impossible" size={28} />
          </span>
          This phone could not compile the session it was sent. You can still join, but it will
          have no steps to show until the app is reloaded.
        </p>
      ) : null}
    </main>
  );
};
