import type { CSSProperties, ReactNode } from 'react';
import { useSession } from '@/app/store';
import { useSync } from '@/app/sync';
import bowl from '@/assets/makitra/makitra-bowl.svg';
import { Button, Glyph, type GlyphName } from '../primitives';
import { GroceryDrop } from './entry/GroceryDrop';
import { HowItGoes } from './entry/HowItGoes';

/**
 * The landing screen has one job: get someone to the aha moment in under ninety seconds.
 *
 * So the first screen is a poster, not a document: one claim set as loud as the page will
 * take it, a bag of shopping spilling across it, and one unmistakable way in. The other two
 * ways in are tickets — real buttons, just not shouting. How it works waits below the fold
 * for whoever wants to know before they try.
 */

const STAMP = 'motion-safe:animate-[mk-stamp_520ms_var(--mk-ease-stamp)_both]';

/** Cream focus ring colour for controls on the dark poster, from the night-kitchen set. */
const NIGHT_FOCUS = 'focus-visible:[outline-color:var(--mk-night-focus)]';

export const Landing = () => {
  const goTo = useSession((s) => s.goTo);
  const startDemo = useSession((s) => s.startDemo);
  const openJoin = useSync((s) => s.openJoin);

  return (
    <main className="relative overflow-x-clip">
      <section className="relative z-10 flex min-h-[calc(100dvh-1.25rem)] flex-col bg-plum-900 text-paper">
        <GroceryDrop className="-right-[46vw] top-[40%] w-[122vw] sm:-right-[22vw] sm:top-[22%] sm:w-[84vw] lg:-right-[10vw] lg:top-[1%] lg:w-[min(66vw,68rem)]" />

        <div className="relative mx-auto flex w-full max-w-[1280px] flex-1 flex-col px-5 pb-[28px] pt-5 sm:px-[40px] sm:pb-[40px]">
          <p className="flex items-center gap-3 text-md font-bold [font-variation-settings:var(--mk-sharp)]">
            <img src={bowl} alt="" className="h-[36px] w-auto" />
            Kitchen Compiler
          </p>

          <h1 className="voice-display mt-5 leading-[0.84] sm:mt-6">
            <Stamped delay={60} className="text-paper [font-size:clamp(4rem,25.5vw,8.5rem)] [rotate:-3deg] sm:[font-size:clamp(7rem,14vw,13rem)]">
              A week
            </Stamped>{' '}
            <Stamped delay={140} className="text-marigold [font-size:clamp(3rem,19.5vw,6.5rem)] [rotate:-1deg] sm:ml-[6vw] sm:[font-size:clamp(5.5rem,11vw,10rem)]">
              of meals
            </Stamped>{' '}
            <Tag delay={240} ground="bg-enamel" className="mt-4 text-plum-900 [font-size:clamp(1.75rem,8.2vw,3rem)] [rotate:2.5deg] sm:mt-5 sm:[font-size:clamp(2.5rem,4.4vw,4rem)]">
              out of one fridge,
            </Tag>{' '}
            <Tag delay={340} ground="bg-paprika" className="ml-[4vw] mt-[20px] text-paper [font-size:clamp(2rem,10vw,3rem)] [rotate:-3deg] sm:ml-[10vw] sm:mt-[28px] sm:[font-size:clamp(2.5rem,5.4vw,5rem)]">
              in one session.
            </Tag>
          </h1>

          <div className="mt-auto pt-[40px]">
            <div className="flex flex-col items-start gap-5 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-7">
              <Button
                variant="primary"
                size="lg"
                onClick={() => goTo('speak')}
                className={`w-full px-[24px] py-4 text-md sm:w-auto sm:px-[28px] sm:py-5 sm:text-xl ${NIGHT_FOCUS} ${STAMP}`}
                style={{ animationDelay: '460ms' }}
              >
                Tell me what you want
                <Arrow />
              </Button>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-4 sm:gap-x-6">
                <Ticket ground="bg-marigold" glyph="pot" tilt="-4deg" delay={560} onClick={startDemo}>
                  Try the example session
                </Ticket>
                <Ticket ground="bg-cornflower-100" glyph="cook-1" tilt="3deg" delay={640} onClick={() => openJoin('')}>
                  Join someone&rsquo;s session
                </Ticket>
              </div>
            </div>
          </div>
        </div>
      </section>
      <span aria-hidden="true" className="relative z-10 -mt-px block h-5 bg-plum-900 [clip-path:var(--mk-cut-edge-bottom)]" />

      {/* Below the fold the page lies on plain paper, so no edge-of-table cut-out sits under the words. */}
      <div className="-mt-[24px] bg-bg pt-[24px]">
        <HowItGoes />

        <footer className="mx-auto max-w-[1280px] px-5 pb-[32px] sm:px-[40px]">
          <p className="mx-auto max-w-[70ch] text-center text-xs text-muted">
            Visual direction inspired by &ldquo;
            <a
              href="https://www.behance.net/gallery/209955313/Ukrainian-food-and-cuisine-illustration"
              target="_blank"
              rel="noreferrer"
              className="text-link underline"
            >
              Ukrainian food and cuisine illustration
            </a>
            &rdquo; by Anna Riabchenko (Behance). Non-commercial use.
          </p>
        </footer>
      </div>
    </main>
  );
};

