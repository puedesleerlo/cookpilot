import { useEffect, useId, useRef, useState } from 'react';
import { Display, Motif } from '../primitives';
import { CodeTiles } from './Paper';
import { Qr } from './Qr';

/**
 * The way in, kept on the host's screen for the whole session.
 *
 * Somebody always turns up after the host pressed Start — the flatmate back from the shop,
 * the phone that was charging. Joining mid-session works (they claim a free cook and land on
 * that cook's current step), so the code stays where it can be scanned: a panel beside the
 * steps on a wide screen, and on a phone a small QR button that opens it full size.
 */

/** The link a phone camera opens: this app, straight into joining with the code. */
export const joinUrlFor = (joinCode: string): string =>
  `${window.location.origin}${window.location.pathname}#join/${joinCode}`;

const spaced = (joinCode: string): string => joinCode.split('').join(' ');

/** The code in display letters, read out one character at a time. */
const CodeLine = ({ joinCode }: { joinCode: string }) => (
  <p className="mk-display text-[length:var(--mk-text-2xl)] leading-none tracking-[0.18em]">
    <span className="mk-visually-hidden">join code {spaced(joinCode)}</span>
    <span aria-hidden="true">{joinCode}</span>
  </p>
);

/** Wide screens: a card that sits beside the steps and never moves. */
export const InvitePanel = ({ joinCode, className = '' }: { joinCode: string; className?: string }) => (
  <section
    aria-label="Invite someone to cook"
    className={`relative flex-col items-center gap-4 overflow-hidden rounded-nick-lg bg-surface px-5 pb-5 pt-0 text-center ${className}`}
  >
    <span aria-hidden="true" className="-mx-5 block h-[12px] self-stretch bg-enamel [clip-path:var(--mk-cut-edge-bottom)]" />
    <Display as="h2" className="text-[length:var(--mk-text-xl)]">
      Cook along
    </Display>
    <div className="relative grid place-items-center p-5">
      <span aria-hidden="true" className="absolute inset-0 bg-marigold [clip-path:var(--mk-cut-plate)] [rotate:-5deg]" />
      <Motif name="cherry" className="absolute -right-2 -top-3 w-[2.5rem] rotate-[14deg]" m1="var(--mk-beet)" m2="var(--mk-garden)" m3="var(--mk-enamel)" />
      <Qr text={joinUrlFor(joinCode)} label={`QR code to join with ${joinCode}`} size={184} className="relative" />
    </div>
    <CodeLine joinCode={joinCode} />
    <p className="text-xs text-muted">Late to the kitchen? Scan it with a phone camera, or open the app and type the letters.</p>
  </section>
);

/** Phones: a button that carries a thumbnail of the code and opens it at a scannable size. */
export const InvitePocket = ({ joinCode, className = '' }: { joinCode: string; className?: string }) => {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);

  return (
    <>
      <button
        ref={trigger}
        type="button"
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
        className={`mk-btn flex-none gap-2 py-1 pl-1 pr-3 text-sm ${className}`}
      >
        <Qr text={joinUrlFor(joinCode)} size={40} className="rounded-nick-xs" />
        Invite
      </button>
      {open ? (
        <InviteDialog
          joinCode={joinCode}
          onClose={() => {
            setOpen(false);
            trigger.current?.focus();
          }}
        />
      ) : null}
    </>
  );
};

/**
 * The code at full size, on day paper even in the night kitchen: a camera wants dark modules
 * on a light ground, and the brightest thing on the screen is what a guest looks for. The
 * card is a `mk-day` scope, so the controls inside it read as day controls.
 */
const InviteDialog = ({ joinCode, onClose }: { joinCode: string; onClose: () => void }) => {
  const titleId = useId();

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-scrim p-4"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative flex w-full max-w-[420px] flex-col items-center gap-4 overflow-hidden rounded-nick-lg bg-paper-bright px-5 pb-5 pt-0 text-center mk-day motion-safe:animate-[mk-stamp_var(--d-slow)_var(--mk-ease-stamp)_both]"
      >
        <span aria-hidden="true" className="-mx-5 block h-[14px] self-stretch bg-paprika [clip-path:var(--mk-cut-edge-bottom)]" />
        <Display as="h2" id={titleId} className="text-[length:var(--mk-text-2xl)]">
          Scan to cook along
        </Display>
        <div className="relative grid place-items-center p-5">
          <span aria-hidden="true" className="absolute inset-0 bg-enamel [clip-path:var(--mk-cut-plate)] [rotate:5deg]" />
          <Qr text={joinUrlFor(joinCode)} label={`QR code to join with ${joinCode}`} size="min(68vw, 18rem)" className="relative" />
        </div>
        <p className="w-full max-w-[320px]">
          <span className="mk-visually-hidden">join code {spaced(joinCode)}</span>
          <CodeTiles value={joinCode} length={joinCode.length} size="sm" />
        </p>
        <p className="text-sm text-muted">Point a phone camera at it, or open the app and type the letters.</p>
        {/* The one control in the dialog, so it takes focus on open. */}
        <button type="button" autoFocus onClick={onClose} className="mk-btn mk-btn--secondary w-full">
          Close
        </button>
      </div>
    </div>
  );
};
