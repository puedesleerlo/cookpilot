import { useState } from 'react';
import { servedFromLocalhost } from '@/app/api';
import { selectCompiled, selectMe, useSync } from '@/app/sync';
import { everyoneHere, roleOf, slots, type Slot } from '@/app/story';
import { Button, Display, Field, Glyph, Motif, Patch, cookGlyph } from '../primitives';
import { cookColor } from '../theme';
import { Agreement } from './Agreement';
import { joinUrlFor } from './Invite';
import { CodeTiles, Icon, STAMP_IN, StampTag } from './Paper';
import { Qr } from './Qr';
import { SlotPicker } from './SlotPicker';

/**
 * The lobby: everyone finds their phone, everyone picks a role, the host says go.
 *
 * The host's screen carries the code two ways, as a QR and as six letters, because a phone
 * camera and a phone keyboard fail in different kitchens. The roster fills in live as
 * people join. Starting is the host's call — it is enabled the moment the last cook is in,
 * and available a beat earlier for the night someone's phone is flat.
 *
 * Laid out as a cut-paper party invitation: the QR on a torn paper plate, the code stamped
 * on tiles, and each cook a name tag that is stamped onto the table as they arrive.
 */
export const Lobby = () => {
  const session = useSync((s) => s.session);
  const role = useSync((s) => s.role);
  const compiled = useSync(selectCompiled);
  const me = useSync(selectMe);
  const deviceId = useSync((s) => s.deviceId);
  const pending = useSync((s) => s.pending);
  const offline = useSync((s) => s.offline);
  const error = useSync((s) => s.error);
  const start = useSync((s) => s.start);
  const claim = useSync((s) => s.claim);
  const leave = useSync((s) => s.leave);

  const [cookId, setCookId] = useState<string | null>(null);
  const [name, setName] = useState('');

  if (!session) return null;

  const roster = slots(session.crew, session.members);
  const all = everyoneHere(session.crew, session.members);
  const here = roster.filter((s) => s.member).length;
  const missing = roster.filter((s) => !s.member).map((s) => s.cook.name);
  const joinUrl = joinUrlFor(session.joinCode);
  const hostName = session.members.find((m) => m.isHost)?.displayName ?? 'the host';
  const host = role === 'host';

  return (
    <main className="mx-auto w-full max-w-[1180px] px-5 pb-8 pt-7 sm:px-8">
      <div
        className={`flex flex-col gap-7 ${
          host
            ? 'lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,460px)] lg:grid-rows-[auto_1fr] lg:gap-x-12 lg:gap-y-7'
            : 'mx-auto max-w-[760px]'
        }`}
      >
        <header className="relative lg:col-start-1">
          <StampTag className={STAMP_IN}>Cooking together</StampTag>
          <div className="relative mt-5">
            <Patch
              tone="dough"
              cut="shard"
              aria-hidden="true"
              className={`absolute -left-4 -top-2 h-[5rem] w-[12rem] [rotate:-7deg] sm:h-[7rem] sm:w-[17rem] ${STAMP_IN}`}
            />
            <Motif name="poppy" className="absolute -top-6 right-[8%] w-[3.5rem] rotate-[14deg]" m1="var(--mk-plum-900)" />
            <Display as="h1" className="relative text-[length:var(--mk-text-4xl)] sm:text-[length:var(--mk-text-5xl)] lg:text-[5.5rem]">
              {compiled?.plan.name ?? 'The session'}
            </Display>
          </div>
          <div className="mt-5 flex items-center gap-4">
            <span
              aria-hidden="true"
              className={`relative grid h-[4.5rem] w-[4.5rem] flex-none place-items-center ${STAMP_IN}`}
            >
              <span className={`absolute inset-0 [clip-path:var(--mk-cut-plate)] [rotate:-6deg] ${all ? 'bg-garden-700' : 'bg-paprika-600'}`} />
              <span className="mk-display relative text-[length:var(--mk-text-2xl)] leading-none text-paper">
                {here}/{roster.length}
              </span>
            </span>
            <p className="text-md font-medium text-ink [font-variation-settings:var(--mk-sharp)]" aria-live="polite">
              {all
                ? `Everyone's here — ${here} of ${roster.length}.`
                : `${here} of ${roster.length} here. Waiting for ${missing.join(' and ')}.`}
            </p>
          </div>
        </header>

        {host ? (
          <section
            aria-label="Invite the others"
            className="relative flex flex-col items-center gap-5 overflow-hidden rounded-nick-lg bg-sunken px-4 pb-6 pt-0 sm:px-7 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:self-start"
          >
            <span aria-hidden="true" className="-mx-4 block h-[14px] self-stretch bg-mk-plum [clip-path:var(--mk-cut-edge-bottom)] sm:-mx-7" />
            <div className="relative grid place-items-center p-7 sm:p-8">
              <span
                aria-hidden="true"
                className={`absolute inset-0 bg-enamel [clip-path:var(--mk-cut-plate)] [rotate:6deg] ${STAMP_IN}`}
              />
              <span
                aria-hidden="true"
                className="absolute inset-[7%] bg-marigold [clip-path:var(--mk-cut-plate)] [rotate:-4deg]"
              />
              <Motif name="cherry" className="absolute -right-3 -top-4 w-[3.25rem] rotate-[16deg]" m1="var(--mk-beet)" m2="var(--mk-garden)" m3="var(--mk-enamel)" />
              <Motif name="leaf" className="absolute -bottom-3 -left-2 w-[2.25rem] -rotate-[32deg]" m1="var(--mk-garden)" m3="var(--mk-enamel)" />
              <Qr text={joinUrl} label={`QR code to join with ${session.joinCode}`} size={232} className="relative" />
            </div>
            <div className="w-full min-w-0 text-center">
              <p className="text-sm text-muted">Scan this with a phone, or open the app and type</p>
              <p className="mx-auto mt-3 max-w-[380px]" aria-label={`join code ${session.joinCode.split('').join(' ')}`}>
                <span className="mk-visually-hidden">{session.joinCode}</span>
                <CodeTiles value={session.joinCode} length={session.joinCode.length} />
              </p>
              <p className="mt-4 break-all text-xs text-muted">{joinUrl}</p>
              {servedFromLocalhost() ? (
                <p className="mt-4 flex items-start gap-3 rounded-nick-md bg-warning-bg p-3 text-left text-xs text-ink">
                  <Icon name="alert" className="flex-none text-warning" />
                  <span>
                    A phone cannot reach <span className="font-bold">localhost</span>. Open this page
                    at your computer&rsquo;s network address instead — the dev server prints it as
                    &ldquo;Network&rdquo; — and the code will work from there.
                  </span>
                </p>
              ) : null}
            </div>
          </section>
        ) : null}

        <div className="flex flex-col gap-7 lg:col-start-1">
          <Agreement />

          <section aria-label="Who is here">
            <Display as="h2" className="mb-4 text-[length:var(--mk-text-xl)] sm:text-[length:var(--mk-text-2xl)]">
              The crew
            </Display>
            <ul className="grid gap-4 sm:grid-cols-2">
              {roster.map((slot) => (
                <NameTag key={slot.cook.id} slot={slot} deviceId={deviceId} />
              ))}
            </ul>
          </section>

          {!me ? (
            <section aria-label="Are you cooking too" className="relative rounded-nick-lg bg-sunken p-4 sm:p-5">
              <Motif name="spark" className="absolute -right-2 -top-5 w-[2.5rem] rotate-[8deg]" m1="var(--mk-cornflower)" />
              <h2 className="text-md font-bold [font-variation-settings:var(--mk-sharp)]">Cooking too? Pick your role.</h2>
              <p className="mb-4 mt-1 text-xs text-muted">
                Leave this if this screen is staying on the counter as the kitchen display.
              </p>
              <SlotPicker slots={roster} selected={cookId} onSelect={setCookId} myDeviceId={deviceId} />
              <div className="mt-4 flex flex-wrap items-end gap-3">
                <div className="min-w-[200px] flex-1">
                  <Field
                    label="What should we call you?"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    maxLength={40}
                    placeholder="Your name"
                  />
                </div>
                <Button
                  variant="secondary"
                  disabled={!cookId || name.trim().length === 0 || pending}
                  onClick={() => {
                    if (cookId) void claim(cookId, name);
                  }}
                >
                  That&rsquo;s me
                </Button>
              </div>
            </section>
          ) : null}

          {error ? (
            <p role="alert" className="flex items-start gap-3 rounded-nick-md bg-warning-bg p-3 text-sm text-ink">
              <Icon name="alert" className="flex-none text-warning" />
              <span>{error}</span>
            </p>
          ) : null}
          {offline ? (
            <p role="status" className="flex items-center gap-2 text-xs text-muted">
              <Icon name="clock" className="flex-none" />
              Lost the server for a moment. Trying again.
            </p>
          ) : null}

          <footer className="flex flex-wrap items-center gap-3 pb-4">
            {host ? (
              <>
                <Button variant="primary" size="lg" icon="burner" disabled={!all || pending} onClick={() => void start()} className="w-full sm:w-auto">
                  Start cooking
                </Button>
                {!all && here > 0 ? (
                  <Button variant="quiet" disabled={pending} onClick={() => void start()}>
                    Start with whoever&rsquo;s here
                  </Button>
                ) : null}
              </>
            ) : (
              <div className="relative flex w-full items-center gap-4 rounded-nick-lg bg-surface p-4 pr-5">
                <span aria-hidden="true" className="relative grid h-[4rem] w-[4rem] flex-none place-items-center">
                  <span className="absolute inset-0 bg-marigold [clip-path:var(--mk-cut-burst)] [rotate:10deg]" />
                  <span className="relative text-charcoal">
                    <Glyph name="pot" size={30} strokeWidth={2} />
                  </span>
                </span>
                <p className="text-md text-ink" role="status">
                  Waiting for {hostName} to start. Keep this open — your steps will appear here.
                </p>
              </div>
            )}
            <Button variant="quiet" onClick={leave}>
              Leave
            </Button>
          </footer>
        </div>
      </div>
    </main>
  );
};

