import { useSession } from '@/app/store';
import { useSync } from '@/app/sync';
import { Button, Glyph } from '../primitives';

/**
 * The landing screen has one job: get someone to the aha moment in under ninety seconds.
 * So it makes one claim, offers two ways in, and gets out of the way.
 */
export const Landing = () => {
  const goTo = useSession((s) => s.goTo);
  const startDemo = useSession((s) => s.startDemo);
  const openJoin = useSync((s) => s.openJoin);

  return (
    <main className="mx-auto flex min-h-dvh max-w-[1100px] flex-col justify-center px-5 py-8">
      <div className="max-w-[34ch]">
        <h1 className="voice-display text-4xl sm:text-5xl">
          A week of meals out of one fridge, in one session.
        </h1>
      </div>

      <p className="mt-5 max-w-measure text-md text-ink-soft">
        Recipe apps tell you what to cook. This works out how to get it out of the kitchen:
        what starts first, what happens while the rice cooks, which pan gets washed when,
        and whether it actually fits in the time you have.
      </p>

      <div className="mt-7 flex flex-wrap items-center gap-3">
        <Button variant="primary" size="lg" onClick={() => goTo('speak')}>
          Tell me what you want
        </Button>
        <Button variant="secondary" size="lg" onClick={startDemo}>
          Try the example session
        </Button>
        <Button variant="quiet" size="lg" onClick={() => openJoin('')}>
          Join someone&rsquo;s session
        </Button>
      </div>

      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        {[
          {
            glyph: 'produce' as const,
            head: 'Answer two questions',
            body: 'Out loud or typed: what you want to cook, and what you have. It goes and finds the recipes.',
          },
          {
            glyph: 'burner' as const,
            head: 'It finds the dead time',
            body: 'Rice is a saucepan for 25 minutes and a cook for 2. Everything else fits inside that.',
          },
          {
            glyph: 'storage-container' as const,
            head: 'Portioned, chilled, labelled',
            body: 'Including the drinks, and including the one that has to start tonight.',
          },
        ].map((card) => (
          <div key={card.head} className="rounded-md bg-cream-deep p-4">
            <span className="text-sage-ink">
              <Glyph name={card.glyph} size={30} />
            </span>
            <h2 className="mt-2 text-sm font-bold">{card.head}</h2>
            <p className="mt-1 text-xs text-ink-soft">{card.body}</p>
          </div>
        ))}
      </div>
    </main>
  );
};
