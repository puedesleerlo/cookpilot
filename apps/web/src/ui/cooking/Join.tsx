import { useState, type FormEvent } from 'react';
import { JOIN_CODE_LENGTH } from '@kitchen/contracts';
import { selectCompiled, useSync } from '@/app/sync';
import { slots } from '@/app/story';
import { Button, Display, Field, Glyph, Motif, Patch } from '../primitives';
import { SlotPicker } from './SlotPicker';
import { Agreement } from './Agreement';
import { CodeTiles, Icon, STAMP_IN, StampTag } from './Paper';

/**
 * Joining from a phone.
 *
 * Two screens in one: type the code if the link did not carry it, then pick who you are and
 * what to call you. Nothing else is asked. The pantry, the kitchen and the plan all came
 * from the host; this phone compiles them itself and shows only the steps for the role
 * chosen here.
 *
 * It reads like an invitation cut out of paper: the code is six stamped letters on six
 * paper tiles, and the roles are name tags.
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
      <main className="mx-auto flex min-h-dvh w-full max-w-[560px] flex-col justify-center gap-6 px-5 py-8 lg:grid lg:max-w-[1080px] lg:grid-cols-[minmax(0,1fr)_minmax(0,500px)] lg:content-center lg:items-center lg:gap-x-8">
        <header className="relative">
          <StampTag className={STAMP_IN}>Cooking together</StampTag>
          <div className="relative mt-4">
            <Patch
              tone="dough"
              cut="shard"
              aria-hidden="true"
              className={`absolute -left-3 top-1 h-[4.5rem] w-[11rem] [rotate:-6deg] sm:h-[5.5rem] sm:w-[14rem] lg:h-[7.5rem] lg:w-[19rem] ${STAMP_IN}`}
            />
            <Motif name="spark" className="absolute -top-5 right-2 w-[2.5rem] rotate-12 sm:right-[2.5rem]" m1="var(--mk-paprika)" />
            <Display as="h1" className="relative text-[length:var(--mk-text-4xl)] sm:text-[length:var(--mk-text-5xl)] lg:text-[6rem]">
              Join a session
            </Display>
          </div>
          <p className="mt-3 max-w-[34ch] text-md text-muted">
            Scan the code on the host&rsquo;s screen, or type the six letters under it.
          </p>
          <Arrivals />
        </header>

        <form onSubmit={submit} className="relative flex flex-col gap-4">
          <Motif name="cherry" className="absolute -right-4 -top-[2rem] z-[1] w-[3rem] rotate-[18deg]" m1="var(--mk-beet)" m2="var(--mk-garden)" m3="var(--mk-paper)" />
          <div className="relative overflow-hidden rounded-nick-lg bg-surface px-4 pb-5 pt-0 sm:px-6">
            <span aria-hidden="true" className="-mx-4 mb-4 block h-[14px] bg-paprika [clip-path:var(--mk-cut-edge-bottom)] sm:-mx-6" />
            <label className="group flex flex-col gap-3">
              <span className="flex items-center justify-between gap-3">
                <span className="text-sm font-bold [font-variation-settings:var(--mk-sharp)]">Join code</span>
                <span aria-hidden="true" className="text-xs font-bold text-muted">
                  {code.length} of {JOIN_CODE_LENGTH}
                </span>
              </span>
              <span className="relative block">
                <CodeTiles
                  value={code}
                  length={JOIN_CODE_LENGTH}
                  placeholder="ABC234"
                  active={code.length < JOIN_CODE_LENGTH ? code.length : null}
                />
                {/*
                  The real field lies over the tiles, its own text invisible: typing, pasting,
                  autocorrect-off and the phone keyboard all behave as a text input does, and
                  the focus ring goes around the whole row of tiles.
                */}
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
                  className="absolute inset-0 h-full w-full cursor-text rounded-nick-md bg-transparent text-center text-3xl uppercase tracking-[0.5em] text-transparent caret-transparent placeholder:text-transparent selection:bg-transparent"
                />
              </span>
            </label>
          </div>

          {error ? (
            <p role="alert" className="flex items-start gap-3 rounded-nick-md bg-warning-bg p-3 text-sm text-ink">
              <Icon name="alert" className="mt-[2px] text-warning" />
              <span>{error}</span>
            </p>
          ) : null}
          <Button type="submit" variant="primary" size="lg" disabled={code.length !== JOIN_CODE_LENGTH || pending}>
            {pending ? 'Finding it…' : 'Find the session'}
          </Button>
          <Button variant="quiet" onClick={leave} className="self-center">
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
    <main className="mx-auto flex min-h-dvh w-full max-w-[720px] flex-col gap-6 px-5 pb-8 pt-7">
      <header className="relative">
        <StampTag className={STAMP_IN}>You&rsquo;re joining</StampTag>
        <div className="relative mt-4">
          <Patch
            tone="preserve"
            cut="plate"
            aria-hidden="true"
            className={`absolute -left-4 -top-3 h-[6.5rem] w-[8rem] [rotate:8deg] ${STAMP_IN}`}
          />
          <Motif name="daisy" className="absolute -top-4 right-0 w-[3rem] rotate-[20deg]" m1="var(--mk-marigold)" m3="var(--mk-paprika)" />
          <Display as="h1" className="relative pr-[2.5rem] text-[length:var(--mk-text-4xl)] sm:text-[length:var(--mk-text-5xl)]">
            {compiled?.plan.name ?? 'the session'}
          </Display>
        </div>
        {compiled ? <p className="mt-3 max-w-measure text-md text-muted">{compiled.plan.tagline}</p> : null}
        <p className="mt-4 flex flex-wrap gap-2">
          <span className="mk-tag bg-marigold-100">
            <Glyph name="cook-0" size={18} strokeWidth={2} />
            {session.crew.length} cooking
          </span>
          <span className="mk-tag bg-cornflower-100">
            <Icon name="clock" />
            {session.inputs.timeBudgetMin.value} minutes
          </span>
        </p>
      </header>

      <Agreement />

      <section aria-label="Which cook are you">
        <Display as="h2" className="mb-4 text-[length:var(--mk-text-xl)] sm:text-[length:var(--mk-text-2xl)]">
          Which one are you tonight?
        </Display>
        <SlotPicker slots={roster} selected={cookId} onSelect={setCookId} myDeviceId={deviceId} />
      </section>

      <div className="relative rounded-nick-lg bg-sunken p-4 sm:p-5">
        <Motif name="leaf" className="absolute -right-2 -top-6 w-[2rem] rotate-[24deg]" m1="var(--mk-garden)" m3="var(--mk-flour)" />
        <Field
          label="What should we call you?"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={40}
          autoComplete="given-name"
          placeholder="Your name"
        />
      </div>

      {error ? (
        <p role="alert" className="flex items-start gap-3 rounded-nick-md bg-warning-bg p-3 text-sm text-ink">
          <Icon name="alert" className="mt-[2px] text-warning" />
          <span>{error}</span>
        </p>
      ) : null}

      <div className="flex flex-col items-center gap-3 pb-4 sm:flex-row sm:flex-wrap">
        <Button
          variant="primary"
          size="lg"
          disabled={!ready}
          className="w-full sm:w-auto"
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
        <p className="flex items-start gap-3 rounded-nick-md bg-danger-bg p-4 text-sm text-ink">
          <span className="flex-none text-danger">
            <Glyph name="state-impossible" size={28} />
          </span>
          This phone could not compile the session it was sent. You can still join, but it will
          have no steps to show until the app is reloaded.
        </p>
      ) : null}
    </main>
  );
};

