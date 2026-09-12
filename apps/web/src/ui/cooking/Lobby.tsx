import { useState } from 'react';
import { servedFromLocalhost } from '@/app/api';
import { selectCompiled, selectMe, useSync } from '@/app/sync';
import { everyoneHere, roleOf, slots } from '@/app/story';
import { Button, Field, Glyph, cookGlyph } from '../primitives';
import { cookColor } from '../theme';
import { Agreement } from './Agreement';
import { Qr } from './Qr';
import { SlotPicker } from './SlotPicker';

/**
 * The lobby: everyone finds their phone, everyone picks a role, the host says go.
 *
 * The host's screen carries the code two ways, as a QR and as six letters, because a phone
 * camera and a phone keyboard fail in different kitchens. The roster fills in live as
 * people join. Starting is the host's call — it is enabled the moment the last cook is in,
 * and available a beat earlier for the night someone's phone is flat.
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
  const joinUrl = `${window.location.origin}${window.location.pathname}#join/${session.joinCode}`;
  const hostName = session.members.find((m) => m.isHost)?.displayName ?? 'the host';

  return (
    <main className="mx-auto flex min-h-dvh max-w-[760px] flex-col gap-5 px-5 py-7">
      <header>
        <p className="text-xs font-bold uppercase tracking-wide text-ink-faint">Cooking together</p>
        <h1 className="voice-display mt-1 text-3xl">{compiled?.plan.name ?? 'The session'}</h1>
        <p className="mt-2 text-md text-ink-soft" aria-live="polite">
          {all
            ? `Everyone's here — ${here} of ${roster.length}.`
            : `${here} of ${roster.length} here. Waiting for ${missing.join(' and ')}.`}
        </p>
      </header>

      {role === 'host' ? (
        <section
          aria-label="Invite the others"
          className="flex flex-col items-center gap-5 rounded-md bg-cream-deep p-4 sm:flex-row sm:items-start"
        >
          <Qr text={joinUrl} label={`QR code to join with ${session.joinCode}`} />
          <div className="min-w-0 flex-1 text-center sm:text-left">
            <p className="text-sm text-ink-soft">Scan this with a phone, or open the app and type</p>
            <p className="voice-numeral mt-1 text-4xl tracking-[0.2em]" aria-label={`join code ${session.joinCode.split('').join(' ')}`}>
              {session.joinCode}
            </p>
            <p className="mt-2 break-all text-xs text-ink-faint">{joinUrl}</p>
            {servedFromLocalhost() ? (
              <p className="mt-3 rounded-sm bg-orange-wash p-3 text-xs">
                A phone cannot reach <span className="font-bold">localhost</span>. Open this page
                at your computer&rsquo;s network address instead — the dev server prints it as
                &ldquo;Network&rdquo; — and the code will work from there.
              </p>
            ) : null}
          </div>
        </section>
      ) : null}

      <Agreement />

      <section aria-label="Who is here">
        <h2 className="mb-2 text-sm font-bold">The crew</h2>
        <ul className="grid gap-2 sm:grid-cols-2">
          {roster.map(({ cook, index, member }) => (
            <li
              key={cook.id}
              className={`flex items-center gap-3 rounded-md border-[1.5px] p-3 ${
                member ? 'border-line-strong bg-cream shadow-1' : 'border-dashed border-line bg-cream/50'
              }`}
            >
              <span style={{ color: cookColor(index) }} className={member ? '' : 'opacity-50'}>
                <Glyph name={cookGlyph(index)} size={36} />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-bold">
                  {member ? member.displayName : cook.name}
                  {member?.deviceId === deviceId ? <span className="ml-1 text-xs font-semibold text-sage-ink">(you)</span> : null}
                  {member?.isHost ? <span className="ml-1 text-xs font-normal text-ink-soft">· host</span> : null}
                </span>
                <span className="block text-xs text-ink-soft">
                  {member ? `${cook.name} · ${roleOf(cook)}` : `${roleOf(cook)} · not here yet`}
                </span>
              </span>
            </li>
          ))}
        </ul>
      </section>

      {!me ? (
        <section aria-label="Are you cooking too" className="rounded-md bg-cream-deep p-4">
          <h2 className="text-sm font-bold">Cooking too? Pick your role.</h2>
          <p className="mb-3 text-xs text-ink-soft">
            Leave this if this screen is staying on the counter as the kitchen display.
          </p>
          <SlotPicker slots={roster} selected={cookId} onSelect={setCookId} myDeviceId={deviceId} />
          <div className="mt-3 flex flex-wrap items-end gap-3">
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
        <p role="alert" className="rounded-sm bg-orange-wash p-3 text-sm">
          {error}
        </p>
      ) : null}
      {offline ? (
        <p role="status" className="text-xs text-ink-soft">
          Lost the server for a moment. Trying again.
        </p>
      ) : null}

      <footer className="flex flex-wrap items-center gap-3 pb-4">
        {role === 'host' ? (
          <>
            <Button variant="primary" size="lg" disabled={!all || pending} onClick={() => void start()}>
              Start cooking
            </Button>
            {!all && here > 0 ? (
              <Button variant="quiet" disabled={pending} onClick={() => void start()}>
                Start with whoever&rsquo;s here
              </Button>
            ) : null}
          </>
        ) : (
          <p className="text-sm text-ink-soft" role="status">
            Waiting for {hostName} to start. Keep this open — your steps will appear here.
          </p>
        )}
        <Button variant="quiet" onClick={leave}>
          Leave
        </Button>
      </footer>
    </main>
  );
};
