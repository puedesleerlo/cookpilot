import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { CookProgress } from '@kitchen/contracts';
import { useSession } from '@/app/store';
import { Working } from './Working';

/**
 * The log, as a person reads it.
 *
 * Everything on this screen is a translation of an event into a sentence, so the thing
 * worth testing is that no stage name, status code or bit of machinery survives the trip.
 */

const show = (progress: CookProgress[], finding = true) => {
  useSession.setState({ progress, finding });
  return render(<Working />);
};

describe('the live log', () => {
  it('says what it heard, and which ingredient is the deadline', () => {
    show([
      {
        kind: 'heard',
        wants: ['something with chicken'],
        pantry: [
          { name: 'chicken', urgent: false },
          { name: 'bok choy', urgent: true },
        ],
        cookCount: 2,
        portionTarget: 14,
      },
    ]);
    expect(screen.getByText(/chicken, bok choy/)).toBeInTheDocument();
    expect(screen.getByText(/bok choy needs using first/)).toBeInTheDocument();
    expect(screen.getByText(/2 of you cooking/)).toBeInTheDocument();
    expect(screen.getByText(/14 portions, a week of meals/)).toBeInTheDocument();
  });

  it('names a recipe it read, where it came from, and what it was scaled to', () => {
    show([{ kind: 'found', title: 'Ginger Chicken', site: 'example.com', servings: 6, steps: 7 }]);
    expect(screen.getByText('Ginger Chicken')).toBeInTheDocument();
    expect(screen.getByText(/example\.com · 7 steps · scaled to serve 6/)).toBeInTheDocument();
  });

  it('explains a skip in words a person would use', () => {
    show([{ kind: 'skipped', site: 'tasty.co', reason: 'it is a list of recipes rather than a recipe' }]);
    expect(screen.getByText('Skipped tasty.co')).toBeInTheDocument();
    expect(screen.getByText('it is a list of recipes rather than a recipe')).toBeInTheDocument();
  });

  it('shows no stage names, status codes or machinery anywhere', () => {
    const { container } = show([
      { kind: 'searching', query: 'chicken stir fry', index: 0, total: 3 },
      { kind: 'reading', site: 'budgetbytes.com' },
      { kind: 'skipped', site: 'a.com', reason: 'that site would not let us read it' },
      { kind: 'found', title: 'Stir Fry', site: 'b.com', servings: 4, steps: 5 },
      { kind: 'finished', recipes: 1 },
    ]);
    expect(container.textContent).not.toMatch(/L\d-|normalize|fetch:|403|404|429|undefined|NaN/);
  });

  it('keeps counting while it works, and stops claiming to when it stops', () => {
    const events: CookProgress[] = [
      { kind: 'found', title: 'One', site: 'a.com', servings: 4, steps: 3 },
      { kind: 'found', title: 'Two', site: 'b.com', servings: 4, steps: 3 },
    ];
    const { rerender } = show(events);
    expect(screen.getByText('2 recipes so far.')).toBeInTheDocument();
    expect(screen.getByText('Still going…')).toBeInTheDocument();

    useSession.setState({ finding: false });
    rerender(<Working />);
    expect(screen.queryByText('Still going…')).not.toBeInTheDocument();
  });

  it('says it is listening before anything has happened', () => {
    show([]);
    expect(screen.getByText('Listening to what you said…')).toBeInTheDocument();
  });

  it('surfaces a failure rather than sitting silent', () => {
    show([{ kind: 'failed', reason: 'Nothing came back to read. Try naming a dish you fancy.' }], false);
    expect(screen.getByText('That did not work')).toBeInTheDocument();
    expect(screen.getByText(/Try naming a dish you fancy/)).toBeInTheDocument();
  });
});