/**
 * The guests arriving, cut out of paper: three cooks on three scraps in the crew colours,
 * tumbling in from under the headline. Only where there is room beside the form.
 */
const Arrivals = () => (
  <div aria-hidden="true" className="relative mt-7 hidden h-[11rem] w-[22rem] lg:block">
    <span
      className={`absolute left-0 top-6 grid h-[7.5rem] w-[8.5rem] place-items-center bg-paprika-600 text-paper [clip-path:var(--mk-cut-tag)] [rotate:-9deg] ${STAMP_IN}`}
    >
      <Glyph name="cook-0" size={64} strokeWidth={1.6} />
    </span>
    <span
      className={`absolute left-[7.5rem] top-0 grid h-[8.5rem] w-[8.5rem] place-items-center bg-cornflower-700 text-paper [clip-path:var(--mk-cut-plate)] [rotate:7deg] ${STAMP_IN}`}
    >
      <Glyph name="cook-1" size={64} strokeWidth={1.6} />
    </span>
    <span
      className={`absolute left-[14.5rem] top-[2.25rem] grid h-[7rem] w-[7.5rem] place-items-center bg-garden-700 text-paper [clip-path:var(--mk-cut-shard)] [rotate:-4deg] ${STAMP_IN}`}
    >
      <Glyph name="cook-3" size={56} strokeWidth={1.6} />
    </span>
    <Motif name="poppy" className="absolute -bottom-2 left-[5rem] w-[3.5rem] rotate-[-10deg]" m1="var(--mk-plum-900)" />
    <Motif name="daisy" className="absolute right-0 top-0 w-[2.5rem] rotate-12" m1="var(--mk-enamel)" m3="var(--mk-marigold)" />
  </div>
);

