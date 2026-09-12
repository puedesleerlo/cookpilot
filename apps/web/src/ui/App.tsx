import { useSession } from '@/app/store';
import { Blobs, Grain } from './primitives';
import { Landing } from './screens/Landing';

/** Screen routing. The store holds where we are; each screen owns its own layout. */
export const App = () => {
  const screen = useSession((s) => s.screen);
  return (
    <>
      <Blobs />
      <Grain />
      {screen === 'landing' ? <Landing /> : <Placeholder screen={screen} />}
    </>
  );
};

const Placeholder = ({ screen }: { screen: string }) => (
  <main className="mx-auto max-w-measure p-6">
    <h1 className="voice-display text-2xl">Next: {screen}</h1>
    <p className="mt-2 text-sm text-ink-soft">This screen arrives with its own change.</p>
  </main>
);
