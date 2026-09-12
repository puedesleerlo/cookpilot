import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { useSession } from './app/store';
import { App } from './ui/App';

const root = document.getElementById('root');
if (!root) throw new Error('#root is missing from index.html');

/**
 * Two links, because two people ask for this differently.
 *
 * `#demo` compiles the example session on load — the link to send someone who asked what
 * this does, landing them on the timeline rather than on a page with a button to find.
 * `#fridge` opens straight into their own. That is the whole of the routing; the rest of
 * the app is one session.
 */
const ENTRY: Record<string, () => void> = {
  '#demo': () => useSession.getState().startDemo(),
  '#fridge': () => useSession.getState().goTo('intake'),
};
ENTRY[window.location.hash]?.();
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
