import { describe, expect, it, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useSession } from '@/app/store';
import { App } from './App';

/**
 * The demo, driven the way a person drives it: land, click, read, change your mind.
 *
 * Every other test in this app holds something still — a fixture plan, a compiled schedule
 * passed in as a prop. This one holds nothing still. It is the test that fails if the button
 * is wired to the wrong action, if the store forgets to recompile, or if the timeline reads
 * from somewhere the compile never wrote.
 */

beforeEach(() => {
  useSession.getState().reset();
});

const compiled = () => {
  const outcome = useSession.getState().outcome;
  if (!outcome?.ok) throw new Error('nothing compiled');
  return outcome;
};
const compiledMinutes = (): number => compiled().schedule.makespanMin;
const dishCount = (): number => compiled().plan.dishes.length;

describe('the example session, end to end', () => {
  it('goes from the landing page to a compiled timeline in one click', async () => {
    const user = userEvent.setup();
    render(<App />);

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'A week of meals out of one fridge, in one session.',
    );

    await user.click(screen.getByRole('button', { name: 'Try the example session' }));

    // The curtain is theatre over work that is already done; the schedule exists immediately.
    expect(useSession.getState().outcome?.ok).toBe(true);
    await waitFor(() => expect(screen.getByText('Sunday session')).toBeInTheDocument());

    expect(screen.getByText(String(compiledMinutes()))).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Run sheet' })).toBeInTheDocument();
  });

  it('recompiles when you take half the time away', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Try the example session' }));
    await waitFor(() => expect(screen.getByText('Sunday session')).toBeInTheDocument());

    const before = compiledMinutes();
    const dishesBefore = dishCount();

    await user.click(screen.getByRole('button', { name: '30m' }));

    const after = compiledMinutes();
    expect(after).toBeLessThanOrEqual(30);
    expect(after).toBeLessThan(before);

    expect(dishCount()).toBeLessThan(dishesBefore);

    // And it says so on screen, not just in the store.
    await waitFor(() =>
      expect(screen.getByText(`minutes in the kitchen, of the 30 you had`)).toBeInTheDocument(),
    );
  });

  it('drops the drinks when you say you do not want any', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Try the example session' }));
    await waitFor(() => expect(screen.getByText('Sunday session')).toBeInTheDocument());

    expect(screen.getAllByText('Overnight cold brew').length).toBeGreaterThan(0);
    await user.click(screen.getByRole('button', { name: 'no' }));

    await waitFor(() => expect(screen.queryByText('Overnight cold brew')).not.toBeInTheDocument());
    expect(compiled().plan.dishes.some((d) => d.kind === 'beverage')).toBe(false);
  });

  it('takes you back to the start without leaving a stale session behind', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Try the example session' }));
    await waitFor(() => expect(screen.getByText('Sunday session')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Start again' }));
    expect(useSession.getState().outcome).toBeNull();
    expect(screen.queryByText('Sunday session')).not.toBeInTheDocument();
  });
});