type StampedProps = { children: ReactNode; className: string; delay: number };

/** One line of the headline, stamped down on its own beat. */
const Stamped = ({ children, className, delay }: StampedProps) => (
  <span className={`block w-fit origin-left ${STAMP} ${className}`} style={{ animationDelay: `${delay}ms` }}>
    {children}
  </span>
);

type TagProps = StampedProps & { ground: string };

/** A headline phrase cut out on its own strip of paper. */
const Tag = ({ children, className, delay, ground }: TagProps) => (
  <span className={`relative block w-fit origin-left px-[0.35em] pb-[0.08em] pt-[0.16em] leading-[0.95] ${STAMP} ${className}`} style={{ animationDelay: `${delay}ms` }}>
    <span aria-hidden="true" className={`absolute inset-0 ${ground} [clip-path:var(--mk-cut-tag)]`} />
    <span className="relative">{children}</span>
  </span>
);

type TicketProps = {
  children: ReactNode;
  ground: string;
  glyph: GlyphName;
  tilt: string;
  delay: number;
  onClick: () => void;
};

/**
 * A secondary way in, as a paper ticket. The cut is on a sibling behind the button, never on
 * the button, so the focus ring is never sliced off. Pointing at it flips the tilt.
 */
const Ticket = ({ children, ground, glyph, tilt, delay, onClick }: TicketProps) => (
  <span
    className={`relative inline-grid [rotate:var(--tilt)] transition-[rotate] duration-base ease-stamp hover:[rotate:calc(var(--tilt)*-1)] focus-within:[rotate:0deg] ${STAMP}`}
    style={{ '--tilt': tilt, animationDelay: `${delay}ms` } as CSSProperties}
  >
    <span aria-hidden="true" className={`absolute inset-0 ${ground} [clip-path:var(--mk-cut-tag)]`} />
    <button
      type="button"
      onClick={onClick}
      className={`mk-btn relative min-h-[60px] max-w-[10.25rem] gap-3 px-[14px] py-2 text-left leading-tight [--btn-bg:transparent] sm:max-w-none sm:px-5 sm:text-lg [--btn-fg:var(--mk-plum-900)] ${NIGHT_FOCUS}`}
    >
      <span className="hidden sm:block">
        <Glyph name={glyph} size={28} strokeWidth={2} />
      </span>
      {children}
    </button>
  </span>
);

const Arrow = () => (
  <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="square" aria-hidden="true">
    <path d="M3.5 12.5 19 11.5M13 5.5l6.5 6-6 6.5" />
  </svg>
);
