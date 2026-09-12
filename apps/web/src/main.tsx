import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { useSession } from './app/store';
import { App } from './ui/App';

const root = document.getElementById('root');
if (!root) throw new Error('#root is missing from index.html');

/**
 * `#demo` compiles the example session on load.
 *
 * It is the link to send someone who asked what this does — they land on the compiled
 * timeline rather than on a landing page with a button they have to find. It is also the
 * only piece of routing in the app, because the rest of it is one session.
 */
if (window.location.hash === '#demo') useSession.getState().startDemo();
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
