import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { useSession } from './app/store';
import { useSync } from './app/sync';
import { App } from './ui/App';

const root = document.getElementById('root');
if (!root) throw new Error('#root is missing from index.html');

/**
 * Three links, because three people arrive differently.
 *
 * `#demo` compiles the example session on load — the link to send someone who asked what
 * this does, landing them on the timeline rather than on a page with a button to find.
 * `#fridge` opens straight into their own. `#join/CODE` is what a phone gets from the QR
 * code on a host's screen, and `#join` alone asks for the code. Anything else is a plain
 * load, which checks whether this tab was in a shared session before it reloaded.
 */
const ENTRY: Record<string, () => void> = {
  '#demo': () => useSession.getState().startDemo(),
  '#fridge': () => useSession.getState().goTo('intake'),
};
const JOIN = '#join';
const hash = window.location.hash;
if (hash.startsWith(JOIN)) {
  useSync.getState().openJoin(hash.slice(JOIN.length).replace(/^[/?=]+/, ''));
} else if (hash in ENTRY) {
  ENTRY[hash]?.();
} else {
  void useSync.getState().resume();
}
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