/** The two tilts a row of name tags alternates between, so the table looks set by hand. */
const TAG_TILT = [-1.6, 1.2];

/**
 * A cook on the roster, as a party name tag: a band in the cook's colour, the name written
 * big, and what they are doing tonight. A tag with nobody behind it yet is a blank on flour.
 * It stamps onto the table again when someone claims it — the one moment worth moving for.
 */
const NameTag = ({ slot: { cook, index, member }, deviceId }: { slot: Slot; deviceId: string | null }) => (
  <li className="relative" style={{ rotate: `${TAG_TILT[index % TAG_TILT.length]}deg` }}>
    <div
      key={member?.deviceId ?? 'nobody'}
      className={`relative overflow-hidden rounded-nick-md ${member ? `bg-surface ${STAMP_IN}` : 'bg-sunken'}`}
    >
      <div aria-hidden="true">
        <div
          className="flex h-[2rem] items-center justify-between px-4 text-paper"
          style={{ background: member ? cookColor(index) : 'var(--mk-flour-deep)' }}
        >
          <span
            className={`text-[0.6875rem] font-bold uppercase tracking-[0.2em] [font-variation-settings:var(--mk-sharp)] ${member ? '' : 'text-muted'}`}
          >
            {member ? 'Hello, I’m' : 'Saved for'}
          </span>
        </div>
        <span
          className="block h-2 [clip-path:var(--mk-cut-edge-bottom)]"
          style={{ background: member ? cookColor(index) : 'var(--mk-flour-deep)' }}
        />
      </div>
      <div className="flex items-center gap-3 px-4 pb-4 pt-1">
        <span style={{ color: cookColor(index) }} className={`flex-none ${member ? '' : 'opacity-50'}`}>
          <Glyph name={cookGlyph(index)} size={44} strokeWidth={1.8} />
        </span>
        <span className="min-w-0">
          <span
            className={`block break-words text-[length:var(--mk-text-xl)] font-extrabold leading-tight [font-variation-settings:var(--mk-sharp)] ${
              member ? 'text-ink' : 'text-muted'
            }`}
          >
            {member ? member.displayName : cook.name}
            {member?.deviceId === deviceId ? (
              <span className="mk-tag mk-tag--success ml-2 align-middle text-xs">you</span>
            ) : null}
            {member?.isHost ? <span className="mk-tag ml-2 bg-marigold-100 align-middle text-xs">host</span> : null}
          </span>
          <span className="mt-1 flex items-center gap-1 text-xs text-muted">
            {member ? null : <Icon name="clock" className="!h-4 !w-4 flex-none" />}
            {member ? `${cook.name} · ${roleOf(cook)}` : `${roleOf(cook)} · not here yet`}
          </span>
        </span>
      </div>
    </div>
  </li>
);
